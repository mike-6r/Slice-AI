import { buildPublicOwnershipBreakdown } from './public-ownership-breakdown';

describe('buildPublicOwnershipBreakdown', () => {
  it('reconciles Initial Offering ownership into distinct settled categories', () => {
    const result = buildPublicOwnershipBreakdown({
      issuedUnits: 1_000n,
      listedUnits: 500n,
      originatingCollectorUserId: 'collector',
      positions: [
        { settledUnits: 400n, account: { type: 'USER', userId: 'collector' } },
        { settledUnits: 100n, account: { type: 'USER', userId: 'investor' } },
        {
          settledUnits: 500n,
          account: { type: 'INITIAL_OFFERING', userId: null },
        },
      ],
    });

    expect(result.reconciles).toBe(true);
    expect(
      result.categories.map((category) => [category.key, category.units]),
    ).toEqual([
      ['COLLECTOR_RETAINED', '400'],
      ['INVESTOR_OWNED', '100'],
      ['OFFERING_INVENTORY', '500'],
    ]);
    expect(result.listedAvailability.relationship).toBe('SEPARATE_INVENTORY');
  });

  it('keeps secondary listings separate when listed units are a subset of inventory', () => {
    const result = buildPublicOwnershipBreakdown({
      issuedUnits: 1_000n,
      listedUnits: 9n,
      positions: [
        { settledUnits: 1n, account: { type: 'USER', userId: 'investor' } },
        { settledUnits: 999n, account: { type: 'TREASURY', userId: null } },
      ],
    });

    expect(result.reconciles).toBe(true);
    expect(
      result.categories.map((category) => [category.key, category.units]),
    ).toEqual([
      ['INVESTOR_OWNED', '1'],
      ['PLATFORM_INVENTORY', '999'],
    ]);
    expect(result.listedAvailability).toMatchObject({
      units: '9',
      percentage: '0.9',
      relationship: 'SUBSET_OF_OWNERSHIP_BUCKET',
    });
  });

  it('surfaces an issued-unit gap instead of fabricating a category', () => {
    const result = buildPublicOwnershipBreakdown({
      issuedUnits: 1_000n,
      listedUnits: 0n,
      positions: [
        { settledUnits: 900n, account: { type: 'TREASURY', userId: null } },
      ],
    });

    expect(result.reconciles).toBe(true);
    expect(result.categories.at(-1)).toMatchObject({
      key: 'UNALLOCATED_ISSUED',
      units: '100',
    });
  });
});
