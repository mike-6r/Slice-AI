import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../../submissions/ports/submission-storage.ports';
import {
  assertCustodyTransition,
  assertMoney,
  evaluateReadiness,
} from '../domain/publication.policy';

type Db = Prisma.TransactionClient;
type OperationsBoardInput = {
  limit?: number;
  tab?: string;
  q?: string;
  category?: string;
  grader?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  page?: number;
  pageSize?: number;
};
type OperationsStage =
  | 'AWAITING_VERIFICATION'
  | 'VERIFICATION_IN_PROGRESS'
  | 'AWAITING_VALUATION'
  | 'CUSTODY_PENDING'
  | 'VAULT_READY'
  | 'MARKET_READY'
  | 'MARKET_LIVE'
  | 'EXCEPTION';
type BoardAsset = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  certificationNumber: string | null;
  edition: string | null;
  status: string;
  updatedAt: Date;
  createdAt: Date;
  category: { name: string; slug: string };
  collectibleSet: { name: string } | null;
  gradeScaleEntry: {
    grade: { toFixed: (digits: number) => string };
    company: { code: string };
  } | null;
  submissions: Array<{
    id: string;
    status: string;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    owner: {
      id: string;
      profile: { displayName: string; publicUsername: string | null } | null;
    };
    media: Array<{ slot: string; status: string; objectKey: string }>;
    marketResearch: Array<{ state: string; collectedAt: Date }>;
    intake: {
      status: string;
      selectedAt: Date;
      receivedAt: Date | null;
      shipment: {
        status: string;
        shippedAt: Date;
        deliveredAt: Date | null;
      } | null;
      receipt: { confirmedAt: Date } | null;
      vault: { displayName: string };
    } | null;
    reviews: Array<{
      status: string;
      createdAt: Date;
      completedAt: Date | null;
    }>;
  }>;
  valuationDecisions: Array<{ status: string; decidedAt: Date }>;
  valuationEvidence: Array<{
    sourceType: string;
    sourceRef: string | null;
    observedAt: Date;
  }>;
  marketSnapshots: Array<{ asOf: Date }>;
  custodyRecord: { status: string; updatedAt: Date } | null;
  insuranceCoverage: Array<{ status: string; expiresAt: Date }>;
  publication: { status: string; updatedAt: Date; readiness: unknown } | null;
};

export const CONTROLLED_BETA_UMBREON_FIXTURE_KEY =
  'UMBREON_VMAX_2021_EVOLVING_SKIES_215_203';
export const CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE =
  'BETA_QA_PHYSICAL_BYPASS';
export const CONTROLLED_BETA_PHYSICAL_BYPASS_CONFIRMATION =
  'BETA_QA_PHYSICAL_BYPASS';

