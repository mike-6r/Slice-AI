import { assertMarketPolicy, feeMinor, tradingPolicy } from './trading-policy';

describe('Document 014 trading policy variables', () => {
  const policy = {
    status: 'OPEN' as const,
    tickSizeMinor: 1n,
    lotSizeUnits: 1n,
    minimumNotionalMinor: 100n,
    makerFeeBps: tradingPolicy.fee.makerBps,
    takerFeeBps: tradingPolicy.fee.takerBps,
    selfTradePrevention: tradingPolicy.selfTradePrevention,
    tradingEnabled: true,
  };

  it('uses bounded integer basis points and explicit fee application', () => {
    expect(tradingPolicy.fee.application).toBe('SETTLEMENT_BOUNDARY_PENDING');
    expect(feeMinor(10_000n, policy.takerFeeBps)).toBe(100n);
    expect(() => assertMarketPolicy({ ...policy, takerFeeBps: 1_001 })).toThrow(
      'policy is invalid',
    );
  });

  it('calculates maker and taker fee previews with deterministic integer rounding', () => {
    expect(feeMinor(999n, policy.makerFeeBps)).toBe(0n);
    expect(feeMinor(101n, policy.takerFeeBps)).toBe(2n);
    expect(feeMinor(10_000n, policy.takerFeeBps)).toBe(100n);
    expect(feeMinor(10_000n, policy.takerFeeBps)).toBeLessThanOrEqual(10_000n);
  });

  it('requires an open enabled market with positive configurable values', () => {
    expect(() => assertMarketPolicy(policy)).not.toThrow();
    expect(() => assertMarketPolicy({ ...policy, status: 'HALTED' })).toThrow(
      'market is not open',
    );
    expect(() =>
      assertMarketPolicy({ ...policy, minimumNotionalMinor: 0n }),
    ).toThrow('policy is invalid');
  });
});
