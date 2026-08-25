import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from '../../finance/application/financial-ledger.service';
import { feeForBps, WITHDRAWAL_FEE_BPS } from '../../finance/domain/fee-policy';
import { StripeClientFactory } from './stripe-provider.client';

export type ProviderLiquidityStatus =
  'AVAILABLE' | 'INSUFFICIENT' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export type WithdrawalPreflightProjection = {
  currency: 'GBP';
  walletAvailableMinor: string;
  customerEligibleMinor: string;
  withdrawableMinor: string;
  settlingMinor: string;
  reservedMinor: string;
  grossMinor: string;
  feeMinor: string;
  netPayoutMinor: string;
  customerEligibilityStatus:
    'AVAILABLE' | 'MATURITY_PENDING' | 'INSUFFICIENT_CASH';
  providerLiquidityStatus: ProviderLiquidityStatus;
  nextAvailabilityAt: string | null;
  checkedAt: string;
};

export type ProviderLiquidityProjection = {
  currency: 'GBP';
  providerMode: 'stripe_sandbox' | 'stripe_live' | 'local';
  providerAvailableMinor: string | null;
  providerPendingMinor: string | null;
  customerCashLiabilityMinor: string;
  withdrawalEligibleLiabilityMinor: string;
  settlingMinor: string;
  activeReservationMinor: string;
  payoutLiquidityCoverageBps: number | null;
  providerLiquidityStatus: ProviderLiquidityStatus;
  nextAvailabilityAt: string | null;
  checkedAt: string;
  warning: boolean;
};

type BalanceSnapshot = {
  availableMinor: bigint;
  pendingMinor: bigint;
  nextAvailabilityAt: Date | null;
  checkedAt: Date;
  status: ProviderLiquidityStatus;
};

const CACHE_MS = 10_000;

@Injectable()
export class WithdrawalPreflightService {
  private cached: { snapshot: BalanceSnapshot; expiresAt: number } | null =
    null;

  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    private readonly stripeFactory: StripeClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async forUser(
    userId: string,
    grossMinorText = '0',
    forceRefresh = false,
    now = new Date(),
  ): Promise<WithdrawalPreflightProjection> {
    const grossMinor = parseMinor(grossMinorText);
    const feeMinor = feeForBps(grossMinor, WITHDRAWAL_FEE_BPS);
    const netPayoutMinor = grossMinor - feeMinor;
    const wallet = await this.ledger.walletForUser(userId);
    const walletAvailableMinor = maxZero(BigInt(wallet.availableMinor));
    const postedWithdrawableMinor = maxZero(
      BigInt(wallet.withdrawableMinor ?? wallet.availableMinor),
    );
    const [maturity, snapshot, activeReservationMinor] = await Promise.all([
      this.db.moneyMovement.aggregate({
        where: {
          userId,
          type: 'DEPOSIT',
          status: 'SETTLED',
          providerAvailableOn: { gt: now },
        },
        _sum: { amountMinor: true },
      }),
      this.snapshot(forceRefresh),
      this.activeReservationMinor(),
    ]);
    const maturityPendingMinor = minBigInt(
      walletAvailableMinor,
      maxZero(maturity._sum.amountMinor ?? 0n),
    );
    const customerEligibleMinor = maxZero(
      postedWithdrawableMinor - maturityPendingMinor,
    );
    const providerCapacityMinor = this.providerCapacity(
      snapshot,
      activeReservationMinor,
    );
    // The local adapter has no external payout rail to preflight. Preserve the
    // existing local withdrawal projection while keeping Stripe-backed paths
    // fail-closed on the provider's available balance.
    const providerGrossCapacityMinor =
      snapshot.status === 'NOT_APPLICABLE'
        ? customerEligibleMinor
        : maxGrossForProviderAmount(providerCapacityMinor);
    const withdrawableMinor = minBigInt(
      customerEligibleMinor,
      providerGrossCapacityMinor,
    );
    // Settling is the customer-specific maturity bucket only. Provider-wide
    // liquidity is reported independently so a treasury shortfall is never
    // mislabeled as a customer's funds still settling.
    const settlingMinor = maturityPendingMinor;
    const customerEligibilityStatus =
      grossMinor > customerEligibleMinor
        ? maturityPendingMinor > 0n
          ? 'MATURITY_PENDING'
          : 'INSUFFICIENT_CASH'
        : 'AVAILABLE';
    const providerLiquidityStatus = this.statusForAmount(
      snapshot,
      netPayoutMinor,
      providerCapacityMinor,
    );
    return {
      currency: 'GBP',
      walletAvailableMinor: walletAvailableMinor.toString(),
      customerEligibleMinor: customerEligibleMinor.toString(),
      withdrawableMinor: withdrawableMinor.toString(),
      settlingMinor: settlingMinor.toString(),
      reservedMinor: maxZero(BigInt(wallet.reservedMinor)).toString(),
      grossMinor: grossMinor.toString(),
      feeMinor: feeMinor.toString(),
      netPayoutMinor: netPayoutMinor.toString(),
      customerEligibilityStatus,
      providerLiquidityStatus,
      nextAvailabilityAt:
        earliestDate(
          maturityPendingMinor > 0n
            ? await this.nextMovementAvailability(userId, now)
            : null,
          snapshot.nextAvailabilityAt,
        )?.toISOString() ?? null,
      checkedAt: snapshot.checkedAt.toISOString(),
    };
  }

