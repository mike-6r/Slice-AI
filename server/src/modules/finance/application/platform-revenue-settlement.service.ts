import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { FinancialSeparationService } from './financial-separation.service';

@Injectable()
export class PlatformRevenueSettlementService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
    private readonly separation: FinancialSeparationService,
  ) {}

  async projection(forceProviderRefresh = false) {
    const { separation, settlements, providerTraces } =
      await this.separation.projection(forceProviderRefresh);
    const company = separation.sliceCompanyRevenue;
    return {
      currency: 'GBP' as const,
      grossRevenueMinor: company.grossFeeRevenueMinor,
      providerExpensesMinor: company.providerExpensesMinor,
      estimatedNetContributionMinor: company.recognisedNetRevenueMinor,
      // This is ledger-recognised revenue. The separately named
      // safeToSweep value is the only amount an operator may request.
      eligibleSettlementMinor: company.unsweptRecognisedRevenueMinor,
      knownProviderCostsMinor: company.knownProviderCostsMinor,
      pendingProviderCostCount: company.pendingProviderCostCount,
      byCategory: company.feeRevenueByCategory.map((item) => ({
        ...item,
        currency: 'GBP' as const,
      })),
      externalSettlement: {
        status: 'NOT_CONFIGURED' as const,
        destination: null,
      },
      financialSeparation: separation,
      providerTraces,
      settlements,
    };
  }

  async request(
    actor: Actor,
    requestedAmountMinor: string | undefined,
    reason: string,
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    const requestHash = createHash('sha256')
      .update(idempotencyKey)
      .digest('hex');
    return this.db.$transaction(async (db) => {
      // Different idempotency keys must not reserve the same verified company
      // revenue. The lock protects calculation-and-reservation; the provider
      // balance is refreshed only after it is acquired.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('PLATFORM_REVENUE_SAFE_SWEEP:GBP'))`;
      const existing = await db.platformRevenueSettlement.findUnique({
        where: { requestIdempotencyKeyHash: requestHash },
      });
      if (existing) return this.safe(existing, true);

      const snapshot = await this.projection(true);
      const company = snapshot.financialSeparation.sliceCompanyRevenue;
      const safeToSweep = BigInt(company.safeToSweepMinor);
      const requested =
        requestedAmountMinor === undefined
          ? safeToSweep
          : this.amount(requestedAmountMinor);
      if (safeToSweep <= 0n || company.safeToSweepStatus !== 'READY')
        throw new ConflictException({
          code: 'REVENUE_SWEEP_NOT_SAFE',
          message:
            'Slice cannot safely prove company revenue is available to sweep. Review the financial separation projection and configured reserve.',
          blockedReasons: company.blockedReasons,
        });
      if (requested <= 0n || requested > safeToSweep)
        throw new ConflictException({
          code: 'REVENUE_SWEEP_AMOUNT_INVALID',
          message:
            'The requested company revenue sweep must be within the server-calculated safe-to-sweep amount.',
          safeToSweepMinor: safeToSweep.toString(),
        });

      const safety = this.safetySnapshots(
        snapshot.financialSeparation,
        requested,
      );
      const settlement = await db.platformRevenueSettlement.create({
        data: {
          id: randomUUID(),
          currency: 'GBP',
          grossRevenueMinor: BigInt(snapshot.grossRevenueMinor),
          providerExpensesMinor: BigInt(snapshot.providerExpensesMinor),
          // The immutable request snapshot records the actual capped amount,
          // not a broad cumulative P&L estimate.
          eligibleSettlementMinor: safeToSweep,
          requestedAmountMinor: requested,
          reason,
          beforeFinancialSnapshot: safety.before,
          afterFinancialSnapshot: safety.after,
          requestIdempotencyKeyHash: requestHash,
          status: 'AWAITING_APPROVAL',
          // Approval is command readiness only. No transfer executor is wired
          // here, so this never implies a provider-side payment was sent.
          externalStatus: 'NOT_CONFIGURED',
          requestedByUserId: actor.userId,
          lines: {
            create: allocateRevenueLines(snapshot.byCategory, requested).map(
              (line) => ({
                id: randomUUID(),
                category: line.category,
                sourceType: 'FINANCIAL_ACCOUNT',
                sourceId: line.category,
                amountMinor: line.amountMinor,
                currency: 'GBP',
              }),
            ),
          },
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'PLATFORM_REVENUE_SETTLEMENT_REQUESTED',
        resourceType: 'platform-revenue-settlement',
        resourceId: settlement.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          requestedAmountMinor: requested.toString(),
          safeToSweepMinor: safeToSweep.toString(),
          reason,
          externalStatus: 'NOT_CONFIGURED',
          financialSnapshotAt: snapshot.financialSeparation.calculatedAt,
        },
        createdAt: new Date(),
      });
      return this.safe(settlement, false);
    });
  }

  async approve(
    actor: Actor,
    settlementId: string,
    requestId: string,
    idempotencyKey: string,
  ) {
    this.recentAuth.require(actor);
    const approvalHash = createHash('sha256')
      .update(idempotencyKey)
      .digest('hex');
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "PlatformRevenueSettlement" WHERE id = ${settlementId} FOR UPDATE`;
      const settlement = await db.platformRevenueSettlement.findUniqueOrThrow({
        where: { id: settlementId },
      });
      if (settlement.approvalIdempotencyKeyHash === approvalHash)
        return this.safe(settlement, true);
      if (settlement.requestedByUserId === actor.userId)
        throw new ConflictException({
          code: 'SETTLEMENT_SECOND_APPROVER_REQUIRED',
          message:
            'A second authorized finance operator must approve this settlement.',
        });
      if (settlement.status !== 'AWAITING_APPROVAL')
        throw new ConflictException({
          code: 'SETTLEMENT_NOT_AWAITING_APPROVAL',
          message: 'Only a pending settlement can be approved.',
        });
      const updated = await db.platformRevenueSettlement.update({
        where: { id: settlement.id },
        data: {
          status: 'APPROVED',
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          externalStatus: 'NOT_CONFIGURED',
          approvalIdempotencyKeyHash: approvalHash,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'PLATFORM_REVENUE_SETTLEMENT_APPROVED',
        resourceType: 'platform-revenue-settlement',
        resourceId: settlement.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: {
          requestedByUserId: settlement.requestedByUserId,
          reason: settlement.reason,
          externalStatus: 'NOT_CONFIGURED',
          idempotencyKeyHash: approvalHash,
        },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  private amount(value: string) {
    if (!/^\d+$/.test(value))
      throw new ConflictException({
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Amount must be a positive GBP minor-unit integer.',
      });
    return BigInt(value);
  }

  private safetySnapshots(
    before: Awaited<
      ReturnType<FinancialSeparationService['projection']>
    >['separation'],
    requested: bigint,
  ): { before: Prisma.InputJsonValue; after: Prisma.InputJsonValue } {
    const company = before.sliceCompanyRevenue;
    const after = {
      ...before,
      sliceCompanyRevenue: {
        ...company,
        committedSweepMinor: (
          BigInt(company.committedSweepMinor) + requested
        ).toString(),
        unsweptRecognisedRevenueMinor: maxZero(
          BigInt(company.unsweptRecognisedRevenueMinor) - requested,
        ).toString(),
        safeToSweepMinor: maxZero(
          BigInt(company.safeToSweepMinor) - requested,
        ).toString(),
        safeToSweepStatus: 'BLOCKED' as const,
        blockedReasons: ['REQUESTED_SWEEP_RESERVED_FOR_DUAL_CONTROL'],
      },
    };
    return {
      before: before as unknown as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    };
  }

  private safe(
    item: {
      id: string;
      status: string;
      externalStatus: string;
      requestedAmountMinor: bigint;
      currency: string;
      reason: string | null;
      requestedAt: Date;
      approvedAt: Date | null;
      settledAt: Date | null;
    },
    replayed: boolean,
  ) {
    return {
      id: item.id,
      status: item.status,
      externalStatus: item.externalStatus,
      requestedAmountMinor: item.requestedAmountMinor.toString(),
      currency: item.currency,
      reason: item.reason,
      requestedAt: item.requestedAt.toISOString(),
      approvedAt: item.approvedAt?.toISOString() ?? null,
      settledAt: item.settledAt?.toISOString() ?? null,
      replayed,
    };
  }
}

function allocateRevenueLines(
  categories: Array<{ category: string; amountMinor: string }>,
  requested: bigint,
) {
  let remaining = requested;
  const lines: Array<{ category: string; amountMinor: bigint }> = [];
  for (const category of categories) {
    if (remaining <= 0n) break;
    const available = BigInt(category.amountMinor);
    const amountMinor = available < remaining ? available : remaining;
    if (amountMinor > 0n)
      lines.push({ category: category.category, amountMinor });
    remaining -= amountMinor;
  }
  if (remaining !== 0n)
    throw new ConflictException({
      code: 'REVENUE_SOURCE_TRACE_INCOMPLETE',
      message:
        'The company revenue source trace does not cover the requested sweep amount.',
    });
  return lines;
}

function maxZero(value: bigint) {
  return value > 0n ? value : 0n;
}
