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

const ranges = {
  '1D': 1,
  '7D': 7,
  '30D': 30,
  '3M': 90,
  '1Y': 365,
  ALL: 3650,
} as const;
type Range = keyof typeof ranges;
const asMoney = (value: bigint, currency: string) => ({
  minor: value.toString(),
  currency: currency === 'GBP' ? 'GBP' : 'GBP',
});
const asOf = (date: Date) => date.toISOString();
const status = (value: string) => value as 'DEMO' | 'DELAYED' | 'LIVE';

@Injectable()
export class MarketService {
  constructor(
    private readonly db: PrismaService,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
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
        marketSnapshots: { orderBy: { asOf: 'desc' }, take: 1 },
        valuationEvidence: {
          where: { sourceType: { in: ['STAGING_CURRENT_LISTING', 'STAGING_RECENT_COMPLETED_SALE'] } },
          orderBy: { observedAt: 'desc' },
          take: 2,
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
        return (
          (!query.estimatedMarketValueMinMinor ||
            (snapshot?.estimatedMarketValueMinor ?? 0n) >=
              query.estimatedMarketValueMinMinor) &&
          (!query.estimatedMarketValueMaxMinor ||
            (snapshot?.estimatedMarketValueMinor ?? 0n) <=
              query.estimatedMarketValueMaxMinor) &&
          (query.availabilityMinBps === undefined ||
            (snapshot?.availableBps ?? -1) >= query.availabilityMinBps)
        );
      })
      .sort((a, b) =>
        query.sort === 'estimatedMarketValue'
          ? Number(
              (b.marketSnapshots[0]?.estimatedMarketValueMinor ?? 0n) -
                (a.marketSnapshots[0]?.estimatedMarketValueMinor ?? 0n),
            )
          : query.sort === 'change24h'
            ? (b.marketSnapshots[0]?.change24hBps ?? -Infinity) -
              (a.marketSnapshots[0]?.change24hBps ?? -Infinity)
            : a.title.localeCompare(b.title),
      );
    const items = filtered
      .slice(0, query.limit)
      .map((asset) => assetView(asset));
    return {
      items,
      hasMore: filtered.length > query.limit,
      nextCursor:
        filtered.length > query.limit
          ? encodeCursor(filtered[query.limit - 1]!.id)
          : null,
    };
  }

  async detail(slug: string) {
    const asset = await this.asset(slug);
    return assetView(asset);
  }
  async history(slug: string, range: Range) {
    const asset = await this.asset(slug);
    const from = new Date(Date.now() - ranges[range] * 86_400_000);
    const points = await this.db.assetValuationPoint.findMany({
      where: { assetId: asset.id, observedAt: { gte: from } },
      orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
      take: 366,
    });
    return {
      assetSlug: asset.slug,
      range,
      points: points.map((point) => ({
        observedAt: asOf(point.observedAt),
        estimatedMarketValue: asMoney(
          point.estimatedMarketValueMinor,
          point.currency,
        ),
        source: point.source,
        dataStatus: status(point.status),
      })),
    };
  }
  async similar(slug: string, limit: number) {
    const asset = await this.asset(slug);
    const rows = await this.db.asset.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: asset.id },
        categoryId: asset.categoryId,
        ...(asset.setId ? { setId: asset.setId } : {}),
      },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        marketSnapshots: { orderBy: { asOf: 'desc' }, take: 1 },
        valuationEvidence: {
          where: { sourceType: { in: ['STAGING_CURRENT_LISTING', 'STAGING_RECENT_COMPLETED_SALE'] } },
          orderBy: { observedAt: 'desc' },
          take: 2,
        },
        publication: true,
        custodyRecord: true,
        insuranceCoverage: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
      take: limit,
    });
    return { items: rows.map(assetView) };
  }
  async summary() {
    const value = await this.db.marketSnapshot.findFirst({
      orderBy: { asOf: 'desc' },
    });
    if (!value)
      return {
        dataStatus: 'DEMO',
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
      include: {
        asset: {
          include: {
            category: true,
            collectibleSet: true,
            gradeScaleEntry: { include: { company: true } },
            marketSnapshots: { orderBy: { asOf: 'desc' }, take: 1 },
            valuationEvidence: {
              where: { sourceType: { in: ['STAGING_CURRENT_LISTING', 'STAGING_RECENT_COMPLETED_SALE'] } },
              orderBy: { observedAt: 'desc' },
              take: 2,
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
      items: rows
        .filter((row) => row.asset.status === 'PUBLISHED')
        .map((row) => assetView({ ...row.asset, marketSnapshots: [row] })),
    };
  }
  async unavailable(slug: string, kind: 'ORDER_BOOK' | 'RECENT_TRADES') {
    await this.asset(slug);
    return { availability: 'NOT_AVAILABLE_UNTIL_TRADING', kind, items: [] };
  }
  private async asset(slug: string) {
    const asset = await this.db.asset.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: {
        category: true,
        collectibleSet: true,
        gradeScaleEntry: { include: { company: true } },
        marketSnapshots: { orderBy: { asOf: 'desc' }, take: 1 },
        valuationEvidence: {
          where: { sourceType: { in: ['STAGING_CURRENT_LISTING', 'STAGING_RECENT_COMPLETED_SALE'] } },
          orderBy: { observedAt: 'desc' },
          take: 2,
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
}

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
};
function assetView(asset: PublicAssetRow) {
  const market = asset.marketSnapshots[0];
  return {
    publicId: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    shortName: asset.shortName,
    year: asset.year,
    manufacturer: asset.manufacturer,
    cardNumber: asset.cardNumber,
    description: asset.description,
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
    estimatedMarketValue: market
      ? asMoney(market.estimatedMarketValueMinor, market.currency)
      : null,
    change24hBps: market?.change24hBps ?? null,
    availabilityBps: market?.availableBps ?? null,
    ownersCount: market?.ownersCount ?? null,
    confidence: market?.confidence ?? null,
    source: market?.source ?? 'NO_MARKET_DATA',
    marketReference: externalMarketReference(asset.valuationEvidence ?? []),
    dataStatus: market ? status(market.status) : 'DEMO',
    asOf: market ? asOf(market.asOf) : null,
    publication:
      asset.publication?.status === 'PUBLISHED'
        ? {
            status: 'PUBLISHED',
            asOf: asset.publication.publishedAt?.toISOString() ?? null,
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
}

function externalMarketReference(
  records: NonNullable<PublicAssetRow['valuationEvidence']>,
) {
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
        amount: { minor: record.valueMinor.toString(), currency: record.currency },
        source: detail.source,
        externalReference: detail.externalReference,
        listingUrl: detail.listingUrl,
        ...(typeof detail.imageUrl === 'string' ? { imageUrl: detail.imageUrl } : {}),
        observedAt: record.observedAt.toISOString(),
      };
    } catch {
      return null;
    }
  };
  const currentListing = read('STAGING_CURRENT_LISTING');
  const recentCompletedSale = read('STAGING_RECENT_COMPLETED_SALE');
  return currentListing || recentCompletedSale
    ? { ...(currentListing ? { currentListing } : {}), ...(recentCompletedSale ? { recentCompletedSale } : {}) }
    : null;
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
