import { initialOfferingFeePolicy } from '../../initial-offering/domain/initial-offering';
import { tradingPolicy } from '../../trading/domain/trading-policy';

/**
 * Read-only projection of the fee rules already used by Slice's movement,
 * offering, and settlement paths. This is disclosure data, not a new charge
 * or a second policy store.
 */
export function currentFeePolicy() {
  return {
    currency: 'GBP' as const,
    movementScheduleVersion: 'NO_SLICE_MOVEMENT_FEE_V1',
    deposit: { sliceFeeBps: 0, providerFeeSeparate: true },
    withdrawal: { sliceFeeBps: 0, providerFeeSeparate: true },
    secondaryTrading: {
      scheduleVersion: 'INITIAL_POLICY_V1',
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
