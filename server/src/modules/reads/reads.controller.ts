import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/auth/access-token.guard';
import { IdempotencyCoordinator } from '../identity/auth/idempotency-coordinator';
@Controller()
export class ReadsController {
  constructor(
    private readonly db: PrismaService,
    private readonly idempotency: IdempotencyCoordinator,
  ) {}
  @Get('collectors') async collectors(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const before = parseCursor(cursor, 'collectors');
    const pageSize = parseLimit(limit);
    const rows = await this.db.publicCollectorProfile.findMany({
      where: {
        isPublic: true,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, userId: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: publicCollectorInclude,
      orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
      take: pageSize + 1,
    });
    return {
      items: rows.slice(0, pageSize).map(publicCollectorView),
      nextCursor:
        rows.length > pageSize
          ? makeCursor(
              'collectors',
              rows[pageSize - 1]!.createdAt,
              rows[pageSize - 1]!.userId,
            )
          : null,
    };
  }
  @Get('collectors/:slug') async collector(@Param('slug') slug: string) {
    const x = await this.db.publicCollectorProfile.findFirst({
      where: { slug, isPublic: true },
      include: publicCollectorInclude,
    });
    return x ? publicCollectorView(x) : { error: 'COLLECTOR_NOT_FOUND' };
  }
  @Get('vault/events') async vault(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const before = parseCursor(cursor, 'vault-events');
    const pageSize = parseLimit(limit);
    const rows = await this.db.vaultPublicEvent.findMany({
      where: {
        status: 'PUBLISHED',
        ...(before
          ? {
              OR: [
                { occurredAt: { lt: before.createdAt } },
                { occurredAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { asset: true },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    return {
      items: rows.slice(0, pageSize).map((x) => ({
        id: x.id,
        type: x.type,
        occurredAt: x.occurredAt.toISOString(),
        publicSummary: x.publicSummary,
        assetSlug: x.asset.slug,
      })),
      nextCursor:
        rows.length > pageSize
          ? makeCursor(
              'vault-events',
              rows[pageSize - 1]!.occurredAt,
              rows[pageSize - 1]!.id,
            )
          : null,
    };
  }
  @Get('vault/summary') async vaultSummary() {
    return {
      authority: 'UNAVAILABLE_UNTIL_CUSTODY',
      eventCount: await this.db.vaultPublicEvent.count({
        where: { status: 'PUBLISHED' },
      }),
    };
  }
  /**
   * A compact, externally safe projection for Vault Live.  It deliberately
   * reads only records already designated public; it is not a second
   * lifecycle, custody, or trading authority.
   */
  @Get('vault/live') async vaultLive() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const publicAssetInclude = {
      category: { select: { slug: true, name: true } },
      collectibleSet: { select: { slug: true, name: true } },
      gradeScaleEntry: { include: { company: true } },
      marketSnapshots: { orderBy: { asOf: 'desc' as const }, take: 1 },
    };
    const [events, published, executions] = await Promise.all([
      this.db.vaultPublicEvent.findMany({
        where: { status: 'PUBLISHED' },
        include: { asset: { include: publicAssetInclude } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 24,
      }),
      this.db.asset.findMany({
        where: { status: 'PUBLISHED' },
        include: publicAssetInclude,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 12,
      }),
      this.db.tradingExecution.findMany({
        where: { executedAt: { gte: since }, asset: { status: 'PUBLISHED' } },
        include: { asset: { include: publicAssetInclude } },
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    ]);

    const eventView = events.map((event) => ({
      id: event.id,
      publicLabel: publicVaultEventLabel(event.type),
      occurredAt: event.occurredAt.toISOString(),
      publicSummary: event.publicSummary,
      asset: publicVaultAssetView(event.asset),
    }));
    const viewedAssetIds = new Set(events.map((event) => event.assetId));
    const reviewed = events
      .filter((event) => isPublicReviewEvent(event.type))
      .map((event) => publicVaultAssetView(event.asset))
      .filter((asset): asset is NonNullable<typeof asset> => asset !== null);
    const readiness = events
      .filter((event) => isPublicReadinessEvent(event.type))
      .map((event) => publicVaultAssetView(event.asset))
      .filter((asset): asset is NonNullable<typeof asset> => asset !== null);
    const distinct = <T extends { publicId: string }>(items: T[]) =>
      [...new Map(items.map((item) => [item.publicId, item])).values()];
    const activityByAsset = new Map<string, { asset: NonNullable<ReturnType<typeof publicVaultAssetView>>; units: bigint; latestPriceMinor: bigint; occurredAt: Date }>();
    for (const execution of executions) {
      const current = activityByAsset.get(execution.assetId);
      if (current) {
        current.units += execution.units;
      } else {
        activityByAsset.set(execution.assetId, {
          asset: publicVaultAssetView(execution.asset)!,
          units: execution.units,
          latestPriceMinor: execution.priceMinor,
          occurredAt: execution.executedAt,
        });
      }
    }
    const metrics = {
      publicVaultEvents: events.filter((event) => event.occurredAt >= since).length,
      newlyPublished: published.filter((asset) => asset.publishedAt && asset.publishedAt >= since).length,
      valuationsUpdated: events.filter((event) => isPublicValuationEvent(event.type) && event.occurredAt >= since).length,
      marketActivity: [...activityByAsset.values()].reduce((total, item) => total + item.units, 0n).toString(),
    };
    return {
      dataStatus: 'LIVE_PUBLIC_PROJECTION',
      windowStartedAt: since.toISOString(),
      metrics,
      featuredAsset: publicVaultAssetView(published.find((asset) => asset.slug === 'slice-demo-umbreon-vmax-moonbreon') ?? published[0] ?? null),
      recentEvents: eventView,
      recentlyReviewed: distinct(reviewed),
      readiness: distinct(readiness),
      publishedAssets: published.map((asset) => publicVaultAssetView(asset)!),
      marketActivity: [...activityByAsset.values()].slice(0, 6).map((item) => ({
        asset: item.asset,
        units: item.units.toString(),
        latestPriceMinor: item.latestPriceMinor.toString(),
        occurredAt: item.occurredAt.toISOString(),
      })),
      categories: [...new Map(published.map((asset) => [asset.category.slug, { slug: asset.category.slug, name: asset.category.name }])).values()],
      eventAssetCount: viewedAssetIds.size,
    };
  }
  @Get('me/watchlist') @UseGuards(AccessTokenGuard) async list(
    @Req() req: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
  ) {
    const before = parseCursor(cursor, 'watchlist');
    const rows = await this.db.watchlistItem.findMany({
      where: {
        userId: req.actor!.userId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, assetId: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: { asset: true },
      orderBy: [{ createdAt: 'desc' }, { assetId: 'desc' }],
      take: 101,
    });
    const items = rows.slice(0, 100).map((x) => ({
      assetId: x.asset.publicId,
      slug: x.asset.slug,
      createdAt: x.createdAt.toISOString(),
    }));
    return {
      items,
      nextCursor:
        rows.length > 100
          ? makeCursor('watchlist', rows[99]!.createdAt, rows[99]!.assetId)
          : null,
    };
  }
  @Put('me/watchlist/:assetId') @UseGuards(AccessTokenGuard) async add(
    @Req() req: AuthenticatedRequest,
    @Param('assetId') assetId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(
      req,
      key,
      'watchlist.add',
      'PUT',
      `/v1/me/watchlist/${assetId}`,
      { assetId },
      async () => {
        const asset = await this.db.asset.findFirst({
          where: {
            OR: [{ id: assetId }, { publicId: assetId }],
            status: 'PUBLISHED',
          },
        });
        if (!asset)
          throw new BadRequestException({
            code: 'ASSET_NOT_FOUND',
            message: 'Resource not found.',
          });
        await this.db.watchlistItem.upsert({
          where: {
            userId_assetId: { userId: req.actor!.userId, assetId: asset.id },
          },
          create: { userId: req.actor!.userId, assetId: asset.id },
          update: {},
        });
        return { assetId: asset.publicId, watched: true };
      },
    );
  }
  @Delete('me/watchlist/:assetId') @UseGuards(AccessTokenGuard) async remove(
    @Req() req: AuthenticatedRequest,
    @Param('assetId') assetId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.mutate(
      req,
      key,
      'watchlist.remove',
      'DELETE',
      `/v1/me/watchlist/${assetId}`,
      { assetId },
      async () => {
        const asset = await this.db.asset.findFirst({
          where: { OR: [{ id: assetId }, { publicId: assetId }] },
        });
        if (asset)
          await this.db.watchlistItem.deleteMany({
            where: { userId: req.actor!.userId, assetId: asset.id },
          });
        return { assetId, watched: false };
      },
    );
  }
  private async mutate(
    req: AuthenticatedRequest,
    key: string | undefined,
    scope: string,
    method: string,
    path: string,
    body: Record<string, unknown>,
    execute: () => Promise<Record<string, unknown>>,
  ) {
    if (!key)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    const result = await this.idempotency.run(
      { actorScope: `user:${req.actor!.userId}`, scope, key },
      method,
      path,
      body,
      async (tx) => {
        const value = await execute();
        const action = scope.toUpperCase();
        const metadata = action.startsWith('WATCHLIST')
          ? { assetId: String(body.assetId) }
          : action === 'NOTIFICATION.READ'
            ? { notificationId: String(body.id) }
            : { affectedCount: Number(value.readCount ?? 0) };
        await tx.audit.append({
          id: randomUUID(),
          actorUserId: req.actor!.userId as never,
          actorType: 'USER',
          action,
          resourceType: scope.split('.')[0],
          resourceId: String(body.assetId ?? body.id ?? 'self'),
          requestId: req.requestId ?? null,
          sessionId: req.actor!.sessionId as never,
          result: 'SUCCESS',
          metadata,
          createdAt: new Date(),
        });
        return value;
      },
    );
    return result.value;
  }
}

const publicCollectorInclude = {
  user: {
    include: {
      profile: true,
      _count: {
        select: {
          submissions: { where: { asset: { is: { status: 'PUBLISHED' } } } },
        },
      },
      submissions: {
        where: { asset: { is: { status: 'PUBLISHED' } } },
        include: {
          asset: {
            include: {
              category: { select: { name: true } },
              marketSnapshots: {
                orderBy: { asOf: 'desc' },
                take: 1,
                select: {
                  estimatedMarketValueMinor: true,
                  currency: true,
                  asOf: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
        take: 8,
      },
    },
  },
} satisfies Prisma.PublicCollectorProfileInclude;

function publicCollectorView(x: {
  slug: string;
  headline: string | null;
  specialism: string | null;
  user: {
    profile: { displayName: string } | null;
    _count: { submissions: number };
    submissions: Array<{
      asset: {
        publicId: string;
        slug: string;
        title: string;
        category: { name: string };
        marketSnapshots: Array<{
          estimatedMarketValueMinor: bigint;
          currency: string;
          asOf: Date;
          status: string;
        }>;
      } | null;
    }>;
  };
}) {
  const listings = x.user.submissions.flatMap((submission) => {
    const asset = submission.asset;
    if (!asset) return [];
    const market = asset.marketSnapshots[0] ?? null;
    return [
      {
        publicId: asset.publicId,
        slug: asset.slug,
        title: asset.title,
        category: asset.category.name,
        market: market
          ? {
              estimatedValueMinor: market.estimatedMarketValueMinor.toString(),
              currency: 'GBP',
              asOf: market.asOf.toISOString(),
              dataStatus: market.status,
            }
          : null,
      },
    ];
  });
  return {
    slug: x.slug,
    headline: x.headline,
    specialism: x.specialism,
    displayName: x.user.profile?.displayName ?? null,
    publishedListingCount: x.user._count.submissions,
    publishedListings: listings,
  };
}

type VaultLiveAsset = {
  publicId: string;
  slug: string;
  title: string;
  shortName: string | null;
  year: number | null;
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
    asOf: Date;
    status: string;
  }>;
};

function publicVaultAssetView(asset: VaultLiveAsset | null) {
  if (!asset) return null;
  const market = asset.marketSnapshots[0] ?? null;
  return {
    publicId: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    shortName: asset.shortName,
    year: asset.year,
    category: asset.category,
    collectibleSet: asset.collectibleSet,
    grading: asset.gradeScaleEntry
      ? {
          companyCode: asset.gradeScaleEntry.company.code,
          grade: asset.gradeScaleEntry.grade.toFixed(2),
          label: asset.gradeScaleEntry.label,
        }
      : null,
    market: market
      ? {
          estimatedValueMinor: market.estimatedMarketValueMinor.toString(),
          currency: market.currency,
          change24hBps: market.change24hBps,
          availableBps: market.availableBps,
          ownersCount: market.ownersCount,
          confidence: market.confidence,
          asOf: market.asOf.toISOString(),
          dataStatus: market.status,
        }
      : null,
  };
}

function publicVaultEventLabel(type: string) {
  const normalized = type.trim().toUpperCase();
  if (normalized.includes('VALU')) return 'Valuation updated';
  if (normalized.includes('REVIEW') || normalized.includes('VERIF')) return 'Review complete';
  if (normalized.includes('READY') || normalized.includes('STORED') || normalized.includes('RECEIVED')) return 'Vault readiness updated';
  if (normalized.includes('MARKET') || normalized.includes('PUBLISH')) return 'Market live';
  return 'Public vault update';
}
function isPublicReviewEvent(type: string) {
  const normalized = type.toUpperCase();
  return normalized.includes('REVIEW') || normalized.includes('VERIF');
}
function isPublicValuationEvent(type: string) {
  return type.toUpperCase().includes('VALU');
}
function isPublicReadinessEvent(type: string) {
  const normalized = type.toUpperCase();
  return normalized.includes('READY') || normalized.includes('STORED') || normalized.includes('RECEIVED');
}
function makeCursor(scope: string, createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ scope, createdAt: createdAt.toISOString(), id }),
  ).toString('base64url');
}
function parseCursor(value: string | undefined, scope: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { scope?: unknown; createdAt?: unknown; id?: unknown };
    const createdAt = new Date(
      typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
    );
    if (
      parsed.scope !== scope ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      Number.isNaN(createdAt.getTime())
    )
      throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  }
}
function parseLimit(value: string | undefined) {
  if (value === undefined) return 24;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return parsed;
}