  async assertWithdrawalCanStart(userId: string, grossMinorText: string) {
    const projection = await this.forUser(userId, grossMinorText, true);
    const grossMinor = parseMinor(grossMinorText);
    if (projection.customerEligibilityStatus !== 'AVAILABLE') {
      throw new ConflictException({
        code: 'WITHDRAWAL_MATURITY_PENDING',
        message:
          "Your funds are still settling with our payment provider and aren't ready for bank withdrawal yet.",
        nextAvailabilityAt: projection.nextAvailabilityAt,
      });
    }
    if (
      projection.providerLiquidityStatus !== 'AVAILABLE' ||
      BigInt(projection.withdrawableMinor) < grossMinor
    ) {
      throw new ConflictException({
        code: 'PROVIDER_LIQUIDITY_UNAVAILABLE',
        message:
          "Your funds are still settling with our payment provider and aren't ready for bank withdrawal yet.",
        nextAvailabilityAt: projection.nextAvailabilityAt,
      });
    }
    return projection;
  }

  async reserveProviderLiquidity(
    movementId: string,
    amountMinorText: string,
  ): Promise<string | null> {
    if (this.config.providerMode === 'local') return null;
    const amountMinor = parseMinor(amountMinorText);
    const snapshot = await this.snapshot(true);
    if (snapshot.status === 'UNAVAILABLE')
      throw this.liquidityConflict(snapshot.nextAvailabilityAt);
    return this.db.$transaction(async (db) => {
      const lockKey =
        'PROVIDER_PAYOUT_LIQUIDITY:' +
        this.stripeFactory.provider() +
        ':' +
        this.stripeFactory.environment() +
        ':GBP';
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const active = await db.providerLiquidityReservation.aggregate({
        where: {
          provider: this.stripeFactory.provider(),
          environment: this.stripeFactory.environment(),
          currency: 'GBP',
          status: 'ACTIVE',
        },
        _sum: { amountMinor: true },
      });
      const activeMinor = active._sum.amountMinor ?? 0n;
      if (snapshot.availableMinor - activeMinor < amountMinor)
        throw this.liquidityConflict(snapshot.nextAvailabilityAt);
      const existing = await db.providerLiquidityReservation.findUnique({
        where: { movementId },
      });
      if (existing) {
        if (existing.status === 'ACTIVE') return existing.id;
        throw new ConflictException({
          code: 'PROVIDER_LIQUIDITY_RESERVATION_TERMINAL',
          message:
            'This withdrawal already has a terminal liquidity reservation.',
        });
      }
      const reservation = await db.providerLiquidityReservation.create({
        data: {
          id: cryptoRandomId(),
          movementId,
          provider: this.stripeFactory.provider(),
          environment: this.stripeFactory.environment(),
          currency: 'GBP',
          amountMinor,
          providerBalanceCheckedAt: snapshot.checkedAt,
        },
      });
      return reservation.id;
    });
  }

