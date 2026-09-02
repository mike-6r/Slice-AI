import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../infrastructure/redis/redis.store';
import { MarketProviderRegistry } from './market-provider.registry';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  isBetaFixtureSource,
  publicBetaAssetWhere,
} from '../../config/beta-policy';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../submissions/ports/submission-storage.ports';
import { deriveMarketLifecycle } from '../market-lifecycle/domain/market-lifecycle';
import { selectAuthoritativeSliceValuation } from '../valuation/valuation-projection';
import {
  downsampleReferencePoints,
  calculateReferenceHistoryMetrics,
  calculateReferenceMovements,
  type ReferenceHistoryPoint,
} from './market-reference-metrics';
import {
  deriveMarketSnapshotStatus,
  marketSnapshotPriority,
} from './market-snapshot';

const ranges = {
  '24H': 1,
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '1Y': 365,
  ALL: 3650,
} as const;
type Range = keyof typeof ranges;
export const REFERENCE_SERIES = [
  'UNGRADED',
  'GRADE_7',
  'GRADE_8',
  'GRADE_9',
  'GRADE_9_5',
  'PSA_10',
  'BGS_10',
] as const;
export type ReferenceSeries = (typeof REFERENCE_SERIES)[number];
type MarketHistoryResponsePoint = {
  id: string;
  priceMinor: bigint;
  observedAt: Date;
  currency: string;
  source: string;
  dataStatus: 'DEMO' | 'DELAYED' | 'LIVE' | 'UNAVAILABLE';
  changeFromPreviousMinor: bigint | null;
  changeFromPreviousBps: number | null;
  changeFromRangeStartMinor: bigint | null;
  changeFromRangeStartBps: number | null;
};
const asMoney = (value: bigint, currency: string) => ({
  minor: value.toString(),
  currency: ['GBP', 'USD', 'CAD', 'EUR'].includes(currency) ? currency : 'GBP',
});
const asOf = (date: Date) => date.toISOString();
const status = (value: string) => value as 'DEMO' | 'DELAYED' | 'LIVE';

