import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from './financial-ledger.service';
import { formatOwnershipPercent } from '../../ownership/domain/ownership-percent';
import { selectAuthoritativeSliceValuation } from '../../valuation/valuation-projection';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { publicBetaAssetWhere } from '../../../config/beta-policy';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../submissions/ports/submission-storage.ports';

@Injectable()
export class PortfolioQueryService {
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    @Inject(APP_CONFIG) private readonly config?: AppConfig,
    @Optional() @Inject(OBJECT_STORAGE) private readonly storage?: ObjectStoragePort,
  ) {}

  async portfolioForUser(userId: string) {
    const [wallet, holdings] = await Promise.all([
      this.ledger.walletForUser(userId),
      this.holdingsForUser(userId),
    ]);
    // The ledger owns the aggregate cash projection. Keep the account-row
    // reduction only as a compatibility fallback for older test fixtures.
    const cashMinor =
      typeof wallet.totalMinor === 'string'
        ? BigInt(wallet.totalMinor)
        : wallet.accounts.reduce(
            (sum, account) => sum + BigInt(account.totalMinor),
            0n,
          );
    const holdingsFullyValued = holdings.every(
      (holding) => holding.estimatedValueMinor !== null,
    );
    const holdingsMinor = holdings.reduce(
      (sum, holding) =>
        sum +
        (holding.estimatedValueMinor
          ? BigInt(holding.estimatedValueMinor)
          : 0n),
      0n,
    );
    const investedCostMinor = holdings.every(
      (holding) => holding.costBasisMinor !== null,
    )
      ? holdings.reduce(
          (sum, holding) => sum + BigInt(holding.costBasisMinor as string),
          0n,
        )
      : null;
    const unrealisedPnlMinor =
      investedCostMinor !== null &&
      holdings.every((holding) => holding.estimatedValueMinor !== null)
        ? holdingsMinor - investedCostMinor
        : null;
    return {
      currency: 'GBP',
      cash: wallet,
      holdings,
      estimatedHoldingsValueMinor: holdingsFullyValued
        ? holdingsMinor.toString()
        : null,
      estimatedPortfolioValueMinor: holdingsFullyValued
        ? (cashMinor + holdingsMinor).toString()
        : null,
      totalAccountValueMinor: holdingsFullyValued
        ? (cashMinor + holdingsMinor).toString()
        : null,
      availableCashMinor: wallet.availableMinor,
      reservedCashMinor: wallet.reservedMinor,
      valuationStatus: holdings.some(
        (holding) => holding.estimatedValueMinor === null,
      )
        ? 'PARTIAL'
        : 'FULL',
      investedCostMinor: investedCostMinor?.toString() ?? null,
      unrealisedPnlMinor: unrealisedPnlMinor?.toString() ?? null,
      unrealisedPnlPercent:
        investedCostMinor !== null &&
        unrealisedPnlMinor !== null &&
        investedCostMinor > 0n
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
        collectibleSet: { select: { name: true } },
        submissions: {
          where: { status: 'APPROVED' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            media: {
              where: { status: 'SAFE', deletedAt: null },
              orderBy: { slot: 'asc' },
              take: 1,
              select: { objectKey: true },
            },
          },
        },
        gradeScaleEntry: {
          select: {
            grade: true,
            label: true,
            company: { select: { code: true } },
          },
        },
        ownershipSupply: { select: { totalUnits: true, issuedUnits: true } },
        marketSnapshots: {
          where: {
            currency: 'GBP',
            markSource: { not: 'EXTERNAL_REFERENCE_FALLBACK' },
          },
          orderBy: [{ asOf: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            estimatedMarketValueMinor: true,
            asOf: true,
            status: true,
            markSource: true,
            freshness: true,
            lastSuccessfulRefreshAt: true,
          },
        },
        valuationDecisions: {
          where: { status: 'ACTIVE' },
          orderBy: { decidedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            valueMinor: true,
            currency: true,
            confidence: true,
            methodologyCode: true,
            decidedAt: true,
            status: true,
          },
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
    const projections = await Promise.all(positions.map(async (position) => {
      const asset = assetsById.get(position.assetId);
      // Retired staging assets remain archived for audit purposes, but are not
      // investable portfolio positions. Exclude them from every portfolio
      // projection so the demo stays aligned with the published catalogue.
      if (!asset) return null;
      const supply = asset.ownershipSupply?.totalUnits;
      const mark = asset.marketSnapshots[0];
      const sliceValuation = selectAuthoritativeSliceValuation(
        asset.valuationDecisions,
      );
      const valuation =
        sliceValuation?.currency === 'GBP' ? sliceValuation : mark;
      const valuationMinor =
        sliceValuation?.currency === 'GBP'
          ? sliceValuation.amountMinor
          : mark?.estimatedMarketValueMinor;
      const thumbnailUrl = await this.safeThumbnailUrl(asset.submissions[0]?.media[0]?.objectKey);
      const estimated =
        supply && valuationMinor
          ? (valuationMinor * position.settledUnits) / supply
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
      const availableToSellUnits =
        position.settledUnits - position.reservedUnits;
      const unrealisedPnlMinor =
        estimated !== null && relevantLots.length
          ? estimated - costBasis
          : null;
      return {
        assetId: position.assetId,
        slug: asset.slug,
        title: asset.title,
        category: asset.category.name,
        setName: asset.collectibleSet?.name ?? null,
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
        availableUnits: availableToSellUnits.toString(),
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
        pricePerSliceMinor:
          supply && valuationMinor ? (valuationMinor / supply).toString() : null,
        thumbnailUrl,
        valuationAsOf:
          sliceValuation?.currency === 'GBP'
            ? sliceValuation.approvedAt.toISOString()
            : (mark?.asOf.toISOString() ?? null),
        valuationStatus: valuation ? 'FULL' : 'UNAVAILABLE',
        valuationSource:
          sliceValuation?.currency === 'GBP'
            ? 'SLICE_VALUATION'
            : (mark?.markSource ?? null),
        valuationFreshness:
          sliceValuation?.currency === 'GBP'
            ? 'FRESH'
            : (mark?.freshness ?? 'UNAVAILABLE'),
        lastSuccessfulRefreshAt:
          sliceValuation?.currency === 'GBP'
            ? sliceValuation.approvedAt.toISOString()
            : (mark?.lastSuccessfulRefreshAt?.toISOString() ?? null),
        costBasisMinor: relevantLots.length ? costBasis.toString() : null,
        unrealisedPnlMinor: unrealisedPnlMinor?.toString() ?? null,
        unrealisedPnlPercent:
          unrealisedPnlMinor !== null && costBasis > 0n
            ? formatMoneyPercent(unrealisedPnlMinor, costBasis)
            : null,
      };
    }));
    return projections.filter((projection): projection is NonNullable<typeof projection> => projection !== null);
  }

  private async safeThumbnailUrl(objectKey: string | undefined) {
    if (!objectKey || !this.storage) return null;
    return this.storage
      .createPrivateDownloadUrl(objectKey, new Date(Date.now() + 5 * 60_000))
      .catch(() => null);
  }

  async holdingsPageForUser(
    userId: string,
    input: {
      page?: number;
      pageSize?: number;
      q?: string;
      category?: string;
      sort?: 'VALUE_DESC' | 'OWNERSHIP_DESC' | 'TITLE_ASC';
    } = {},
  ) {
    const all = await this.holdingsForUser(userId);
    const query = input.q?.trim().toLowerCase();
    const category = input.category?.trim().toLowerCase();
    const filtered = all.filter((holding) => {
      const matchesQuery = !query || [holding.title, holding.category, holding.grade, holding.slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
      const matchesCategory = !category || holding.category?.toLowerCase() === category;
      return matchesQuery && matchesCategory;
    });
    const sorted = [...filtered].sort((left, right) => {
      if (input.sort === 'VALUE_DESC') return compareMinor(right.estimatedValueMinor, left.estimatedValueMinor) || titleCompare(left.title, right.title);
      if (input.sort === 'OWNERSHIP_DESC') return compareOwnership(left, right) || titleCompare(left.title, right.title);
      return titleCompare(left.title, right.title) || left.assetId.localeCompare(right.assetId);
    });
    const pageSize = Math.min(Math.max(input.pageSize ?? 10, 1), 50);
    const total = sorted.length;
    const totalPages = total ? Math.ceil(total / pageSize) : 0;
    const page = Math.min(Math.max(input.page ?? 1, 1), Math.max(totalPages, 1));
    return {
      items: sorted.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async lotsForUser(userId: string) {
    const lots = await this.db.portfolioLot.findMany({
      where: {
        userId,
        asset: {
          status: 'PUBLISHED',
          ...publicBetaAssetWhere(this.config?.isBeta === true),
        },
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

function titleCompare(left: string | null, right: string | null) {
  return (left ?? 'Collectible').localeCompare(right ?? 'Collectible');
}

function compareMinor(left: string | null, right: string | null) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

function compareOwnership(left: { userOwnershipPercent?: string | null }, right: { userOwnershipPercent?: string | null }) {
  const a = left.userOwnershipPercent ? Number(left.userOwnershipPercent) : -1;
  const b = right.userOwnershipPercent ? Number(right.userOwnershipPercent) : -1;
  return a === b ? 0 : a > b ? -1 : 1;
}

function formatMoneyPercent(value: bigint, basis: bigint) {
  const scaled = (value * 10_000n) / basis;
  const sign = scaled < 0n ? '-' : '';
  const absolute = scaled < 0n ? -scaled : scaled;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n)
    .toString()
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
