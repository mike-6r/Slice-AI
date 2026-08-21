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
const run = `signup-captcha-consent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';
const consent = { termsAccepted: true, privacyAccepted: true, termsVersion: 'terms-development-v1', privacyVersion: 'privacy-development-v1' };

describe('signup CAPTCHA and consent HTTP E2E', () => {
  let app: INestApplication; let db: PrismaService; let redis: RedisCacheStore; let inspector: Redis;
  beforeAll(async () => {
    Object.assign(process.env, { NODE_ENV: 'test', TEST_DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256', COOKIE_SECURE: 'false', TRUST_PROXY_HOPS: '1', CAPTCHA_ENABLED: 'true', CAPTCHA_PROVIDER: 'local_test', SIGNUP_CONSENT_REQUIRED: 'true', TERMS_POLICY_VERSION: consent.termsVersion, PRIVACY_POLICY_VERSION: consent.privacyVersion });
    app = await createApp(AppModule); await app.init(); db = app.get(PrismaService); redis = app.get(RedisCacheStore); await redis.connect(); inspector = new Redis(redisUrl, { lazyConnect: true }); await inspector.connect();
  });
  beforeEach(async () => { const keys = await inspector.keys('slice:test:auth-signup*'); if (keys.length) await inspector.del(...keys); const captchaKeys = await inspector.keys('slice:test:captcha-proof:*'); if (captchaKeys.length) await inspector.del(...captchaKeys); });
  afterAll(async () => { await db.user.deleteMany({ where: { normalizedEmail: { startsWith: run } } }); await app?.close(); await inspector.quit(); for (const key of ['CAPTCHA_ENABLED', 'CAPTCHA_PROVIDER', 'CAPTCHA_SECRET_KEY', 'SIGNUP_CONSENT_REQUIRED', 'TERMS_POLICY_VERSION', 'PRIVACY_POLICY_VERSION']) delete process.env[key]; });

  it('server-verifies a one-time local proof, creates consent evidence, and issues a normal unverified session', async () => {
    const email = `${run}-valid@example.test`; const key = `${run}-valid`; const token = `local-test:${run}-valid-proof`;
    const first = await signup({ email, key, token });
    expect(first.status).toBe(201); expect(first.body.user).toMatchObject({ email, emailVerificationStatus: 'UNVERIFIED', phoneVerified: false, twoFactorEnabled: false });
    const replay = await signup({ email, key, token });
    expect(replay.status).toBe(201); expect(replay.body.user).toEqual(first.body.user);
    await expect(db.user.count({ where: { normalizedEmail: email } })).resolves.toBe(1);
    await expect(db.consentAcceptance.count({ where: { userId: first.body.user.id } })).resolves.toBe(2);
    const projected = await request(app.getHttpServer()).get('/api/v1/me/consents').set('authorization', `Bearer ${first.body.accessToken}`);
    expect(projected.status).toBe(200); expect(projected.body).toMatchObject({ required: { termsVersion: consent.termsVersion, privacyVersion: consent.privacyVersion }, currentConsentSatisfied: true });
    expect(JSON.stringify(projected.body)).not.toMatch(/audit|accountId|metadata/i);
  });

  it('rejects missing, invalid, and replayed CAPTCHA proofs without creating an account', async () => {
    const missing = await signup({ email: `${run}-missing@example.test`, key: `${run}-missing`, token: undefined });
    expectError(missing, 400, 'CAPTCHA_VERIFICATION_FAILED');
    const invalid = await signup({ email: `${run}-invalid@example.test`, key: `${run}-invalid`, token: 'invalid-proof-value' });
    expectError(invalid, 400, 'CAPTCHA_VERIFICATION_FAILED');
    const token = `local-test:${run}-replay-proof`;
    expect((await signup({ email: `${run}-first@example.test`, key: `${run}-first`, token })).status).toBe(201);
    const replayed = await signup({ email: `${run}-second@example.test`, key: `${run}-second`, token });
    expectError(replayed, 400, 'CAPTCHA_VERIFICATION_FAILED');
    await expect(db.user.count({ where: { normalizedEmail: { in: [`${run}-missing@example.test`, `${run}-invalid@example.test`, `${run}-second@example.test`] } } })).resolves.toBe(0);
  });

  it('rejects missing or mismatched consent atomically and keeps consent history self-only', async () => {
    const noConsent = await signup({ email: `${run}-no-consent@example.test`, key: `${run}-no-consent`, token: `local-test:${run}-no-consent` , consentValue: null });
    expectError(noConsent, 400, 'REQUIRED_CONSENT_MISSING');
    const wrong = await signup({ email: `${run}-wrong-consent@example.test`, key: `${run}-wrong-consent`, token: `local-test:${run}-wrong-consent`, consentValue: { ...consent, privacyVersion: 'privacy-development-v0' } });
    expectError(wrong, 400, 'REQUIRED_CONSENT_MISSING');
    await expect(db.consentAcceptance.count({ where: { user: { normalizedEmail: { in: [`${run}-no-consent@example.test`, `${run}-wrong-consent@example.test`] } } } })).resolves.toBe(0);
  });

  it('fails closed when a configured Turnstile provider lacks its server secret', async () => {
    const previous = process.env.CAPTCHA_PROVIDER; const previousSecret = process.env.CAPTCHA_SECRET_KEY; const previousTurnstileSecret = process.env.TURNSTILE_SECRET_KEY; process.env.CAPTCHA_PROVIDER = 'cloudflare_turnstile'; delete process.env.CAPTCHA_SECRET_KEY; delete process.env.TURNSTILE_SECRET_KEY;
    const unavailable = (await createApp(AppModule)) as INestApplication; await unavailable.init();
    try {
      const response = await request(unavailable.getHttpServer()).post('/api/v1/auth/signup').set('idempotency-key', `${run}-provider`).set('x-forwarded-for', '198.51.100.241').send({ email: `${run}-provider@example.test`, password, displayName: 'Provider unavailable', username: 'qa_provider_unavailable', captchaToken: `local-test:${run}-provider-proof`, consent });
      expectError(response, 503, 'CAPTCHA_UNAVAILABLE');
      await expect(db.user.count({ where: { normalizedEmail: `${run}-provider@example.test` } })).resolves.toBe(0);
    } finally { await unavailable.close(); process.env.CAPTCHA_PROVIDER = previous; if (previousSecret === undefined) delete process.env.CAPTCHA_SECRET_KEY; else process.env.CAPTCHA_SECRET_KEY = previousSecret; if (previousTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = previousTurnstileSecret; }
  });

  function signup({ email, key, token, consentValue = consent }: { email: string; key: string; token?: string; consentValue?: typeof consent | null }) {
    return request(app.getHttpServer()).post('/api/v1/auth/signup').set('x-forwarded-for', `198.51.100.${Math.floor(Math.random() * 100)}`).set('idempotency-key', key).send({ email, password, displayName: 'Signup consent user', username: `qa_${email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').slice(-24)}`, ...(token ? { captchaToken: token } : {}), ...(consentValue ? { consent: consentValue } : {}) });
  }
});

function expectError(response: { status: number; body: Record<string, unknown> }, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.body).toMatchObject({ error: { code }, requestId: expect.any(String) });
}
