import {
  deriveMarketSnapshotStatus,
  marketSnapshotPriority,
} from './market-snapshot';

describe('market snapshot projection rules', () => {
  it('does not claim current data when every item lacks persisted freshness', () => {
    expect(deriveMarketSnapshotStatus([{ freshness: null }, { freshness: 'UNAVAILABLE' }])).toBe(
      'DELAYED',
    );
  });

  it('uses the freshest persisted reference state for the strip status', () => {
    expect(deriveMarketSnapshotStatus([{ freshness: 'STALE' }, { freshness: 'FRESH' }])).toBe(
      'CURRENT',
    );
    expect(deriveMarketSnapshotStatus([{ freshness: 'AGING' }, { freshness: 'STALE' }])).toBe(
      'AGING',
    );
  });

  it('prioritizes real Slice prices over reference-only assets', () => {
    expect(
      marketSnapshotPriority({
        hasLastTrade: true,
        hasInitialOffering: false,
        hasExternalReference: true,
      }),
    ).toBeLessThan(
      marketSnapshotPriority({
        hasLastTrade: false,
        hasInitialOffering: false,
        hasExternalReference: true,
      }),
    );
    expect(
      marketSnapshotPriority({
        hasLastTrade: false,
        hasInitialOffering: true,
        hasExternalReference: false,
      }),
    ).toBeLessThan(
      marketSnapshotPriority({
        hasLastTrade: false,
        hasInitialOffering: false,
        hasExternalReference: true,
      }),
    );
  });
});
