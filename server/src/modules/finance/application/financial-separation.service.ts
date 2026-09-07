import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import {
  WithdrawalPreflightService,
  type ProviderLiquidityProjection,
} from '../../providers/application/withdrawal-preflight.service';
import { accountAuthority } from '../domain/journal';
import { authoritativeFinancialDataClasses } from '../domain/financial-data-classification';
import {
  calculateFinancialSeparation,
  type FinancialSeparationProjection,
} from '../domain/financial-separation';

const REVENUE_CODES = [
  'TRADING_FEE_REVENUE',
  'INITIAL_OFFERING_FEE_REVENUE',
  'WITHDRAWAL_FEE_REVENUE',
] as const;

/**
 * Joins the existing customer ledger, Stripe evidence, and company P&L into a
 * single read model. It is intentionally not a general ledger and never uses
 * a Stripe balance to mutate customer accounts.
 */
@Injectable()
export class FinancialSeparationService {
  constructor(
    private readonly db: PrismaService,
    private readonly withdrawalPreflight: WithdrawalPreflightService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async projection(forceProviderRefresh = false): Promise<{
    separation: FinancialSeparationProjection;
    settlements: Array<{
      id: string;
      status: string;
      externalStatus: string;
      currency: string;
      grossRevenueMinor: string;
      providerExpensesMinor: string;
      eligibleSettlementMinor: string;
      requestedAmountMinor: string;
      reason: string | null;
      requestedAt: string;
      approvedAt: string | null;
      settledAt: string | null;
      requestedBy: { email: string };
      approvedBy: { email: string } | null;
      safetySnapshotRecorded: boolean;
    }>;
    providerTraces: Array<{
      id: string;
      type: string;
      rail: string;
      status: string;
      grossMinor: string;
      sliceFeeMinor: string;
      providerAmountMinor: string | null;
      providerFeeMinor: string | null;
      providerNetMinor: string | null;
      providerReferenceRecorded: boolean;
      providerBalanceTransactionRecorded: boolean;
      providerAvailableOn: string | null;
      connectPayoutStatus: string | null;
      updatedAt: string;
    }>;
  }> {
    const now = new Date();
    const [
      accounts,
      pendingMovements,
      withdrawalReservations,
      deficits,
      pendingConnectPayouts,
      balanceSnapshots,
      revenueAccounts,
      expenseAccount,
      providerCosts,
      settlements,
      providerTraces,
      liquidity,
    ] = await Promise.all([
      this.db.financialAccount.findMany({
        where: {
          ownerType: 'USER',
          currency: 'GBP',
          financialDataClass: { in: [...authoritativeFinancialDataClasses] },
          code: {
            in: [
              'CASH_AVAILABLE',
              'COLLECTOR_PROCEEDS_AVAILABLE',
              'BACS_RISK_HOLD',
            ],
          },
        },
        select: { code: true, normalSide: true, balance: true },
      }),
      this.db.moneyMovement.findMany({
        where: {
          currency: 'GBP',
          financialDataClass: { in: [...authoritativeFinancialDataClasses] },
          status: {
            in: [
              'CREATED',
              'PENDING_PROVIDER',
              'PROCESSING',
              'MANUAL_REVIEW',
              'HELD',
            ],
          },
        },
        select: { type: true, amountMinor: true },
      }),
      this.db.cashReservation.aggregate({
        where: {
          status: 'ACTIVE',
          purposeType: 'EXTERNAL_WITHDRAWAL',
          financialDataClass: { in: [...authoritativeFinancialDataClasses] },
        },
        _sum: { amountMinor: true },
      }),
      this.db.financialDeficit.findMany({
        where: {
          currency: 'GBP',
          financialDataClass: { in: [...authoritativeFinancialDataClasses] },
          status: { in: ['OPEN', 'PARTIALLY_RECOVERED'] },
        },
        select: { amountMinor: true, recoveredMinor: true },
      }),
      this.db.connectPayout.findMany({
        where: {
          currency: 'GBP',
          movement: {
            financialDataClass: { in: [...authoritativeFinancialDataClasses] },
          },
          status: {
            in: ['CREATED', 'TRANSFERRED', 'PROCESSING', 'MANUAL_REVIEW'],
          },
        },
        select: { amountMinor: true },
      }),
      this.db.connectPayoutBalanceSnapshot.findMany({
        where: {
          connectPayout: {
            currency: 'GBP',
            movement: {
              financialDataClass: {
                in: [...authoritativeFinancialDataClasses],
              },
            },
          },
        },
        orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
        take: 500,
        select: {
          connectPayoutId: true,
          connectedAvailableMinor: true,
          connectedPendingMinor: true,
          capturedAt: true,
        },
      }),
      this.db.journalEntry.findMany({
        where: {
          currency: 'GBP',
          transaction: {
            financialDataClass: { in: [...authoritativeFinancialDataClasses] },
          },
          account: {
            ownerType: 'PLATFORM',
            code: { in: [...REVENUE_CODES] },
            currency: 'GBP',
          },
        },
        select: {
          side: true,
          amountMinor: true,
          account: { select: { code: true, normalSide: true } },
        },
      }),
      this.db.journalEntry.findMany({
        where: {
          currency: 'GBP',
          transaction: {
            financialDataClass: { in: [...authoritativeFinancialDataClasses] },
          },
          account: {
            ownerType: 'PLATFORM',
            code: 'STRIPE_PROVIDER_EXPENSE',
            currency: 'GBP',
          },
        },
        select: {
          side: true,
          amountMinor: true,
          account: { select: { normalSide: true } },
        },
      }),
      this.db.providerFinancialCost.findMany({
        where: {
          currency: 'GBP',
          status: {
            in: ['PENDING_EVIDENCE', 'OBSERVED', 'POSTED', 'RECONCILED'],
          },
        },
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
          reason: true,
          beforeFinancialSnapshot: true,
          requestedAt: true,
          approvedAt: true,
          settledAt: true,
          requestedBy: { select: { email: true } },
          approvedBy: { select: { email: true } },
        },
      }),
      this.db.moneyMovement.findMany({
        where: {
          currency: 'GBP',
          financialDataClass: { in: [...authoritativeFinancialDataClasses] },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 16,
        select: {
          id: true,
          type: true,
          rail: true,
          status: true,
          amountMinor: true,
          sliceFeeMinor: true,
          providerAmountMinor: true,
          providerFeeMinor: true,
          providerNetMinor: true,
          providerReferenceHash: true,
          providerBalanceTransactionIdHash: true,
          providerAvailableOn: true,
          updatedAt: true,
          connectPayout: { select: { status: true } },
        },
      }),
      this.withdrawalPreflight.adminProjection(forceProviderRefresh),
    ]);

    let totalLiabilityMinor = 0n;
    let availableLiabilityMinor = 0n;
    let reservedMinor = 0n;
    let collectorProceedsMinor = 0n;
    let bacsRiskHeldMinor = 0n;
    for (const account of accounts) {
      const posted = account.balance
        ? accountAuthority(
            account.normalSide,
            account.balance.postedDebitMinor,
            account.balance.postedCreditMinor,
          )
        : 0n;
      const gross = maxZero(posted);
      const reserved = account.balance?.reservedMinor ?? 0n;
      totalLiabilityMinor += gross;
      reservedMinor += maxZero(reserved);
      if (
        account.code === 'CASH_AVAILABLE' ||
        account.code === 'COLLECTOR_PROCEEDS_AVAILABLE'
      )
        availableLiabilityMinor += maxZero(gross - reserved);
      if (account.code === 'COLLECTOR_PROCEEDS_AVAILABLE')
        collectorProceedsMinor += gross;
      if (account.code === 'BACS_RISK_HOLD') bacsRiskHeldMinor += gross;
    }

    const pendingDepositsMinor = sumByType(pendingMovements, 'DEPOSIT');
    const pendingWithdrawalsMinor = sumByType(pendingMovements, 'WITHDRAWAL');
    const withdrawalReservationMinor =
      withdrawalReservations._sum.amountMinor ?? 0n;
    const unresolvedReturnExposureMinor = deficits.reduce(
      (total, deficit) =>
        total + maxZero(deficit.amountMinor - deficit.recoveredMinor),
      0n,
    );
    const pendingPayoutObligationMinor = pendingConnectPayouts.reduce(
      (total, payout) => total + payout.amountMinor,
      0n,
    );
    const latestBalanceEvidence = new Map<
      string,
      (typeof balanceSnapshots)[number]
    >();
    for (const snapshot of balanceSnapshots)
      if (!latestBalanceEvidence.has(snapshot.connectPayoutId))
        latestBalanceEvidence.set(snapshot.connectPayoutId, snapshot);
    const connectedAvailableEvidenceMinor = [
      ...latestBalanceEvidence.values(),
    ].reduce((total, snapshot) => total + snapshot.connectedAvailableMinor, 0n);
    const connectedPendingEvidenceMinor = [
      ...latestBalanceEvidence.values(),
    ].reduce((total, snapshot) => total + snapshot.connectedPendingMinor, 0n);
    const connectedBalanceEvidenceAt =
      balanceSnapshots[0]?.capturedAt.toISOString() ?? null;

    const feeRevenue = new Map<string, bigint>();
    for (const entry of revenueAccounts) {
      const signed =
        entry.side === entry.account.normalSide
          ? entry.amountMinor
          : -entry.amountMinor;
      feeRevenue.set(
        entry.account.code,
        (feeRevenue.get(entry.account.code) ?? 0n) + signed,
      );
    }
    const feeRevenueByCategory = [...feeRevenue.entries()].map(
      ([category, amountMinor]) => ({
        category,
        amountMinor: maxZero(amountMinor),
      }),
    );
    const providerExpensesMinor = expenseAccount.reduce(
      (total, entry) =>
        total +
        (entry.side === entry.account.normalSide
          ? entry.amountMinor
          : -entry.amountMinor),
      0n,
    );
    const knownProviderCostsMinor = providerCosts
      .filter((cost) => cost.status !== 'PENDING_EVIDENCE')
      .reduce((total, cost) => total + (cost.amountMinor ?? 0n), 0n);
    // A cost can be observed but not yet have a posted expense journal (for
    // example if its movement trace is incomplete). Treat both states as an
    // unresolved safety boundary rather than assuming it is harmless.
    const pendingProviderCostCount = providerCosts.filter(
      (cost) =>
        cost.status === 'PENDING_EVIDENCE' || cost.status === 'OBSERVED',
    ).length;
    const alreadySweptMinor = settlements
      .filter((item) => item.status === 'SETTLED')
      .reduce((total, item) => total + item.requestedAmountMinor, 0n);
    const committedSweepMinor = settlements
      .filter((item) =>
        ['AWAITING_APPROVAL', 'APPROVED', 'PROCESSING'].includes(item.status),
      )
      .reduce((total, item) => total + item.requestedAmountMinor, 0n);

    const separation = calculateFinancialSeparation(
      {
        customer: {
          totalLiabilityMinor,
          availableLiabilityMinor,
          reservedMinor,
          withdrawalEligibleMinor: BigInt(
            liquidity.withdrawalEligibleLiabilityMinor,
          ),
          settlingMinor: BigInt(liquidity.settlingMinor),
          collectorProceedsMinor,
          bacsRiskHeldMinor,
          pendingDepositsMinor,
          pendingWithdrawalsMinor,
          withdrawalReservationMinor,
          unresolvedReturnExposureMinor,
        },
        stripe: stripeInput(liquidity, {
          pendingPayoutObligationMinor,
          connectedAvailableEvidenceMinor,
          connectedPendingEvidenceMinor,
          connectedBalanceEvidenceAt,
        }),
        company: {
          feeRevenueByCategory,
          providerExpensesMinor: maxZero(providerExpensesMinor),
          knownProviderCostsMinor,
          pendingProviderCostCount,
          alreadySweptMinor,
          committedSweepMinor,
        },
        operationalReserveMinor:
          this.config.financeOperationalReserveMinor === undefined
            ? undefined
            : BigInt(this.config.financeOperationalReserveMinor),
      },
      now.toISOString(),
    );

    return {
      separation,
      settlements: settlements.map((settlement) => ({
        id: settlement.id,
        status: settlement.status,
        externalStatus: settlement.externalStatus,
        currency: settlement.currency,
        grossRevenueMinor: settlement.grossRevenueMinor.toString(),
        providerExpensesMinor: settlement.providerExpensesMinor.toString(),
        eligibleSettlementMinor: settlement.eligibleSettlementMinor.toString(),
        requestedAmountMinor: settlement.requestedAmountMinor.toString(),
        reason: settlement.reason,
        requestedAt: settlement.requestedAt.toISOString(),
        approvedAt: settlement.approvedAt?.toISOString() ?? null,
        settledAt: settlement.settledAt?.toISOString() ?? null,
        requestedBy: settlement.requestedBy,
        approvedBy: settlement.approvedBy,
        safetySnapshotRecorded: settlement.beforeFinancialSnapshot !== null,
      })),
      providerTraces: providerTraces.map((movement) => ({
        id: movement.id,
        type: movement.type,
        rail: movement.rail,
        status: movement.status,
        grossMinor: movement.amountMinor.toString(),
        sliceFeeMinor: movement.sliceFeeMinor.toString(),
        providerAmountMinor: movement.providerAmountMinor?.toString() ?? null,
        providerFeeMinor: movement.providerFeeMinor?.toString() ?? null,
        providerNetMinor: movement.providerNetMinor?.toString() ?? null,
        providerReferenceRecorded: Boolean(movement.providerReferenceHash),
        providerBalanceTransactionRecorded: Boolean(
          movement.providerBalanceTransactionIdHash,
        ),
        providerAvailableOn:
          movement.providerAvailableOn?.toISOString() ?? null,
        connectPayoutStatus: movement.connectPayout?.status ?? null,
        updatedAt: movement.updatedAt.toISOString(),
      })),
    };
  }
}

function stripeInput(
  liquidity: ProviderLiquidityProjection,
  evidence: {
    pendingPayoutObligationMinor: bigint;
    connectedAvailableEvidenceMinor: bigint;
    connectedPendingEvidenceMinor: bigint;
    connectedBalanceEvidenceAt: string | null;
  },
) {
  return {
    providerMode: liquidity.providerMode,
    liquiditySource: liquidity.liquiditySource,
    providerAvailableMinor:
      liquidity.providerAvailableMinor === null
        ? null
        : BigInt(liquidity.providerAvailableMinor),
    providerPendingMinor:
      liquidity.providerPendingMinor === null
        ? null
        : BigInt(liquidity.providerPendingMinor),
    availableAfterReservationsMinor:
      liquidity.availableAfterReservationsMinor === null
        ? null
        : BigInt(liquidity.availableAfterReservationsMinor),
    activeReservationMinor: BigInt(liquidity.activeReservationMinor),
    payoutLiquidityStatus: liquidity.providerLiquidityStatus,
    payoutLiquidityCoverageBps: liquidity.payoutLiquidityCoverageBps,
    nextAvailabilityAt: liquidity.nextAvailabilityAt,
    checkedAt: liquidity.checkedAt,
    ...evidence,
  } as const;
}

function sumByType(
  movements: Array<{ type: string; amountMinor: bigint }>,
  type: 'DEPOSIT' | 'WITHDRAWAL',
) {
  return movements
    .filter((movement) => movement.type === type)
    .reduce((total, movement) => total + movement.amountMinor, 0n);
}

function maxZero(value: bigint) {
  return value > 0n ? value : 0n;
}
