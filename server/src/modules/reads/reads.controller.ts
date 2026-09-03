import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
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
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { publicBetaAssetWhere } from '../../config/beta-policy';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../submissions/ports/submission-storage.ports';
import { publicDiscoverableAssetWhere } from '../public-discovery/public-asset-visibility';
@Controller()
export class ReadsController {
  constructor(
    private readonly db: PrismaService,
    private readonly idempotency: IdempotencyCoordinator,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}
  @Get('collectors') async collectors(
    @Query('cursor') _cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') query?: string,
    @Query('specialty') specialty?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const size = parseCollectorPageSize(pageSize ?? limit);
    const currentPage = parseCollectorPage(page);
    const order = parseCollectorSort(sort);
    const publicAssetWhere = publicDiscoverableAssetWhere(this.config.isBeta);
    const publicWhere: Prisma.UserWhereInput = {
      accountStatus: 'ACTIVE',
      roleAssignments: { some: { role: 'COLLECTOR', revokedAt: null } },
      publicCollectorProfile: { is: { isPublic: true } },
      submissions: {
        some: {
          status: 'APPROVED',
          asset: { is: publicAssetWhere },
        },
      },
    };
    // Demo isolation belongs to the asset predicate above. Do not exclude an
    // entire collector profile when it owns a legitimate non-demo asset.
    const nonDemoWhere: Prisma.UserWhereInput = {};
    const baseWhere: Prisma.UserWhereInput = {
      ...publicWhere,
      ...nonDemoWhere,
      ...(query?.trim()
        ? {
            OR: [
              {
                publicCollectorProfile: {
                  is: {
                    OR: [
                      { slug: { contains: query.trim(), mode: 'insensitive' } },
                      {
                        headline: {
                          contains: query.trim(),
                          mode: 'insensitive',
                        },
                      },
                      {
                        specialism: {
                          contains: query.trim(),
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
              {
                profile: {
                  is: {
                    OR: [
                      {
                        displayName: {
                          contains: query.trim(),
                          mode: 'insensitive',
                        },
                      },
                      {
                        publicUsername: {
                          contains: query.trim(),
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
              {
                submissions: {
                  some: {
                    status: 'APPROVED',
                    asset: {
                      is: {
                        ...publicAssetWhere,
                        OR: [
                          {
                            title: {
                              contains: query.trim(),
                              mode: 'insensitive',
                            },
                          },
                          {
                            category: {
                              name: {
                                contains: query.trim(),
                                mode: 'insensitive',
                              },
                            },
                          },
                          {
                            collectibleSet: {
                              name: {
                                contains: query.trim(),
                                mode: 'insensitive',
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(specialty && specialty.trim() && specialty !== 'All specialties'
        ? {
            OR: [
              {
                publicCollectorProfile: {
                  is: {
                    specialism: {
                      contains: specialty.trim(),
                      mode: 'insensitive',
                    },
                  },
                },
              },
              {
                submissions: {
                  some: {
                    status: 'APPROVED',
                    asset: {
                      is: {
                        ...publicAssetWhere,
                        category: {
                          name: {
                            contains: specialty.trim(),
                            mode: 'insensitive',
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      order === 'name'
        ? [{ profile: { displayName: 'asc' } }, { id: 'asc' }]
        : order === 'assets'
          ? [
              { submissions: { _count: 'desc' } },
              { createdAt: 'desc' },
              { id: 'desc' },
            ]
          : order === 'recent'
            ? [
                { publicCollectorProfile: { publishedAt: 'desc' } },
                { createdAt: 'desc' },
                { id: 'desc' },
              ]
            : [
                { publicCollectorProfile: { isFeatured: 'desc' } },
                { publicCollectorProfile: { featurePriority: 'asc' } },
                { publicCollectorProfile: { featuredAt: 'asc' } },
                { createdAt: 'desc' },
                { id: 'desc' },
              ];
    const [
      total,
      eligibleCollectorCount,
      rows,
      featuredRows,
      specialtyRows,
      categoryRows,
      publishedAssetCount,
      featuredCollectorCount,
    ] = await Promise.all([
      this.db.user.count({ where: baseWhere }),
      this.db.user.count({ where: { ...publicWhere, ...nonDemoWhere } }),
      this.db.user.findMany({
        where: baseWhere,
        include: publicCollectorUserInclude(publicAssetWhere),
        orderBy,
        skip: (currentPage - 1) * size,
        take: size,
      }),
      this.db.user.findMany({
        where: {
          ...publicWhere,
          ...nonDemoWhere,
          publicCollectorProfile: { is: { isFeatured: true } },
        },
        include: publicCollectorUserInclude(publicAssetWhere),
        orderBy: [
          { publicCollectorProfile: { featurePriority: 'asc' } },
          { publicCollectorProfile: { featuredAt: 'asc' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 3,
      }),
      this.db.publicCollectorProfile.findMany({
        where: {
          user: { ...publicWhere, ...nonDemoWhere },
          specialism: { not: null },
        },
        select: { specialism: true },
        distinct: ['specialism'],
      }),
      this.db.asset.findMany({
        where: {
          ...publicAssetWhere,
          submissions: {
            some: {
              status: 'APPROVED',
              owner: { ...publicWhere, ...nonDemoWhere },
            },
          },
        },
        select: { category: { select: { name: true } } },
        distinct: ['categoryId'],
      }),
      this.db.assetSubmission.count({
        where: {
          status: 'APPROVED',
          asset: { is: publicAssetWhere },
          owner: { ...publicWhere, ...nonDemoWhere },
        },
      }),
      this.db.user.count({
        where: {
          ...publicWhere,
          ...nonDemoWhere,
          publicCollectorProfile: { is: { isPublic: true, isFeatured: true } },
        },
      }),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / size);
    return {
      items: await Promise.all(
        rows.map((row) =>
          publicCollectorView(row, this.config.isBeta === true, this.storage),
        ),
      ),
      featured: await Promise.all(
        featuredRows.map((row) =>
          publicCollectorView(row, this.config.isBeta === true, this.storage),
        ),
      ),
      specialties: [
        ...new Set([
          ...specialtyRows.flatMap((row) =>
            (row.specialism ?? '')
              .split('·')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
          ...categoryRows.map((row) => row.category.name),
        ]),
      ]
        .sort((left, right) => left.localeCompare(right))
        .map((name) => ({ name })),
      stats: {
        eligibleCollectorCount,
        publishedAssetCount,
        featuredCollectorCount,
      },
      nextCursor: null,
      pagination: {
        page: currentPage,
        pageSize: size,
        total,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1,
      },
    };
  }
  @Get('collectors/:slug') async collector(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const assetPage = parseCollectorPage(page);
    const assetPageSize = parseCollectorPageSize(pageSize ?? '8');
    const publicAssetWhere = publicDiscoverableAssetWhere(this.config.isBeta);
    const fallbackUserId = slug.startsWith('collector-')
      ? slug.slice('collector-'.length)
      : null;
    const x = await this.db.user.findFirst({
      where: {
        accountStatus: 'ACTIVE',
        roleAssignments: { some: { role: 'COLLECTOR', revokedAt: null } },
        publicCollectorProfile: { is: { isPublic: true } },
        submissions: {
          some: {
            status: 'APPROVED',
            asset: { is: publicAssetWhere },
          },
        },
        AND: [
          {
            OR: [
              { publicCollectorProfile: { is: { slug } } },
              ...(fallbackUserId ? [{ id: fallbackUserId }] : []),
            ],
          },
        ],
      },
      include: publicCollectorUserInclude(
        publicAssetWhere,
        (assetPage - 1) * assetPageSize,
        assetPageSize,
      ),
    });
    const publicAssetTotal = x
      ? await this.db.assetSubmission.count({
          where: {
            ownerUserId: x.id,
            status: 'APPROVED',
            asset: { is: publicAssetWhere },
          },
        })
      : 0;
    return x
      ? await publicCollectorView(
          x,
          this.config.isBeta === true,
          this.storage,
          {
            page: assetPage,
            pageSize: assetPageSize,
            total: publicAssetTotal,
            totalPages: publicAssetTotal
              ? Math.ceil(publicAssetTotal / assetPageSize)
              : 0,
            hasNextPage: assetPage * assetPageSize < publicAssetTotal,
            hasPreviousPage: assetPage > 1,
          },
        )
      : { error: 'COLLECTOR_NOT_FOUND' };
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
        ...(this.config.isBeta ? { asset: publicBetaAssetWhere(true) } : {}),
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
        where: {
          status: 'PUBLISHED',
          ...(this.config.isBeta ? { asset: publicBetaAssetWhere(true) } : {}),
        },
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
      marketSnapshots: {
        ...(this.config.isBeta
          ? {
              where: {
                NOT: [
                  { source: { startsWith: 'STAGING_' } },
                  { source: { startsWith: 'DEMO_' } },
                  { source: { startsWith: 'TEST_' } },
                ],
              },
            }
          : {}),
        orderBy: { asOf: 'desc' as const },
        take: 1,
      },
    };
    const [events, published, executions] = await Promise.all([
      this.db.vaultPublicEvent.findMany({
        where: {
          status: 'PUBLISHED',
          ...(this.config.isBeta ? { asset: publicBetaAssetWhere(true) } : {}),
        },
        include: { asset: { include: publicAssetInclude } },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 24,
      }),
      this.db.asset.findMany({
        where: {
          status: 'PUBLISHED',
          ...publicBetaAssetWhere(this.config.isBeta),
        },
        include: publicAssetInclude,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 12,
      }),
      this.db.tradingExecution.findMany({
        where: {
          executedAt: { gte: since },
          asset: {
            status: 'PUBLISHED',
            ...publicBetaAssetWhere(this.config.isBeta),
          },
        },
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
    const distinct = <T extends { publicId: string }>(items: T[]) => [
      ...new Map(items.map((item) => [item.publicId, item])).values(),
    ];
    const activityByAsset = new Map<
      string,
      {
        asset: NonNullable<ReturnType<typeof publicVaultAssetView>>;
        units: bigint;
        latestPriceMinor: bigint;
        occurredAt: Date;
      }
    >();
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
      publicVaultEvents: events.filter((event) => event.occurredAt >= since)
        .length,
      newlyPublished: published.filter(
        (asset) => asset.publishedAt && asset.publishedAt >= since,
      ).length,
      valuationsUpdated: events.filter(
        (event) =>
          isPublicValuationEvent(event.type) && event.occurredAt >= since,
      ).length,
      marketActivity: [...activityByAsset.values()]
        .reduce((total, item) => total + item.units, 0n)
        .toString(),
    };
    return {
      dataStatus: 'LIVE_PUBLIC_PROJECTION',
      windowStartedAt: since.toISOString(),
      metrics,
      featuredAsset: publicVaultAssetView(
        published.find(
          (asset) => asset.slug === 'slice-demo-umbreon-vmax-moonbreon',
        ) ??
          published[0] ??
          null,
      ),
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
      categories: [
        ...new Map(
          published.map((asset) => [
            asset.category.slug,
            { slug: asset.category.slug, name: asset.category.name },
          ]),
        ).values(),
      ],
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

const publicCollectorUserInclude = (
  assetWhere: Prisma.AssetWhereInput = { status: 'PUBLISHED' },
  submissionSkip = 0,
  submissionTake = 8,
) =>
  ({
    profile: {
      select: {
        displayName: true,
        publicUsername: true,
        avatarReference: true,
      },
    },
    publicCollectorProfile: {
      select: {
        slug: true,
        headline: true,
        specialism: true,
        isFeatured: true,
        featurePriority: true,
        featuredCaption: true,
        featuredAt: true,
        publishedAt: true,
        createdAt: true,
      },
    },
    _count: {
      select: {
        submissions: {
          where: {
            status: 'APPROVED',
            asset: { is: assetWhere },
          },
        },
      },
    },
    submissions: {
      where: {
        status: 'APPROVED',
        asset: { is: assetWhere },
      },
      include: {
        asset: {
          select: {
            publicId: true,
            slug: true,
            title: true,
            shortName: true,
            publishedAt: true,
            category: { select: { name: true } },
            collectibleSet: { select: { name: true } },
            gradeScaleEntry: {
              select: {
                label: true,
                company: { select: { displayName: true, name: true } },
              },
            },
            preSale: {
              select: {
                status: true,
                openedAt: true,
                deadlineAt: true,
                physicalStatus: true,
                initialOffering: {
                  select: {
                    offeredUnits: true,
                    pricePerUnitMinor: true,
                    currency: true,
                  },
                },
                reservations: {
                  where: { status: 'ACTIVE' },
                  select: { units: true },
                },
              },
            },
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
        media: {
          where: { status: 'SAFE', deletedAt: null },
          orderBy: { slot: 'asc' },
          select: { id: true, slot: true, objectKey: true },
        },
      },
      orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
      skip: submissionSkip,
      take: submissionTake,
    },
  }) satisfies Prisma.UserInclude;

async function publicCollectorView(
  x: {
    id: string;
    createdAt: Date;
    profile: {
      displayName: string;
      publicUsername: string | null;
      avatarReference: string | null;
    } | null;
    publicCollectorProfile: {
      slug: string;
      headline: string | null;
      specialism: string | null;
      isFeatured: boolean;
      featurePriority: number;
      featuredCaption: string | null;
      featuredAt: Date | null;
      publishedAt: Date | null;
      createdAt: Date;
    } | null;
    _count: { submissions: number };
    submissions: Array<{
      media: Array<{ id: string; slot: string; objectKey: string }>;
      asset: {
        publicId: string;
        slug: string;
        title: string;
        shortName: string | null;
        category: { name: string };
        collectibleSet: { name: string } | null;
        publishedAt: Date | null;
        gradeScaleEntry: {
          label: string;
          company: { displayName: string; name: string };
        } | null;
        preSale: {
          status: string;
          openedAt: Date | null;
          deadlineAt: Date | null;
          physicalStatus: string;
          initialOffering: {
            offeredUnits: bigint;
            pricePerUnitMinor: bigint;
            currency: string;
          };
          reservations: Array<{ units: bigint }>;
        } | null;
        marketSnapshots: Array<{
          estimatedMarketValueMinor: bigint;
          currency: string;
          asOf: Date;
          status: string;
        }>;
      } | null;
    }>;
  },
  isBeta = false,
  storage: ObjectStoragePort,
  assetPagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  },
) {
  const listings = await Promise.all(
    x.submissions
      .flatMap((submission) => {
        const asset = submission.asset;
        if (!asset || (isBeta && asset.slug.startsWith('slice-demo-')))
          return [];
        const market = asset.marketSnapshots[0] ?? null;
        return [
          {
            submission,
            asset,
            market,
          },
        ];
      })
      .map(async ({ submission, asset, market }) => ({
        publicId: asset.publicId,
        slug: asset.slug,
        title: asset.title,
        category: asset.category.name,
        variant: asset.shortName ?? asset.collectibleSet?.name ?? null,
        grade: asset.gradeScaleEntry
          ? `${asset.gradeScaleEntry.company.displayName || asset.gradeScaleEntry.company.name} ${asset.gradeScaleEntry.label}`
          : null,
        preSale:
          asset.preSale?.status === 'ACTIVE'
            ? (() => {
                const reservedUnits = asset.preSale.reservations.reduce(
                  (sum, row) => sum + row.units,
                  0n,
                );
                const offeredUnits = asset.preSale.initialOffering.offeredUnits;
                return {
                  status: asset.preSale.status,
                  openedAt: asset.preSale.openedAt?.toISOString() ?? null,
                  deadlineAt: asset.preSale.deadlineAt?.toISOString() ?? null,
                  physicalStatus: asset.preSale.physicalStatus,
                  pricePerUnitMinor:
                    asset.preSale.initialOffering.pricePerUnitMinor.toString(),
                  currency: asset.preSale.initialOffering.currency,
                  offeredUnits: offeredUnits.toString(),
                  reservedUnits: reservedUnits.toString(),
                  availableUnits: (offeredUnits - reservedUnits).toString(),
                  reservedPercentageBps: offeredUnits
                    ? Number((reservedUnits * 10_000n) / offeredUnits)
                    : 0,
                };
              })()
            : null,
        listedAt: asset.publishedAt?.toISOString() ?? null,
        media: (
          await Promise.all(
            submission.media.map(async (media) => ({
              id: media.id,
              slot: media.slot,
              url: await storage
                .createPrivateDownloadUrl(
                  media.objectKey,
                  new Date(Date.now() + 5 * 60_000),
                )
                .catch(() => null),
              alt: `${asset.title} ${media.slot.toLowerCase()} approved media`,
            })),
          )
        ).filter(
          (
            media,
          ): media is { id: string; slot: string; url: string; alt: string } =>
            Boolean(media.url),
        ),
        market: market
          ? {
              estimatedValueMinor: market.estimatedMarketValueMinor.toString(),
              currency: market.currency,
              asOf: market.asOf.toISOString(),
              dataStatus: market.status,
            }
          : null,
      })),
  );
  const profile = x.publicCollectorProfile;
  return {
    slug: profile?.slug ?? `collector-${x.id}`,
    username: x.profile?.publicUsername ?? profile?.slug ?? `collector-${x.id}`,
    headline: profile?.headline ?? null,
    specialism: profile?.specialism ?? null,
    displayName: x.profile?.displayName ?? 'Collector',
    avatarReference: x.profile?.avatarReference ?? null,
    publicSince: (
      profile?.publishedAt ??
      profile?.createdAt ??
      x.createdAt
    ).toISOString(),
    isFeatured: profile?.isFeatured ?? false,
    featurePriority: profile?.featurePriority ?? 0,
    featuredCaption: profile?.featuredCaption ?? null,
    publishedListingCount: isBeta ? listings.length : x._count.submissions,
    latestPublicListingAt: listings[0]?.listedAt ?? null,
    featuredPreviewAssets: listings.slice(0, 3),
    publishedListings: listings,
    assetPagination,
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
  if (normalized.includes('REVIEW') || normalized.includes('VERIF'))
    return 'Review complete';
  if (
    normalized.includes('READY') ||
    normalized.includes('STORED') ||
    normalized.includes('RECEIVED')
  )
    return 'Vault readiness updated';
  if (normalized.includes('MARKET') || normalized.includes('PUBLISH'))
    return 'Market live';
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
  return (
    normalized.includes('READY') ||
    normalized.includes('STORED') ||
    normalized.includes('RECEIVED')
  );
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

function parseCollectorPage(value: string | undefined) {
  if (value === undefined) return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return parsed;
}

function parseCollectorPageSize(value: string | undefined) {
  if (value === undefined) return 12;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 48)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
    });
  return parsed;
}

function parseCollectorSort(value: string | undefined) {
  if (value === undefined || value === '') return 'featured' as const;
  if (
    value === 'featured' ||
    value === 'assets' ||
    value === 'recent' ||
    value === 'name'
  )
    return value;
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
  });
}
