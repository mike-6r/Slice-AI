import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
const runId = `market-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;

describe('market HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let assetId: string;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
      COOKIE_SECURE: 'false',
      TRUST_PROXY_HOPS: '1',
    });
    app = await createApp(AppModule);
    await app.init();
    prisma = app.get(PrismaService);
    redis = new Redis(redisUrl, { lazyConnect: true });
    await redis.connect();
    const category = await prisma.category.create({
      data: {
        id: `${runId}-category`,
        slug: `${runId}-category`,
        name: 'Market fixture',
        sortOrder: 1,
      },
    });
    const asset = await prisma.asset.create({
      data: {
        id: `${runId}-asset`,
        publicId: `ast_${runId.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`,
        slug: `${runId}-asset`,
        categoryId: category.id,
        title: 'Published market fixture',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    assetId = asset.id;
    const now = new Date();
    await prisma.assetMarketSnapshot.create({
      data: {
        id: `${runId}-snapshot`,
        assetId,
        asOf: now,
        estimatedMarketValueMinor: 2458000n,
        currency: 'GBP',
        change24hBps: 1243,
        availableBps: 2460,
        ownersCount: 12,
        watchersCount: 30,
        confidence: 92,
        source: 'DEMO_FIXTURE',
        status: 'DEMO',
      },
    });
    await prisma.assetValuationPoint.createMany({
      data: [0, 1].map((days) => ({
        id: `${runId}-point-${days}`,
        assetId,
        observedAt: new Date(now.getTime() - days * 86400000),
        estimatedMarketValueMinor: BigInt(2400000 + days * 10000),
        currency: 'GBP',
        source: 'DEMO_FIXTURE',
        status: 'DEMO',
      })),
    });
    await prisma.marketSnapshot.create({
      data: {
        id: `${runId}-summary`,
        asOf: now,
        currency: 'GBP',
        totalEstimatedMarketValueMinor: 100000000n,
        volume24hMinor: 1200000n,
        activeAssetCount: 1,
        collectorCount: 0,
        source: 'DEMO_FIXTURE',
        status: 'DEMO',
      },
    });
  });
  afterAll(async () => {
    await prisma.assetValuationPoint.deleteMany({ where: { assetId } });
    await prisma.assetMarketSnapshot.deleteMany({ where: { assetId } });
    await prisma.asset.deleteMany({ where: { id: assetId } });
    await prisma.marketSnapshot.deleteMany({
      where: { id: `${runId}-summary` },
    });
    await prisma.category.deleteMany({ where: { id: `${runId}-category` } });
    await app.close();
    await redis.quit();
  });
  it('returns honest attributed estimated valuations and safe trading placeholders', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/market/assets')
      .query({ category: `${runId}-category` });
    expect(list.status).toBe(200);
    expect(list.body.items[0]).toMatchObject({
      slug: `${runId}-asset`,
      dataStatus: 'DEMO',
      estimatedMarketValue: { minor: '2458000', currency: 'GBP' },
    });
    expect(list.body.items[0].ownership).toBeNull();
    expect(JSON.stringify(list.body)).not.toMatch(/"price"|unitPrice/i);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/market/assets/${runId}-asset/history`)
          .query({ range: '7D' })
      ).body.points,
    ).toHaveLength(2);
    expect(
      (
        await request(app.getHttpServer()).get(
          `/api/v1/market/assets/${runId}-asset/order-book`,
        )
      ).body,
    ).toMatchObject({
      status: 'CLOSED',
      marketSequence: '0',
      bids: [],
      asks: [],
    });
    expect(
      (await request(app.getHttpServer()).get('/api/v1/market/summary')).body
        .dataStatus,
    ).toBe('DEMO');
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/market/assets')
          .query({ limit: 49 })
      ).status,
    ).toBe(400);
  });
});
