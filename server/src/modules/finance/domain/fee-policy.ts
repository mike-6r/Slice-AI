import { initialOfferingFeePolicy } from '../../initial-offering/domain/initial-offering';
import { tradingPolicy } from '../../trading/domain/trading-policy';

export const WITHDRAWAL_FEE_BPS = 250;

export function feeForBps(amountMinor: bigint, bps: number) {
  if (amountMinor < 0n || !Number.isInteger(bps) || bps < 0 || bps > 10_000)
    throw new Error('Invalid fee calculation input.');
  return (amountMinor * BigInt(bps)) / 10_000n;
}

/**
 * Read-only projection of the fee rules already used by Slice's movement,
 * offering, and settlement paths. This is disclosure data, not a new charge
 * or a second policy store.
 */
export function currentFeePolicy() {
  return {
    currency: 'GBP' as const,
    movementScheduleVersion: 'SLICE_MOVEMENT_FEE_POLICY_V2',
    deposit: { sliceFeeBps: 0, providerFeeSeparate: true },
    withdrawal: { sliceFeeBps: WITHDRAWAL_FEE_BPS, providerFeeSeparate: true },
    secondaryTrading: {
      scheduleVersion: tradingPolicy.fee.application,
      makerFeeBps: tradingPolicy.fee.makerBps,
      takerFeeBps: tradingPolicy.fee.takerBps,
    },
    initialOffering: {
      scheduleVersion: initialOfferingFeePolicy.version,
      feeBps: initialOfferingFeePolicy.feeBps,
    },
  };
}

export type CurrentFeePolicy = ReturnType<typeof currentFeePolicy>;
