import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import {
  assertCustodyTransition,
  assertMoney,
  evaluateReadiness,
} from '../domain/publication.policy';

type Db = Prisma.TransactionClient;

@Injectable()
export class LifecycleService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async sellerStatus(actor: Actor, assetId: string) {
    const asset = await this.db.asset.findFirst({
      where: {
        id: assetId,
        submissions: { some: { ownerUserId: actor.userId } },
      },
      include: {
        publication: true,
        custodyRecord: true,
        insuranceCoverage: true,
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    return safeStatus(asset);
  }

  /** Bounded staff-only discovery projection for the existing D11 authority. */
  async operationsQueue(actor: Actor, limit: number) {
    if (
      !actor.roles.some((role) =>
        ['ADMIN', 'COMPLIANCE_ANALYST', 'VAULT_OPERATOR'].includes(role),
      )
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view asset operations.',
      });
    }
    const assets = await this.db.asset.findMany({
      where: { status: { not: 'ARCHIVED' } },
      include: {
        valuationDecisions: {
          where: { status: 'ACTIVE' },
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
        custodyRecord: true,
        insuranceCoverage: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
        publication: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return {
      items: assets.map((asset) => ({
        id: asset.id,
        publicId: asset.publicId,
        title: asset.title,
        catalogueStatus: asset.status,
        valuationStatus: asset.valuationDecisions.length ? 'ACTIVE' : 'MISSING',
        custodyStatus: asset.custodyRecord?.status ?? 'MISSING',
        coverageStatus: asset.insuranceCoverage.length ? 'ACTIVE' : 'MISSING',
        publicationStatus: asset.publication?.status ?? 'BLOCKED',
        updatedAt: asset.updatedAt.toISOString(),
      })),
    };
  }

  handoff(actor: Actor, assetId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.handoff:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/handoff`,
      {},
      requestId,
      key,
      async (db, audit) => {
        const asset = await db.asset.findUnique({
          where: { id: assetId },
          include: { submissions: { where: { status: 'APPROVED' }, take: 1 } },
        });
        if (!asset || !asset.submissions.length)
          throw new ConflictException({
            code: 'CUSTODY_PROOF_REQUIRED',
            message: 'An approved submission is required for intake.',
          });
        const custody = await db.vaultCustodyRecord.upsert({
          where: { assetId },
          create: {
            id: randomUUID(),
            assetId,
            providerCode: 'MANUAL_UNVERIFIED',
            status: 'EXPECTED',
          },
          update: {},
        });
        await audit('CUSTODY_STATUS_CHANGED', 'asset', assetId, {
          assetId,
          fromStatus: 'NONE',
          toStatus: custody.status,
        });
        await this.notifyOwner(
          db,
          assetId,
          'LIFECYCLE_HANDOFF',
          'Asset intake started',
        );
        return { assetId, custodyStatus: custody.status };
      },
    );
  }

  custody(
    actor: Actor,
    assetId: string,
    toStatus: string,
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.custody:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/custody/transitions`,
      { toStatus },
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "VaultCustodyRecord" WHERE "assetId" = ${assetId} FOR UPDATE`;
        const custody = await db.vaultCustodyRecord.findUnique({
          where: { assetId },
        });
        if (!custody)
          throw new NotFoundException({
            code: 'CUSTODY_PROOF_REQUIRED',
            message: 'Asset intake is required.',
          });
        assertCustodyTransition(custody.status, toStatus);
        const at = new Date();
        const updated = await db.vaultCustodyRecord.update({
          where: { id: custody.id },
          data: {
            status: toStatus as never,
            receivedAt: toStatus === 'RECEIVED' ? at : custody.receivedAt,
            securedAt: toStatus === 'SECURED' ? at : custody.securedAt,
          },
        });
        await db.custodyEvent.create({
          data: {
            id: randomUUID(),
            assetId,
            custodyRecordId: custody.id,
            fromStatus: custody.status,
            toStatus: toStatus as never,
            actorUserId: actor.userId,
            occurredAt: at,
          },
        });
        await audit('CUSTODY_STATUS_CHANGED', 'asset', assetId, {
          assetId,
          fromStatus: custody.status,
          toStatus,
        });
        await this.notifyOwner(
          db,
          assetId,
          `LIFECYCLE_CUSTODY_${toStatus}`,
          'Asset custody status updated',
        );
        return {
          assetId,
          custodyStatus: updated.status,
          asOf: updated.updatedAt.toISOString(),
        };
      },
    );
  }

  valuation(
    actor: Actor,
    assetId: string,
    input: {
      valueMinor: bigint;
      currency: string;
      confidence: number;
      methodologyCode: string;
      sourceType: string;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.valuation:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/valuations/decisions`,
      input,
      requestId,
      key,
      async (db, audit) => {
        assertMoney(input.valueMinor, input.currency);
        if (
          !Number.isInteger(input.confidence) ||
          input.confidence < 0 ||
          input.confidence > 100
        )
          throw new ConflictException({
            code: 'VALUATION_EVIDENCE_INVALID',
            message: 'Confidence must be a whole percentage.',
          });
        await this.asset(db, assetId);
        const at = new Date();
        await db.valuationEvidence.create({
          data: {
            id: randomUUID(),
            assetId,
            sourceType: input.sourceType,
            observedAt: at,
            valueMinor: input.valueMinor,
            currency: input.currency,
            conditionBasis: 'MANUAL_UNVERIFIED',
            confidence: input.confidence,
            createdByUserId: actor.userId,
          },
        });
        await db.valuationDecision.updateMany({
          where: { assetId, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
        const decision = await db.valuationDecision.create({
          data: {
            id: randomUUID(),
            assetId,
            valueMinor: input.valueMinor,
            currency: input.currency,
            confidence: input.confidence,
            methodologyCode: input.methodologyCode,
            decidedByUserId: actor.userId,
            decidedAt: at,
          },
        });
        await audit('VALUATION_DECIDED', 'asset', assetId, {
          assetId,
          currency: input.currency,
          confidence: input.confidence,
          methodologyCode: input.methodologyCode,
        });
        await this.notifyOwner(
          db,
          assetId,
          'LIFECYCLE_VALUATION_COMPLETE',
          'Asset valuation recorded',
        );
        return {
          assetId,
          valuation: {
            amount: decision.valueMinor.toString(),
            currency: decision.currency,
            confidence: decision.confidence,
            asOf: decision.decidedAt.toISOString(),
            status: 'MANUAL_UNVERIFIED',
          },
        };
      },
    );
  }

  coverage(
    actor: Actor,
    assetId: string,
    input: {
      insuredValueMinor: bigint;
      currency: string;
      effectiveAt: Date;
      expiresAt: Date;
      status: 'PENDING' | 'ACTIVE';
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.coverage:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/insurance/coverage`,
      input,
      requestId,
      key,
      async (db, audit) => {
        assertMoney(input.insuredValueMinor, input.currency);
        if (input.expiresAt <= input.effectiveAt)
          throw new ConflictException({
            code: 'COVERAGE_INVALID',
            message: 'Coverage dates are invalid.',
          });
        await this.asset(db, assetId);
        const coverage = await db.insuranceCoverage.create({
          data: {
            id: randomUUID(),
            assetId,
            providerCode: 'MANUAL_UNVERIFIED',
            insuredValueMinor: input.insuredValueMinor,
            currency: input.currency,
            status: input.status,
            effectiveAt: input.effectiveAt,
            expiresAt: input.expiresAt,
          },
        });
        await audit('INSURANCE_COVERAGE_RECORDED', 'asset', assetId, {
          assetId,
          status: coverage.status,
          currency: coverage.currency,
        });
        if (coverage.status === 'ACTIVE') {
          await this.notifyOwner(
            db,
            assetId,
            'LIFECYCLE_INSURANCE_ACTIVE',
            'Asset coverage is active',
          );
        }
        return {
          assetId,
          insurance: {
            status: coverage.status,
            insuredAmount: coverage.insuredValueMinor.toString(),
            currency: coverage.currency,
            expiresAt: coverage.expiresAt.toISOString(),
          },
        };
      },
    );
  }

  async readiness(actor: Actor, assetId: string, requestId?: string) {
    const result = await this.readinessFor(this.db, assetId);
    if (requestId)
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'ASSET_PUBLICATION_READINESS_EVALUATED',
          resourceType: 'asset',
          resourceId: assetId,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { assetId, status: result.status },
        },
      });
    return result;
  }

  publish(actor: Actor, assetId: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(
      actor,
      `lifecycle.publish:${assetId}`,
      'POST',
      `/v1/admin/assets/${assetId}/publish`,
      {},
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
        const readiness = await this.readinessFor(db, assetId);
        if (readiness.status !== 'READY')
          throw new ConflictException({
            code: 'PUBLICATION_BLOCKED',
            message: 'Publication prerequisites are not met.',
            blockingCodes: readiness.blockingCodes,
          });
        const asset = await this.asset(db, assetId);
        const existing = await db.assetPublication.findUnique({
          where: { assetId },
        });
        if (existing?.status === 'PUBLISHED') {
          return {
            assetId,
            status: 'PUBLISHED',
            publishedAt: existing.publishedAt!.toISOString(),
            version: existing.version,
          };
        }
        const now = new Date();
        const publication = await db.assetPublication.upsert({
          where: { assetId },
          create: {
            id: randomUUID(),
            assetId,
            status: 'PUBLISHED',
            readiness: { blockingCodes: [] },
            publishedAt: now,
            publishedByUserId: actor.userId,
          },
          update: {
            status: 'PUBLISHED',
            readiness: { blockingCodes: [] },
            publishedAt: now,
            publishedByUserId: actor.userId,
            version: { increment: 1 },
          },
        });
        await db.asset.update({
          where: { id: asset.id },
          data: { status: 'PUBLISHED', publishedAt: now },
        });
        await audit('ASSET_PUBLISHED', 'asset', assetId, {
          assetId,
          version: publication.version,
        });
        await this.notifyOwner(
          db,
          assetId,
          'LIFECYCLE_PUBLISHED',
          'Asset published',
        );
        return {
          assetId,
          status: 'PUBLISHED',
          publishedAt: now.toISOString(),
          version: publication.version,
        };
      },
    );
  }

  private async readinessFor(db: PrismaService | Db, assetId: string) {
    const asset = await (db as PrismaService).asset.findUnique({
      where: { id: assetId },
      include: {
        submissions: { where: { status: 'APPROVED' }, take: 1 },
        valuationDecisions: { where: { status: 'ACTIVE' }, take: 1 },
        custodyRecord: true,
        insuranceCoverage: {
          where: {
            status: 'ACTIVE',
            effectiveAt: { lte: new Date() },
            expiresAt: { gt: new Date() },
          },
          take: 1,
        },
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    const evaluated = evaluateReadiness({
      cataloguePublished: asset.status !== 'ARCHIVED',
      verificationApproved: asset.submissions.length > 0,
      activeDecision: asset.valuationDecisions.length > 0,
      custodySecured: asset.custodyRecord?.status === 'SECURED',
      activeCoverage: asset.insuranceCoverage.length > 0,
      hasException: asset.custodyRecord?.status === 'EXCEPTION',
    });
    return { assetId, ...evaluated };
  }
  private async asset(db: Db, id: string) {
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found.',
      });
    return asset;
  }

  private async notifyOwner(
    db: Db,
    assetId: string,
    type: string,
    title: string,
  ) {
    const submission = await db.assetSubmission.findFirst({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      select: { ownerUserId: true },
    });
    if (!submission) return;
    await db.notification.create({
      data: {
        id: randomUUID(),
        userId: submission.ownerUserId,
        type,
        title,
        body: 'Your asset lifecycle status has changed.',
        resourceType: 'asset',
        resourceId: assetId,
      },
    });
  }
  private async mutate<T extends Record<string, unknown>>(
    actor: Actor,
    scope: string,
    method: string,
    path: string,
    body: unknown,
    requestId: string,
    key: string,
    work: (
      db: Db,
      audit: (
        action: string,
        type: string,
        id: string,
        metadata: Record<string, unknown>,
      ) => Promise<void>,
    ) => Promise<T>,
  ) {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope,
      key,
    };
    const hash = createHash('sha256')
      .update(`${method}\n${path}\n${canonicalBody(body)}`)
      .digest('hex');
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        hash,
        new Date(Date.now() + 86_400_000),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT')
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: 'The request key cannot be reused for this operation.',
        });
      if (acquired.state === 'EXISTING_IN_PROGRESS')
        throw new ConflictException({
          code: 'PERSISTENCE_CONFLICT',
          message: 'The request is already in progress.',
        });
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as T;
      const audit = (
        action: string,
        resourceType: string,
        resourceId: string,
        metadata: Record<string, unknown>,
      ) =>
        tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action,
          resourceType,
          resourceId,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata,
          createdAt: new Date(),
        });
      const result = await work(db, audit);
      await tx.idempotency.complete(
        identity,
        { status: 200, body: result },
        new Date(),
      );
      return result;
    });
  }
}

/** Request DTOs use bigint for GBP minor units; native JSON cannot encode bigint. */
function canonicalBody(body: unknown) {
  return JSON.stringify(body, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

function safeStatus(asset: {
  publication: { status: string; updatedAt: Date } | null;
  custodyRecord: { status: string; updatedAt: Date } | null;
  insuranceCoverage: Array<{ status: string; expiresAt: Date }>;
}) {
  const coverage = asset.insuranceCoverage.find(
    (item) => item.status === 'ACTIVE' && item.expiresAt > new Date(),
  );
  return {
    publication: asset.publication
      ? {
          status: asset.publication.status,
          asOf: asset.publication.updatedAt.toISOString(),
        }
      : null,
    custody: asset.custodyRecord
      ? {
          status: asset.custodyRecord.status,
          asOf: asset.custodyRecord.updatedAt.toISOString(),
        }
      : null,
    insurance: coverage
      ? { status: 'ACTIVE', expiresAt: coverage.expiresAt.toISOString() }
      : { status: 'UNAVAILABLE', expiresAt: null },
  };
}
