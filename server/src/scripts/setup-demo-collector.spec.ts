import {
  COLLECTOR_FIXTURE_ROLES,
  demoMarketHistoryAdjustmentBps,
} from './setup-demo-collector';

describe('staging demo market valuation profiles', () => {
  it('keeps distinct, deterministic 90-day trends in persisted valuation data', () => {
    expect(demoMarketHistoryAdjustmentBps('UPWARD', 0)).toBeLessThan(
      demoMarketHistoryAdjustmentBps('UPWARD', 89),
    );
    expect(demoMarketHistoryAdjustmentBps('DOWNWARD', 0)).toBeGreaterThan(
      demoMarketHistoryAdjustmentBps('DOWNWARD', 89),
    );
    expect(demoMarketHistoryAdjustmentBps('STABLE', 0)).toEqual(
      demoMarketHistoryAdjustmentBps('STABLE', 7),
    );
    expect(demoMarketHistoryAdjustmentBps('VOLATILE', 6)).not.toEqual(
      demoMarketHistoryAdjustmentBps('VOLATILE', 7),
    );
  });
});

describe('Collector fixture role boundary', () => {
  it('provisions Collector access without staff review authority', () => {
    expect(COLLECTOR_FIXTURE_ROLES).toEqual(['COLLECTOR']);
    expect(COLLECTOR_FIXTURE_ROLES).not.toContain('ASSET_REVIEWER');
  });
});
