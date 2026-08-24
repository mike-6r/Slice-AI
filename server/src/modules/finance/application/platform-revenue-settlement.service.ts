import { ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { accountAuthority } from '../domain/journal';

const REVENUE_CODES = [
  'TRADING_FEE_REVENUE',
  'INITIAL_OFFERING_FEE_REVENUE',
  'WITHDRAWAL_FEE_REVENUE',
] as const;

@Injectable()
export class PlatformRevenueSettlementService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async projection() {
    const [revenueAccounts, expenseAccount, providerCosts, settlements] = await Promise.all([
      this.db.financialAccount.findMany({
        where: { ownerType: 'PLATFORM', code: { in: [...REVENUE_CODES] }, currency: 'GBP' },
        include: { balance: true },
      }),
      this.db.financialAccount.findFirst({
        where: { ownerType: 'PLATFORM', code: 'STRIPE_PROVIDER_EXPENSE', currency: 'GBP' },
        include: { balance: true },
      }),
      this.db.providerFinancialCost.findMany({
        where: { currency: 'GBP', status: { in: ['PENDING_EVIDENCE', 'OBSERVED'] } },
        select: { amountMinor: true, status: true },
      }),
      this.db.platformRevenueSettlement.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 25,
        select: {
          id: true,
          status: true,
          externalStatus: true,
          currency: true,
          grossRevenueMinor: true,
          providerExpensesMinor: true,
          eligibleSettlementMinor: true,
          requestedAmountMinor: true,
          requestedAt: true,
          approvedAt: true,
          settledAt: true,
          requestedBy: { select: { email: true } },
          approvedBy: { select: { email: true } },
        },
      }),
    ]);
    const balanceValue = (account: { normalSide: string; balance: { postedDebitMinor: bigint; postedCreditMinor: bigint } | null }) => account.balance ? accountAuthority(account.normalSide as 'DEBIT' | 'CREDIT', account.balance.postedDebitMinor, account.balance.postedCreditMinor) : 0n;
    const byCategory = revenueAccounts.map((account) => ({
      category: account.code,
      amountMinor: balanceValue(account).toString(),
      currency: 'GBP',
    }));
    const grossRevenue = byCategory.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n);
    const providerExpenses = expenseAccount ? balanceValue(expenseAccount) : 0n;
    const knownProviderCosts = providerCosts
      .filter((cost) => cost.status === 'OBSERVED' && cost.amountMinor !== null)
      .reduce((sum, cost) => sum + (cost.amountMinor ?? 0n), 0n);
    const pendingProviderCosts = providerCosts.filter((cost) => cost.status === 'PENDING_EVIDENCE').length;
    const eligible = grossRevenue - providerExpenses > 0n ? grossRevenue - providerExpenses : 0n;
    return {
      currency: 'GBP',
      grossRevenueMinor: grossRevenue.toString(),
      providerExpensesMinor: providerExpenses.toString(),
      estimatedNetContributionMinor: (grossRevenue - providerExpenses).toString(),
      eligibleSettlementMinor: eligible.toString(),
      knownProviderCostsMinor: knownProviderCosts.toString(),
      pendingProviderCostCount: pendingProviderCosts,
      byCategory,
      externalSettlement: { status: 'NOT_CONFIGURED', destination: null },
      settlements: settlements.map((settlement) => ({
        ...settlement,
        grossRevenueMinor: settlement.grossRevenueMinor.toString(),
        providerExpensesMinor: settlement.providerExpensesMinor.toString(),
        eligibleSettlementMinor: settlement.eligibleSettlementMinor.toString(),
        requestedAmountMinor: settlement.requestedAmountMinor.toString(),
        requestedAt: settlement.requestedAt.toISOString(),
        approvedAt: settlement.approvedAt?.toISOString() ?? null,
        settledAt: settlement.settledAt?.toISOString() ?? null,
      })),
    };
  }

  async request(actor: Actor, requestedAmountMinor: string | undefined, requestId: string, idempotencyKey: string) {
    this.recentAuth.require(actor);
    const snapshot = await this.projection();
    const eligible = BigInt(snapshot.eligibleSettlementMinor);
    const requested = requestedAmountMinor === undefined ? eligible : this.amount(requestedAmountMinor);
    if (requested <= 0n || requested > eligible)
      throw new ConflictException({ code: 'REVENUE_SETTLEMENT_AMOUNT_INVALID', message: 'The requested settlement must be within the eligible Slice revenue balance.' });
    const requestHash = createHash('sha256').update(idempotencyKey).digest('hex');
    return this.db.$transaction(async (db) => {
      const existing = await db.platformRevenueSettlement.findUnique({ where: { requestIdempotencyKeyHash: requestHash } });
      if (existing) return this.safe(existing, true);
      const settlement = await db.platformRevenueSettlement.create({
        data: {
          id: randomUUID(),
          currency: 'GBP',
          grossRevenueMinor: BigInt(snapshot.grossRevenueMinor),
          providerExpensesMinor: BigInt(snapshot.providerExpensesMinor),
          eligibleSettlementMinor: eligible,
          requestedAmountMinor: requested,
          requestIdempotencyKeyHash: requestHash,
          status: 'AWAITING_APPROVAL',
          externalStatus: 'NOT_CONFIGURED',
          requestedByUserId: actor.userId,
          lines: {
            create: snapshot.byCategory
              .filter((line) => BigInt(line.amountMinor) > 0n)
              .map((line) => ({ id: randomUUID(), category: line.category, sourceType: 'FINANCIAL_ACCOUNT', sourceId: line.category, amountMinor: BigInt(line.amountMinor), currency: 'GBP' })),
          },
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'PLATFORM_REVENUE_SETTLEMENT_REQUESTED', resourceType: 'platform-revenue-settlement', resourceId: settlement.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { requestedAmountMinor: requested.toString(), externalStatus: 'NOT_CONFIGURED' }, createdAt: new Date(),
      });
      return this.safe(settlement, false);
    });
  }

  async approve(actor: Actor, settlementId: string, requestId: string, idempotencyKey: string) {
    this.recentAuth.require(actor);
    const approvalHash = createHash('sha256').update(idempotencyKey).digest('hex');
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "PlatformRevenueSettlement" WHERE id = ${settlementId} FOR UPDATE`;
      const settlement = await db.platformRevenueSettlement.findUniqueOrThrow({ where: { id: settlementId } });
      if (settlement.approvalIdempotencyKeyHash === approvalHash) return this.safe(settlement, true);
      if (settlement.requestedByUserId === actor.userId)
        throw new ConflictException({ code: 'SETTLEMENT_SECOND_APPROVER_REQUIRED', message: 'A second authorized finance operator must approve this settlement.' });
      if (settlement.status !== 'AWAITING_APPROVAL')
        throw new ConflictException({ code: 'SETTLEMENT_NOT_AWAITING_APPROVAL', message: 'Only a pending settlement can be approved.' });
      const updated = await db.platformRevenueSettlement.update({ where: { id: settlement.id }, data: { status: 'APPROVED', approvedByUserId: actor.userId, approvedAt: new Date(), externalStatus: 'NOT_CONFIGURED', approvalIdempotencyKeyHash: approvalHash } });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'PLATFORM_REVENUE_SETTLEMENT_APPROVED', resourceType: 'platform-revenue-settlement', resourceId: settlement.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { requestedByUserId: settlement.requestedByUserId, idempotencyKeyHash: createHash('sha256').update(idempotencyKey).digest('hex') }, createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  private amount(value: string) {
    if (!/^\d+$/.test(value)) throw new ConflictException({ code: 'INVALID_MONEY_AMOUNT', message: 'Amount must be a positive GBP minor-unit integer.' });
    return BigInt(value);
  }

  private safe(item: { id: string; status: string; externalStatus: string; requestedAmountMinor: bigint; currency: string; requestedAt: Date; approvedAt: Date | null; settledAt: Date | null }, replayed: boolean) {
    return { id: item.id, status: item.status, externalStatus: item.externalStatus, requestedAmountMinor: item.requestedAmountMinor.toString(), currency: item.currency, requestedAt: item.requestedAt.toISOString(), approvedAt: item.approvedAt?.toISOString() ?? null, settledAt: item.settledAt?.toISOString() ?? null, replayed };
  }
}
