import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Module,
  Param,
  Post,
  Req,
  type INestApplication,
} from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { APP_CONFIG, loadAppConfig } from '../src/config/app-config';
import { createApp } from '../src/create-app';
import {
  CACHE_STORE,
  RedisCacheStore,
} from '../src/infrastructure/redis/redis.store';
import { AuthAbuseService } from '../src/modules/identity/auth/auth-abuse.service';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL is required for auth abuse tests.');

const runId = `auth-abuse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = loadAppConfig({ NODE_ENV: 'test', REDIS_URL: redisUrl });
const cache = new RedisCacheStore(config);
const abuse = new AuthAbuseService(cache);
const inspector = new Redis(redisUrl, { lazyConnect: true });

type Operation = 'signup' | 'login' | 'refresh' | 'logout-all' | 'profile';

@Controller('test/auth-abuse')
class AuthAbuseTestController {
  constructor(private readonly abuse: AuthAbuseService) {}

  @Post(':operation')
  async enforce(
    @Param('operation') operation: Operation,
    @Body() body: { accountHint?: string },
    @Req() requestValue: { ip?: string },
  ) {
    await this.abuse.enforce(
      operation,
      requestValue.ip ?? 'unknown',
      body.accountHint,
    );
    return { accepted: true };
  }
}

@Module({
  controllers: [AuthAbuseTestController],
  providers: [
    { provide: APP_CONFIG, useValue: config },
    RedisCacheStore,
    { provide: CACHE_STORE, useExisting: RedisCacheStore },
    AuthAbuseService,
  ],
})
class AuthAbuseTestModule {}

describe('auth abuse Redis integration', () => {
  let app: INestApplication;
  let httpCache: RedisCacheStore;

  beforeAll(async () => {
    await cache.connect();
    await inspector.connect();
    app = await createApp(AuthAbuseTestModule);
    await app.init();
    httpCache = app.get(RedisCacheStore);
    await httpCache.connect();
  });

  afterAll(async () => {
    const keys = await inspector.keys('slice:test:auth-*');
    if (keys.length) await inspector.del(...keys);
    await httpCache.quit();
    await app?.close();
    await cache.quit();
    await inspector.quit();
  });

  it.each([
    ['signup', 5, true],
    ['login', 10, true],
    ['refresh', 120, false],
    ['logout-all', 5, true],
    ['profile', 5, true],
  ] as const)(
    'enforces the %s threshold against real Redis',
    async (operation, limit, includesAccount) => {
      const ip = `${runId}-${operation}-ip`;
      const account = `${runId}-${operation}@example.test`;
      for (let count = 0; count < limit; count += 1) {
        await expect(
          abuse.enforce(operation, ip, includesAccount ? account : undefined),
        ).resolves.toBeUndefined();
      }
      await expect(
        abuse.enforce(operation, ip, includesAccount ? account : undefined),
      ).rejects.toMatchObject({ status: 429 });
    },
  );

  it('uses separate operation, IP and account dimensions without raw identifiers', async () => {
    const ip = `${runId}-dimension-ip`;
    const account = `${runId}-dimension@example.test`;
    await abuse.enforce('signup', ip, account);
    await abuse.enforce('profile', ip, account);
    await abuse.enforce('signup', `${runId}-other-dimension-ip`, account);
    await abuse.enforce('signup', ip, `${runId}-other@example.test`);
    const secretAccountHint =
      'refresh-token-secret.slice_refresh=secret.session-identifier-secret';
    await abuse.enforce('logout-all', ip, secretAccountHint);

    const signupIp = cache.key('auth-signup-ip', digest(ip));
    const signupAccount = cache.key('auth-signup-account', digest(account));
    const profileIp = cache.key('auth-profile-ip', digest(ip));
    expect(signupIp).not.toBe(profileIp);
    await expect(cache.get(signupIp)).resolves.toBe('2');
    await expect(cache.get(signupAccount)).resolves.toBe('2');
    await expect(cache.get(profileIp)).resolves.toBe('1');

    const keys = await inspector.keys('slice:test:auth-*');
    const sensitive = [
      ip,
      account,
      `${runId}-other@example.test`,
      secretAccountHint,
      'refresh-token-secret',
      'slice_refresh=secret',
      'session-identifier-secret',
    ];
    for (const key of keys) {
      for (const value of sensitive) expect(key).not.toContain(value);
    }
    expect(keys).toContain(signupIp);
    expect(keys).toContain(signupAccount);
  });

  it('assigns a bounded TTL once and resets the counter after expiry', async () => {
    const ip = `${runId}-ttl-ip`;
    const account = `${runId}-ttl@example.test`;
    const key = cache.key('auth-signup-ip', digest(ip));
    await abuse.enforce('signup', ip, account);
    const firstTtl = await inspector.ttl(key);
    expect(firstTtl).toBeGreaterThan(3_590);
    expect(firstTtl).toBeLessThanOrEqual(3_600);
    await abuse.enforce('signup', ip, account);
    const secondTtl = await inspector.ttl(key);
    expect(secondTtl).toBeGreaterThan(0);
    expect(secondTtl).toBeLessThanOrEqual(firstTtl);

    await inspector.set(key, '4');
    expect(await inspector.ttl(key)).toBe(-1);
    await abuse.enforce('signup', ip, account);
    expect(await inspector.ttl(key)).toBeGreaterThan(0);

    await cache.expire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await abuse.enforce('signup', ip, account);
    await expect(cache.get(key)).resolves.toBe('1');
  });

  it('sets one bounded TTL during concurrent first limiter increments', async () => {
    const ip = `${runId}-concurrent-ip`;
    const key = cache.key('auth-refresh-ip', digest(ip));
    await inspector.del(key);
    await Promise.all(
      Array.from({ length: 10 }, () => abuse.enforce('refresh', ip)),
    );
    expect(await cache.get(key)).toBe('10');
    const ttl = await inspector.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3_600);
  });

  it('does not trust forwarded client IP values when zero proxy hops are configured', async () => {
    const keys = await inspector.keys('slice:test:auth-signup-*');
    if (keys.length) await inspector.del(...keys);
    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/test/auth-abuse/signup')
        .set('x-forwarded-for', `198.51.100.${index + 1}`)
        .send({ accountHint: `${runId}-proxy-${index}@example.test` })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/api/v1/test/auth-abuse/signup')
      .set('x-forwarded-for', '203.0.113.99')
      .send({ accountHint: `${runId}-proxy-limited@example.test` })
      .expect(429);
  });

  it('returns the canonical RATE_LIMITED envelope and propagates request IDs', async () => {
    const keys = await inspector.keys('slice:test:auth-signup-*');
    if (keys.length) await inspector.del(...keys);
    const accountHint = `${runId}-http@example.test`;
    for (let count = 0; count < 5; count += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/test/auth-abuse/signup')
        .send({ accountHint })
        .expect(201);
    }
    const requestId = '4d92ce2b-3d97-45fd-a568-a4d2d539e9bf';
    await request(app.getHttpServer())
      .post('/api/v1/test/auth-abuse/signup')
      .set('x-request-id', requestId)
      .send({ accountHint })
      .expect(429)
      .expect('x-request-id', requestId)
      .expect(
        ({
          body,
          headers,
        }: {
          body: Record<string, unknown>;
          headers: Record<string, string>;
        }) => {
          expect(body).toMatchObject({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests. Please retry later.',
            },
            requestId,
          });
          expect(Number(headers['retry-after'])).toBeGreaterThan(0);
        },
      );
  });

  it('does not make login or refresh limiter behavior reveal account or session existence', async () => {
    const ip = `${runId}-non-enumeration-ip`;
    const knownShape = `${runId}-known@example.test`;
    const unknownShape = `${runId}-unknown@example.test`;
    await expect(
      abuse.enforce('login', ip, knownShape),
    ).resolves.toBeUndefined();
    await expect(
      abuse.enforce('login', ip, unknownShape),
    ).resolves.toBeUndefined();
    await expect(abuse.enforce('refresh', ip)).resolves.toBeUndefined();
    const keys = await inspector.keys('slice:test:auth-*');
    expect(keys.some((key) => key.includes(knownShape))).toBe(false);
    expect(keys.some((key) => key.includes(unknownShape))).toBe(false);
  });

  it('fails closed during a supported Redis disconnect and recovers without restarting the app', async () => {
    await httpCache.quit();
    const requestId = 'b8b5a0d4-52fe-4d6d-93a4-00cf380a274d';
    await request(app.getHttpServer())
      .post('/api/v1/test/auth-abuse/profile')
      .set('x-request-id', requestId)
      .send({ accountHint: `${runId}-outage@example.test` })
      .expect(503)
      .expect('x-request-id', requestId)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          error: {
            code: 'PERSISTENCE_UNAVAILABLE',
            message: 'Service is temporarily unavailable.',
          },
          requestId,
        });
      });
    await httpCache.connect();
    await request(app.getHttpServer())
      .post('/api/v1/test/auth-abuse/profile')
      .send({ accountHint: `${runId}-outage@example.test` })
      .expect(201);
  });
});

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
