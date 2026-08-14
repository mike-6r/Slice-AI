import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from './financial-ledger.service';
import { formatOwnershipPercent } from '../../ownership/domain/ownership-percent';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { publicBetaAssetWhere } from '../../../config/beta-policy';

@Injectable()
export class PortfolioQueryService {
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    @Inject(APP_CONFIG) private readonly config?: AppConfig,
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
    const investedCostMinor = holdings.every((holding) => holding.costBasisMinor !== null)
      ? holdings.reduce(
          (sum, holding) => sum + BigInt(holding.costBasisMinor as string),
          0n,
        )
      : null;
    const unrealisedPnlMinor =
      investedCostMinor !== null && holdings.every((holding) => holding.estimatedValueMinor !== null)
        ? holdingsMinor - investedCostMinor
        : null;
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
      investedCostMinor: investedCostMinor?.toString() ?? null,
      unrealisedPnlMinor: unrealisedPnlMinor?.toString() ?? null,
      unrealisedPnlPercent:
        investedCostMinor !== null && unrealisedPnlMinor !== null && investedCostMinor > 0n
          ? formatMoneyPercent(unrealisedPnlMinor, investedCostMinor)
          : null,
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
        where: { userId, asset: { status: 'PUBLISHED' } },
        include: { disposals: { select: { allocatedCostMinor: true } } },
      }),
    ]);
    const assets = await this.db.asset.findMany({
      where: {
        id: { in: positions.map((position) => position.assetId) },
        status: 'PUBLISHED',
        ...publicBetaAssetWhere(this.config?.isBeta === true),
      },
      select: {
        id: true,
        slug: true,
        title: true,
        category: { select: { name: true } },
        gradeScaleEntry: {
          select: {
            grade: true,
            label: true,
            company: { select: { code: true } },
          },
        },
        ownershipSupply: { select: { totalUnits: true, issuedUnits: true } },
        marketSnapshots: {
          where: { currency: 'GBP' },
          orderBy: [{ asOf: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { estimatedMarketValueMinor: true, asOf: true, status: true, markSource: true, freshness: true, lastSuccessfulRefreshAt: true },
        },
        tradingOrders: {
          where: {
            side: 'SELL',
            status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
            remainingUnits: { gt: 0n },
          },
          select: { remainingUnits: true },
        },
      },
    });
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    return positions.flatMap((position) => {
      const asset = assetsById.get(position.assetId);
      // Retired staging assets remain archived for audit purposes, but are not
      // investable portfolio positions. Exclude them from every portfolio
      // projection so the demo stays aligned with the published catalogue.
      if (!asset) return [];
      const supply = asset.ownershipSupply?.totalUnits;
      const mark = asset.marketSnapshots[0];
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
      const availableToBuyUnits = asset.tradingOrders.reduce(
        (sum, order) => sum + order.remainingUnits,
        0n,
      );
      const availableToSellUnits = position.settledUnits - position.reservedUnits;
      const unrealisedPnlMinor =
        estimated !== null && relevantLots.length ? estimated - costBasis : null;
      return {
        assetId: position.assetId,
        slug: asset.slug,
        title: asset.title,
        category: asset.category.name,
        grade: asset.gradeScaleEntry
          ? `${asset.gradeScaleEntry.company.code} ${asset.gradeScaleEntry.grade.toString()} · ${asset.gradeScaleEntry.label}`
          : null,
        totalUnits: supply?.toString() ?? null,
        issuedUnits: asset.ownershipSupply?.issuedUnits.toString() ?? null,
        ownedUnits: position.settledUnits.toString(),
        reservedUnits: position.reservedUnits.toString(),
        // This is the user's sellable settled position, not unowned market
        // liquidity. Keep the legacy field below for API compatibility while
        // exposing the explicit customer-facing meaning.
        availableToSellUnits: (
          position.settledUnits - position.reservedUnits
        ).toString(),
        availableUnits: (
          availableToSellUnits
        ).toString(),
        totalIssuedQuantity: supply?.toString() ?? null,
        userOwnershipPercent: supply
          ? formatOwnershipPercent(position.settledUnits, supply)
          : null,
        availableToSellPercent: supply
          ? formatOwnershipPercent(availableToSellUnits, supply)
          : null,
        availableToBuyQuantity: availableToBuyUnits.toString(),
        availableToBuyPercent: supply
          ? formatOwnershipPercent(availableToBuyUnits, supply)
          : null,
        estimatedValueMinor: estimated?.toString() ?? null,
        valuationAsOf: mark?.asOf.toISOString() ?? null,
        valuationStatus: mark ? 'FULL' : 'UNAVAILABLE',
        valuationSource: mark?.markSource ?? null,
        valuationFreshness: mark?.freshness ?? 'UNAVAILABLE',
        lastSuccessfulRefreshAt: mark?.lastSuccessfulRefreshAt?.toISOString() ?? null,
        costBasisMinor: relevantLots.length ? costBasis.toString() : null,
        unrealisedPnlMinor: unrealisedPnlMinor?.toString() ?? null,
        unrealisedPnlPercent:
          unrealisedPnlMinor !== null && costBasis > 0n
            ? formatMoneyPercent(unrealisedPnlMinor, costBasis)
            : null,
      };
    });
  }

  async lotsForUser(userId: string) {
    const lots = await this.db.portfolioLot.findMany({
      where: {
        userId,
        asset: { status: 'PUBLISHED', ...publicBetaAssetWhere(this.config?.isBeta === true) },
      },
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

function formatMoneyPercent(value: bigint, basis: bigint) {
  const scaled = (value * 10_000n) / basis;
  const sign = scaled < 0n ? '-' : '';
  const absolute = scaled < 0n ? -scaled : scaled;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