@Injectable()
export class MarketService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
    private readonly providers: MarketProviderRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async list(query: {
    query?: string;
    category?: string;
    set?: string;
    gradingCompany?: string;
    gradeMin?: number;
    gradeMax?: number;
    estimatedMarketValueMinMinor?: bigint;
    estimatedMarketValueMaxMinor?: bigint;
    availabilityMinBps?: number;
    sort: 'estimatedMarketValue' | 'change24h' | 'title';
    cursor?: string;
    limit: number;
  }) {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.db.asset.findMany({
      where: {
        status: 'PUBLISHED',
        ...publicBetaAssetWhere(this.config.isBeta),
        ...(query.category ? { category: { slug: query.category } } : {}),
        ...(query.set ? { collectibleSet: { slug: query.set } } : {}),
        ...(query.gradingCompany
          ? {
              gradeScaleEntry: {
                company: { code: query.gradingCompany.toUpperCase() },
              },
            }
          : {}),
        ...(query.gradeMin !== undefined || query.gradeMax !== undefined
          ? {
              gradeScaleEntry: {
                grade: {
                  ...(query.gradeMin !== undefined
                    ? { gte: query.gradeMin }
                    : {}),
                  ...(query.gradeMax !== undefined
                    ? { lte: query.gradeMax }
                    : {}),
                },
              },
            }
          : {}),
        ...(query.query
          ? { title: { contains: query.query, mode: 'insensitive' } }
          : {}),
      },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        ownershipSupply: {
          select: { status: true, totalUnits: true, issuedUnits: true },
        },
        ownershipSupplyPolicy: { select: { status: true } },
        initialOffering: {
          include: { inventory: true },
        },
        preSale: {
          include: {
            initialOffering: { select: { offeredUnits: true, pricePerUnitMinor: true, currency: true } },
            reservations: { where: { status: 'ACTIVE' }, select: { units: true } },
          },
        },
        tradingMarket: {
          select: { status: true, tradingEnabled: true },
        },
        tradingOrders: {
          where: {
            side: 'SELL',
            channel: 'SECONDARY_MARKET',
            status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
          },
          select: { remainingUnits: true },
        },
        _count: { select: { tradingExecutions: true } },
        marketSnapshots: {
          ...this.publicMarketSnapshotFilter(),
          orderBy: { asOf: 'desc' },
          take: 1,
        },
        valuationEvidence: {
          where: this.publicValuationEvidenceFilter(),
          orderBy: { observedAt: 'desc' },
          take: 2,
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
        marketObservations: {
          where: this.publicMarketObservationFilter(),
          orderBy: { observedAt: 'desc' },
          take: 50,
        },
        marketProviderMappings: {
          where: { providerCode: 'PRICECHARTING' },
          select: {
            providerCode: true,
            providerExternalId: true,
            providerUrl: true,
            status: true,
            lastSuccessAt: true,
            lastFailureAt: true,
            lastFailureCode: true,
            nextRefreshAt: true,
            currentPriceMinor: true,
            currentCurrency: true,
            currentObservedAt: true,
            referenceHistoryStartedAt: true,
            referenceMovement24hBps: true,
            referenceMovement7dBps: true,
            referenceMovement30dBps: true,
            referenceMovement90dBps: true,
            referenceMovement1yBps: true,
          },
          take: 1,
        },
        submissions: {
          where: { status: 'APPROVED' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: {
            declaredMetadata: true,
            owner: {
              select: {
                profile: {
                  select: { displayName: true, publicUsername: true },
                },
                publicCollectorProfile: {
                  select: { slug: true, isPublic: true },
                },
              },
            },
            media: {
              where: { status: 'SAFE', deletedAt: null },
              orderBy: { slot: 'asc' },
              select: { id: true, slot: true, status: true, objectKey: true },
            },
          },
        },
        publication: true,
        custodyRecord: true,
        insuranceCoverage: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          take: 1,
        },
      },
      orderBy:
        query.sort === 'title'
          ? [{ title: 'asc' }, { id: 'asc' }]
          : [{ id: 'asc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: query.limit + 1,
    });
    const filtered = rows
      .filter((asset) => {
        const snapshot = asset.marketSnapshots[0];
        const valuation = selectAuthoritativeSliceValuation(
          asset.valuationDecisions,
        );
        const valueMinor =
          valuation?.amountMinor ?? snapshot?.estimatedMarketValueMinor;
        return (
          (!query.estimatedMarketValueMinMinor ||
            (valueMinor ?? 0n) >= query.estimatedMarketValueMinMinor) &&
          (!query.estimatedMarketValueMaxMinor ||
            (valueMinor ?? 0n) <= query.estimatedMarketValueMaxMinor) &&
          (query.availabilityMinBps === undefined ||
            (snapshot?.availableBps ?? -1) >= query.availabilityMinBps)
        );
      })
      .sort((a, b) =>
        query.sort === 'estimatedMarketValue'
          ? Number(
              (selectAuthoritativeSliceValuation(b.valuationDecisions)
                ?.amountMinor ??
                b.marketSnapshots[0]?.estimatedMarketValueMinor ??
                0n) -
                (selectAuthoritativeSliceValuation(a.valuationDecisions)
                  ?.amountMinor ??
                  a.marketSnapshots[0]?.estimatedMarketValueMinor ??
                  0n),
            )
          : query.sort === 'change24h'
            ? (b.marketSnapshots[0]?.change24hBps ?? -Infinity) -
              (a.marketSnapshots[0]?.change24hBps ?? -Infinity)
            : a.title.localeCompare(b.title),
      );
    const items = await Promise.all(
      filtered
        .slice(0, query.limit)
        .map((asset) => assetView(asset, this.storage)),
    );
    return {
      items,
      hasMore: filtered.length > query.limit,
      nextCursor:
        filtered.length > query.limit
          ? encodeCursor(filtered[query.limit - 1]!.id)
          : null,
    };
  }

  /**
   * One batched, public projection for the global ticker. It intentionally
   * chooses a real Slice price (offering price or settled last trade) and a
   * separately-labelled external reference. Approved whole-asset valuation is
   * not used as a market quote here.
   */
  async snapshot() {
    const listed = await this.list({
      sort: 'title',
      limit: 48,
    });
    const candidates = listed.items
      .filter((asset) => {
        const hasInitialOffering = Boolean(
          asset.initialOffering &&
          ['OPEN', 'PARTIALLY_FILLED'].includes(asset.initialOffering.status),
        );
        const hasExternalReference = Boolean(
          asset.marketReference?.currentListing,
        );
        return (
          hasInitialOffering ||
          asset.trading?.hasExecutionHistory ||
          hasExternalReference
        );
      })
      .map((asset) => ({
        asset,
        hasInitialOffering: Boolean(
          asset.initialOffering &&
          ['OPEN', 'PARTIALLY_FILLED'].includes(asset.initialOffering.status),
        ),
        hasExternalReference: Boolean(asset.marketReference?.currentListing),
      }));

    const selected = candidates
      .sort((left, right) => {
        const leftPriority = marketSnapshotPriority({
          hasLastTrade: Boolean(left.asset.trading?.hasExecutionHistory),
          hasInitialOffering: left.hasInitialOffering,
          hasExternalReference: left.hasExternalReference,
        });
        const rightPriority = marketSnapshotPriority({
          hasLastTrade: Boolean(right.asset.trading?.hasExecutionHistory),
          hasInitialOffering: right.hasInitialOffering,
          hasExternalReference: right.hasExternalReference,
        });
        return (
          leftPriority - rightPriority ||
          left.asset.title.localeCompare(right.asset.title)
        );
      })
      .slice(0, 6);

    if (!selected.length) {
      return {
        generatedAt: new Date().toISOString(),
        status: 'UNAVAILABLE' as const,
        lastUpdatedAt: null,
        items: [],
      };
    }

    const databaseAssets = await this.db.asset.findMany({
      where: { slug: { in: selected.map(({ asset }) => asset.slug) } },
      select: { id: true, slug: true },
    });
    const assetIdBySlug = new Map(
      databaseAssets.map((asset) => [asset.slug, asset.id]),
    );
    const executions = await this.db.tradingExecution.findMany({
      where: {
        assetId: { in: databaseAssets.map((asset) => asset.id) },
        settlementStatus: 'SETTLED',
      },
      orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
      select: { assetId: true, priceMinor: true, executedAt: true },
    });
    const latestExecutionByAssetId = new Map<
      string,
      (typeof executions)[number]
    >();
    for (const execution of executions) {
      if (!latestExecutionByAssetId.has(execution.assetId)) {
        latestExecutionByAssetId.set(execution.assetId, execution);
      }
    }

    const items = selected.map(({ asset }) => {
      const databaseAssetId = assetIdBySlug.get(asset.slug);
      const latestExecution = databaseAssetId
        ? latestExecutionByAssetId.get(databaseAssetId)
        : undefined;
      const offering = asset.initialOffering;
      const activeOffering =
        offering && ['OPEN', 'PARTIALLY_FILLED'].includes(offering.status)
          ? offering
          : null;
      const externalReference = asset.marketReference?.currentListing;
      const sliceMarketPrice = activeOffering
        ? {
            amount: {
              minor: activeOffering.pricePerUnitMinor.toString(),
              currency: activeOffering.currency,
            },
            kind: 'INITIAL_OFFERING' as const,
            observedAt:
              activeOffering.updatedAt ??
              latestExecution?.executedAt.toISOString() ??
              null,
          }
        : latestExecution
          ? {
              amount: {
                minor: latestExecution.priceMinor.toString(),
                currency:
                  asset.sliceValuation?.amount.currency ??
                  asset.marketReference?.currentListing?.amount.currency ??
                  'GBP',
              },
              kind: 'LAST_TRADE' as const,
              observedAt: latestExecution.executedAt.toISOString(),
            }
          : undefined;
      const referenceUpdatedAt =
        asset.marketReference?.lastRefreshedAt ??
        externalReference?.observedAt ??
        null;
      const updatedAt =
        [sliceMarketPrice?.observedAt ?? null, referenceUpdatedAt]
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;

      return {
        assetId: asset.publicId,
        slug: asset.slug,
        title: asset.title,
        ...(asset.collectibleSet?.name
          ? { setName: asset.collectibleSet.name }
          : {}),
        ...(asset.cardNumber ? { cardNumber: asset.cardNumber } : {}),
        ...(sliceMarketPrice?.observedAt
          ? { sliceMarketPrice }
          : sliceMarketPrice
            ? {
                sliceMarketPrice: {
                  ...sliceMarketPrice,
                  observedAt: new Date().toISOString(),
                },
              }
            : {}),
        ...(externalReference
          ? {
              externalReference: {
                amount: externalReference.amount,
                source: externalReference.source,
                movement24hBps: asset.marketReference?.movement24hBps ?? null,
                lastRefreshedAt: asset.marketReference?.lastRefreshedAt ?? null,
                freshness: asset.marketReference?.freshness ?? null,
              },
            }
          : {}),
        marketState: activeOffering
          ? ('INITIAL_OFFERING' as const)
          : sliceMarketPrice
            ? ('SECONDARY_MARKET' as const)
            : ('REFERENCE_ONLY' as const),
        lastUpdatedAt: updatedAt,
        freshness: asset.marketReference?.freshness ?? null,
      };
    });
    const snapshotItems = items.map((item) => {
      const { freshness, ...snapshotItem } = item;
      void freshness;
      return snapshotItem;
    });
    const lastUpdatedAt =
      snapshotItems
        .map((item) => item.lastUpdatedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    return {
      generatedAt: new Date().toISOString(),
      status: deriveMarketSnapshotStatus(items),
      lastUpdatedAt,
      items: snapshotItems,
    };
  }

  async detail(slug: string) {
    const asset = await this.asset(slug);
    return assetView(asset, this.storage);
  }
  async history(
    slug: string,
    range: Range,
    requestedSeries?: ReferenceSeries,
  ) {
    const asset = await this.asset(slug);
    const now = new Date();
    const mapping = asset.marketProviderMappings?.[0] ?? null;
    const selectedSeries =
      requestedSeries ??
      referenceSeriesForAsset(
        asset.gradeScaleEntry?.company.code ?? null,
        asset.gradeScaleEntry?.grade.toString() ?? null,
      );
    const providerRows = mapping
      ? (
          await this.db.marketObservation.findMany({
          where: {
            assetId: asset.id,
            providerCode: 'PRICECHARTING',
            providerExternalId: mapping.providerExternalId,
            observationType: 'PRICE_GUIDE',
            included: true,
            observedAt: { lte: now },
            matchQuality: { in: ['EXACT', 'STRONG'] },
          },
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          take: 10_000,
          })
        ).filter((point) => point.providerExternalId === mapping.providerExternalId)
      : [];
    const availableSeries = REFERENCE_SERIES.filter((series) =>
      providerRows.some(
        (point) =>
          referenceSeriesForObservation(point.grader, point.grade) === series,
      ),
    );
    const referencePoints = providerRows
      .filter(
        (point) =>
          referenceSeriesForObservation(point.grader, point.grade) ===
          selectedSeries,
      )
      .sort(
        (left, right) =>
          left.observedAt.getTime() - right.observedAt.getTime() ||
          left.id.localeCompare(right.id),
      );
    const referenceHistory = referencePoints.map((point) => ({
      id: point.id,
      priceMinor: point.priceMinor,
      observedAt: point.observedAt,
      currency: point.currency,
      source: point.providerCode,
      dataStatus: 'LIVE' as const,
    }));
    // External reference history must never fall back to Slice valuation
    // points. Those are a separate staff-controlled authority.
    const allHistory = referenceHistory;
    const historySource = 'PRICECHARTING' as const;
    const historyCurrency = allHistory.at(-1)?.currency ?? 'GBP';
    const currencyHistory = allHistory.filter(
      (point) => point.currency === historyCurrency,
    );
    const movementPoints: ReferenceHistoryPoint[] = currencyHistory.map(
      (point) => ({
        id: point.id,
        priceMinor: point.priceMinor,
        observedAt: point.observedAt,
      }),
    );
    const historyWindowMs =
      range === 'ALL'
        ? Math.max(
            1,
            (movementPoints.at(-1)?.observedAt.getTime() ?? now.getTime()) -
              (movementPoints[0]?.observedAt.getTime() ?? now.getTime()),
          )
        : ranges[range] * 86_400_000;
    const metrics = calculateReferenceHistoryMetrics(
      movementPoints,
      historyWindowMs,
    );
    const visibleIds = new Set(metrics.visiblePoints.map((point) => point.id));
    const chartPoints =
      metrics.startingPoint && !visibleIds.has(metrics.startingPoint.id)
        ? [metrics.startingPoint, ...metrics.visiblePoints]
        : metrics.visiblePoints;
    const responsePoints: MarketHistoryResponsePoint[] =
      downsampleReferencePoints(chartPoints).map((point) => {
        const sourcePoint = currencyHistory.find(
          (candidate) => candidate.id === point.id,
        )!;
        const sourceIndex = currencyHistory.findIndex(
          (candidate) => candidate.id === point.id,
        );
        const previous =
          sourceIndex > 0 ? currencyHistory[sourceIndex - 1] : undefined;
        return {
          ...sourcePoint,
          changeFromPreviousMinor: previous
            ? point.priceMinor - previous.priceMinor
            : null,
          changeFromPreviousBps: previous
            ? calculateChangeBps(previous.priceMinor, point.priceMinor)
            : null,
          changeFromRangeStartMinor: metrics.startingPoint
            ? point.priceMinor - metrics.startingPoint.priceMinor
            : null,
          changeFromRangeStartBps: metrics.startingPoint
            ? calculateChangeBps(
                metrics.startingPoint.priceMinor,
                point.priceMinor,
              )
            : null,
        };
      });
    const latest = metrics.latestPoint;
    const latestSource = latest
      ? currencyHistory.find((point) => point.id === latest.id)
      : undefined;
    const startingSource = metrics.startingPoint
      ? currencyHistory.find((point) => point.id === metrics.startingPoint!.id)
      : undefined;
    const lastRefreshedAt = mapping?.lastSuccessAt ?? latest?.observedAt ?? null;
    const movementUnavailableReason = referenceHistory.length
      ? metrics.movementUnavailableReason
      : availableSeries.length
        ? `Reference unavailable for ${selectedSeries}`
        : 'History collection has just started.';
    return {
      assetSlug: asset.slug,
      range,
      selectedRange: range,
      source: historySource,
      series: selectedSeries,
      availableSeries,
      currency: latestSource?.currency ?? null,
      movementBps: metrics.percentageChangeBps,
      percentageChangeBps: metrics.percentageChangeBps,
      movementAvailability: metrics.movementAvailability,
      movementUnavailableReason,
      rangeStart: metrics.rangeStart ? asOf(metrics.rangeStart) : null,
      rangeEnd: metrics.rangeEnd ? asOf(metrics.rangeEnd) : null,
      actualCoverageSeconds: metrics.actualCoverageSeconds,
      lastRefreshedAt: lastRefreshedAt ? asOf(lastRefreshedAt) : null,
      startingValue: startingSource
        ? asMoney(metrics.startingPoint!.priceMinor, startingSource.currency)
        : null,
      latestValue: latestSource
        ? asMoney(metrics.latestPoint!.priceMinor, latestSource.currency)
        : null,
      absoluteChange:
        metrics.absoluteChangeMinor !== null && startingSource
          ? asMoney(metrics.absoluteChangeMinor, startingSource.currency)
          : null,
      highValue:
        metrics.highValueMinor !== null
          ? asMoney(metrics.highValueMinor, historyCurrency)
          : null,
      lowValue:
        metrics.lowValueMinor !== null
          ? asMoney(metrics.lowValueMinor, historyCurrency)
          : null,
      historyPointCount: metrics.visiblePoints.length,
      displayedPointCount: responsePoints.length,
      points: responsePoints.map((point) => ({
        id: point.id,
        observedAt: asOf(point.observedAt),
        estimatedMarketValue: asMoney(point.priceMinor, point.currency),
        source: point.source,
        dataStatus: point.dataStatus,
        changeFromPrevious:
          point.changeFromPreviousMinor === null
            ? null
            : asMoney(point.changeFromPreviousMinor, point.currency),
        changeFromPreviousBps: point.changeFromPreviousBps,
        changeFromRangeStart:
          point.changeFromRangeStartMinor === null
            ? null
            : asMoney(point.changeFromRangeStartMinor, point.currency),
        changeFromRangeStartBps: point.changeFromRangeStartBps,
      })),
    };
  }
  async similar(slug: string, limit: number) {
    const asset = await this.asset(slug);
    const boundedLimit = Math.min(Math.max(limit, 1), 24);
    const projection = {
      id: true,
      publicId: true,
      slug: true,
      title: true,
      cardNumber: true,
      category: { select: { slug: true } },
      collectibleSet: { select: { name: true } },
      initialOffering: {
        select: {
          status: true,
          pricePerUnitMinor: true,
          currency: true,
          updatedAt: true,
        },
      },
      tradingMarket: {
        select: { status: true, tradingEnabled: true },
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
      submissions: {
        where: { status: 'APPROVED' },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          media: {
            where: { status: 'SAFE', deletedAt: null },
            orderBy: { slot: 'asc' },
            take: 1,
            select: { slot: true, objectKey: true },
          },
        },
      },
    } as const;
    const baseWhere = {
      status: 'PUBLISHED' as const,
      ...publicBetaAssetWhere(this.config.isBeta),
      id: { not: asset.id },
      categoryId: asset.categoryId,
    };
    const sameSetRows = await this.db.asset.findMany({
      where: asset.setId ? { ...baseWhere, setId: asset.setId } : baseWhere,
      select: projection,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: boundedLimit,
    });
    const rows =
      sameSetRows.length >= boundedLimit || !asset.setId
        ? sameSetRows
        : [
            ...sameSetRows,
            ...(await this.db.asset.findMany({
              where: { ...baseWhere, setId: { not: asset.setId } },
              select: projection,
              orderBy: [{ title: 'asc' }, { id: 'asc' }],
              take: boundedLimit - sameSetRows.length,
            })),
          ];
    const assetIds = rows.map((row) => row.id);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const executionSelect = {
      assetId: true,
      priceMinor: true,
      executedAt: true,
    } as const;
    const [latestExecutions, baselineExecutions] = await Promise.all([
      this.db.tradingExecution.findMany({
        where: { assetId: { in: assetIds }, settlementStatus: 'SETTLED' },
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        // Keep this bounded while leaving enough room to find one recent row
        // for every recommendation in a busy market.
        take: Math.max(boundedLimit * 48, 96),
        select: executionSelect,
      }),
      this.db.tradingExecution.findMany({
        where: {
          assetId: { in: assetIds },
          settlementStatus: 'SETTLED',
          executedAt: { lte: twentyFourHoursAgo },
        },
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        take: Math.max(boundedLimit * 48, 96),
        select: executionSelect,
      }),
    ]);
    const firstByAsset = (executions: typeof latestExecutions) => {
      const result = new Map<string, (typeof executions)[number]>();
      for (const execution of executions) {
        if (!result.has(execution.assetId))
          result.set(execution.assetId, execution);
      }
      return result;
    };
    const latestByAsset = firstByAsset(latestExecutions);
    const baselineByAsset = firstByAsset(baselineExecutions);
    return {
      items: await Promise.all(
        rows.map(async (row) => {
          const latest = latestByAsset.get(row.id);
          const baseline = baselineByAsset.get(row.id);
          const activeOffering =
            row.initialOffering &&
            ['OPEN', 'PARTIALLY_FILLED'].includes(row.initialOffering.status)
              ? row.initialOffering
              : null;
          const valuation = selectAuthoritativeSliceValuation(
            row.valuationDecisions,
          );
          const displayPrice = latest
            ? {
                type: 'LAST_EXECUTION' as const,
                amount: asMoney(latest.priceMinor, 'GBP'),
                observedAt: latest.executedAt.toISOString(),
              }
            : activeOffering
              ? {
                  type: 'INITIAL_OFFERING' as const,
                  amount: asMoney(
                    activeOffering.pricePerUnitMinor,
                    activeOffering.currency,
                  ),
                  observedAt: activeOffering.updatedAt.toISOString(),
                }
              : valuation
                ? {
                    type: 'VALUATION' as const,
                    amount: asMoney(valuation.amountMinor, valuation.currency),
                    observedAt: valuation.approvedAt.toISOString(),
                  }
                : {
                    type: 'UNAVAILABLE' as const,
                    amount: null,
                    observedAt: null,
                  };
          const movement24hBps =
            latest && baseline && baseline.priceMinor > 0n
              ? Number(
                  ((latest.priceMinor - baseline.priceMinor) * 10_000n) /
                    baseline.priceMinor,
                )
              : null;
          const marketState = activeOffering
            ? ('INITIAL_OFFERING' as const)
            : row.tradingMarket?.status === 'OPEN' &&
                row.tradingMarket.tradingEnabled
              ? ('LIVE_MARKET' as const)
              : row.tradingMarket
                ? ('MARKET_CLOSED' as const)
                : ('REFERENCE_ONLY' as const);
          const media = row.submissions[0]?.media[0];
          const thumbnailUrl = media
            ? await this.storage
                .createPrivateDownloadUrl(
                  media.objectKey,
                  new Date(Date.now() + 5 * 60_000),
                )
                .catch(() => null)
            : null;
          return {
            assetId: row.publicId,
            slug: row.slug,
            title: row.title,
            category: row.category.slug,
            ...(row.collectibleSet?.name
              ? { setName: row.collectibleSet.name }
              : {}),
            ...(row.cardNumber ? { cardNumber: row.cardNumber } : {}),
            ...(thumbnailUrl
              ? {
                  thumbnail: {
                    url: thumbnailUrl,
                    alt: `${row.title} public thumbnail`,
                  },
                }
              : {}),
            marketState,
            displayPrice,
            movement24hBps,
          };
        }),
      ),
    };
  }
  async summary() {
    const value = await this.db.marketSnapshot.findFirst({
      where: this.config.isBeta
        ? {
            NOT: [
              { source: { startsWith: 'STAGING_' } },
              { source: { startsWith: 'DEMO_' } },
              { source: { startsWith: 'TEST_' } },
            ],
          }
        : undefined,
      orderBy: { asOf: 'desc' },
    });
    if (!value)
      return {
        dataStatus: 'UNAVAILABLE',
        source: 'NO_MARKET_DATA',
        asOf: null,
        totalEstimatedMarketValue: null,
        volume24h: null,
        activeAssetCount: 0,
        collectorCount: 0,
      };
    return {
      dataStatus: status(value.status),
      source: value.source,
      asOf: asOf(value.asOf),
      totalEstimatedMarketValue: asMoney(
        value.totalEstimatedMarketValueMinor,
        value.currency,
      ),
      volume24h: asMoney(value.volume24hMinor, value.currency),
      activeAssetCount: value.activeAssetCount,
      collectorCount: value.collectorCount,
    };
  }
  async movers(kind: 'gainers' | 'losers' | 'active', limit: number) {
    const rows = await this.db.assetMarketSnapshot.findMany({
      where: {
        source: { not: 'EXTERNAL_MARKET_REFERENCE' },
        markSource: { not: 'EXTERNAL_REFERENCE_FALLBACK' },
      },
      include: {
        asset: {
          include: {
            category: true,
            collectibleSet: true,
            gradeScaleEntry: { include: { company: true } },
            ownershipSupply: {
              select: { status: true, totalUnits: true, issuedUnits: true },
            },
            ownershipSupplyPolicy: { select: { status: true } },
            tradingMarket: {
              select: { status: true, tradingEnabled: true },
            },
            tradingOrders: {
              where: {
                side: 'SELL',
                channel: 'SECONDARY_MARKET',
                status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
              },
              select: { remainingUnits: true },
            },
            publication: { select: { status: true, publishedAt: true } },
            custodyRecord: { select: { status: true, updatedAt: true } },
            _count: { select: { tradingExecutions: true } },
            marketSnapshots: {
              ...this.publicMarketSnapshotFilter(),
              orderBy: { asOf: 'desc' },
              take: 1,
            },
            valuationEvidence: {
              where: this.publicValuationEvidenceFilter(),
              orderBy: { observedAt: 'desc' },
              take: 2,
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
            marketObservations: {
              where: this.publicMarketObservationFilter(),
              orderBy: { observedAt: 'desc' },
              take: 50,
            },
            marketProviderMappings: {
              where: { providerCode: 'PRICECHARTING' },
              select: {
                providerCode: true,
                providerExternalId: true,
                providerUrl: true,
                status: true,
                lastSuccessAt: true,
                lastFailureAt: true,
                lastFailureCode: true,
                nextRefreshAt: true,
                currentPriceMinor: true,
                currentCurrency: true,
                currentObservedAt: true,
                referenceHistoryStartedAt: true,
                referenceMovement24hBps: true,
                referenceMovement7dBps: true,
                referenceMovement30dBps: true,
                referenceMovement90dBps: true,
                referenceMovement1yBps: true,
              },
              take: 1,
            },
            submissions: {
              where: { status: 'APPROVED' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              include: {
                owner: {
                  select: {
                    profile: {
                      select: { displayName: true, publicUsername: true },
                    },
                    publicCollectorProfile: {
                      select: { slug: true, isPublic: true },
                    },
                  },
                },
                media: {
                  where: { status: 'SAFE', deletedAt: null },
                  orderBy: { slot: 'asc' },
                  select: {
                    id: true,
                    slot: true,
                    status: true,
                    objectKey: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy:
        kind === 'losers'
          ? { change24hBps: 'asc' }
          : kind === 'gainers'
            ? { change24hBps: 'desc' }
            : { watchersCount: 'desc' },
      take: limit,
    });
    return {
      kind,
      items: await Promise.all(
        rows
          .filter((row) => row.asset.status === 'PUBLISHED')
          .filter(
            (row) => !this.config.isBeta || !isBetaFixtureSource(row.source),
          )
          .map((row) =>
            assetView({ ...row.asset, marketSnapshots: [row] }, this.storage),
          ),
      ),
    };
  }
  async unavailable(slug: string, kind: 'ORDER_BOOK' | 'RECENT_TRADES') {
    await this.asset(slug);
    return { availability: 'NOT_AVAILABLE_UNTIL_TRADING', kind, items: [] };
  }
  async providerHealth() {
    const providers = await Promise.all(
      this.providers.all().map(async (provider) => ({
        provider: provider.providerId,
        ...(await provider.health()),
      })),
    );
    return { providers };
  }
  private async asset(slug: string) {
    const asset = await this.db.asset.findFirst({
      where: {
        status: 'PUBLISHED',
        slug: this.config.isBeta
          ? { equals: slug, not: { startsWith: 'slice-demo-' } }
          : slug,
      },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        ownershipSupply: {
          select: { status: true, totalUnits: true, issuedUnits: true },
        },
        ownershipSupplyPolicy: { select: { status: true } },
        initialOffering: {
          include: { inventory: true },
        },
        preSale: {
          include: {
            initialOffering: { select: { offeredUnits: true, pricePerUnitMinor: true, currency: true } },
            reservations: { where: { status: 'ACTIVE' }, select: { units: true } },
          },
        },
        publication: { select: { status: true, publishedAt: true } },
        custodyRecord: { select: { status: true, updatedAt: true } },
        insuranceCoverage: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          take: 1,
        },
        tradingMarket: {
          select: { status: true, tradingEnabled: true },
        },
        tradingOrders: {
          where: {
            side: 'SELL',
            channel: 'SECONDARY_MARKET',
            status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
          },
          select: { remainingUnits: true },
        },
        _count: { select: { tradingExecutions: true } },
        marketSnapshots: {
          ...this.publicMarketSnapshotFilter(),
          orderBy: { asOf: 'desc' },
          take: 1,
        },
        valuationEvidence: {
          where: this.publicValuationEvidenceFilter(),
          orderBy: { observedAt: 'desc' },
          take: 2,
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
        marketObservations: {
          where: this.publicMarketObservationFilter(),
          orderBy: { observedAt: 'desc' },
          take: 50,
        },
        marketProviderMappings: {
          where: { providerCode: 'PRICECHARTING' },
          select: {
            providerCode: true,
            providerExternalId: true,
            providerUrl: true,
            status: true,
            lastSuccessAt: true,
            lastFailureAt: true,
            lastFailureCode: true,
            nextRefreshAt: true,
            currentPriceMinor: true,
            currentCurrency: true,
            currentObservedAt: true,
            referenceHistoryStartedAt: true,
            referenceMovement24hBps: true,
            referenceMovement7dBps: true,
            referenceMovement30dBps: true,
            referenceMovement90dBps: true,
            referenceMovement1yBps: true,
          },
          take: 1,
        },
        submissions: {
          where: { status: 'APPROVED' },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: {
            owner: {
              select: {
                profile: {
                  select: { displayName: true, publicUsername: true },
                },
                publicCollectorProfile: {
                  select: { slug: true, isPublic: true },
                },
              },
            },
            preGrades: {
              where: { status: 'SUCCEEDED', supersededAt: null },
              orderBy: { analyzedAt: 'desc' },
              take: 1,
              select: {
                status: true,
                provider: true,
                overallEstimate: true,
                overallMin: true,
                overallMax: true,
                centeringScore: true,
                cornerScore: true,
                edgeScore: true,
                surfaceScore: true,
                confidence: true,
                conditionLabel: true,
                analyzedAt: true,
                warnings: true,
                visualizations: true,
              },
            },
            media: {
              where: { status: 'SAFE', deletedAt: null },
              orderBy: { slot: 'asc' },
              select: { id: true, slot: true, status: true, objectKey: true },
            },
          },
        },
      },
    });
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Resource not found.',
      });
    return asset;
  }

  private publicMarketSnapshotFilter() {
    const safeProjection = {
      NOT: [
        { source: 'EXTERNAL_MARKET_REFERENCE' },
        { markSource: 'EXTERNAL_REFERENCE_FALLBACK' },
        ...(this.config.isBeta
          ? [
              { source: { startsWith: 'STAGING_' } },
              { source: { startsWith: 'DEMO_' } },
              { source: { startsWith: 'TEST_' } },
            ]
          : []),
      ],
    };
    return { where: safeProjection };
  }

  private publicValuationEvidenceFilter() {
    return this.config.isBeta
      ? {
          NOT: [
            { sourceType: { startsWith: 'STAGING_' } },
            { sourceType: { startsWith: 'DEMO_' } },
            { sourceType: { startsWith: 'TEST_' } },
          ],
        }
      : {
          sourceType: {
            in: ['STAGING_CURRENT_LISTING', 'STAGING_RECENT_COMPLETED_SALE'],
          },
        };
  }

  private publicMarketObservationFilter() {
    return this.config.isBeta
      ? {
          included: true,
          NOT: [
            { providerCode: { startsWith: 'STAGING_' } },
            { providerCode: { startsWith: 'DEMO_' } },
            { providerCode: { startsWith: 'TEST_' } },
          ],
        }
      : { included: true };
  }
}

type PublicPreGrade = {
  status: string;
  provider: string;
  overallEstimate: number | null;
  overallMin: number | null;
  overallMax: number | null;
  centeringScore: number | null;
  cornerScore: number | null;
  edgeScore: number | null;
  surfaceScore: number | null;
  confidence: number | null;
  conditionLabel: string | null;
  analyzedAt: Date | null;
  warnings: unknown;
  visualizations: unknown;
};

type PublicAssetRow = {
  publicId: string;
  slug: string;
  title: string;
  shortName: string | null;
  year: number | null;
  manufacturer: string | null;
  cardNumber: string | null;
  description: string | null;
  certificationNumber: string | null;
  category: { slug: string; name: string };
  collectibleSet: { slug: string; name: string } | null;
  gradeScaleEntry: {
    grade: { toFixed: (digits: number) => string };
    label: string;
    company: { code: string };
  } | null;
  ownershipSupply: {
    status: string;
    totalUnits: bigint;
    issuedUnits: bigint;
  } | null;
  ownershipSupplyPolicy: { status: string } | null;
  initialOffering?: {
    status: string;
    totalUnits: bigint;
    offeredUnits: bigint;
    retainedUnits: bigint;
    pricePerUnitMinor: bigint;
    currency: string;
    updatedAt: Date;
    inventory: {
      offeredUnits: bigint;
      availableUnits: bigint;
      reservedUnits: bigint;
      settledUnits: bigint;
    } | null;
  } | null;
  preSale?: {
    status: string;
    openedAt: Date | null;
    deadlineAt: Date | null;
    physicalStatus: string;
    initialOffering: { offeredUnits: bigint; pricePerUnitMinor: bigint; currency: string };
    reservations: Array<{ units: bigint }>;
  } | null;
  tradingMarket: { status: string; tradingEnabled: boolean } | null;
  tradingOrders?: Array<{ remainingUnits: bigint }>;
  _count?: { tradingExecutions: number };
  marketSnapshots: Array<{
    estimatedMarketValueMinor: bigint;
    currency: string;
    change24hBps: number;
    availableBps: number | null;
    ownersCount: number | null;
    confidence: number | null;
    source: string;
    status: string;
    asOf: Date;
    markSource?: string;
    freshness?: string;
    lastSuccessfulRefreshAt?: Date | null;
  }>;
  marketObservations?: Array<{
    id: string;
    observationType: string;
    priceMinor: bigint;
    currency: string;
    providerCode: string;
    providerExternalId: string;
    matchQuality: string;
    included: boolean;
    externalUrl: string | null;
    title: string;
    observedAt: Date;
    occurredAt: Date | null;
  }>;
  marketProviderMappings?: Array<{
    providerCode: string;
    providerExternalId: string;
    providerUrl: string | null;
    status: string;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    lastFailureCode: string | null;
    nextRefreshAt: Date | null;
    currentPriceMinor: bigint | null;
    currentCurrency: string | null;
    currentObservedAt: Date | null;
    referenceHistoryStartedAt: Date | null;
    referenceMovement24hBps: number | null;
    referenceMovement7dBps: number | null;
    referenceMovement30dBps: number | null;
    referenceMovement90dBps: number | null;
    referenceMovement1yBps: number | null;
  }>;
  submissions?: Array<{
    declaredMetadata: unknown;
    owner?: {
      profile: {
        displayName: string | null;
        publicUsername: string | null;
      } | null;
      publicCollectorProfile: { slug: string; isPublic: boolean } | null;
    };
    preGrades?: PublicPreGrade[];
    media: Array<{
      id: string;
      slot: string;
      status: string;
      objectKey: string;
    }>;
  }>;
  publication?: { status: string; publishedAt: Date | null } | null;
  custodyRecord?: { status: string; updatedAt: Date } | null;
  insuranceCoverage?: Array<{ status: string; expiresAt: Date }>;
  valuationEvidence?: Array<{
    sourceType: string;
    sourceRef: string | null;
    observedAt: Date;
    valueMinor: bigint;
    currency: string;
  }>;
  valuationDecisions: Array<{
    id: string;
    valueMinor: bigint;
    currency: string;
    confidence: number;
    methodologyCode: string;
    decidedAt: Date;
    status: string;
  }>;
};
type PublicMarketProviderMapping = NonNullable<
  PublicAssetRow['marketProviderMappings']
>[number];
type PublicExternalMarketReference = {
  currentListing?: {
    amount: { minor: string; currency: string };
    source: string;
    externalReference: string;
    listingUrl: string;
    observedAt: string;
  };
  recentCompletedSale?: {
    amount: { minor: string; currency: string };
    source: string;
    externalReference: string;
    listingUrl: string;
    observedAt: string;
  };
  movement24hBps?: number | null;
  movement7dBps?: number | null;
  movement30dBps?: number | null;
  movement90dBps?: number | null;
  movement1yBps?: number | null;
  lastRefreshedAt?: string | null;
  historyStartedAt?: string | null;
  freshness?: string | null;
};
async function assetView(asset: PublicAssetRow, storage: ObjectStoragePort) {
  const market = asset.marketSnapshots[0];
  const priceChartingMapping = asset.marketProviderMappings?.[0] ?? null;
  const activeSellOrders = asset.tradingOrders ?? [];
  const sliceValuation = selectAuthoritativeSliceValuation(
    asset.valuationDecisions,
  );
  const approvedMedia = asset.submissions?.[0]?.media ?? [];
  const listingSubmission = asset.submissions?.[0];
  const publicCollector = listingSubmission?.owner?.publicCollectorProfile;
  const listedBy =
    publicCollector?.isPublic && listingSubmission?.owner
      ? {
          displayName:
            listingSubmission.owner.profile?.displayName ?? 'Collector',
          username: listingSubmission.owner.profile?.publicUsername ?? null,
          slug: publicCollector.slug,
        }
      : null;
  const media = (
    await Promise.all(
      approvedMedia.map(async (item) => ({
        id: item.id,
        slot: item.slot,
        url: await storage
          .createPrivateDownloadUrl(
            item.objectKey,
            new Date(Date.now() + 5 * 60_000),
          )
          .catch(() => null),
      })),
    )
  )
    .filter((item): item is { id: string; slot: string; url: string } =>
      Boolean(item.url),
    )
    .map((item) => ({
      id: item.id,
      slot: item.slot,
      url: item.url,
      alt: `${asset.title} ${item.slot} approved media`,
    }));
  return {
    publicId: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    shortName: asset.shortName,
    year: asset.year,
    manufacturer: asset.manufacturer,
    cardNumber: asset.cardNumber,
    description: asset.description,
    conditionLabel: collectorConditionValue(
      asset.submissions?.[0]?.declaredMetadata,
    ),
    // Public market results only select approved submissions. Keep the
    // projection coarse; review records and staff notes never leave the API.
    publicVerificationStatus: asset.submissions?.length
      ? 'VERIFIED'
      : 'UNAVAILABLE',
    media,
    ...(asset.certificationNumber
      ? { certificationNumber: asset.certificationNumber }
      : {}),
    category: { slug: asset.category.slug, name: asset.category.name },
    collectibleSet: asset.collectibleSet
      ? { slug: asset.collectibleSet.slug, name: asset.collectibleSet.name }
      : null,
    grading: asset.gradeScaleEntry
      ? {
          companyCode: asset.gradeScaleEntry.company.code,
          grade: asset.gradeScaleEntry.grade.toFixed(2),
          label: asset.gradeScaleEntry.label,
        }
      : null,
    sliceValuation: sliceValuation
      ? {
          id: sliceValuation.id,
          amount: asMoney(sliceValuation.amountMinor, sliceValuation.currency),
          confidence: sliceValuation.confidence,
          sourceType: sliceValuation.sourceType,
          approvedAt: sliceValuation.approvedAt.toISOString(),
          status: sliceValuation.status,
        }
      : null,
    // Keep the legacy field populated for existing clients, but derive it from
    // the approved Slice decision rather than an external market reference.
    estimatedMarketValue: sliceValuation
      ? asMoney(sliceValuation.amountMinor, sliceValuation.currency)
      : market
        ? asMoney(market.estimatedMarketValueMinor, market.currency)
        : null,
    change24hBps: market?.change24hBps ?? null,
    availabilityBps: market?.availableBps ?? null,
    ownersCount: market?.ownersCount ?? null,
    confidence: market?.confidence ?? null,
    source: sliceValuation
      ? 'SLICE_VALUATION'
      : (market?.source ?? 'NO_MARKET_DATA'),
    markSource: market?.markSource ?? null,
    freshness: market?.freshness ?? 'UNAVAILABLE',
    lastSuccessfulRefreshAt:
      market?.lastSuccessfulRefreshAt?.toISOString() ?? null,
    marketSummary: summarizeObservations(asset.marketObservations ?? []),
    marketReference:
      externalMarketReferenceFromMapping(
        priceChartingMapping,
        asset.marketObservations ?? [],
      ) ??
      externalMarketReferenceFromObservations(asset.marketObservations ?? []) ??
      externalMarketReference(asset.valuationEvidence ?? []),
    sliceGrade: await publicSliceGrade(
      asset.submissions?.[0]?.preGrades?.[0],
      storage,
    ),
    dataStatus: sliceValuation
      ? 'LIVE'
      : market
        ? status(market.status)
        : 'UNAVAILABLE',
    ownership: asset.ownershipSupply
      ? {
          status: asset.ownershipSupply.status,
          totalUnits: asset.ownershipSupply.totalUnits.toString(),
          issuedUnits: asset.ownershipSupply.issuedUnits.toString(),
        }
      : null,
    initialOffering:
      asset.initialOffering &&
      ['OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT'].includes(
        asset.initialOffering.status,
      )
        ? {
            status: asset.initialOffering.status,
            totalUnits: asset.initialOffering.totalUnits.toString(),
            offeredUnits: asset.initialOffering.offeredUnits.toString(),
            retainedUnits: asset.initialOffering.retainedUnits.toString(),
            pricePerUnitMinor:
              asset.initialOffering.pricePerUnitMinor.toString(),
            currency: asset.initialOffering.currency,
            updatedAt: asset.initialOffering.updatedAt.toISOString(),
            inventory: asset.initialOffering.inventory
              ? {
                  offeredUnits:
                    asset.initialOffering.inventory.offeredUnits.toString(),
                  availableUnits:
                    asset.initialOffering.inventory.availableUnits.toString(),
                  reservedUnits:
                    asset.initialOffering.inventory.reservedUnits.toString(),
                  settledUnits:
                    asset.initialOffering.inventory.settledUnits.toString(),
                }
              : null,
          }
        : null,
    preSale:
      asset.preSale && ['ACTIVE', 'PAUSED', 'FINALIZING'].includes(asset.preSale.status)
        ? (() => {
            const reservedUnits = asset.preSale.reservations.reduce((sum, row) => sum + row.units, 0n);
            const offeredUnits = asset.preSale.initialOffering.offeredUnits;
            return {
              status: asset.preSale.status,
              openedAt: asset.preSale.openedAt?.toISOString() ?? null,
              deadlineAt: asset.preSale.deadlineAt?.toISOString() ?? null,
              physicalStatus: asset.preSale.physicalStatus,
              pricePerUnitMinor: asset.preSale.initialOffering.pricePerUnitMinor.toString(),
              currency: asset.preSale.initialOffering.currency,
              offeredUnits: offeredUnits.toString(),
              reservedUnits: reservedUnits.toString(),
              availableUnits: (offeredUnits - reservedUnits).toString(),
              reservedPercentageBps: offeredUnits ? Number((reservedUnits * 10_000n) / offeredUnits) : 0,
            };
          })()
        : null,
    trading: asset.tradingMarket
      ? {
          status: asset.tradingMarket.status,
          enabled: asset.tradingMarket.tradingEnabled,
          hasExecutionHistory: (asset._count?.tradingExecutions ?? 0) > 0,
        }
      : null,
    activeListings: {
      count: activeSellOrders.length,
      availableUnits: activeSellOrders
        .reduce((total, order) => total + order.remainingUnits, 0n)
        .toString(),
    },
    marketLifecycle: deriveMarketLifecycle({
      published: asset.publication?.status === 'PUBLISHED',
      publicationStatus: asset.publication?.status,
      custodyStatus: asset.custodyRecord?.status,
      supplyPolicyStatus: asset.ownershipSupplyPolicy?.status,
      supplyStatus: asset.ownershipSupply?.status,
      issuedUnits: asset.ownershipSupply?.issuedUnits,
      marketStatus: asset.tradingMarket?.status,
      tradingEnabled: asset.tradingMarket?.tradingEnabled,
      availabilityBps: market?.availableBps,
    }),
    asOf: market ? asOf(market.asOf) : null,
    publication:
      asset.publication?.status === 'PUBLISHED'
        ? {
            status: 'PUBLISHED',
            asOf: asset.publication.publishedAt?.toISOString() ?? null,
          }
        : null,
    listing: listingSubmission
      ? {
          listedAt: asset.publication?.publishedAt?.toISOString() ?? null,
          listedBy,
        }
      : null,
    custody:
      asset.custodyRecord?.status === 'SECURED'
        ? {
            status: 'SECURED',
            asOf: asset.custodyRecord.updatedAt.toISOString(),
          }
        : null,
    insurance: asset.insuranceCoverage?.[0]
      ? {
          status: 'ACTIVE',
          expiresAt: asset.insuranceCoverage[0].expiresAt.toISOString(),
        }
      : null,
  };

  async function publicSliceGrade(
    preGrade: PublicPreGrade | undefined,
    storage: ObjectStoragePort,
  ) {
    if (!preGrade || preGrade.status !== 'SUCCEEDED') return null;
    const visualizations = Array.isArray(preGrade.visualizations)
      ? await Promise.all(
          preGrade.visualizations
            .filter(isPublicPreGradeVisualization)
            .map(async (visualization) => ({
              side: visualization.side,
              type: visualization.type,
              url: await storage
                .createPrivateDownloadUrl(
                  visualization.objectKey,
                  new Date(Date.now() + 5 * 60_000),
                )
                .catch(() => null),
              centering: visualization.centering ?? null,
            })),
        )
      : [];
    return {
      status: 'SUCCEEDED' as const,
      provider: preGrade.provider,
      overallEstimate: preGrade.overallEstimate,
      overallMin: preGrade.overallMin,
      overallMax: preGrade.overallMax,
      centeringScore: preGrade.centeringScore,
      cornerScore: preGrade.cornerScore,
      edgeScore: preGrade.edgeScore,
      surfaceScore: preGrade.surfaceScore,
      confidence: preGrade.confidence,
      conditionLabel: preGrade.conditionLabel,
      analyzedAt: preGrade.analyzedAt?.toISOString() ?? null,
      warnings: Array.isArray(preGrade.warnings)
        ? preGrade.warnings.filter(
            (warning): warning is string => typeof warning === 'string',
          )
        : [],
      visualizations,
    };
  }

  function isPublicPreGradeVisualization(value: unknown): value is {
    side: 'FRONT' | 'BACK';
    type: 'overview' | 'centering';
    objectKey: string;
    centering?: Record<string, number> | null;
  } {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    return (
      (item.side === 'FRONT' || item.side === 'BACK') &&
      (item.type === 'overview' || item.type === 'centering') &&
      typeof item.objectKey === 'string'
    );
  }
}

function collectorConditionValue(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null;
  const value = (metadata as Record<string, unknown>).condition;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeObservations(
  observations: NonNullable<PublicAssetRow['marketObservations']>,
) {
  const summarize = (rows: typeof observations) => {
    if (!rows.length) return null;
    const currencies = new Set(rows.map((row) => row.currency));
    if (currencies.size !== 1)
      return { count: rows.length, mixedCurrency: true };
    const sorted = [...rows].sort((a, b) =>
      a.priceMinor < b.priceMinor ? -1 : a.priceMinor > b.priceMinor ? 1 : 0,
    );
    const midpoint = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2
        ? sorted[midpoint]!.priceMinor
        : (sorted[midpoint - 1]!.priceMinor + sorted[midpoint]!.priceMinor) /
          2n;
    return {
      count: rows.length,
      currency: sorted[0]!.currency,
      lowMinor: sorted[0]!.priceMinor.toString(),
      highMinor: sorted.at(-1)!.priceMinor.toString(),
      medianMinor: median.toString(),
      latestMinor: sorted.at(-1)!.priceMinor.toString(),
      latestAt: (
        sorted.at(-1)!.occurredAt ?? sorted.at(-1)!.observedAt
      ).toISOString(),
    };
  };
  return {
    completedSales: summarize(
      observations.filter((item) => item.observationType === 'COMPLETED_SALE'),
    ),
    activeListings: summarize(
      observations.filter((item) => item.observationType === 'ACTIVE_LISTING'),
    ),
    priceGuides: summarize(
      observations.filter((item) => item.observationType === 'PRICE_GUIDE'),
    ),
    providerCount: new Set(observations.map((item) => item.providerCode)).size,
  };
}

function externalMarketReference(
  records: NonNullable<PublicAssetRow['valuationEvidence']>,
): PublicExternalMarketReference | null {
  const read = (sourceType: string) => {
    const record = records.find((item) => item.sourceType === sourceType);
    if (!record?.sourceRef) return null;
    try {
      const detail = JSON.parse(record.sourceRef) as {
        source?: unknown;
        externalReference?: unknown;
        listingUrl?: unknown;
        imageUrl?: unknown;
      };
      if (
        typeof detail.source !== 'string' ||
        typeof detail.externalReference !== 'string' ||
        typeof detail.listingUrl !== 'string'
      )
        return null;
      return {
        amount: {
          minor: record.valueMinor.toString(),
          currency: record.currency,
        },
        source: detail.source,
        externalReference: detail.externalReference,
        listingUrl: detail.listingUrl,
        ...(typeof detail.imageUrl === 'string'
          ? { imageUrl: detail.imageUrl }
          : {}),
        observedAt: record.observedAt.toISOString(),
      };
    } catch {
      return null;
    }
  };
  const currentListing = read('STAGING_CURRENT_LISTING');
  const recentCompletedSale = read('STAGING_RECENT_COMPLETED_SALE');
  return currentListing || recentCompletedSale
    ? {
        ...(currentListing ? { currentListing } : {}),
        ...(recentCompletedSale ? { recentCompletedSale } : {}),
      }
    : null;
}

function externalMarketReferenceFromObservations(
  observations: NonNullable<PublicAssetRow['marketObservations']>,
): PublicExternalMarketReference | null {
  const latest = observations.find(
    (item) =>
      item.providerCode === 'PRICECHARTING' &&
      item.included !== false &&
      item.observationType === 'PRICE_GUIDE' &&
      (item.matchQuality === 'EXACT' || item.matchQuality === 'STRONG') &&
      item.priceMinor > 0n &&
      Boolean(item.externalUrl),
  );
  if (!latest?.externalUrl) return null;
  return {
    currentListing: {
      amount: asMoney(latest.priceMinor, latest.currency),
      source: 'PRICECHARTING',
      externalReference: latest.providerExternalId,
      listingUrl: latest.externalUrl,
      observedAt: latest.observedAt.toISOString(),
    },
  };
}

function externalMarketReferenceFromMapping(
  mapping: PublicMarketProviderMapping | null,
  observations: NonNullable<PublicAssetRow['marketObservations']>,
): PublicExternalMarketReference | null {
  if (
    !mapping ||
    mapping.providerCode !== 'PRICECHARTING' ||
    mapping.currentPriceMinor === null ||
    mapping.currentCurrency === null ||
    mapping.currentObservedAt === null
  ) {
    return null;
  }
  const referencePoints: ReferenceHistoryPoint[] = observations
    .filter(
      (point) =>
        point.providerCode === 'PRICECHARTING' &&
        point.observationType === 'PRICE_GUIDE' &&
        point.included !== false &&
        (point.matchQuality === 'EXACT' || point.matchQuality === 'STRONG') &&
        point.priceMinor > 0n,
    )
    .map((point) => ({
      id: point.id,
      priceMinor: point.priceMinor,
      observedAt: point.observedAt,
    }));
  const movements = referencePoints.length
    ? calculateReferenceMovements(referencePoints)
    : null;
  return {
    currentListing: {
      amount: asMoney(mapping.currentPriceMinor, mapping.currentCurrency),
      source: 'PRICECHARTING',
      externalReference: mapping.providerExternalId,
      listingUrl:
        mapping.providerUrl ??
        `https://www.pricecharting.com/product?id=${encodeURIComponent(mapping.providerExternalId)}`,
      observedAt: mapping.currentObservedAt.toISOString(),
    },
    movement24hBps: movements
      ? (movements['24H'] ?? mapping.referenceMovement24hBps)
      : mapping.referenceMovement24hBps,
    movement7dBps: movements
      ? (movements['7D'] ?? mapping.referenceMovement7dBps)
      : mapping.referenceMovement7dBps,
    movement30dBps: movements
      ? (movements['30D'] ?? mapping.referenceMovement30dBps)
      : mapping.referenceMovement30dBps,
    movement90dBps: movements
      ? (movements['90D'] ?? mapping.referenceMovement90dBps)
      : mapping.referenceMovement90dBps,
    movement1yBps: movements
      ? (movements['1Y'] ?? mapping.referenceMovement1yBps)
      : mapping.referenceMovement1yBps,
    lastRefreshedAt: mapping.lastSuccessAt?.toISOString() ?? null,
    historyStartedAt: mapping.referenceHistoryStartedAt?.toISOString() ?? null,
    freshness: mapping.lastSuccessAt
      ? freshnessLabel(mapping.lastSuccessAt)
      : 'UNAVAILABLE',
  };
}

function freshnessLabel(lastSuccessAt: Date) {
  const age = Date.now() - lastSuccessAt.getTime();
  if (age <= 24 * 60 * 60 * 1000) return 'FRESH';
  if (age <= 72 * 60 * 60 * 1000) return 'AGING';
  if (age <= 7 * 24 * 60 * 60 * 1000) return 'STALE';
  return 'UNAVAILABLE';
}

function calculateChangeBps(startMinor: bigint, endMinor: bigint) {
  if (startMinor <= 0n) return null;
  return Number(((endMinor - startMinor) * 10_000n) / startMinor);
}

export function referenceSeriesForAsset(
  grader: string | null | undefined,
  grade: string | null | undefined,
): ReferenceSeries {
  if (!grader && !grade) return 'UNGRADED';
  const normalizedGrader = normalizeSeriesText(grader);
  const normalizedGrade = normalizeGrade(grade);
  if (normalizedGrader === 'PSA' && normalizedGrade === '10') return 'PSA_10';
  if (normalizedGrader === 'BGS' && normalizedGrade === '10') return 'BGS_10';
  if (normalizedGrade === '7') return 'GRADE_7';
  if (normalizedGrade === '8') return 'GRADE_8';
  if (normalizedGrade === '9') return 'GRADE_9';
  if (normalizedGrade === '9.5') return 'GRADE_9_5';
  return 'UNGRADED';
}

export function referenceSeriesForObservation(
  grader: string | null | undefined,
  grade: string | null | undefined,
): ReferenceSeries | null {
  if (!grader && !grade) return 'UNGRADED';
  const normalizedGrader = normalizeSeriesText(grader);
  const normalizedGrade = normalizeGrade(grade);
  if (normalizedGrader === 'PSA' && normalizedGrade === '10') return 'PSA_10';
  if (normalizedGrader === 'BGS' && normalizedGrade === '10') return 'BGS_10';
  if (normalizedGrade === '7') return 'GRADE_7';
  if (normalizedGrade === '8') return 'GRADE_8';
  if (normalizedGrade === '9') return 'GRADE_9';
  if (normalizedGrade === '9.5') return 'GRADE_9_5';
  return null;
}

function normalizeSeriesText(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeGrade(value: string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return parsed.toFixed(1).replace(/\.0$/, '');
}

function encodeCursor(id: string) {
  return Buffer.from(JSON.stringify({ id })).toString('base64url');
}
function decodeCursor(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed.id !== 'string' || !parsed.id) throw new Error();
    return parsed.id;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR',
      message: 'The cursor is invalid.',
    });
  }
}
