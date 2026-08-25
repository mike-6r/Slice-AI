import { PortfolioSnapshotService } from './portfolio-snapshot.service';

describe('PortfolioSnapshotService performance projection', () => {
  it('treats deposits as positive cash flow and withdrawals as negative cash flow', async () => {
    const now = new Date();
    const firstAt = new Date(now.getTime() - 2 * 86_400_000);
    const lastAt = new Date(now.getTime() - 86_400_000);
    const points = [
      {
        bucketStart: firstAt,
        portfolioMarketValueMinor: 10_000n,
        cashValueMinor: 10_000n,
        holdingsMarketValueMinor: 0n,
        reservedValueMinor: 0n,
        costBasisMinor: 0n,
        unrealizedPnlMinor: 0n,
        currency: 'GBP',
        marketDataFreshness: 'FRESH',
        id: 'first',
      },
      {
        bucketStart: lastAt,
        portfolioMarketValueMinor: 18_000n,
        cashValueMinor: 17_500n,
        holdingsMarketValueMinor: 500n,
        reservedValueMinor: 0n,
        costBasisMinor: 500n,
        unrealizedPnlMinor: 0n,
        currency: 'GBP',
        marketDataFreshness: 'FRESH',
        id: 'last',
      },
    ];
    const db = {
      portfolioSnapshot: { findMany: jest.fn().mockResolvedValue(points) },
      financialAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cash', normalSide: 'DEBIT' }]),
      },
      journalEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            accountId: 'cash',
            side: 'DEBIT',
            amountMinor: 10_000n,
            transaction: { effectiveAt: new Date(firstAt.getTime() + 1_000) },
          },
          {
            accountId: 'cash',
            side: 'CREDIT',
            amountMinor: 2_500n,
            transaction: { effectiveAt: new Date(lastAt.getTime() - 1_000) },
          },
        ]),
      },
    };
    const service = Object.create(
      PortfolioSnapshotService.prototype,
    ) as PortfolioSnapshotService;
    Object.assign(service, { db });

    const result = await service.performanceForUser('user-1', 'ALL');

    expect(result.netCashFlowMinor).toBe('7500');
    expect(result.periodChangeMinor).toBe('500');
    expect(result.direction).toBe('POSITIVE');
    expect(result.points[0]).toMatchObject({
      netExternalCashFlowMinor: '0',
      cashFlowAdjustedChangeMinor: '0',
    });
    expect(result.points[1]).toMatchObject({
      netExternalCashFlowMinor: '7500',
      cashFlowAdjustedChangeMinor: '500',
    });
  });
});
