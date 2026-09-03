import {
  publicDiscoverableAssetWhere,
  publicPreSaleAssetWhere,
} from './public-asset-visibility';

describe('public asset visibility', () => {
  it('allows active Pre-Sales before final publication', () => {
    const where = publicDiscoverableAssetWhere(false);
    expect(where).toMatchObject({
      status: 'PUBLISHED',
      AND: expect.arrayContaining([
        {
          OR: [
            { preSale: { is: { status: 'ACTIVE' } } },
            { publication: { is: { status: 'PUBLISHED' } } },
          ],
        },
      ]),
    });
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
      status: 'PUBLISHED',
      preSale: { is: { status: 'ACTIVE' } },
    });
  });
});
