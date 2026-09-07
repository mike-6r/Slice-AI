/**
 * A deliberately conservative view across Slice's three financial domains.
 *
 * This is a projection only. It never moves cash, changes a customer wallet,
 * or treats a provider balance as a Slice ledger balance. All input amounts are
 * GBP minor units and are kept as bigint until the HTTP boundary.
 */
export type FinancialSeparationInput = {
  customer: {
    totalLiabilityMinor: bigint;
    availableLiabilityMinor: bigint;
    reservedMinor: bigint;
    withdrawalEligibleMinor: bigint;
    settlingMinor: bigint;
    collectorProceedsMinor: bigint;
    bacsRiskHeldMinor: bigint;
    pendingDepositsMinor: bigint;
    pendingWithdrawalsMinor: bigint;
    withdrawalReservationMinor: bigint;
    unresolvedReturnExposureMinor: bigint;
  };
  stripe: {
    providerMode: 'stripe_sandbox' | 'stripe_live' | 'local';
    liquiditySource: 'STRIPE_PLATFORM_PAYMENTS_BALANCE' | 'NOT_APPLICABLE';
    providerAvailableMinor: bigint | null;
    providerPendingMinor: bigint | null;
    availableAfterReservationsMinor: bigint | null;
    activeReservationMinor: bigint;
    payoutLiquidityStatus:
      'AVAILABLE' | 'INSUFFICIENT' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
    payoutLiquidityCoverageBps: number | null;
    nextAvailabilityAt: string | null;
    checkedAt: string;
    pendingPayoutObligationMinor: bigint;
    connectedAvailableEvidenceMinor: bigint;
    connectedPendingEvidenceMinor: bigint;
    connectedBalanceEvidenceAt: string | null;
  };
  company: {
    feeRevenueByCategory: Array<{ category: string; amountMinor: bigint }>;
    providerExpensesMinor: bigint;
    knownProviderCostsMinor: bigint;
    pendingProviderCostCount: number;
    alreadySweptMinor: bigint;
    committedSweepMinor: bigint;
  };
  operationalReserveMinor?: bigint;
};

export type FinancialSeparationProjection = {
  currency: 'GBP';
  calculatedAt: string;
  customerLiabilities: {
    totalLiabilityMinor: string;
    availableLiabilityMinor: string;
    reservedMinor: string;
    withdrawalEligibleMinor: string;
    settlingMinor: string;
    collectorProceedsMinor: string;
    bacsRiskHeldMinor: string;
    pendingDepositsMinor: string;
    pendingWithdrawalsMinor: string;
    withdrawalReservationMinor: string;
    unresolvedReturnExposureMinor: string;
  };
  stripePlatformLiquidity: {
    providerMode: FinancialSeparationInput['stripe']['providerMode'];
    liquiditySource: FinancialSeparationInput['stripe']['liquiditySource'];
    providerAvailableMinor: string | null;
    providerPendingMinor: string | null;
    availableAfterReservationsMinor: string | null;
    activeReservationMinor: string;
    payoutLiquidityStatus: FinancialSeparationInput['stripe']['payoutLiquidityStatus'];
    payoutLiquidityCoverageBps: number | null;
    nextAvailabilityAt: string | null;
    checkedAt: string;
    pendingPayoutObligationMinor: string;
    requiredOperationalReserveMinor: string | null;
    requiredPlatformRetentionMinor: string | null;
    liquiditySurplusOrDeficitMinor: string | null;
    liquidityShortfallMinor: string | null;
    operationalStatus: 'HEALTHY' | 'CAUTION' | 'DEFICIT' | 'UNKNOWN';
    connectedAvailableEvidenceMinor: string;
    connectedPendingEvidenceMinor: string;
    connectedBalanceEvidenceAt: string | null;
  };
  sliceCompanyRevenue: {
    feeRevenueByCategory: Array<{ category: string; amountMinor: string }>;
    grossFeeRevenueMinor: string;
    providerExpensesMinor: string;
    knownProviderCostsMinor: string;
    pendingProviderCostCount: number;
    recognisedNetRevenueMinor: string;
    alreadySweptMinor: string;
    committedSweepMinor: string;
    unsweptRecognisedRevenueMinor: string;
    operationalReserveConfigured: boolean;
    operationalReserveMinor: string | null;
    protectedLiquidityMinor: string | null;
    availableAboveProtectionMinor: string | null;
    safeToSweepMinor: string;
    safeToSweepStatus: 'READY' | 'BLOCKED';
    blockedReasons: string[];
    externalExecutionStatus: 'NOT_CONFIGURED';
  };
};

