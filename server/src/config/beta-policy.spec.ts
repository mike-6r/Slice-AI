import {
  isBetaFixtureSlug,
  isBetaFixtureSource,
  publicBetaAssetWhere,
} from './beta-policy';

describe('beta public fixture boundary', () => {
  it('only identifies the explicit fixture marker', () => {
    expect(isBetaFixtureSlug('slice-demo-umbreon')).toBe(true);
    expect(isBetaFixtureSlug('collector-umbreon')).toBe(false);
    expect(isBetaFixtureSource('STAGING_DEMO_MARKET')).toBe(true);
    expect(isBetaFixtureSource('PRICECHARTING')).toBe(false);
  });

  it('does not add a filter outside beta', () => {
    expect(publicBetaAssetWhere(false)).toEqual({});
    expect(publicBetaAssetWhere(true)).toEqual({
      slug: { not: { startsWith: 'slice-demo-' } },
    });
  });
});
