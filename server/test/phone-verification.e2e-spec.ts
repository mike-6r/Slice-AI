import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';
import { LocalTestPhoneDelivery } from '../src/modules/identity/phone-verification/phone-verification.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
const run = `phone-verification-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';

describe('phone verification HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let delivery: LocalTestPhoneDelivery;
  let redis: RedisCacheStore;
  let inspector: Redis;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
      COOKIE_SECURE: 'false',
      TRUST_PROXY_HOPS: '1',
      PHONE_DELIVERY_MODE: 'local_test',
    });
    app = await createApp(AppModule);
    await app.init();
    prisma = app.get(PrismaService);
    delivery = app.get(LocalTestPhoneDelivery);
    redis = app.get(RedisCacheStore);
    await redis.connect();
    inspector = new Redis(redisUrl, { lazyConnect: true });
    await inspector.connect();
  });
  beforeEach(async () => {
    const keys = await inspector.keys('slice:test:auth-phone-*');
    if (keys.length) await inspector.del(...keys);
  });
  afterAll(async () => {
    await prisma.phoneVerificationChallenge.deleteMany({
      where: { user: { normalizedEmail: { startsWith: run } } },
    });
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: run } },
    });
    await app?.close();
    await inspector.quit();
  });
  it('sends only through the local test seam, verifies once, and exposes a safe projection', async () => {
    const user = await signup('first', ip('signup-first'));
    const phone = '+12025550103';
    const headers = auth(user, ip('phone-first'));
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/me/phone-verification/status')
          .set(headers)
      ).body,
    ).toMatchObject({ phonePresent: false, verified: false });
    const sent = await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/send')
      .set(headers)
      .send({ phone });
    expect(sent.status).toBe(201);
    expect(JSON.stringify(sent.body)).not.toMatch(/code|otp|hash/i);
    const code = delivery.codeForTest(user.body.user.id, phone)!;
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/confirm')
      .set(headers)
      .send({ phone, code: '000000' });
    expect(wrong.status).toBe(401);
    const confirmed = await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/confirm')
      .set(headers)
      .send({ phone, code });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      verified: true,
      phone: expect.stringMatching(/0103$/),
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(headers);
    expect(me.body).toMatchObject({
      phone,
      phoneVerified: true,
      phoneVerifiedAt: expect.any(String),
    });
    const replay = await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/confirm')
      .set(headers)
      .send({ phone, code });
    expect(replay.status).toBe(401);
  });
  it('keeps the verified phone authoritative until a new challenge is confirmed', async () => {
    const user = await signup('change', ip('signup-change'));
    const oldPhone = '+12025550104';
    const newPhone = '+12025550105';
    const headers = auth(user, ip('phone-change'));
    await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/send')
      .set(headers)
      .send({ phone: oldPhone });
    await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/confirm')
      .set(headers)
      .send({
        phone: oldPhone,
        code: delivery.codeForTest(user.body.user.id, oldPhone),
      });
    await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/send')
      .set(headers)
      .send({ phone: newPhone });
    expect(
      (await request(app.getHttpServer()).get('/api/v1/me').set(headers)).body
        .phone,
    ).toBe(oldPhone);
    await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/confirm')
      .set(headers)
      .send({
        phone: newPhone,
        code: delivery.codeForTest(user.body.user.id, newPhone),
      });
    expect(
      (await request(app.getHttpServer()).get('/api/v1/me').set(headers)).body
        .phone,
    ).toBe(newPhone);
  });
  it('keeps phone challenges isolated between users', async () => {
    const alice = await signup('alice', ip('signup-alice'));
    const bob = await signup('bob', ip('signup-bob'));
    const phone = '+12025550106';
    const aliceHeaders = auth(alice, ip('phone-alice'));
    const bobHeaders = auth(bob, ip('phone-bob'));
    await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/send')
      .set(aliceHeaders)
      .send({ phone });
    const aliceCode = delivery.codeForTest(alice.body.user.id, phone)!;
    const crossUser = await request(app.getHttpServer())
      .post('/api/v1/me/phone-verification/confirm')
      .set(bobHeaders)
      .send({ phone, code: aliceCode });
    expect(crossUser.status).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/me/phone-verification/status')
          .set(bobHeaders)
      ).body,
    ).toMatchObject({ phonePresent: false, verified: false });
  });
  it('fails safely when the configured delivery provider is unavailable', async () => {
    const previous = process.env.PHONE_DELIVERY_MODE;
    process.env.PHONE_DELIVERY_MODE = 'provider';
    const unavailable = (await createApp(AppModule)) as INestApplication;
    await unavailable.init();
    try {
      const signedUp = await request(unavailable.getHttpServer())
        .post('/api/v1/auth/signup')
        .set('idempotency-key', `${run}-provider-unavailable`)
        .set('x-forwarded-for', ip('signup-provider-unavailable'))
        .send({
          email: `${run}-provider-unavailable@example.test`,
          password,
          displayName: 'Unavailable provider user',
          username: `qa_provider_${run.replace(/[^a-z0-9]/gi, '').slice(-16)}`,
        });
      const response = await request(unavailable.getHttpServer())
        .post('/api/v1/me/phone-verification/send')
        .set('authorization', `Bearer ${signedUp.body.accessToken}`)
        .set('x-forwarded-for', ip('phone-provider-unavailable'))
        .send({ phone: '+12025550107' });
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('PHONE_DELIVERY_UNAVAILABLE');
      await expect(
        prisma.user.findUniqueOrThrow({ where: { id: signedUp.body.user.id } }),
      ).resolves.toMatchObject({ phoneE164: null, phoneVerifiedAt: null });
    } finally {
      await unavailable.close();
      if (previous === undefined) delete process.env.PHONE_DELIVERY_MODE;
      else process.env.PHONE_DELIVERY_MODE = previous;
    }
  });
  function signup(label: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('idempotency-key', `${run}-${label}`)
      .set('x-forwarded-for', ip)
      .send({
        email: `${run}-${label}@example.test`,
        password,
        displayName: `User ${label}`,
        username: `qa_${label}`,
      });
  }
  function auth(user: { body: { accessToken: string } }, ip: string) {
    return {
      authorization: `Bearer ${user.body.accessToken}`,
      'x-forwarded-for': ip,
    };
  }
  function ip(label: string) {
    return `phone-e2e-${run}-${label}`;
  }
});
