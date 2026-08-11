import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { assertStagingDemoSafety, demoAccounts } from './staging-demo-safety';

const publishedSlugs = [
  'slice-demo-charizard',
  'slice-demo-pikachu',
  'slice-demo-blastoise',
  'slice-demo-jordan',
  'slice-demo-mantle',
  'slice-demo-specialist-dark-magician',
  'slice-demo-specialist-black-lotus',
  'slice-demo-specialist-one-piece',
] as const;

async function main() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService);
    const config = app.get<AppConfig>(APP_CONFIG);
    const [investor, collector, collectorB, marketMaker, profiles, assets] = await Promise.all([
      db.user.findUnique({
        where: { normalizedEmail: demoAccounts.investor.email },
        select: { id: true, accountStatus: true },
      }),
      db.user.findUnique({
        where: { normalizedEmail: demoAccounts.collector.email },
        select: { id: true, accountStatus: true },
      }),
      db.user.findUnique({
        where: { normalizedEmail: demoAccounts.collectorB.email },
        select: { id: true, accountStatus: true },
      }),
      db.user.findUnique({
        where: { normalizedEmail: demoAccounts.marketMaker.email },
        select: { id: true, accountStatus: true },
      }),
      db.publicCollectorProfile.findMany({
        where: {
          isPublic: true,
          slug: { in: ['slice-demo-collector', 'slice-demo-specialist'] },
        },
        select: { userId: true, slug: true },
      }),
      db.asset.findMany({
        where: { slug: { in: [...publishedSlugs] }, status: 'PUBLISHED' },
        select: { id: true, slug: true },
      }),
    ]);
    if (!investor || !collector || !collectorB)
      throw new Error('Demo investor and collector identities are missing.');
    if (assets.length !== publishedSlugs.length)
      throw new Error(
        `Expected ${publishedSlugs.length} published demo assets; found ${assets.length}.`,
      );

    const assetIds = assets.map((asset) => asset.id);
    const [
      historyRows,
      investorWatchlist,
      collectorWatchlist,
      markets,
      orders,
      executions,
    ] = await Promise.all([
      db.assetValuationPoint.count({
        where: { assetId: { in: assetIds }, source: 'STAGING_DEMO_MARKET' },
      }),
      db.watchlistItem.count({
        where: { userId: investor.id, assetId: { in: assetIds } },
      }),
      db.watchlistItem.count({
        where: { userId: collector.id, assetId: { in: assetIds } },
      }),
      db.tradingMarket.count({ where: { assetId: { in: assetIds } } }),
      db.tradingOrder.count({ where: { assetId: { in: assetIds } } }),
      db.tradingExecution.count({ where: { assetId: { in: assetIds } } }),
    ]);
    const result = {
      result: 'STAGING_DEMO_MARKET_VERIFIED',
      accounts: {
        investor: investor.accountStatus,
        collector: collector.accountStatus,
        collectorB: collectorB.accountStatus,
        marketMaker: marketMaker?.accountStatus ?? 'NOT_CREATED',
      },
      publishedAssets: assets.length,
      publicCollectorProfiles: profiles.length,
      valuationHistoryRows: historyRows,
      watchlists: {
        investor: investorWatchlist,
        collector: collectorWatchlist,
      },
      trading: {
        configured: config.operationalFeatures.trading,
        providerMode: config.providerMode,
        markets,
        orders,
        executions,
      },
    };
    if (historyRows < publishedSlugs.length * 90)
      throw new Error(
        'Each published demo asset must have 90 staged valuation points.',
      );
    if (profiles.length < 2)
      throw new Error('Expected two public staging collector profiles.');
    if (investorWatchlist < 3 || collectorWatchlist < 3)
      throw new Error('Demo watchlists are incomplete.');
    if (
      config.operationalFeatures.trading &&
      config.providerMode === 'local' &&
      (markets !== publishedSlugs.length || executions < 2)
    )
      throw new Error('Configured staging trading fixture is incomplete.');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Staging demo market verification failed.'}\n`,
  );
  process.exitCode = 1;
});
