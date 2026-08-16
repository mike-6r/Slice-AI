import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { parseOwnershipUnits } from '../domain/ownership-units';
import {
  policyPreview,
  STANDARD_OWNERSHIP_POLICY,
  validatePolicyUnits,
} from '../domain/issuance-policy';

type Db = Prisma.TransactionClient;

@Injectable()
export class OwnershipPolicyService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async adminProjection(assetId: string) {
    const asset = await this.db.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        status: true,
        custodyRecord: { select: { status: true } },
        controlledBetaBypass: { select: { id: true } },
        insuranceCoverage: {
          where: { status: 'ACTIVE', effectiveAt: { lte: new Date() }, expiresAt: { gt: new Date() } },
          select: { expiresAt: true },
          orderBy: { expiresAt: 'desc' },
          take: 2,
        },
        ownershipSupply: { select: { status: true, totalUnits: true, issuedUnits: true } },
        ownershipSupplyPolicy: true,
        valuationDecisions: {
          where: { status: 'ACTIVE' },
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: { valueMinor: true, currency: true, decidedAt: true, methodologyCode: true },
        },
      },
    });
    if (!asset) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Asset not found.' });
    const decision = asset.valuationDecisions[0] ?? null;
    const valuation = decision
      ? {
          minor: decision.valueMinor.toString(),
          currency: decision.currency,
          asOf: decision.decidedAt.toISOString(),
          method: decision.methodologyCode,
        }
      : null;
    const previews = STANDARD_OWNERSHIP_POLICY.candidates.map((units) => {
      const preview = policyPreview(decision?.valueMinor ?? null, units);
      return {
        units: units.toString(),
        pricePerUnitMinor: preview?.pricePerUnitMinor ?? null,
        remainderMinor: preview?.remainderMinor ?? null,
        impliedWholeValueMinor: preview?.impliedWholeValueMinor ?? null,
        currency: decision?.currency ?? null,
      };
    });
    const policy = asset.ownershipSupplyPolicy;
    const status = policy?.status ?? 'NOT_CONFIGURED';
    const blockers = [
      asset.status !== 'PUBLISHED' ? 'CATALOGUE_NOT_PUBLISHED' : null,
      !decision ? 'VALUATION_REQUIRED' : null,
      asset.custodyRecord?.status !== 'SECURED' && !asset.controlledBetaBypass
        ? 'CUSTODY_NOT_SECURED'
        : null,
      status !== 'APPROVED' && status !== 'ISSUED' ? 'SUPPLY_POLICY_NOT_APPROVED' : null,
    ].filter((value): value is string => Boolean(value));
    return {
      assetId,
      status,
      policy: {
        code: STANDARD_OWNERSHIP_POLICY.code,
        label: STANDARD_OWNERSHIP_POLICY.label,
        minimumUnits: STANDARD_OWNERSHIP_POLICY.minimumUnits.toString(),
        maximumUnits: STANDARD_OWNERSHIP_POLICY.maximumUnits.toString(),
        defaultUnits: STANDARD_OWNERSHIP_POLICY.defaultUnits.toString(),
        candidates: STANDARD_OWNERSHIP_POLICY.candidates.map((value) => value.toString()),
        rounding: STANDARD_OWNERSHIP_POLICY.rounding,
      },
      valuation,
      insurance: {
        active: asset.insuranceCoverage.length === 1,
        expiresAt: asset.insuranceCoverage[0]?.expiresAt.toISOString() ?? null,
      },
      proposed: policy
        ? {
            id: policy.id,
            status: policy.status,
            policyCode: policy.policyCode,
            units: policy.proposedUnits.toString(),
            pricePerUnitMinor: policy.pricePerUnitMinor.toString(),
            remainderMinor: policy.remainderMinor.toString(),
            valuationMinor: policy.valuationMinor.toString(),
            valuationCurrency: policy.valuationCurrency,
            reason: policy.reason,
            proposedAt: policy.proposedAt.toISOString(),
            approvedAt: policy.approvedAt?.toISOString() ?? null,
          }
        : null,
      previews,
      readiness: { ready: blockers.length === 0, blockers },
      supply: asset.ownershipSupply
        ? {
            status: asset.ownershipSupply.status,
            totalUnits: asset.ownershipSupply.totalUnits.toString(),
            issuedUnits: asset.ownershipSupply.issuedUnits.toString(),
          }
        : null,
    };
  }

  propose(
    actor: Actor,
    assetId: string,
    input: { policyCode: string; totalUnits: string; reason: string },
    requestId: string,
    key: string,
  ) {
    this.recentAuth.require(actor);
    const units = parseOwnershipUnits(input.totalUnits);
    validatePolicyUnits(units);
    if (input.policyCode !== STANDARD_OWNERSHIP_POLICY.code)
      throw new ConflictException({ code: 'SUPPLY_POLICY_UNSUPPORTED', message: 'That supply policy is not available.' });
    return this.mutate(actor, assetId, 'propose', input, requestId, key, async (db, audit) => {
      const asset = await db.asset.findUnique({
        where: { id: assetId },
        include: {
          ownershipSupply: true,
          ownershipSupplyPolicy: true,
          valuationDecisions: { where: { status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' }, take: 1 },
        },
      });
      if (!asset) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Asset not found.' });
      if (asset.ownershipSupply)
        throw new ConflictException({ code: 'OWNERSHIP_ALREADY_ISSUED', message: 'Supply cannot be configured after issuance.' });
      if (asset.ownershipSupplyPolicy && asset.ownershipSupplyPolicy.status !== 'REJECTED')
        throw new ConflictException({ code: 'SUPPLY_POLICY_ALREADY_CONFIGURED', message: 'A supply proposal already exists for this asset.' });
      const decision = asset.valuationDecisions[0];
      if (!decision) throw new ConflictException({ code: 'VALUATION_REQUIRED', message: 'An active valuation is required before proposing supply.' });
      const preview = policyPreview(decision.valueMinor, units)!;
      const now = new Date();
      const policy = await db.ownershipSupplyPolicy.upsert({
        where: { assetId },
        create: {
          id: randomUUID(), assetId, policyCode: input.policyCode, status: 'PROPOSED',
          proposedUnits: units, valuationMinor: decision.valueMinor, valuationCurrency: decision.currency,
          pricePerUnitMinor: BigInt(preview.pricePerUnitMinor), remainderMinor: BigInt(preview.remainderMinor),
          reason: input.reason.trim(), proposedByUserId: actor.userId, proposedAt: now,
        },
        update: {
          policyCode: input.policyCode, status: 'PROPOSED', proposedUnits: units,
          valuationMinor: decision.valueMinor, valuationCurrency: decision.currency,
          pricePerUnitMinor: BigInt(preview.pricePerUnitMinor), remainderMinor: BigInt(preview.remainderMinor),
          reason: input.reason.trim(), proposedByUserId: actor.userId, proposedAt: now,
          approvedByUserId: null, approvedAt: null, issuedAt: null,
        },
      });
      await audit('OWNERSHIP_SUPPLY_PROPOSED', {
        assetId, policyCode: input.policyCode, totalUnits: units.toString(),
        valuationMinor: decision.valueMinor.toString(), valuationCurrency: decision.currency,
        pricePerUnitMinor: preview.pricePerUnitMinor, remainderMinor: preview.remainderMinor,
        reason: input.reason.trim(),
      });
      return { assetId, status: policy.status, units: policy.proposedUnits.toString(), pricePerUnitMinor: policy.pricePerUnitMinor.toString(), remainderMinor: policy.remainderMinor.toString() };
    });
  }

  approve(actor: Actor, assetId: string, reason: string, requestId: string, key: string) {
    this.recentAuth.require(actor);
    return this.mutate(actor, assetId, 'approve', { reason }, requestId, key, async (db, audit) => {
      await db.$queryRaw`SELECT "assetId" FROM "OwnershipSupplyPolicy" WHERE "assetId" = ${assetId} FOR UPDATE`;
      const policy = await db.ownershipSupplyPolicy.findUnique({ where: { assetId } });
      if (!policy) throw new NotFoundException({ code: 'SUPPLY_POLICY_NOT_FOUND', message: 'Propose a supply policy before approval.' });
      if (policy.status === 'ISSUED') throw new ConflictException({ code: 'OWNERSHIP_ALREADY_ISSUED', message: 'Issued supply cannot be approved again.' });
      if (policy.status !== 'PROPOSED') throw new ConflictException({ code: 'SUPPLY_POLICY_NOT_PROPOSED', message: 'Only a proposed supply policy can be approved.' });
      const decision = await db.valuationDecision.findFirst({ where: { assetId, status: 'ACTIVE' }, orderBy: { decidedAt: 'desc' } });
      if (!decision || decision.valueMinor !== policy.valuationMinor || decision.currency !== policy.valuationCurrency)
        throw new ConflictException({ code: 'VALUATION_CHANGED', message: 'The authoritative valuation changed. Propose the supply again.' });
      const updated = await db.ownershipSupplyPolicy.update({ where: { assetId }, data: { status: 'APPROVED', approvedByUserId: actor.userId, approvedAt: new Date() } });
      await audit('OWNERSHIP_SUPPLY_APPROVED', {
        assetId, policyCode: updated.policyCode, totalUnits: updated.proposedUnits.toString(),
        valuationMinor: updated.valuationMinor.toString(), valuationCurrency: updated.valuationCurrency,
        pricePerUnitMinor: updated.pricePerUnitMinor.toString(), remainderMinor: updated.remainderMinor.toString(),
        reason: reason.trim(),
      });
      return { assetId, status: updated.status, units: updated.proposedUnits.toString(), pricePerUnitMinor: updated.pricePerUnitMinor.toString(), remainderMinor: updated.remainderMinor.toString() };
    });
  }

  private async mutate<T extends Record<string, unknown>>(
    actor: Actor, assetId: string, operation: string, body: unknown, requestId: string, key: string,
    work: (db: Db, audit: (action: string, metadata: Record<string, unknown>) => Promise<void>) => Promise<T>,
  ) {
    const identity: IdempotencyIdentity = { actorScope: `user:${actor.userId}`, scope: `ownership.supply-policy.${operation}:${assetId}`, key };
    const hash = createHash('sha256').update(`${operation}\n${JSON.stringify(body)}`).digest('hex');
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(identity, hash, new Date(Date.now() + 86_400_000));
      if (acquired.state === 'FINGERPRINT_CONFLICT') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'The request key cannot be reused for another policy change.' });
      if (acquired.state === 'EXISTING_IN_PROGRESS') throw new ConflictException({ code: 'PERSISTENCE_CONFLICT', message: 'The request is already in progress.' });
      if (acquired.state === 'EXISTING_COMPLETED') return acquired.record.response!.body as T;
      const audit = (action: string, metadata: Record<string, unknown>) => tx.audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action, resourceType: 'asset', resourceId: assetId, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata, createdAt: new Date() });
      const result = await work(db, audit);
      await tx.idempotency.complete(identity, { status: 200, body: result }, new Date());
      return result;
    });
  }
}
