import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
const run = `account-lifecycle-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';

describe('customer data export and account lifecycle HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisCacheStore;
  let inspector: Redis;
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'test', TEST_DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256', COOKIE_SECURE: 'false', TRUST_PROXY_HOPS: '1' });
    app = await createApp(AppModule); await app.init(); prisma = app.get(PrismaService); redis = app.get(RedisCacheStore); await redis.connect(); inspector = new Redis(redisUrl, { lazyConnect: true }); await inspector.connect();
  });
  beforeEach(async () => { const keys = await inspector.keys('slice:test:auth-*'); if (keys.length) await inspector.del(...keys); });
  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { key: { startsWith: run } } });
    await prisma.accountDeletionRequest.deleteMany({ where: { user: { normalizedEmail: { startsWith: run } } } });
    await prisma.cashReservation.deleteMany({ where: { purposeId: { startsWith: run } } });
    await prisma.financialAccount.deleteMany({ where: { id: { startsWith: run } } });
    await prisma.user.deleteMany({ where: { normalizedEmail: { startsWith: run } } });
    await app?.close(); await inspector.quit();
  });

  it('returns an authenticated, safe, idempotent JSON export', async () => {
    const user = await signup('export', '198.51.100.141');
    const headers = { authorization: `Bearer ${user.body.accessToken}`, 'idempotency-key': `${run}-export`, 'x-forwarded-for': '198.51.100.142' };
    const first = await request(app.getHttpServer()).post('/api/v1/me/data-export').set(headers).send({ confirmation: 'EXPORT_MY_DATA' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ format: 'JSON', data: { account: { email: `${run}-export@example.test` }, preferences: { timezone: 'Europe/London', locale: 'en-GB' } } });
    expect(JSON.stringify(first.body)).not.toMatch(/passwordHash|tokenHash|secretCiphertext|accessTokenCiphertext|providerReferenceCiphertext|actorUserId/);
    const replay = await request(app.getHttpServer()).post('/api/v1/me/data-export').set(headers).send({ confirmation: 'EXPORT_MY_DATA' });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
  });

  it('keeps deletion requests self-only, durable, idempotent, and cancellable', async () => {
    const alice = await signup('delete-alice', '198.51.100.143');
    const bob = await signup('delete-bob', '198.51.100.144');
    const headers = { authorization: `Bearer ${alice.body.accessToken}`, 'idempotency-key': `${run}-delete`, 'x-forwarded-for': '198.51.100.145' };
    const requested = await request(app.getHttpServer()).post('/api/v1/me/deletion-request').set(headers).send({ confirmation: 'DELETE_MY_ACCOUNT' });
    expect(requested.status).toBe(201);
    expect(requested.body).toMatchObject({ status: 'REQUESTED', canCancel: true, blockedReason: null });
    const replay = await request(app.getHttpServer()).post('/api/v1/me/deletion-request').set(headers).send({ confirmation: 'DELETE_MY_ACCOUNT' });
    expect(replay.body).toEqual(requested.body);
    const bobState = await request(app.getHttpServer()).get('/api/v1/me/deletion-request').set('authorization', `Bearer ${bob.body.accessToken}`);
    expect(bobState.body).toEqual({});
    const cancelled = await request(app.getHttpServer()).post('/api/v1/me/deletion-request/cancel').set('authorization', `Bearer ${alice.body.accessToken}`).set('idempotency-key', `${run}-cancel`).set('x-forwarded-for', '198.51.100.146').send({});
    expect(cancelled.status).toBe(201);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', canCancel: false });
  });

  it('blocks lifecycle changes for active reservations, then deactivates an eligible account and revokes all sessions', async () => {
    const blocked = await signup('blocked', '198.51.100.147');
    const cash = await prisma.financialAccount.create({ data: { id: `${run}-blocked-cash`, ownerType: 'USER', ownerUserId: blocked.body.user.id, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await prisma.cashReservation.create({ data: { accountId: cash.id, purposeType: 'TEST', purposeId: `${run}-blocked`, amountMinor: 100, status: 'ACTIVE' } });
    const blockedHeaders = { authorization: `Bearer ${blocked.body.accessToken}`, 'idempotency-key': `${run}-blocked-deactivate`, 'x-forwarded-for': '198.51.100.148' };
    const denied = await request(app.getHttpServer()).post('/api/v1/me/deactivate').set(blockedHeaders).send({ confirmation: 'DEACTIVATE_MY_ACCOUNT' });
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe('DEACTIVATION_BLOCKED');
    const deletion = await request(app.getHttpServer()).post('/api/v1/me/deletion-request').set('authorization', `Bearer ${blocked.body.accessToken}`).set('idempotency-key', `${run}-blocked-delete`).set('x-forwarded-for', '198.51.100.149').send({ confirmation: 'DELETE_MY_ACCOUNT' });
    expect(deletion.body).toMatchObject({ status: 'BLOCKED', blockedReason: 'ACTIVE_RESERVATIONS' });

    const active = await signup('deactivate', '198.51.100.150');
    const other = await request(app.getHttpServer()).post('/api/v1/auth/login').set('x-forwarded-for', '198.51.100.151').send({ email: `${run}-deactivate@example.test`, password });
    const deactivated = await request(app.getHttpServer()).post('/api/v1/me/deactivate').set('authorization', `Bearer ${active.body.accessToken}`).set('idempotency-key', `${run}-deactivate`).set('x-forwarded-for', '198.51.100.152').send({ confirmation: 'DEACTIVATE_MY_ACCOUNT' });
    expect(deactivated.status).toBe(201);
    expect(deactivated.body.accountStatus).toBe('DEACTIVATED');
    const access = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${active.body.accessToken}`);
    expect(access.status).toBe(401);
    await expectRefreshFailure(readCookie(active));
    await expectRefreshFailure(readCookie(other));
    await expect(prisma.user.findUniqueOrThrow({ where: { id: active.body.user.id } })).resolves.toMatchObject({ accountStatus: 'DEACTIVATED' });
  });

  function signup(label: string, ip: string) { return request(app.getHttpServer()).post('/api/v1/auth/signup').set('idempotency-key', `${run}-${label}-signup`).set('x-forwarded-for', ip).send({ email: `${run}-${label}@example.test`, password, displayName: `User ${label}` }); }
  async function expectRefreshFailure(cookie: string) { const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('cookie', cookie); expect(response.status).toBe(401); }
});

function readCookie(response: { headers: Record<string, string> }) {
  const cookies = (response.headers as Record<string, unknown>)['set-cookie'];
  const value = Array.isArray(cookies) ? cookies.find((item): item is string => typeof item === 'string' && item.startsWith('slice_refresh=')) : undefined;
  if (!value) throw new Error('Expected a refresh cookie.');
  return value.split(';', 1)[0];
}
