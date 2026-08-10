import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from './financial-ledger.service';

@Injectable()
export class PortfolioQueryService {
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
  ) {}

  async portfolioForUser(userId: string) {
    const [wallet, holdings] = await Promise.all([
      this.ledger.walletForUser(userId),
      this.holdingsForUser(userId),
    ]);
    const cashMinor = wallet.accounts.reduce(
      (sum, account) => sum + BigInt(account.totalMinor),
      0n,
    );
    const holdingsMinor = holdings.reduce(
      (sum, holding) =>
        sum +
        (holding.estimatedValueMinor
          ? BigInt(holding.estimatedValueMinor)
          : 0n),
      0n,
    );
    return {
      currency: 'GBP',
      cash: wallet,
      holdings,
      estimatedHoldingsValueMinor: holdingsMinor.toString(),
      estimatedPortfolioValueMinor: (cashMinor + holdingsMinor).toString(),
      valuationStatus: holdings.some(
        (holding) => holding.estimatedValueMinor === null,
      )
        ? 'PARTIAL'
        : 'AVAILABLE',
    };
  }

  async holdingsForUser(userId: string) {
    const account = await this.db.ownershipAccount.findUnique({
      where: { userId },
    });
    if (!account) return [];
    const [positions, lots] = await Promise.all([
      this.db.ownershipPosition.findMany({
        where: { accountId: account.id, settledUnits: { gt: 0n } },
        orderBy: { assetId: 'asc' },
      }),
      this.db.portfolioLot.findMany({
        where: { userId },
        include: { disposals: { select: { allocatedCostMinor: true } } },
      }),
    ]);
    const assets = await this.db.asset.findMany({
      where: { id: { in: positions.map((position) => position.assetId) } },
      select: {
        id: true,
        slug: true,
        title: true,
        ownershipSupply: { select: { totalUnits: true } },
        marketSnapshots: {
          where: { currency: 'GBP' },
          orderBy: [{ asOf: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { estimatedMarketValueMinor: true, asOf: true, status: true },
        },
      },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return positions.map((position) => {
      const asset = assetsById.get(position.assetId);
      const supply = asset?.ownershipSupply?.totalUnits;
      const mark = asset?.marketSnapshots[0];
      const estimated =
        supply && mark
          ? (mark.estimatedMarketValueMinor * position.settledUnits) / supply
          : null;
      const relevantLots = lots.filter(
        (lot) => lot.assetId === position.assetId,
      );
      const costBasis = relevantLots.reduce(
        (sum, lot) =>
          sum +
          lot.totalCostMinor -
          lot.disposals.reduce(
            (inner, disposal) => inner + disposal.allocatedCostMinor,
            0n,
          ),
        0n,
      );
      return {
        assetId: position.assetId,
        slug: asset?.slug ?? null,
        title: asset?.title ?? null,
        ownedUnits: position.settledUnits.toString(),
        reservedUnits: position.reservedUnits.toString(),
        availableUnits: (
          position.settledUnits - position.reservedUnits
        ).toString(),
        estimatedValueMinor: estimated?.toString() ?? null,
        valuationAsOf: mark?.asOf.toISOString() ?? null,
        valuationStatus: mark?.status ?? 'UNAVAILABLE',
        costBasisMinor: relevantLots.length ? costBasis.toString() : null,
      };
    });
  }

  async lotsForUser(userId: string) {
    const lots = await this.db.portfolioLot.findMany({
      where: { userId },
      include: { asset: { select: { slug: true, title: true } } },
      orderBy: [{ acquiredAt: 'asc' }, { id: 'asc' }],
    });
    return lots.map((lot) => ({
      assetSlug: lot.asset.slug,
      assetTitle: lot.asset.title,
      acquiredUnits: lot.acquiredUnits.toString(),
      remainingUnits: lot.remainingUnits.toString(),
      totalCostMinor: lot.totalCostMinor.toString(),
      acquiredAt: lot.acquiredAt.toISOString(),
      status: lot.status,
    }));
  }
}