@Injectable()
export class LifecycleService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
  async operationsQueue(actor: Actor, input: number | OperationsBoardInput) {
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
    if (typeof input === 'number') {
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
        take: input,
      });
      return {
        items: assets.map((asset) => ({
          id: asset.id,
          publicId: asset.publicId,
          title: asset.title,
          catalogueStatus: asset.status,
          valuationStatus: asset.valuationDecisions.length
            ? 'ACTIVE'
            : 'MISSING',
          custodyStatus: asset.custodyRecord?.status ?? 'MISSING',
          coverageStatus: asset.insuranceCoverage.length ? 'ACTIVE' : 'MISSING',
          publicationStatus: asset.publication?.status ?? 'BLOCKED',
          updatedAt: asset.updatedAt.toISOString(),
        })),
      };
    }
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 10;
    const assets = await this.db.asset.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        ...(input.q
          ? {
              OR: [
                { title: { contains: input.q, mode: 'insensitive' } },
                { publicId: { contains: input.q, mode: 'insensitive' } },
                { slug: { contains: input.q, mode: 'insensitive' } },
                { cardNumber: { contains: input.q, mode: 'insensitive' } },
                {
                  certificationNumber: {
                    contains: input.q,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
        ...(input.category ? { category: { slug: input.category } } : {}),
        ...(input.grader
          ? {
              gradeScaleEntry: {
                company: { code: input.grader.toUpperCase() },
              },
            }
          : {}),
      },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        submissions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            owner: {
              select: {
                id: true,
                profile: {
                  select: { displayName: true, publicUsername: true },
                },
              },
            },
            media: { where: { status: 'SAFE', deletedAt: null }, take: 2 },
            intake: { include: { vault: true, shipment: true, receipt: true } },
            reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
            marketResearch: {
              orderBy: { collectedAt: 'desc' },
              take: 1,
              select: { state: true, collectedAt: true },
            },
          },
        },
        valuationDecisions: {
          where: { status: 'ACTIVE' },
          orderBy: { decidedAt: 'desc' },
          take: 1,
        },
        valuationEvidence: { orderBy: { observedAt: 'desc' }, take: 10 },
        marketSnapshots: { orderBy: { asOf: 'desc' }, take: 1 },
        custodyRecord: true,
        insuranceCoverage: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
        publication: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 500,
    });
    const projected = (await Promise.all(
      assets.map((asset) => operationsItem(asset, this.storage)),
    ))
      .filter((item): item is NonNullable<Awaited<ReturnType<typeof operationsItem>>> =>
        Boolean(item),
      )
      .filter(
        (item) =>
          !input.tab ||
          input.tab === 'all' ||
          tabMatches(item.currentStage, input.tab),
      )
      .filter((item) => !input.priority || item.priority === input.priority)
      .sort(
        (left, right) =>
          priorityRank(left.priority) - priorityRank(right.priority) ||
          new Date(left.stageSince).getTime() -
            new Date(right.stageSince).getTime() ||
          left.id.localeCompare(right.id),
      );
    const allProjected = await Promise.all(
      assets.map((asset) => operationsItem(asset, this.storage)),
    );
    const counts = stageCounts(
      allProjected.filter(
        (item): item is NonNullable<Awaited<ReturnType<typeof operationsItem>>> =>
          Boolean(item),
      ),
    );
    const start = (page - 1) * pageSize;
    const items = projected.slice(start, start + pageSize);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activity = await this.db.auditEvent.findMany({
      where: { resourceType: 'asset', createdAt: { gte: today } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const flow = activity.reduce<Record<string, number>>((result, event) => {
      result[event.action] = (result[event.action] ?? 0) + 1;
      return result;
    }, {});
    return {
      items,
      pagination: {
        page,
        pageSize,
        total: projected.length,
        totalPages: Math.max(1, Math.ceil(projected.length / pageSize)),
      },
      counts,
      operationsOverview: Object.entries(counts).map(([stage, count]) => ({
        stage,
        label: stageLabel(stage),
        count,
      })),
      stageFlowToday: Object.entries(flow)
        .slice(0, 8)
        .map(([type, count]) => ({ type, label: stageLabel(type), count })),
      recentActivity: activity.slice(0, 10).map((event) => ({
        id: event.id,
        type: event.action,
        title: stageLabel(event.action),
        reference: event.resourceId ?? '',
        occurredAt: event.createdAt.toISOString(),
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

  controlledBetaPhysicalBypass(
    actor: Actor,
    input: {
      submissionId: string;
      assetId: string;
      fixtureKey: string;
      reason: string;
      confirmation: string;
    },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    if (!this.config.isBeta)
      throw new ForbiddenException({
        code: 'CONTROLLED_BETA_FEATURE_DISABLED',
        message: 'This controlled lifecycle exception is available only in beta.',
      });
    if (!actor.roles.includes('ADMIN'))
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only an administrator can apply this controlled exception.',
      });
    if (
      input.fixtureKey !== CONTROLLED_BETA_UMBREON_FIXTURE_KEY ||
      input.confirmation !== CONTROLLED_BETA_PHYSICAL_BYPASS_CONFIRMATION
    )
      throw new ConflictException({
        code: 'CONTROLLED_BETA_CONFIRMATION_REQUIRED',
        message: 'The named beta fixture and confirmation are required.',
      });

    return this.mutate(
      actor,
      `lifecycle.controlled-beta-physical-bypass:${input.submissionId}`,
      'POST',
      `/v1/admin/submissions/${input.submissionId}/controlled-beta/physical-bypass`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await db.assetSubmission.findUnique({
          where: { id: input.submissionId },
          include: {
            controlledBetaBypass: true,
            asset: {
              include: {
                category: true,
                collectibleSet: true,
                custodyRecord: true,
                controlledBetaBypass: true,
              },
            },
          },
        });
        const asset = submission?.asset;
        const fixtureMatches =
          asset?.title.toLowerCase().includes('umbreon vmax') &&
          asset.year === 2021 &&
          asset.cardNumber === '215/203' &&
          asset.collectibleSet?.name.toLowerCase() === 'evolving skies' &&
          asset.category.name.toLowerCase() === 'pokémon tcg';
        if (
          !submission ||
          submission.assetId !== input.assetId ||
          submission.status !== 'APPROVED' ||
          !asset ||
          !fixtureMatches
        )
          throw new ConflictException({
            code: 'CONTROLLED_BETA_FIXTURE_REQUIRED',
            message:
              'This exception is limited to the approved Umbreon VMAX 215/203 beta fixture.',
          });
        if (submission.controlledBetaBypass || asset.controlledBetaBypass)
          throw new ConflictException({
            code: 'CONTROLLED_BETA_BYPASS_ALREADY_APPLIED',
            message: 'The controlled beta exception has already been applied.',
          });
        if (asset.custodyRecord)
          throw new ConflictException({
            code: 'PHYSICAL_STATE_ALREADY_STARTED',
            message:
              'The controlled exception cannot be applied after a custody record exists.',
          });

        const created = await db.controlledBetaPhysicalBypass.create({
          data: {
            id: randomUUID(),
            submissionId: submission.id,
            assetId: asset.id,
            reasonCode: CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE,
            reason: input.reason.trim(),
            createdByUserId: actor.userId,
          },
        });
        await audit(
          'CONTROLLED_BETA_PHYSICAL_BYPASS_APPLIED',
          'asset',
          asset.id,
          {
            submissionId: submission.id,
            assetId: asset.id,
            reasonCode: CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE,
            reason: input.reason.trim(),
          },
        );
        return {
          status: 'APPLIED',
          submissionId: submission.id,
          assetId: asset.id,
          reasonCode: CONTROLLED_BETA_PHYSICAL_BYPASS_REASON_CODE,
          createdAt: created.createdAt.toISOString(),
          physicalStateUnchanged: true,
        };
      },
    );
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
        controlledBetaBypass: true,
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
      controlledBetaPhysicalBypass: Boolean(asset.controlledBetaBypass),
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

async function operationsItem(asset: BoardAsset, storage: ObjectStoragePort) {
  const submission = asset.submissions[0];
  const intake = submission?.intake;
  if (!submission || submission.status !== 'APPROVED' || !intake?.receipt)
    return null;
  const review = submission.reviews[0];
  const decision = asset.valuationDecisions[0];
  const custodyException = asset.custodyRecord?.status === 'EXCEPTION';
  const shipmentException = intake.shipment?.status === 'EXCEPTION';
  const publicationException = asset.publication?.status === 'UNPUBLISHED';
  const exception =
    shipmentException || custodyException || publicationException;
  const verified =
    review?.status === 'COMPLETED' ||
    ['VERIFIED', 'PUBLISHED'].includes(asset.status);
  const secured = asset.custodyRecord?.status === 'SECURED';
  const covered = asset.insuranceCoverage.some(
    (item) => item.status === 'ACTIVE' && item.expiresAt > new Date(),
  );
  const readiness = evaluateReadiness({
    cataloguePublished: asset.status !== 'ARCHIVED',
    verificationApproved: verified,
    activeDecision: Boolean(decision),
    custodySecured: secured,
    activeCoverage: covered,
    hasException: exception,
  });
  let currentStage: OperationsStage;
  let stageSince: Date;
  let detailTab = 'verification';
  if (exception) {
    currentStage = 'EXCEPTION';
    stageSince =
      intake.shipment?.deliveredAt ??
      asset.custodyRecord?.updatedAt ??
      asset.updatedAt;
    detailTab = custodyException
      ? 'custody'
      : publicationException
        ? 'marketplace'
        : 'shipping';
  } else if (!verified) {
    currentStage =
      review?.status === 'CLAIMED'
        ? 'VERIFICATION_IN_PROGRESS'
        : 'AWAITING_VERIFICATION';
    stageSince =
      review?.createdAt ?? intake.receivedAt ?? intake.receipt.confirmedAt;
  } else if (!decision) {
    currentStage = 'AWAITING_VALUATION';
    stageSince = review?.completedAt ?? asset.updatedAt;
    detailTab = 'valuation';
  } else if (!secured) {
    currentStage = 'CUSTODY_PENDING';
    stageSince = asset.custodyRecord?.updatedAt ?? decision.decidedAt;
    detailTab = 'custody';
  } else if (asset.publication?.status === 'PUBLISHED') {
    currentStage = 'MARKET_LIVE';
    stageSince = asset.publication.updatedAt;
    detailTab = 'marketplace';
  } else if (readiness.status === 'READY') {
    currentStage = 'MARKET_READY';
    stageSince =
      asset.publication?.updatedAt ??
      asset.custodyRecord?.updatedAt ??
      decision.decidedAt;
    detailTab = 'marketplace';
  } else {
    currentStage = 'VAULT_READY';
    stageSince = asset.custodyRecord?.updatedAt ?? decision.decidedAt;
    detailTab = 'custody';
  }
  const research = submission.marketResearch[0];
  const source = asset.valuationEvidence.find(
    (item) => item.sourceType === 'STAGING_CURRENT_LISTING',
  );
  const approvedMedia = submission.media
    .filter((item) => item.status === 'SAFE' && item.objectKey)
    .sort((left) => (left.slot.toLowerCase() === 'front' ? -1 : 1));
  const thumbnailUrl = approvedMedia[0]
    ? await storage
        .createPrivateDownloadUrl(
          approvedMedia[0].objectKey,
          new Date(Date.now() + 5 * 60_000),
        )
        .catch(() => null)
    : source
      ? sourceImage(source.sourceRef)
      : null;
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - stageSince.getTime()) / 86_400_000),
  );
  return {
    id: asset.id,
    publicId: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    thumbnailUrl,
    collector: submission.owner
      ? {
          id: submission.owner.id,
          displayName:
            submission.owner.profile?.displayName ?? 'Unnamed collector',
          username: submission.owner.profile?.publicUsername ?? null,
          membership: null,
        }
      : null,
    grading: {
      company: asset.gradeScaleEntry?.company.code ?? null,
      grade:
        asset.gradeScaleEntry?.grade.toFixed(2).replace(/\.00$/, '') ?? null,
      certNumber: asset.certificationNumber,
      gradeDate: null,
    },
    category: {
      name: asset.category.name,
      set: asset.collectibleSet?.name ?? null,
      variant: asset.edition,
    },
    research: {
      status: research ? normalizeResearch(research.state) : 'NOT_REQUESTED',
      asOf: research?.collectedAt.toISOString() ?? null,
    },
    currentStage,
    stageSince: stageSince.toISOString(),
    priority:
      exception || ageDays >= 7 ? 'HIGH' : ageDays >= 3 ? 'MEDIUM' : 'LOW',
    exception: exception
      ? {
          type: shipmentException
            ? 'INTAKE_EXCEPTION'
            : custodyException
              ? 'CUSTODY_EXCEPTION'
              : 'PUBLICATION_EXCEPTION',
          severity: 'HIGH',
          openedAt: stageSince.toISOString(),
          summary: shipmentException
            ? 'Shipment exception requires intake review.'
            : custodyException
              ? 'Custody requires operator attention.'
              : 'Publication is not currently live.',
          detailTab,
        }
      : null,
    recommendedDetailTab: detailTab,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    sourceContext: {
      submissionId: submission.id,
      receivedAt: intake.receivedAt?.toISOString() ?? null,
      receiptConfirmedAt: intake.receipt.confirmedAt.toISOString(),
      vault: intake.vault.displayName,
    },
    assignee: null,
    blockers: readiness.blockingCodes,
    readiness,
    nextAction: nextActionFor(currentStage, readiness.blockingCodes),
    eligibleActions: eligibleActionsFor(currentStage, readiness),
    ageDays,
  };
}

function nextActionFor(stage: OperationsStage, blockers: string[]) {
  if (stage === 'EXCEPTION') return 'Resolve the lifecycle exception';
  if (stage === 'AWAITING_VERIFICATION' || stage === 'VERIFICATION_IN_PROGRESS')
    return 'Review identity and evidence';
  if (stage === 'AWAITING_VALUATION') return 'Record a supported valuation';
  if (stage === 'CUSTODY_PENDING') return 'Confirm secure custody';
  if (stage === 'VAULT_READY')
    return blockers.includes('ACTIVE_COVERAGE_REQUIRED')
      ? 'Add active insurance coverage'
      : 'Complete market readiness';
  if (stage === 'MARKET_READY') return 'Publish when approved';
  return 'Monitor market listing';
}

function eligibleActionsFor(
  stage: OperationsStage,
  readiness: { status: 'BLOCKED' | 'READY'; blockingCodes: string[] },
) {
  const actions: string[] = ['VIEW'];
  if (stage === 'AWAITING_VERIFICATION' || stage === 'VERIFICATION_IN_PROGRESS')
    actions.push('REVIEW_VERIFICATION');
  if (stage === 'AWAITING_VALUATION') actions.push('RECORD_VALUATION');
  if (stage === 'CUSTODY_PENDING') actions.push('UPDATE_CUSTODY');
  if (stage === 'MARKET_READY' && readiness.status === 'READY') actions.push('PUBLISH');
  if (stage === 'EXCEPTION') actions.push('OPEN_EXCEPTION');
  return actions;
}

function sourceImage(sourceRef: string | null) {
  if (!sourceRef) return null;
  try {
    const value = JSON.parse(sourceRef) as { imageUrl?: unknown };
    return typeof value.imageUrl === 'string' ? value.imageUrl : null;
  } catch {
    return null;
  }
}
function normalizeResearch(
  state: string,
): 'COMPLETED' | 'IN_PROGRESS' | 'UNAVAILABLE' | 'NOT_REQUESTED' {
  if (state === 'COMPLETED') return 'COMPLETED';
  if (['IN_PROGRESS', 'PENDING'].includes(state)) return 'IN_PROGRESS';
  if (['UNAVAILABLE', 'FAILED'].includes(state)) return 'UNAVAILABLE';
  return 'NOT_REQUESTED';
}
function tabStage(value: string): OperationsStage | null {
  const map: Record<string, OperationsStage> = {
    verification: 'AWAITING_VERIFICATION',
    valuation: 'AWAITING_VALUATION',
    custody: 'CUSTODY_PENDING',
    'vault-ready': 'VAULT_READY',
    'market-ready': 'MARKET_READY',
    'market-live': 'MARKET_LIVE',
    exceptions: 'EXCEPTION',
  };
  return map[value] ?? null;
}
function tabMatches(stage: OperationsStage, tab: string) {
  if (tab === 'needs-action') return stage !== 'MARKET_LIVE';
  if (tab === 'verification')
    return (
      stage === 'AWAITING_VERIFICATION' || stage === 'VERIFICATION_IN_PROGRESS'
    );
  return stage === tabStage(tab);
}
function priorityRank(value: string) {
  return value === 'HIGH' ? 0 : value === 'MEDIUM' ? 1 : 2;
}
function stageCounts(items: Array<{ currentStage: OperationsStage }>) {
  const stages: OperationsStage[] = [
    'AWAITING_VERIFICATION',
    'VERIFICATION_IN_PROGRESS',
    'AWAITING_VALUATION',
    'CUSTODY_PENDING',
    'VAULT_READY',
    'MARKET_READY',
    'MARKET_LIVE',
    'EXCEPTION',
  ];
  return Object.fromEntries(
    stages.map((stage) => [
      stage,
      items.filter((item) => item.currentStage === stage).length,
    ]),
  ) as Record<OperationsStage, number>;
}
function stageLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
