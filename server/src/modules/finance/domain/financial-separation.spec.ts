import {
  calculateFinancialSeparation,
  type FinancialSeparationInput,
} from './financial-separation';
import { feeForBps, WITHDRAWAL_FEE_BPS } from './fee-policy';

const input = (
  overrides: Partial<FinancialSeparationInput> = {},
): FinancialSeparationInput => {
  const { customer, stripe, company, ...topLevel } = overrides;
  return {
    customer: {
      totalLiabilityMinor: 10_000n,
      availableLiabilityMinor: 8_000n,
      reservedMinor: 2_000n,
      withdrawalEligibleMinor: 8_000n,
      settlingMinor: 0n,
      collectorProceedsMinor: 0n,
      bacsRiskHeldMinor: 0n,
      pendingDepositsMinor: 0n,
      pendingWithdrawalsMinor: 0n,
      withdrawalReservationMinor: 0n,
      unresolvedReturnExposureMinor: 0n,
      ...customer,
    },
    stripe: {
      providerMode: 'stripe_sandbox',
      liquiditySource: 'STRIPE_PLATFORM_PAYMENTS_BALANCE',
      providerAvailableMinor: 35_000n,
      providerPendingMinor: 0n,
      availableAfterReservationsMinor: 35_000n,
      activeReservationMinor: 0n,
      payoutLiquidityStatus: 'AVAILABLE',
      payoutLiquidityCoverageBps: 43_750,
      nextAvailabilityAt: null,
      checkedAt: '2026-09-07T00:00:00.000Z',
      pendingPayoutObligationMinor: 0n,
      connectedAvailableEvidenceMinor: 0n,
      connectedPendingEvidenceMinor: 0n,
      connectedBalanceEvidenceAt: null,
      ...stripe,
    },
    company: {
      feeRevenueByCategory: [
        { category: 'TRADING_FEE_REVENUE', amountMinor: 20_000n },
      ],
      providerExpensesMinor: 2_000n,
      knownProviderCostsMinor: 2_000n,
      pendingProviderCostCount: 0,
      alreadySweptMinor: 0n,
      committedSweepMinor: 0n,
      ...company,
    },
    operationalReserveMinor: 5_000n,
    ...topLevel,
  };
};

describe('financial separation projection', () => {
  it('keeps a Bacs-held customer deposit inside liabilities while it settles', () => {
    const result = calculateFinancialSeparation(
      input({
        customer: {
          totalLiabilityMinor: 20_000n,
          bacsRiskHeldMinor: 10_000n,
          settlingMinor: 10_000n,
        } as FinancialSeparationInput['customer'],
      }),
    );
    expect(result.customerLiabilities.totalLiabilityMinor).toBe('20000');
    expect(result.customerLiabilities.bacsRiskHeldMinor).toBe('10000');
    expect(result.sliceCompanyRevenue.protectedLiquidityMinor).toBe('25000');
  });

  it('keeps a card-confirmed but not provider-available deposit out of safe sweep capacity', () => {
    const result = calculateFinancialSeparation(
      input({
        stripe: {
          payoutLiquidityStatus: 'INSUFFICIENT',
          availableAfterReservationsMinor: 0n,
        } as FinancialSeparationInput['stripe'],
      }),
    );
    expect(result.sliceCompanyRevenue.safeToSweepMinor).toBe('0');
    expect(result.sliceCompanyRevenue.blockedReasons).toContain(
      'STRIPE_PLATFORM_LIQUIDITY_UNAVAILABLE',
    );
  });

  it('retains partial-sale collector proceeds as a customer liability', () => {
    const result = calculateFinancialSeparation(
      input({
        customer: {
          totalLiabilityMinor: 14_000n,
          collectorProceedsMinor: 4_000n,
        } as FinancialSeparationInput['customer'],
      }),
    );
    expect(result.customerLiabilities.collectorProceedsMinor).toBe('4000');
    expect(result.sliceCompanyRevenue.protectedLiquidityMinor).toBe('19000');
  });

  it('preserves the fixed 2.5% withdrawal fee split independently of provider fees', () => {
    const gross = 10_000n;
    const sliceFee = feeForBps(gross, WITHDRAWAL_FEE_BPS);
    expect(sliceFee).toBe(250n);
    expect(gross - sliceFee).toBe(9_750n);
  });

  it('fails closed when Stripe balance evidence is unavailable', () => {
    const result = calculateFinancialSeparation(
      input({
        stripe: {
          payoutLiquidityStatus: 'UNAVAILABLE',
          providerAvailableMinor: null,
          providerPendingMinor: null,
          availableAfterReservationsMinor: null,
        } as FinancialSeparationInput['stripe'],
      }),
    );
    expect(result.sliceCompanyRevenue.safeToSweepStatus).toBe('BLOCKED');
    expect(result.sliceCompanyRevenue.safeToSweepMinor).toBe('0');
  });

  it('blocks revenue sweeping until Finance configures an explicit reserve', () => {
    const result = calculateFinancialSeparation(
      input({ operationalReserveMinor: undefined }),
    );
    expect(result.sliceCompanyRevenue.operationalReserveConfigured).toBe(false);
    expect(result.sliceCompanyRevenue.blockedReasons).toContain(
      'OPERATIONAL_RESERVE_UNCONFIGURED',
    );
  });

  it('blocks revenue sweeping while provider fee evidence is pending', () => {
    const result = calculateFinancialSeparation(
      input({
        company: {
          pendingProviderCostCount: 1,
        } as FinancialSeparationInput['company'],
      }),
    );
    expect(result.sliceCompanyRevenue.blockedReasons).toContain(
      'PROVIDER_COST_EVIDENCE_PENDING',
    );
  });

  it('caps the safe sweep below the untouched customer, payout, and reserve protection', () => {
    const result = calculateFinancialSeparation(
      input({
        stripe: {
          availableAfterReservationsMinor: 18_750n,
          pendingPayoutObligationMinor: 1_000n,
        } as FinancialSeparationInput['stripe'],
      }),
    );
    // 18,750 available - (10,000 customers + 1,000 payout + 5,000 reserve).
    expect(result.sliceCompanyRevenue.availableAboveProtectionMinor).toBe(
      '2750',
    );
    expect(result.sliceCompanyRevenue.safeToSweepMinor).toBe('2750');
  });

  it('reports an exact provider-liquidity deficit without using pending Stripe funds', () => {
    const result = calculateFinancialSeparation(
      input({
        stripe: {
          payoutLiquidityStatus: 'INSUFFICIENT',
          providerPendingMinor: 50_000n,
          availableAfterReservationsMinor: 9_000n,
        } as FinancialSeparationInput['stripe'],
      }),
    );
    expect(result.stripePlatformLiquidity.operationalStatus).toBe('DEFICIT');
    expect(result.stripePlatformLiquidity.liquidityShortfallMinor).toBe('6000');
    expect(result.sliceCompanyRevenue.safeToSweepMinor).toBe('0');
  });

  it('removes already requested and settled sweeps from recognised company revenue', () => {
    const result = calculateFinancialSeparation(
      input({
        company: {
          alreadySweptMinor: 4_000n,
          committedSweepMinor: 5_000n,
        } as FinancialSeparationInput['company'],
      }),
    );
    expect(result.sliceCompanyRevenue.unsweptRecognisedRevenueMinor).toBe(
      '9000',
    );
  });
});
