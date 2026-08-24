import { describe, expect, it } from '@jest/globals';
import { currentFeePolicy } from './fee-policy';

describe('current fee policy projection', () => {
  it('matches the existing movement, offering, and secondary-market authorities', () => {
    const policy = currentFeePolicy();
    expect(policy.deposit.sliceFeeBps).toBe(0);
    expect(policy.withdrawal.sliceFeeBps).toBe(0);
    expect(policy.secondaryTrading).toMatchObject({ makerFeeBps: 0, takerFeeBps: 100 });
    expect(policy.initialOffering.feeBps).toBe(0);
  });
});
