import { describe, expect, it, jest } from '@jest/globals';
import { PortfolioQueryService } from './portfolio-query.service';

describe('PortfolioQueryService holdings page projection', () => {
  it('reconciles total account value from ledger cash plus marked holdings once', async () => {
    type PortfolioQueryHarness = {
      ledger: {
        walletForUser: (userId: string) => Promise<{
          currency: 'GBP';
          totalMinor: string;
          reservedMinor: string;
          availableMinor: string;
          accounts: Array<{ totalMinor: string }>;
        }>;
      };
      holdingsForUser: (userId: string) => Promise<
        Array<{ estimatedValueMinor: string | null; costBasisMinor: string | null }>
      >;
      portfolioForUser: PortfolioQueryService['portfolioForUser'];
    };
    const service = Object.create(PortfolioQueryService.prototype) as PortfolioQueryHarness;
    service.ledger = {
      walletForUser: jest.fn(async () => ({
        currency: 'GBP' as const,
        totalMinor: '100000',
        reservedMinor: '25000',
        availableMinor: '75000',
        accounts: [{ totalMinor: '100000' }],
      })),
    };
    service.holdingsForUser = jest.fn(async () => [
      {
        estimatedValueMinor: '400164',
        costBasisMinor: null,
      },
    ]);

    const portfolio = await service.portfolioForUser('user-1');

    expect(portfolio.cash.totalMinor).toBe('100000');
    expect(portfolio.availableCashMinor).toBe('75000');
    expect(portfolio.reservedCashMinor).toBe('25000');
    expect(portfolio.estimatedHoldingsValueMinor).toBe('400164');
    expect(portfolio.totalAccountValueMinor).toBe('500164');
    expect(portfolio.estimatedPortfolioValueMinor).toBe('500164');
  });

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