  async releaseProviderLiquidity(reservationId: string | null) {
    if (!reservationId) return;
    await this.db.providerLiquidityReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'RELEASED' },
    });
  }

  async consumeProviderLiquidity(reservationId: string | null) {
    if (!reservationId) return;
    await this.db.providerLiquidityReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'CONSUMED' },
    });
  }

  async adminProjection(): Promise<ProviderLiquidityProjection> {
    const [accounts, settling, activeReservationMinor, snapshot] =
      await Promise.all([
        this.db.financialAccount.findMany({
          where: {
            ownerType: 'USER',
            currency: 'GBP',
            code: { in: ['CASH_AVAILABLE', 'COLLECTOR_PROCEEDS_AVAILABLE'] },
          },
          include: { balance: true },
        }),
        this.db.moneyMovement.aggregate({
          where: {
            type: 'DEPOSIT',
            status: 'SETTLED',
            providerAvailableOn: { gt: new Date() },
          },
          _sum: { amountMinor: true },
        }),
        this.activeReservationMinor(),
        this.snapshot(false),
      ]);
    let customerCashLiabilityMinor = 0n;
    let withdrawalEligibleLiabilityMinor = 0n;
    for (const account of accounts) {
      const gross = account.balance
        ? account.normalSide === 'DEBIT'
          ? account.balance.postedDebitMinor - account.balance.postedCreditMinor
          : account.balance.postedCreditMinor - account.balance.postedDebitMinor
        : 0n;
      const available = maxZero(gross - (account.balance?.reservedMinor ?? 0n));
      customerCashLiabilityMinor += maxZero(gross);
      withdrawalEligibleLiabilityMinor += available;
    }
    const settlingMinor = maxZero(settling._sum.amountMinor ?? 0n);
    withdrawalEligibleLiabilityMinor = maxZero(
      withdrawalEligibleLiabilityMinor - settlingMinor,
    );
    const providerAvailableMinor =
      snapshot.status === 'NOT_APPLICABLE' ? null : snapshot.availableMinor;
    const capacity = this.providerCapacity(snapshot, activeReservationMinor);
    const coverageBps =
      withdrawalEligibleLiabilityMinor > 0n
        ? Number(
            (maxZero(capacity) * 10_000n) / withdrawalEligibleLiabilityMinor,
          )
        : null;
    return {
      currency: 'GBP',
      providerMode: this.config.providerMode,
      providerAvailableMinor: providerAvailableMinor?.toString() ?? null,
      providerPendingMinor:
        snapshot.status === 'NOT_APPLICABLE'
          ? null
          : snapshot.pendingMinor.toString(),
      customerCashLiabilityMinor: customerCashLiabilityMinor.toString(),
      withdrawalEligibleLiabilityMinor:
        withdrawalEligibleLiabilityMinor.toString(),
      settlingMinor: settlingMinor.toString(),
      activeReservationMinor: activeReservationMinor.toString(),
      payoutLiquidityCoverageBps: coverageBps,
      providerLiquidityStatus:
        snapshot.status === 'NOT_APPLICABLE'
          ? 'NOT_APPLICABLE'
          : snapshot.status === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : snapshot.availableMinor < 0n ||
                capacity < withdrawalEligibleLiabilityMinor
              ? 'INSUFFICIENT'
              : 'AVAILABLE',
      nextAvailabilityAt: snapshot.nextAvailabilityAt?.toISOString() ?? null,
      checkedAt: snapshot.checkedAt.toISOString(),
      warning:
        snapshot.status === 'UNAVAILABLE' ||
        (snapshot.status !== 'NOT_APPLICABLE' &&
          capacity < withdrawalEligibleLiabilityMinor),
    };
  }

  private async snapshot(forceRefresh: boolean): Promise<BalanceSnapshot> {
    if (this.config.providerMode === 'local') {
      const checkedAt = new Date();
      return {
        availableMinor: 0n,
        pendingMinor: 0n,
        nextAvailabilityAt: null,
        checkedAt,
        status: 'NOT_APPLICABLE',
      };
    }
    if (!forceRefresh && this.cached && this.cached.expiresAt > Date.now())
      return this.cached.snapshot;
    try {
      const stripe = this.stripeFactory.get();
      const balance = await stripe.balance.retrieve();
      const availableMinor = sumBalanceEntries(balance.available);
      const pendingMinor = sumBalanceEntries(balance.pending);
      let nextAvailabilityAt: Date | null = null;
      try {
        const transactions = await stripe.balanceTransactions.list({
          currency: 'gbp',
          limit: 100,
        });
        for (const transaction of transactions.data) {
          if (
            typeof transaction.available_on === 'number' &&
            transaction.available_on * 1000 > Date.now()
          ) {
            const candidate = new Date(transaction.available_on * 1000);
            if (!nextAvailabilityAt || candidate < nextAvailabilityAt)
              nextAvailabilityAt = candidate;
          }
        }
      } catch {
        // Balance remains authoritative if the optional maturity lookup fails.
      }
      const snapshot: BalanceSnapshot = {
        availableMinor,
        pendingMinor,
        nextAvailabilityAt,
        checkedAt: new Date(),
        status: 'AVAILABLE',
      };
      this.cached = { snapshot, expiresAt: Date.now() + CACHE_MS };
      return snapshot;
    } catch {
      const snapshot: BalanceSnapshot = {
        availableMinor: 0n,
        pendingMinor: 0n,
        nextAvailabilityAt: null,
        checkedAt: new Date(),
        status: 'UNAVAILABLE',
      };
      this.cached = { snapshot, expiresAt: Date.now() + 2_000 };
      return snapshot;
    }
  }

  private async activeReservationMinor() {
    if (this.config.providerMode === 'local') return 0n;
    const aggregate = await this.db.providerLiquidityReservation.aggregate({
      where: {
        provider: this.stripeFactory.provider(),
        environment: this.stripeFactory.environment(),
        currency: 'GBP',
        status: 'ACTIVE',
      },
      _sum: { amountMinor: true },
    });
    return aggregate._sum.amountMinor ?? 0n;
  }

  private async nextMovementAvailability(userId: string, now: Date) {
    const row = await this.db.moneyMovement.findFirst({
      where: {
        userId,
        type: 'DEPOSIT',
        status: 'SETTLED',
        providerAvailableOn: { gt: now },
      },
      orderBy: { providerAvailableOn: 'asc' },
      select: { providerAvailableOn: true },
    });
    return row?.providerAvailableOn ?? null;
  }

  private providerCapacity(snapshot: BalanceSnapshot, activeMinor: bigint) {
    return snapshot.status === 'NOT_APPLICABLE'
      ? 0n
      : maxZero(snapshot.availableMinor - activeMinor);
  }

  private statusForAmount(
    snapshot: BalanceSnapshot,
    providerAmountMinor: bigint,
    capacityMinor: bigint,
  ): ProviderLiquidityStatus {
    if (snapshot.status === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
    if (snapshot.status === 'UNAVAILABLE') return 'UNAVAILABLE';
    return capacityMinor >= providerAmountMinor ? 'AVAILABLE' : 'INSUFFICIENT';
  }

  private liquidityConflict(
    nextAvailabilityAt: Date | null,
  ): ConflictException {
    return new ConflictException({
      code: 'PROVIDER_LIQUIDITY_UNAVAILABLE',
      message:
        "Your funds are still settling with our payment provider and aren't ready for bank withdrawal yet.",
      nextAvailabilityAt: nextAvailabilityAt?.toISOString() ?? null,
    });
  }
}

