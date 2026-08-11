import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { MarketService } from '../modules/market/market.service';
import {
  publishedStagingDemoAssetSlugs,
  stagingDemoAssetSlugs,
} from './setup-demo-collector';
import { assertStagingDemoSafety } from './staging-demo-safety';

/**
 * Read-only staging check for the records consumed by GET /api/v1/vault/live.
 * It never creates fixtures or changes asset, finance, ownership, or event
 * state. The output is intentionally operator-friendly for VPS deployment QA.
 */
async function main() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const db = app.get(PrismaService);
    const market = app.get(MarketService);
    const publicMarket = await market.list({ sort: 'title', limit: 100 });
    const publicSlugs = new Set(publicMarket.items.map((item) => item.slug));
    const [assets, events, executions] = await Promise.all([
      db.asset.findMany({
        where: { slug: { in: stagingDemoAssetSlugs } },
        select: { slug: true, status: true, publishedAt: true },
      }),
      db.vaultPublicEvent.findMany({
        where: {
          status: 'PUBLISHED',
          asset: { slug: { in: stagingDemoAssetSlugs } },
        },
        select: {
          id: true,
          type: true,
          publicSummary: true,
          occurredAt: true,
          asset: { select: { slug: true } },
        },
      }),
      db.tradingExecution.count({
        where: { asset: { slug: { in: stagingDemoAssetSlugs } } },
      }),
    ]);
    const assetBySlug = new Map(assets.map((asset) => [asset.slug, asset]));
    const publishedRows = publishedStagingDemoAssetSlugs.map((slug) => {
      const asset = assetBySlug.get(slug);
      return {
        slug,
        exists: Boolean(asset),
        published: asset?.status === 'PUBLISHED',
        publicMarketVisible: publicSlugs.has(slug),
      };
    });
    const featured = publishedRows.find(
      (asset) => asset.slug === 'slice-demo-charizard',
    );
    const eventAssetSlugs = new Set(events.map((event) => event.asset.slug));
    const eventsReferenceOnlyFixtureAssets = events.every((event) =>
      stagingDemoAssetSlugs.includes(event.asset.slug),
    );
    const healthy =
      publishedRows.every((row) => row.published && row.publicMarketVisible) &&
      featured?.published === true &&
      featured.publicMarketVisible === true &&
      eventsReferenceOnlyFixtureAssets;

    process.stdout.write(
      `${JSON.stringify({
        result: healthy
          ? 'STAGING_DEMO_VAULT_LIVE_HEALTHY'
          : 'STAGING_DEMO_VAULT_LIVE_UNHEALTHY',
        projection: 'GET /api/v1/vault/live',
        featuredAsset: featured,
        counts: {
          expectedPublished: publishedStagingDemoAssetSlugs.length,
          publishedInDatabase: publishedRows.filter((row) => row.published)
            .length,
          visibleInMarketplace: publishedRows.filter(
            (row) => row.publicMarketVisible,
          ).length,
          publicVaultEvents: events.length,
          publicVaultEventAssets: eventAssetSlugs.size,
          aggregateTradeExecutions: executions,
        },
        eventSource: {
          safePublicEventsOnly: eventsReferenceOnlyFixtureAssets,
          note:
            'Zero events is a truthful empty Vault Live feed; this check never invents public lifecycle activity.',
        },
        assets: publishedRows,
      })}\n`,
    );
    if (!healthy) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Vault Live staging check failed.'}\n`,
  );
  process.exitCode = 1;
});
