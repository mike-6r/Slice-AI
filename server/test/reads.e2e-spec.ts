import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const id = `reads-e2e-${Date.now()}`;
describe('Document 008 public read HTTP contracts', () => {
  let app: INestApplication;
  let db: PrismaService;
  let asset: string;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: databaseUrl,
      REDIS_URL: process.env.REDIS_URL,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
      COOKIE_SECURE: 'false',
    });
    app = await createApp(AppModule);
    await app.init();
    db = app.get(PrismaService);
    await db.category.create({
      data: { id: `${id}-cat`, slug: `${id}-cat`, name: 'C', sortOrder: 1 },
    });
    asset = (
      await db.asset.create({
        data: {
          id: `${id}-asset`,
          publicId: `ast_${id.replace(/-/g, '')}`,
          slug: `${id}-asset`,
          categoryId: `${id}-cat`,
          title: 'A',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
    ).id;
    const pub = await db.user.create({
      data: {
        id: `${id}-pub`,
        email: `${id}-pub@example.test`,
        normalizedEmail: `${id}-pub@example.test`,
        passwordHash: 'x',
        profile: { create: { displayName: 'Public' } },
      },
    });
    const priv = await db.user.create({
      data: {
        id: `${id}-priv`,
        email: `${id}-priv@example.test`,
        normalizedEmail: `${id}-priv@example.test`,
        passwordHash: 'x',
        profile: { create: { displayName: 'Private' } },
      },
    });
    const pub2 = await db.user.create({
      data: {
        id: `${id}-pub2`,
        email: `${id}-pub2@example.test`,
        normalizedEmail: `${id}-pub2@example.test`,
        passwordHash: 'x',
        profile: { create: { displayName: 'Public Two' } },
      },
    });
    await db.publicCollectorProfile.createMany({
      data: [
        { userId: pub.id, slug: `${id}-public`, isPublic: true },
        { userId: pub2.id, slug: `${id}-public-2`, isPublic: true },
        { userId: priv.id, slug: `${id}-private`, isPublic: false },
      ],
    });
    await db.assetSubmission.create({
      data: {
        ownerUserId: pub.id,
        assetId: asset,
        categoryId: `${id}-cat`,
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    });
    await db.assetMarketSnapshot.create({
      data: {
        assetId: asset,
        source: 'READS_E2E_TEST',
        asOf: new Date(),
        estimatedMarketValueMinor: 123450n,
        currency: 'GBP',
        change24hBps: 125,
        availableBps: 4500,
        ownersCount: 12,
        watchersCount: 4,
        confidence: 92,
        status: 'DEMO',
      },
    });
    await db.vaultPublicEvent.createMany({
      data: [
        {
          id: `${id}-event`,
          assetId: asset,
          type: 'STORED',
          occurredAt: new Date(),
          publicSummary: 'Stored safely',
          sourceRef: 'private',
        },
        {
          id: `${id}-event-2`,
          assetId: asset,
          type: 'RECEIVED',
          occurredAt: new Date(),
          publicSummary: 'Received safely',
          sourceRef: 'private-two',
        },
      ],
    });
  });
  afterAll(async () => {
    await db.vaultPublicEvent.deleteMany({ where: { id: { startsWith: id } } });
    await db.assetMarketSnapshot.deleteMany({ where: { assetId: asset } });
    await db.assetSubmission.deleteMany({ where: { assetId: asset } });
    await db.publicCollectorProfile.deleteMany({
      where: { slug: { startsWith: id } },
    });
    await db.user.deleteMany({
      where: { normalizedEmail: { startsWith: id } },
    });
    await db.asset.delete({ where: { id: asset } });
    await db.category.delete({ where: { id: `${id}-cat` } });
    await app.close();
  });
  it('paginates collectors and vault events with scoped cursors', async () => {
    const collectors = await request(app.getHttpServer()).get(
      '/api/v1/collectors?limit=1',
    );
    expect(collectors.status).toBe(200);
    expect(collectors.body.items).toHaveLength(1);
    expect(collectors.body.nextCursor).toEqual(expect.any(String));
    const collectorsNext = await request(app.getHttpServer()).get(
      `/api/v1/collectors?limit=1&cursor=${encodeURIComponent(collectors.body.nextCursor)}`,
    );
    expect(collectorsNext.status).toBe(200);
    expect(collectorsNext.body.items[0]?.slug).not.toBe(
      collectors.body.items[0]?.slug,
    );
    expect(
      (
        await request(app.getHttpServer()).get(
          '/api/v1/collectors?cursor=not-a-cursor',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer()).get(
          `/api/v1/vault/events?cursor=${encodeURIComponent(collectors.body.nextCursor)}`,
        )
      ).status,
    ).toBe(400);
    const vault = await request(app.getHttpServer()).get(
      '/api/v1/vault/events?limit=1',
    );
    expect(vault.status).toBe(200);
    expect(vault.body.nextCursor).toEqual(expect.any(String));
    const vaultNext = await request(app.getHttpServer()).get(
      `/api/v1/vault/events?limit=1&cursor=${encodeURIComponent(vault.body.nextCursor)}`,
    );
    expect(vaultNext.status).toBe(200);
    expect(vaultNext.body.items[0]?.id).not.toBe(vault.body.items[0]?.id);
    expect(
      (await request(app.getHttpServer()).get('/api/v1/vault/events?limit=0'))
        .status,
    ).toBe(400);
  });
  it('exposes only opted-in collectors and safe vault projections', async () => {
    const list = await request(app.getHttpServer()).get('/api/v1/collectors');
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: `${id}-public` }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(`${id}-private`);
    const publicProfile = list.body.items.find(
      (item: { slug: string }) => item.slug === `${id}-public`,
    );
    expect(publicProfile).toMatchObject({
      publishedListingCount: 1,
      publishedListings: [
        expect.objectContaining({
          slug: `${id}-asset`,
          title: 'A',
          category: 'C',
          market: expect.objectContaining({
            estimatedValueMinor: '123450',
            currency: 'GBP',
          }),
        }),
      ],
    });
    expect(JSON.stringify(publicProfile)).not.toContain(
      `${id}-pub@example.test`,
    );
    expect(JSON.stringify(publicProfile)).not.toContain('ownerUserId');
    const detail = await request(app.getHttpServer()).get(
      `/api/v1/collectors/${id}-private`,
    );
    expect(detail.body).not.toHaveProperty('email');
    const vault = await request(app.getHttpServer()).get(
      '/api/v1/vault/events',
    );
    expect(vault.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${id}-event`,
          publicSummary: 'Stored safely',
          type: 'STORED',
          assetSlug: `${id}-asset`,
        }),
      ]),
    );
    const publicVaultPayload = JSON.stringify(vault.body).toLowerCase();
    for (const forbidden of [
      'private',
      'sourceRef',
      'email',
      'phone',
      'wallet',
      'bank',
      'provider',
      'custody location',
      'internal note',
      'evidence',
      'compliance',
      'assignment',
    ]) {
      expect(publicVaultPayload).not.toContain(forbidden.toLowerCase());
    }
    expect(
      (await request(app.getHttpServer()).get('/api/v1/me/portfolio')).status,
    ).toBe(401);
  });
  it('projects Vault Live exclusively from safe public records', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/vault/live');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      dataStatus: 'LIVE_PUBLIC_PROJECTION',
      metrics: expect.objectContaining({
        publicVaultEvents: expect.any(Number),
        newlyPublished: expect.any(Number),
        valuationsUpdated: expect.any(Number),
        marketActivity: expect.any(String),
      }),
      publishedAssets: expect.arrayContaining([
        expect.objectContaining({ slug: `${id}-asset`, market: expect.anything() }),
      ]),
      recentEvents: expect.arrayContaining([
        expect.objectContaining({
          id: `${id}-event`,
          publicLabel: 'Vault readiness updated',
          asset: expect.objectContaining({ slug: `${id}-asset` }),
        }),
      ]),
    });
    const body = JSON.stringify(response.body).toLowerCase();
    for (const forbidden of ['sourceref', 'private', 'email', 'owneruserid', 'providerref']) {
      expect(body).not.toContain(forbidden);
    }
  });
});