function parseMinor(value: string) {
  if (!/^\d+$/.test(value))
    throw new ConflictException({
      code: 'WITHDRAWAL_AMOUNT_INVALID',
      message: 'Withdrawal amount must be a non-negative GBP minor-unit value.',
    });
  return BigInt(value);
}

function maxZero(value: bigint) {
  return value > 0n ? value : 0n;
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function sumBalanceEntries(
  entries: Array<{ amount: number; currency: string }>,
) {
  return entries
    .filter((entry) => entry.currency.toLowerCase() === 'gbp')
    .reduce((total, entry) => {
      if (!Number.isSafeInteger(entry.amount)) return total;
      return total + BigInt(entry.amount);
    }, 0n);
}

function maxGrossForProviderAmount(providerCapacityMinor: bigint) {
  if (providerCapacityMinor <= 0n) return 0n;
  let low = 0n;
  let high = providerCapacityMinor + providerCapacityMinor / 10n + 100n;
  while (low < high) {
    const midpoint = (low + high + 1n) / 2n;
    if (
      midpoint - feeForBps(midpoint, WITHDRAWAL_FEE_BPS) <=
      providerCapacityMinor
    )
      low = midpoint;
    else high = midpoint - 1n;
  }
  return low;
}

function earliestDate(first: Date | null, second: Date | null) {
  if (!first) return second;
  if (!second) return first;
  return first < second ? first : second;
}

function cryptoRandomId() {
  return randomUUID();
}
