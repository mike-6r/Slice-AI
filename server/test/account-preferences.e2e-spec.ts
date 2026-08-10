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
const runId = `account-preferences-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';

describe('customer account preferences and activity HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisCacheStore;
  let inspector: Redis;

  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'test', TEST_DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256', COOKIE_SECURE: 'false', TRUST_PROXY_HOPS: '1' });
    app = await createApp(AppModule);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisCacheStore);
    await redis.connect();
    inspector = new Redis(redisUrl, { lazyConnect: true });
    await inspector.connect();
  });
  beforeEach(async () => {
    const keys = await inspector.keys('slice:test:auth-*');
    if (keys.length) await inspector.del(...keys);
  });
  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { key: { startsWith: runId } } });
    await prisma.user.deleteMany({ where: { normalizedEmail: { startsWith: runId } } });
    await app?.close();
    await inspector.quit();
  });

  it('persists safe preferences and rejects invalid or unsupported fields', async () => {
    const user = await signup('preferences', '198.51.100.121');
    const headers = { authorization: `Bearer ${user.body.accessToken}` };
    await expect(request(app.getHttpServer()).get('/api/v1/me/preferences').set(headers)).resolves.toMatchObject({ status: 200, body: { timezone: 'Europe/London', locale: 'en-GB' } });
    const patch = await request(app.getHttpServer()).patch('/api/v1/me/preferences').set(headers).set('idempotency-key', `${runId}-preferences-patch`).set('x-forwarded-for', '198.51.100.122').send({ timezone: 'America/New_York', locale: 'en-US' });
    expect(patch.status).toBe(200);
    expect(patch.body).toEqual({ timezone: 'America/New_York', locale: 'en-US' });
    const invalid = await request(app.getHttpServer()).patch('/api/v1/me/preferences').set(headers).set('idempotency-key', `${runId}-preferences-invalid`).set('x-forwarded-for', '198.51.100.123').send({ timezone: 'not/a-timezone' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_FAILED');
    const unsupported = await request(app.getHttpServer()).patch('/api/v1/me/preferences').set(headers).set('idempotency-key', `${runId}-preferences-unsupported`).set('x-forwarded-for', '198.51.100.124').send({ preferredCurrency: 'USD' });
    expect(unsupported.status).toBe(400);
  });

  it('projects customer-safe, paginated activity while excluding internal audit events', async () => {
    const user = await signup('activity', '198.51.100.125');
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set('x-forwarded-for', '198.51.100.126').send({ email: `${runId}-activity@example.test`, password });
    const headers = { authorization: `Bearer ${login.body.accessToken}` };
    await request(app.getHttpServer()).patch('/api/v1/me/preferences').set(headers).set('idempotency-key', `${runId}-activity-pref`).set('x-forwarded-for', '198.51.100.127').send({ locale: 'en-US' });
    await prisma.auditEvent.create({ data: { actorUserId: user.body.user.id, actorType: 'USER', action: 'ACCESS_DENIED', resourceType: 'internal', resourceId: user.body.user.id, result: 'SUCCESS', metadata: { ignored: true } } });
    const first = await request(app.getHttpServer()).get('/api/v1/me/activity?limit=1').set(headers);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({ type: 'PREFERENCES_UPDATED', metadata: {}, context: null });
    expect(JSON.stringify(first.body)).not.toMatch(/actorUserId|sessionId|token|hash|internal/);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app.getHttpServer()).get(`/api/v1/me/activity?limit=10&cursor=${encodeURIComponent(first.body.nextCursor)}`).set(headers);
    expect(second.status).toBe(200);
    expect(second.body.items.some((item: { type: string }) => item.type === 'LOGIN')).toBe(true);
    expect(second.body.items.some((item: { type: string }) => item.type === 'ACCESS_DENIED')).toBe(false);
  });

  it('enforces account activity and preferences as self-only projections', async () => {
    const alice = await signup('alice', '198.51.100.128');
    const bob = await signup('bob', '198.51.100.129');
    const aliceActivity = await request(app.getHttpServer()).get('/api/v1/me/activity').set('authorization', `Bearer ${alice.body.accessToken}`);
    const bobActivity = await request(app.getHttpServer()).get('/api/v1/me/activity').set('authorization', `Bearer ${bob.body.accessToken}`);
    expect(JSON.stringify(aliceActivity.body)).not.toContain(bob.body.user.id);
    expect(JSON.stringify(bobActivity.body)).not.toContain(alice.body.user.id);
    const unauthenticated = await request(app.getHttpServer()).get('/api/v1/me/preferences');
    expect(unauthenticated.status).toBe(401);
  });

  function signup(label: string, ip: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/signup').set('idempotency-key', `${runId}-${label}-signup`).set('x-forwarded-for', ip).send({ email: `${runId}-${label}@example.test`, password, displayName: `User ${label}` });
  }
});
