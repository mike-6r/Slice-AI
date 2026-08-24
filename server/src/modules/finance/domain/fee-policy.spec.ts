import { describe, expect, it } from '@jest/globals';
import { currentFeePolicy, feeForBps } from './fee-policy';

describe('current fee policy projection', () => {
  it('matches the existing movement, offering, and secondary-market authorities', () => {
    const policy = currentFeePolicy();
    expect(policy.deposit.sliceFeeBps).toBe(0);
    expect(policy.withdrawal.sliceFeeBps).toBe(250);
    expect(policy.secondaryTrading).toMatchObject({ makerFeeBps: 0, takerFeeBps: 0 });
    expect(policy.initialOffering).toMatchObject({ scheduleVersion: 'INITIAL_OFFERING_5_PERCENT_V1', feeBps: 500 });
  });

  it('rounds the gross withdrawal fee in integer minor units', () => {
    expect(feeForBps(100n, 250)).toBe(2n);
    expect(feeForBps(1_000n, 250)).toBe(25n);
    expect(feeForBps(9_999n, 250)).toBe(249n);
    expect(feeForBps(10_000n, 250)).toBe(250n);
    expect(feeForBps(100_000n, 250)).toBe(2_500n);
  });
});
