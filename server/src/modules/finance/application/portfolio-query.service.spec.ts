import { describe, expect, it, jest } from '@jest/globals';
import { PortfolioQueryService } from './portfolio-query.service';

describe('PortfolioQueryService holdings page projection', () => {
  it('filters, sorts, and paginates the authoritative holding projection', async () => {
    const service = Object.create(PortfolioQueryService.prototype) as PortfolioQueryService;
    const holdings = [
      { assetId: 'alpha', title: 'Alpha Card', category: 'Pokémon', slug: 'alpha', grade: null, estimatedValueMinor: '900', userOwnershipPercent: '10' },
      { assetId: 'beta', title: 'Beta Card', category: 'Sports', slug: 'beta', grade: null, estimatedValueMinor: '2000', userOwnershipPercent: '20' },
      { assetId: 'gamma', title: 'Gamma Card', category: 'Pokémon', slug: 'gamma', grade: null, estimatedValueMinor: '1500', userOwnershipPercent: '5' },
    ] as unknown as Awaited<ReturnType<PortfolioQueryService['holdingsForUser']>>;
    const holdingsForUser = jest.fn<
      (userId: string) => Promise<Awaited<ReturnType<PortfolioQueryService['holdingsForUser']>>>
    >().mockResolvedValue(holdings);
    service.holdingsForUser = holdingsForUser;

    const page = await service.holdingsPageForUser('user-1', {
      page: 1,
      pageSize: 1,
      category: 'pokémon',
      sort: 'VALUE_DESC',
    });

    expect(page).toEqual({
      items: [expect.objectContaining({ assetId: 'gamma', estimatedValueMinor: '1500' })],
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(holdingsForUser).toHaveBeenCalledWith('user-1');
  });
});
