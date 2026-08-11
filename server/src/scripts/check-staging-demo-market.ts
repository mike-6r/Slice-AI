import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { MarketService } from '../modules/market/market.service';
import { assertStagingDemoSafety, demoAccounts } from './staging-demo-safety';
import {
  publishedStagingDemoAssetSlugs,
  stagingDemoAssetSlugs,
} from './setup-demo-collector';

/**
 * Read-only staging diagnostic.  It deliberately evaluates the exact public
 * MarketService projection used by GET /api/v1/market/assets; it does not
 * repair records, change lifecycle state, or touch unrelated staging data.
 */
async function main() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const db = app.get(PrismaService);
    const market = app.get(MarketService);
    const collector = await db.user.findUnique({
      where: { normalizedEmail: demoAccounts.collector.email },
      select: { id: true },
    });
    const assets = await db.asset.findMany({
      where: { slug: { in: stagingDemoAssetSlugs } },
      include: {
        submissions: {
          select: {
            ownerUserId: true,
            status: true,
            media: { select: { status: true } },
          },
        },
        publication: { select: { status: true } },
        custodyRecord: { select: { status: true } },
        ownershipSupply: {
          select: { status: true, totalUnits: true, issuedUnits: true },
        },
        tradingMarket: { select: { status: true, tradingEnabled: true } },
        marketSnapshots: {
          where: { source: 'STAGING_DEMO_MARKET' },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { slug: 'asc' },
    });
    const publicPage = await market.list({ sort: 'title', limit: 48 });
    const publicSlugs = new Set(publicPage.items.map((item) => item.slug));
    const publishedExpected = new Set(publishedStagingDemoAssetSlugs);
    const bySlug = new Map(assets.map((asset) => [asset.slug, asset]));

    const rows = stagingDemoAssetSlugs.map((slug) => {
      const asset = bySlug.get(slug);
      if (!asset)
        return {
          slug,
          exists: false,
          status: 'MISSING',
          publication: 'MISSING',
          custody: 'MISSING',
          marketVisible: false,
          tradeable: false,
          blockingReason: 'ASSET_MISSING',
        };

      const expectedPublished = publishedExpected.has(slug);
      const mediaSafe = asset.submissions.some((submission) =>
        submission.media.some((media) => media.status === 'SAFE'),
      );
      const tradeable =
        asset.status === 'PUBLISHED' &&
        asset.ownershipSupply?.status === 'ACTIVE' &&
        asset.ownershipSupply.issuedUnits > 0n &&
        asset.tradingMarket?.status === 'OPEN' &&
        asset.tradingMarket.tradingEnabled;
      const blockingReason = !expectedPublished
        ? null
        : asset.status !== 'PUBLISHED'
          ? 'ASSET_NOT_PUBLISHED'
          : !publicSlugs.has(slug)
            ? 'NOT_IN_PUBLIC_MARKET_PROJECTION'
            : !mediaSafe
              ? 'PUBLIC_MEDIA_NOT_SAFE'
              : null;
      return {
        slug,
        exists: true,
        expectedPublished,
        status: asset.status,
        publication: asset.publication?.status ?? 'MISSING',
        custody: asset.custodyRecord?.status ?? 'MISSING',
        marketSnapshot: asset.marketSnapshots.length > 0,
        mediaSafe,
        supply: asset.ownershipSupply
          ? {
              status: asset.ownershipSupply.status,
              totalUnits: asset.ownershipSupply.totalUnits.toString(),
              issuedUnits: asset.ownershipSupply.issuedUnits.toString(),
            }
          : null,
        marketVisible: publicSlugs.has(slug),
        tradeable,
        blockingReason,
      };
    });
    const demoCollectorAssets = collector
      ? assets.filter((asset) =>
          asset.submissions.some(
            (submission) => submission.ownerUserId === collector.id,
          ),
        ).length
      : 0;
    const marketVisible = rows.filter((row) => row.marketVisible).length;
    const published = rows.filter((row) => row.status === 'PUBLISHED').length;
    const tradeable = rows.filter((row) => row.tradeable).length;
    const missingMedia = rows.filter(
      (row) => row.expectedPublished && !row.mediaSafe,
    ).length;
    const healthy =
      published === publishedStagingDemoAssetSlugs.length &&
      marketVisible === publishedStagingDemoAssetSlugs.length &&
      missingMedia === 0;

    process.stdout.write(
      `${JSON.stringify({
        result: healthy
          ? 'STAGING_DEMO_MARKET_HEALTHY'
          : 'STAGING_DEMO_MARKET_UNHEALTHY',
        predicate: {
          endpoint: 'GET /api/v1/market/assets',
          required: ['asset.status = PUBLISHED'],
          note: 'The public market query does not require trading to be enabled.',
        },
        collector: {
          email: demoAccounts.collector.email,
          exists: Boolean(collector),
          associatedAssets: demoCollectorAssets,
        },
        counts: {
          fixtureAssets: assets.length,
          expectedPublished: publishedStagingDemoAssetSlugs.length,
          published,
          marketVisible,
          tradeable,
          missingMedia,
          publicApiItems: publicPage.items.length,
        },
        assets: rows,
      })}\n`,
    );
    if (!healthy) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Staging demo market check failed.'}\n`,
  );
  process.exitCode = 1;
});
