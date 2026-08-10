import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const id = `watch-e2e-${Date.now()}`;
describe('watchlist HTTP E2E', () => {
  let app: INestApplication;
  let db: PrismaService;
  let publicId: string;
  let auth: string;
  let userId: string;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: url,
      REDIS_URL: process.env.REDIS_URL,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
      COOKIE_SECURE: 'false',
      TRUST_PROXY_HOPS: '1',
    });
    app = await createApp(AppModule);
    await app.init();
    db = app.get(PrismaService);
    await db.category.create({
      data: { id: `${id}-cat`, slug: `${id}-cat`, name: 'C', sortOrder: 1 },
    });
    publicId = `ast_${id.replace(/-/g, '')}`;
    await db.asset.create({
      data: {
        id: `${id}-asset`,
        publicId,
        slug: `${id}-asset`,
        categoryId: `${id}-cat`,
        title: 'A',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('idempotency-key', `${id}-signup`)
      .send({
        email: `${id}@example.test`,
        password: 'a sufficiently strong password',
        displayName: 'Watcher',
      });
    expect(signup.status).toBe(201);
    userId = signup.body.user.id;
    auth = `Bearer ${signup.body.accessToken}`;
  });
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorUserId: userId } });
    await db.idempotencyRecord.deleteMany({
      where: { key: { startsWith: id } },
    });
    await db.watchlistItem.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.asset.deleteMany({ where: { publicId } });
    await db.category.deleteMany({ where: { id: `${id}-cat` } });
    await app.close();
  });
  it('enforces auth, durable replay/conflict, idempotent remove and audit', async () => {
    expect(
      (await request(app.getHttpServer()).get('/api/v1/me/watchlist')).status,
    ).toBe(401);
    const key = `${id}-add`;
    const first = await request(app.getHttpServer())
      .put(`/api/v1/me/watchlist/${publicId}`)
      .set('authorization', auth)
      .set('idempotency-key', key);
    expect(first.status).toBe(200);
    const replay = await request(app.getHttpServer())
      .put(`/api/v1/me/watchlist/${publicId}`)
      .set('authorization', auth)
      .set('idempotency-key', key);
    expect(replay.body).toEqual(first.body);
    expect(await db.watchlistItem.count({ where: { userId } })).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { actorUserId: userId, action: 'WATCHLIST.ADD' },
      }),
    ).toBe(1);
    expect(
      (
        await request(app.getHttpServer())
          .put(`/api/v1/me/watchlist/${publicId}`)
          .set('authorization', auth)
          .set('idempotency-key', key)
          .set('x-extra', 'x')
      ).status,
    ).toBe(200);
    const removeKey = `${id}-remove`;
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/api/v1/me/watchlist/${publicId}`)
          .set('authorization', auth)
          .set('idempotency-key', removeKey)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/api/v1/me/watchlist/${publicId}`)
          .set('authorization', auth)
          .set('idempotency-key', removeKey)
      ).status,
    ).toBe(200);
    expect(await db.watchlistItem.count({ where: { userId } })).toBe(0);
    expect(
      (
        await request(app.getHttpServer())
          .put('/api/v1/me/watchlist/missing')
          .set('authorization', auth)
          .set('idempotency-key', `${id}-missing`)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app.getHttpServer())
          .put(`/api/v1/me/watchlist/${publicId}`)
          .set('authorization', auth)
      ).status,
    ).toBe(400);
  });
});
