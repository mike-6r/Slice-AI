import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { PortfolioQueryService } from './portfolio-query.service';

const ranges = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  ALL: 3650,
} as const;
export type PortfolioPerformanceRange = keyof typeof ranges;

@Injectable()
export class PortfolioSnapshotService {
  constructor(
    private readonly db: PrismaService,
    private readonly portfolio: PortfolioQueryService,
  ) {}

  async captureForUser(userId: string, now = new Date()) {
    const summary = await this.portfolio.portfolioForUser(userId);
    const holdingsValue = BigInt(summary.estimatedHoldingsValueMinor ?? '0');
    // Use the same ledger-owned aggregate as the live portfolio response so
    // snapshots cannot drift from the value shown in the summary cards.
    const cashValue = BigInt(summary.cash.totalMinor);
    const reservedValue = BigInt(summary.cash.reservedMinor);
    const costBasis = summary.holdings.reduce(
      (total, holding) => total + BigInt(holding.costBasisMinor ?? '0'),
      0n,
    );
    const realized = await this.db.lotDisposal.aggregate({
      _sum: { realizedPnlMinor: true },
      where: { lot: { userId } },
    });
    const bucketStart = new Date(
      Math.floor(now.getTime() / 3_600_000) * 3_600_000,
    );
    const freshness =
      summary.holdings.length &&
      summary.holdings.every((holding) => holding.valuationStatus === 'FULL')
        ? 'FRESH'
        : summary.holdings.length
          ? 'AGING'
          : 'UNAVAILABLE';
    return this.db.portfolioSnapshot.upsert({
      where: { userId_bucketStart: { userId, bucketStart } },
      create: {
        id: randomUUID(),
        userId,
        bucketStart,
        cashValueMinor: cashValue,
        reservedValueMinor: reservedValue,
        holdingsMarketValueMinor: holdingsValue,
        portfolioMarketValueMinor: cashValue + holdingsValue,
        costBasisMinor: costBasis,
        unrealizedPnlMinor: holdingsValue - costBasis,
        realizedPnlMinor: realized._sum.realizedPnlMinor ?? 0n,
        currency: 'GBP',
        marketDataFreshness: freshness,
        source: 'LEDGER_AND_MARKET_MARKS',
      },
      update: {
        cashValueMinor: cashValue,
        reservedValueMinor: reservedValue,
        holdingsMarketValueMinor: holdingsValue,
        portfolioMarketValueMinor: cashValue + holdingsValue,
        costBasisMinor: costBasis,
        unrealizedPnlMinor: holdingsValue - costBasis,
        realizedPnlMinor: realized._sum.realizedPnlMinor ?? 0n,
        marketDataFreshness: freshness,
      },
    });
  }

  async captureAll(now = new Date()) {
    const users = await this.db.user.findMany({
      where: { accountStatus: { not: 'CLOSED' } },
      select: { id: true },
      take: 10_000,
    });
    let captured = 0;
    for (const user of users) {
      await this.captureForUser(user.id, now);
      captured += 1;
    }
    return { captured };
  }

  async performanceForUser(
    userId: string,
    range: PortfolioPerformanceRange = '1M',
  ) {
    const from = new Date(Date.now() - ranges[range] * 86_400_000);
    const points = await this.db.portfolioSnapshot.findMany({
      where: { userId, bucketStart: { gte: from } },
      orderBy: [{ bucketStart: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last)
      return {
        range,
        points: [],
        periodChangeMinor: null,
        periodChangeBps: null,
        netCashFlowMinor: '0',
        direction: 'NEUTRAL',
        freshness: 'UNAVAILABLE',
      };
    const cashFlowEvents = await this.cashFlowEventsBetween(
      userId,
      first.bucketStart,
      last.bucketStart,
    );
    let eventIndex = 0;
    let netCashFlowMinor = 0n;
    const series = points.map((point) => {
      while (
        eventIndex < cashFlowEvents.length &&
        cashFlowEvents[eventIndex]!.effectiveAt.getTime() <=
          point.bucketStart.getTime()
      ) {
        netCashFlowMinor += cashFlowEvents[eventIndex]!.amountMinor;
        eventIndex += 1;
      }
      const cashFlowAdjustedChangeMinor =
        point.portfolioMarketValueMinor -
        first.portfolioMarketValueMinor -
        netCashFlowMinor;
      return {
        timestamp: point.bucketStart.toISOString(),
        valueMinor: point.portfolioMarketValueMinor.toString(),
        currency: point.currency,
        freshness: point.marketDataFreshness,
        cashValueMinor: point.cashValueMinor.toString(),
        availableCashMinor: (
          point.cashValueMinor - point.reservedValueMinor
        ).toString(),
        holdingsValueMinor: point.holdingsMarketValueMinor.toString(),
        reservedValueMinor: point.reservedValueMinor.toString(),
        costBasisMinor: point.costBasisMinor.toString(),
        unrealisedPnlMinor: point.unrealizedPnlMinor.toString(),
        netExternalCashFlowMinor: netCashFlowMinor.toString(),
        cashFlowAdjustedChangeMinor: cashFlowAdjustedChangeMinor.toString(),
      };
    });
    const change = BigInt(series.at(-1)!.cashFlowAdjustedChangeMinor);
    const bps =
      first.portfolioMarketValueMinor === 0n
        ? null
        : Number((change * 10_000n) / first.portfolioMarketValueMinor);
    return {
      range,
      points: series,
      periodChangeMinor: change.toString(),
      periodChangeBps: bps,
      netCashFlowMinor: netCashFlowMinor.toString(),
      direction:
        change > 0n ? 'POSITIVE' : change < 0n ? 'NEGATIVE' : 'NEUTRAL',
      freshness: last.marketDataFreshness,
    };
  }

  private async cashFlowEventsBetween(userId: string, from: Date, to: Date) {
    const accounts = await this.db.financialAccount.findMany({
      where: { ownerType: 'USER', ownerUserId: userId, currency: 'GBP' },
      select: { id: true, normalSide: true },
    });
    if (!accounts.length) return [];
    const normalSides = new Map(
      accounts.map((account) => [account.id, account.normalSide]),
    );
    const entries = await this.db.journalEntry.findMany({
      where: {
        accountId: { in: accounts.map((account) => account.id) },
        transaction: {
          effectiveAt: { gt: from, lte: to },
          type: {
            in: ['EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'DEMO_FUNDING'],
          },
        },
      },
      select: {
        accountId: true,
        side: true,
        amountMinor: true,
        transaction: { select: { effectiveAt: true } },
      },
      orderBy: [{ transaction: { effectiveAt: 'asc' } }, { id: 'asc' }],
    });
    return entries.map((entry) => {
      const normalSide = normalSides.get(entry.accountId);
      const isPositive = entry.side === normalSide;
      return {
        effectiveAt: entry.transaction.effectiveAt,
        amountMinor: isPositive ? entry.amountMinor : -entry.amountMinor,
      };
    });
  }
}