export function calculateFinancialSeparation(
  input: FinancialSeparationInput,
  calculatedAt = new Date().toISOString(),
): FinancialSeparationProjection {
  const grossFeeRevenueMinor = input.company.feeRevenueByCategory.reduce(
    (total, item) => total + maxZero(item.amountMinor),
    0n,
  );
  const recognisedNetRevenueMinor = maxZero(
    grossFeeRevenueMinor - maxZero(input.company.providerExpensesMinor),
  );
  const unsweptRecognisedRevenueMinor = maxZero(
    recognisedNetRevenueMinor -
      maxZero(input.company.alreadySweptMinor) -
      maxZero(input.company.committedSweepMinor),
  );
  const reasons: string[] = [];
  const reserve = input.operationalReserveMinor;
  const safelyReadableProviderBalance =
    input.stripe.payoutLiquidityStatus === 'AVAILABLE' &&
    input.stripe.availableAfterReservationsMinor !== null;

  if (reserve === undefined) reasons.push('OPERATIONAL_RESERVE_UNCONFIGURED');
  if (!safelyReadableProviderBalance)
    reasons.push('STRIPE_PLATFORM_LIQUIDITY_UNAVAILABLE');
  if (input.company.pendingProviderCostCount > 0)
    reasons.push('PROVIDER_COST_EVIDENCE_PENDING');
  if (unsweptRecognisedRevenueMinor === 0n)
    reasons.push('NO_UNSWEPT_RECOGNISED_REVENUE');

  // `availableAfterReservationsMinor` has already excluded active payout
  // reservations. Retain every remaining customer liability, unresolved return
  // exposure, and in-flight Connect payout before considering company revenue.
  const protectedLiquidityMinor =
    reserve === undefined
      ? null
      : maxZero(input.customer.totalLiabilityMinor) +
        maxZero(input.customer.unresolvedReturnExposureMinor) +
        maxZero(input.stripe.pendingPayoutObligationMinor) +
        maxZero(reserve);
  const availableAboveProtectionMinor =
    protectedLiquidityMinor === null ||
    input.stripe.availableAfterReservationsMinor === null
      ? null
      : maxZero(
          input.stripe.availableAfterReservationsMinor -
            protectedLiquidityMinor,
        );

  const liquiditySurplusOrDeficitMinor =
    protectedLiquidityMinor === null ||
    input.stripe.availableAfterReservationsMinor === null
      ? null
      : input.stripe.availableAfterReservationsMinor - protectedLiquidityMinor;
  const operationalStatus =
    input.stripe.payoutLiquidityStatus === 'UNAVAILABLE' ||
    input.stripe.payoutLiquidityStatus === 'NOT_APPLICABLE'
      ? 'UNKNOWN'
      : input.stripe.payoutLiquidityStatus === 'INSUFFICIENT' ||
          (liquiditySurplusOrDeficitMinor !== null &&
            liquiditySurplusOrDeficitMinor < 0n)
        ? 'DEFICIT'
        : reserve === undefined || input.company.pendingProviderCostCount > 0
          ? 'CAUTION'
          : 'HEALTHY';

  if (
    availableAboveProtectionMinor !== null &&
    availableAboveProtectionMinor === 0n
  )
    reasons.push('LIQUIDITY_PROTECTED_FOR_CUSTOMERS_AND_RESERVE');

  const safeToSweepMinor =
    reasons.length === 0 && availableAboveProtectionMinor !== null
      ? minBigInt(unsweptRecognisedRevenueMinor, availableAboveProtectionMinor)
      : 0n;
  if (safeToSweepMinor === 0n && reasons.length === 0)
    reasons.push('NO_SAFE_SWEEP_CAPACITY');

  return {
    currency: 'GBP',
    calculatedAt,
    customerLiabilities: {
      totalLiabilityMinor: maxZero(
        input.customer.totalLiabilityMinor,
      ).toString(),
      availableLiabilityMinor: maxZero(
        input.customer.availableLiabilityMinor,
      ).toString(),
      reservedMinor: maxZero(input.customer.reservedMinor).toString(),
      withdrawalEligibleMinor: maxZero(
        input.customer.withdrawalEligibleMinor,
      ).toString(),
      settlingMinor: maxZero(input.customer.settlingMinor).toString(),
      collectorProceedsMinor: maxZero(
        input.customer.collectorProceedsMinor,
      ).toString(),
      bacsRiskHeldMinor: maxZero(input.customer.bacsRiskHeldMinor).toString(),
      pendingDepositsMinor: maxZero(
        input.customer.pendingDepositsMinor,
      ).toString(),
      pendingWithdrawalsMinor: maxZero(
        input.customer.pendingWithdrawalsMinor,
      ).toString(),
      withdrawalReservationMinor: maxZero(
        input.customer.withdrawalReservationMinor,
      ).toString(),
      unresolvedReturnExposureMinor: maxZero(
        input.customer.unresolvedReturnExposureMinor,
      ).toString(),
    },
    stripePlatformLiquidity: {
      providerMode: input.stripe.providerMode,
      liquiditySource: input.stripe.liquiditySource,
      providerAvailableMinor:
        input.stripe.providerAvailableMinor?.toString() ?? null,
      providerPendingMinor:
        input.stripe.providerPendingMinor?.toString() ?? null,
      availableAfterReservationsMinor:
        input.stripe.availableAfterReservationsMinor?.toString() ?? null,
      activeReservationMinor: maxZero(
        input.stripe.activeReservationMinor,
      ).toString(),
      payoutLiquidityStatus: input.stripe.payoutLiquidityStatus,
      payoutLiquidityCoverageBps: input.stripe.payoutLiquidityCoverageBps,
      nextAvailabilityAt: input.stripe.nextAvailabilityAt,
      checkedAt: input.stripe.checkedAt,
      pendingPayoutObligationMinor: maxZero(
        input.stripe.pendingPayoutObligationMinor,
      ).toString(),
      requiredOperationalReserveMinor: reserve?.toString() ?? null,
      requiredPlatformRetentionMinor:
        protectedLiquidityMinor?.toString() ?? null,
      liquiditySurplusOrDeficitMinor:
        liquiditySurplusOrDeficitMinor?.toString() ?? null,
      liquidityShortfallMinor:
        liquiditySurplusOrDeficitMinor === null
          ? null
          : maxZero(-liquiditySurplusOrDeficitMinor).toString(),
      operationalStatus,
      connectedAvailableEvidenceMinor: maxZero(
        input.stripe.connectedAvailableEvidenceMinor,
      ).toString(),
      connectedPendingEvidenceMinor: maxZero(
        input.stripe.connectedPendingEvidenceMinor,
      ).toString(),
      connectedBalanceEvidenceAt: input.stripe.connectedBalanceEvidenceAt,
    },
    sliceCompanyRevenue: {
      feeRevenueByCategory: input.company.feeRevenueByCategory.map((item) => ({
        category: item.category,
        amountMinor: maxZero(item.amountMinor).toString(),
      })),
      grossFeeRevenueMinor: grossFeeRevenueMinor.toString(),
      providerExpensesMinor: maxZero(
        input.company.providerExpensesMinor,
      ).toString(),
      knownProviderCostsMinor: maxZero(
        input.company.knownProviderCostsMinor,
      ).toString(),
      pendingProviderCostCount: input.company.pendingProviderCostCount,
      recognisedNetRevenueMinor: recognisedNetRevenueMinor.toString(),
      alreadySweptMinor: maxZero(input.company.alreadySweptMinor).toString(),
      committedSweepMinor: maxZero(
        input.company.committedSweepMinor,
      ).toString(),
      unsweptRecognisedRevenueMinor: unsweptRecognisedRevenueMinor.toString(),
      operationalReserveConfigured: reserve !== undefined,
      operationalReserveMinor: reserve?.toString() ?? null,
      protectedLiquidityMinor: protectedLiquidityMinor?.toString() ?? null,
      availableAboveProtectionMinor:
        availableAboveProtectionMinor?.toString() ?? null,
      safeToSweepMinor: safeToSweepMinor.toString(),
      safeToSweepStatus: safeToSweepMinor > 0n ? 'READY' : 'BLOCKED',
      blockedReasons: reasons,
      // Approval records a protected command only. A separate, explicitly
      // configured provider executor must write PROCESSING/SETTLED evidence.
      externalExecutionStatus: 'NOT_CONFIGURED',
    },
  };
}

function maxZero(value: bigint) {
  return value > 0n ? value : 0n;
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}
