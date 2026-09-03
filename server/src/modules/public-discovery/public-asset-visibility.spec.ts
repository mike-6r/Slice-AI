import {
  publicDiscoverableAssetWhere,
  publicPreSaleAssetWhere,
} from './public-asset-visibility';

describe('public asset visibility', () => {
  it('allows active Pre-Sales before final publication', () => {
    const where = publicDiscoverableAssetWhere(false);
    expect(where).toMatchObject({
      AND: expect.arrayContaining([
        {
          OR: [
            { preSale: { is: { status: 'ACTIVE' } } },
            { status: 'PUBLISHED' },
          ],
        },
      ]),
    });
  });

  it('does not require the underlying asset to be published when its Pre-Sale is active', () => {
    const where = publicDiscoverableAssetWhere(false);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [{ preSale: { is: { status: 'ACTIVE' } } }, { status: 'PUBLISHED' }],
        },
      ]),
    );
  });

  it('keeps beta fixtures and frozen assets outside the public catalogue', () => {
    const where = publicDiscoverableAssetWhere(true);
    expect(where).toMatchObject({
      slug: { not: { startsWith: 'slice-demo-' } },
      AND: expect.arrayContaining([
        {
          OR: [
            { operationalControl: { is: { status: 'ACTIVE' } } },
            { operationalControl: { is: null } },
          ],
        },
      ]),
    });
  });

  it('provides a narrow active Pre-Sale predicate for shared nested collector queries', () => {
    expect(publicPreSaleAssetWhere(false)).toMatchObject({
      preSale: { is: { status: 'ACTIVE' } },
    });
  });
});
