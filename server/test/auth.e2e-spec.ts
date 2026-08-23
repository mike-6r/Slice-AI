import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';
import { LocalTestEmailDelivery } from '../src/modules/identity/email-verification/email-verification.service';
import { generateTotpForTest } from '../src/modules/identity/two-factor/two-factor.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error(
    'TEST_DATABASE_URL and REDIS_URL are required for auth E2E tests.',
  );
}

const runId = `auth-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cookieName = 'slice_refresh';
const password = 'a sufficiently strong password';

describe('authentication HTTP E2E with PostgreSQL and Redis', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    });
    app = await createApp(AppModule);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisCacheStore);
    await redis.connect();
    inspector = new Redis(redisUrl, { lazyConnect: true });
    await inspector.connect();
  });

  beforeEach(async () => {
    await inspector.flushdb();
    const keys = await inspector.keys('slice:test:auth-*');
    if (keys.length) await inspector.del(...keys);
  });

  afterAll(async () => {
    const keys = await prisma.idempotencyRecord.findMany({
      where: { key: { startsWith: runId } },
      select: { id: true },
    });
    if (keys.length) {
      await prisma.idempotencyRecord.deleteMany({
        where: { id: { in: keys.map((record) => record.id) } },
      });
    }
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: runId } },
    });
    await app?.close();
    await inspector.quit();
  });

  it('exposes only the safe public signup policy needed by the client', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/signup-policy')
      .expect(200);
    expect(response.body).toMatchObject({
      captcha: {
        required: expect.any(Boolean),
        localTest: expect.any(Boolean),
      },
      consent: {
        required: expect.any(Boolean),
      },
    });
    expect(
      response.body.captcha.siteKey === null ||
        typeof response.body.captcha.siteKey === 'string',
    ).toBe(true);
    expect(
      response.body.consent.termsVersion === null ||
        typeof response.body.consent.termsVersion === 'string',
    ).toBe(true);
    expect(
      response.body.consent.privacyVersion === null ||
        typeof response.body.consent.privacyVersion === 'string',
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(
      /secret|provider|hostname|expectedaction/i,
    );
  });

  it('signs up with a safe public DTO, cookie, duplicate handling, and idempotency semantics', async () => {
    const email = `${runId}-signup@example.test`;
    const key = `${runId}-signup`;
    const first = await signup(email, key, 'Signup User', '198.51.100.1');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      user: {
        email,
        accountStatus: 'PENDING_REVIEW',
        profile: { displayName: 'Signup User' },
      },
      session: { id: expect.any(String), expiresAt: expect.any(String) },
      accessToken: expect.any(String),
      expiresIn: 900,
    });
    expectPublic(first.body);
    expectCookie(first, false);
    const firstCookie = readCookie(first);
    expect(firstCookie).toBeTruthy();

    const replay = await signup(email, key, 'Signup User', '198.51.100.1');
    expect(replay.status).toBe(201);
    expect(replay.body.user).toEqual(first.body.user);
    expect(readCookie(replay)).not.toEqual(firstCookie);
    await expect(
      prisma.user.count({ where: { normalizedEmail: email } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: {
          resourceId: first.body.user.id,
          action: 'AUTH_SIGNUP_SUCCEEDED',
        },
      }),
    ).resolves.toBe(1);
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { key, scope: 'auth.signup' },
    });
    expect(JSON.stringify(record.responseBody)).not.toMatch(
      /token|cookie|password|hash|normalizedemail|metadata/i,
    );

    const conflict = await signup(email, key, 'Changed Name', '198.51.100.1');
    expectError(conflict, 409, 'IDEMPOTENCY_KEY_CONFLICT');

    const isolated = await signup(
      `${runId}-isolated@example.test`,
      key,
      'Isolated Scope',
      '198.51.100.2',
    );
    expect(isolated.status).toBe(201);
    const duplicate = await signup(
      email.toUpperCase(),
      `${runId}-duplicate`,
      'Signup User',
      '198.51.100.3',
      password,
      `qa_dup_${runId.replace(/[^a-z0-9]/gi, '').slice(-18)}`,
    );
    expectError(duplicate, 409, 'EMAIL_ALREADY_REGISTERED');
  });

  it('validates signup input, unknown fields, password policy, and the real signup rate limit', async () => {
    const bad = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('idempotency-key', `${runId}-bad-signup`)
      .send({
        email: 'not-an-email',
        password: 'weak',
        displayName: 'X',
        role: 'ADMIN',
      });
    expectError(bad, 400, 'VALIDATION_FAILED');

    for (let index = 0; index < 5; index += 1) {
      const response = await signup(
        `${runId}-signup-rate-${index}@example.test`,
        `${runId}-signup-rate-${index}`,
        `Rate User ${index}`,
        '198.51.100.10',
      );
      expect(response.status).toBe(201);
    }
    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('x-forwarded-for', '198.51.100.10')
      .set('idempotency-key', `${runId}-signup-rate-limited`)
      .send({
        email: `${runId}-signup-rate-limited@example.test`,
        password,
        displayName: 'Rate Limited',
        username: `qa_rate_limited_${runId.replace(/[^a-z0-9]/gi, '').slice(-10)}`,
      });
    expectError(limited, 429, 'RATE_LIMITED');
  });

  it('logs in safely, remains non-enumerating, applies account status policy, and rate limits', async () => {
    const email = `${runId}-login@example.test`;
    await signup(email, `${runId}-login-signup`, 'Login User', '198.51.100.20');
    const success = await login(email, password, '198.51.100.21');
    expect(success.status).toBe(200);
    expect(success.body.accessToken).toEqual(expect.any(String));
    expectCookie(success, false);
    expectPublic(success.body);

    const unknown = await login(
      `${runId}-unknown@example.test`,
      password,
      '198.51.100.22',
    );
    const wrong = await login(email, 'an incorrect password', '198.51.100.23');
    expectError(unknown, 401, 'INVALID_CREDENTIALS');
    expectError(wrong, 401, 'INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, unexpected: true });
    expectError(invalid, 400, 'VALIDATION_FAILED');

    await prisma.user.update({
      where: { normalizedEmail: email },
      data: { accountStatus: 'RESTRICTED' },
    });
    const restricted = await login(email, password, '198.51.100.24');
    expectError(restricted, 401, 'INVALID_CREDENTIALS');
    await prisma.user.update({
      where: { normalizedEmail: email },
      data: { accountStatus: 'PENDING_REVIEW' },
    });

    const rateIp = '198.51.100.25';
    for (let index = 0; index < 10; index += 1) {
      const response = await login(
        `${runId}-login-rate@example.test`,
        password,
        rateIp,
      );
      expectError(response, 401, 'INVALID_CREDENTIALS');
    }
    const limited = await login(
      `${runId}-login-rate@example.test`,
      password,
      rateIp,
    );
    expectError(limited, 429, 'RATE_LIMITED');
  });

  it('rotates refresh credentials, detects replay-family compromise, and handles invalid refresh input safely', async () => {
    const email = `${runId}-refresh@example.test`;
    const created = await signup(
      email,
      `${runId}-refresh-signup`,
      'Refresh User',
      '198.51.100.30',
    );
    const oldCookie = readCookie(created)!;
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('x-forwarded-for', '198.51.100.31')
      .set('cookie', oldCookie);
    expect(rotated.status).toBe(200);
    expectCookie(rotated, false);
    expect(readCookie(rotated)).not.toEqual(oldCookie);
    expectPublic(rotated.body);
    expect(JSON.stringify(rotated.body)).not.toMatch(
      /refreshToken|cookie|hash/i,
    );

    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('x-forwarded-for', '198.51.100.31')
      .set('cookie', oldCookie);
    expectError(replay, 401, 'REFRESH_TOKEN_REUSED');
    const revokedSession = await request(app.getHttpServer())
      .get('/api/v1/session')
      .set('authorization', `Bearer ${rotated.body.accessToken}`);
    expectError(revokedSession, 401, 'AUTHENTICATION_REQUIRED');

    const missing = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('x-forwarded-for', '198.51.100.32');
    expectError(missing, 400, 'REFRESH_TOKEN_INVALID');
    const malformed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('x-forwarded-for', '198.51.100.33')
      .set('cookie', `${cookieName}=not-a-real-refresh-token`);
    expectError(malformed, 401, 'REFRESH_TOKEN_INVALID');
    const malformedEncoding = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('x-forwarded-for', '198.51.100.34')
      .set('cookie', `${cookieName}=%`);
    expectError(malformedEncoding, 400, 'REFRESH_TOKEN_INVALID');
  });

  it('logs out, clears the cookie, and prevents the revoked session from reading session or profile data', async () => {
    const created = await signup(
      `${runId}-logout@example.test`,
      `${runId}-logout-signup`,
      'Logout User',
      '198.51.100.40',
    );
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('cookie', readCookie(created)!);
    expect(logout.status).toBe(204);
    expectClearedCookie(logout);
    for (const path of ['/api/v1/session', '/api/v1/me']) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set('authorization', `Bearer ${created.body.accessToken}`);
      expectError(response, 401, 'AUTHENTICATION_REQUIRED');
    }
    const profile = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', `${runId}-logout-revoked-profile`)
      .send({ displayName: 'Revoked Attempt' });
    expectError(profile, 401, 'AUTHENTICATION_REQUIRED');
    const retry = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${created.body.accessToken}`);
    expectError(retry, 401, 'AUTHENTICATION_REQUIRED');
  });

  it('preserves an opaque password across signup, logout, login, and a fresh application instance', async () => {
    const email = `${runId}-signup-logout-login@example.test`;
    const exactPassword = 'Slice Auth! Mixed Case 2026';
    const created = await signup(
      email,
      `${runId}-signup-logout-login`,
      'Credential Regression User',
      '198.51.100.45',
      exactPassword,
    );
    expect(created.status).toBe(201);

    const storedBeforeLogout = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
      select: { passwordHash: true, updatedAt: true },
    });
    expect(storedBeforeLogout.passwordHash).toMatch(/^\$argon2id\$/);
    expect(storedBeforeLogout.passwordHash.length).toBeGreaterThan(80);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('cookie', readCookie(created)!);
    expect(logout.status).toBe(204);
    expectClearedCookie(logout);

    const storedAfterLogout = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
      select: { passwordHash: true, updatedAt: true },
    });
    expect(storedAfterLogout.passwordHash).toBe(storedBeforeLogout.passwordHash);
    expect(storedAfterLogout.updatedAt).toEqual(storedBeforeLogout.updatedAt);

    const firstLogin = await login(email, exactPassword, '198.51.100.46');
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.accessToken).toEqual(expect.any(String));
    expectCookie(firstLogin, false);

    const restartedApp = await createApp(AppModule);
    await restartedApp.init();
    try {
      const afterReinitialization = await request(restartedApp.getHttpServer() as never)
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', '198.51.100.47')
        .send({ email, password: exactPassword });
      expect(afterReinitialization.status).toBe(200);
      expect(afterReinitialization.body.accessToken).toEqual(expect.any(String));
      expectCookie(afterReinitialization, false);
    } finally {
      await restartedApp.close();
    }

    const wrongPassword = await login(email, `${exactPassword}!`, '198.51.100.48');
    expectError(wrongPassword, 401, 'INVALID_CREDENTIALS');
  });

  it('uses the same opaque password semantics for ASCII, spaces, symbols, mixed case, and long values', async () => {
    const cases = [
      'PlainAsciiPassword12',
      'Internal spaces 2026!',
      'Symbols!@#$%^&*()_+-=12',
      'MiXeD CaSe 2026! Slice',
      `Long-${'password-segment-'.repeat(6)}2026!`,
    ];

    for (const [index, candidate] of cases.entries()) {
      const email = `${runId}-opaque-${index}@example.test`;
      const created = await signup(
        email,
        `${runId}-opaque-${index}`,
        `Opaque Password ${index}`,
        `198.51.101.${index + 1}`,
        candidate,
      );
      expect(created.status).toBe(201);
      const loggedIn = await login(email, candidate, `198.51.102.${index + 1}`);
      expect(loggedIn.status).toBe(200);
      expectCookie(loggedIn, false);
    }
  });

  it('logs out all sessions, clears cookies, revokes both refresh credentials, and rejects invalid idempotency use', async () => {
    const email = `${runId}-logout-all@example.test`;
    const created = await signup(
      email,
      `${runId}-logout-all-signup`,
      'Logout All User',
      '198.51.100.50',
    );
    const second = await login(email, password, '198.51.100.51');
    const key = `${runId}-logout-all`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('cookie', readCookie(created)!)
      .set('idempotency-key', key)
      .set('x-forwarded-for', '198.51.100.52');
    expect(response.status).toBe(204);
    expectClearedCookie(response);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', key)
      .set('x-forwarded-for', '198.51.100.52');
    expect(replay.status).toBe(204);
    await expect(
      prisma.auditEvent.count({
        where: { resourceId: created.body.user.id, action: 'AUTH_LOGOUT_ALL' },
      }),
    ).resolves.toBe(1);

    const freshSession = await login(email, password, '198.51.100.59');
    expect(freshSession.status).toBe(200);
    const revokedWithNewKey = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', `${runId}-logout-all-new-key`)
      .set('x-forwarded-for', '198.51.100.52');
    expectError(revokedWithNewKey, 401, 'AUTHENTICATION_REQUIRED');
    const freshSessionStillActive = await request(app.getHttpServer())
      .get('/api/v1/session')
      .set('authorization', `Bearer ${freshSession.body.accessToken}`);
    expect(freshSessionStillActive.status).toBe(200);

    const conflictKey = `${runId}-logout-all-conflict`;
    await prisma.idempotencyRecord.create({
      data: {
        id: `${runId}-logout-all-conflict-record`,
        actorScope: `user:${created.body.user.id}`,
        scope: 'auth.logout-all',
        key: conflictKey,
        requestHash: 'not-the-logout-all-fingerprint',
        status: 'COMPLETED',
        responseStatus: 200,
        responseBody: { revokedSessionCount: 1 },
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const revokedWithConflict = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', conflictKey)
      .set('x-forwarded-for', '198.51.100.52');
    expectError(revokedWithConflict, 401, 'AUTHENTICATION_REQUIRED');

    const inProgressKey = `${runId}-logout-all-in-progress`;
    await prisma.idempotencyRecord.create({
      data: {
        id: `${runId}-logout-all-in-progress-record`,
        actorScope: `user:${created.body.user.id}`,
        scope: 'auth.logout-all',
        key: inProgressKey,
        requestHash: 'still-not-a-completed-replay',
        status: 'PROCESSING',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const revokedWithInProgress = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', inProgressKey)
      .set('x-forwarded-for', '198.51.100.52');
    expectError(revokedWithInProgress, 401, 'AUTHENTICATION_REQUIRED');
    for (const cookie of [readCookie(created)!, readCookie(second)!]) {
      const refresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-forwarded-for', `198.51.100.${53 + (cookie.length % 10)}`)
        .set('cookie', cookie);
      expectError(refresh, 401, 'REFRESH_TOKEN_REUSED');
    }
    const missingKey = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('authorization', `Bearer ${created.body.accessToken}`);
    expectError(missingKey, 401, 'AUTHENTICATION_REQUIRED');
  });

  it('returns protected session and me DTOs only to an active authenticated session', async () => {
    const created = await signup(
      `${runId}-reads@example.test`,
      `${runId}-reads-signup`,
      'Reads User',
      '198.51.100.60',
    );
    for (const path of ['/api/v1/session', '/api/v1/me']) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set('authorization', `Bearer ${created.body.accessToken}`);
      expect(response.status).toBe(200);
      expectPublic(response.body.user ?? response.body);
    }
    const noToken = await request(app.getHttpServer()).get('/api/v1/me');
    expectError(noToken, 401, 'AUTHENTICATION_REQUIRED');
    await prisma.user.update({
      where: { id: created.body.user.id },
      data: { accountStatus: 'SUSPENDED' },
    });
    const suspended = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${created.body.accessToken}`);
    expectError(suspended, 401, 'AUTHENTICATION_REQUIRED');
  });

  it('updates profiles with validation and durable replay protection without private fields', async () => {
    const created = await signup(
      `${runId}-profile@example.test`,
      `${runId}-profile-signup`,
      'Profile User',
      '198.51.100.70',
    );
    await prisma.userProfile.update({
      where: { userId: created.body.user.id },
      data: { usernameChangedAt: null },
    });
    const key = `${runId}-profile-update`;
    const username = `p${runId.replace(/[^a-z0-9]/gi, '').slice(-20)}`;
    const patch = { displayName: 'Updated Profile', username };
    const first = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', key)
      .set('x-forwarded-for', '198.51.100.71')
      .send(patch);
    expect(first.status).toBe(200);
    expect(first.body.profile).toMatchObject({
      displayName: 'Updated Profile',
      username,
    });
    expectPublic(first.body);
    const profileAfterFirst = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: created.body.user.id },
    });
    const replay = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', key)
      .set('x-forwarded-for', '198.51.100.71')
      .send(patch);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    const profileAfterReplay = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: created.body.user.id },
    });
    expect(profileAfterReplay.updatedAt).toEqual(profileAfterFirst.updatedAt);
    await expect(
      prisma.auditEvent.count({
        where: {
          resourceId: created.body.user.id,
          action: 'AUTH_PROFILE_UPDATED',
        },
      }),
    ).resolves.toBe(1);
    const conflict = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', key)
      .send({ displayName: 'Different Profile' });
    expectError(conflict, 409, 'IDEMPOTENCY_KEY_CONFLICT');
    const empty = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', `${runId}-profile-empty`)
      .send({});
    expectError(empty, 400, 'VALIDATION_FAILED');
    const unsafe = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${created.body.accessToken}`)
      .set('idempotency-key', `${runId}-profile-unsafe`)
      .send({ displayName: '  Trimmed  ', accountStatus: 'ACTIVE' });
    expectError(unsafe, 400, 'VALIDATION_FAILED');
  });

  it('enforces profile-update, logout-all, and refresh limits through the HTTP endpoints', async () => {
    const profile = await signup(
      `${runId}-profile-rate@example.test`,
      `${runId}-profile-rate-signup`,
      'Profile Rate User',
      '198.51.100.72',
    );
    for (let index = 0; index < 5; index += 1) {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('authorization', `Bearer ${profile.body.accessToken}`)
        .set('idempotency-key', `${runId}-profile-rate-${index}`)
        .set('x-forwarded-for', '198.51.100.73')
        .send({ displayName: `Profile Rate ${index}` });
      expect(response.status).toBe(200);
    }
    const profileLimited = await request(app.getHttpServer())
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${profile.body.accessToken}`)
      .set('idempotency-key', `${runId}-profile-rate-limited`)
      .set('x-forwarded-for', '198.51.100.73')
      .send({ displayName: 'Profile Rate Limited' });
    expectError(profileLimited, 429, 'RATE_LIMITED');

    const logoutIp = '198.51.100.74';
    for (let index = 0; index < 6; index += 1) {
      const created = await signup(
        `${runId}-logout-rate-${index}@example.test`,
        `${runId}-logout-rate-signup-${index}`,
        `Logout Rate ${index}`,
        `198.51.100.${75 + index}`,
      );
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('authorization', `Bearer ${created.body.accessToken}`)
        .set('idempotency-key', `${runId}-logout-rate-${index}`)
        .set('x-forwarded-for', logoutIp);
      if (index < 5) expect(response.status).toBe(204);
      else expectError(response, 429, 'RATE_LIMITED');
    }

    const refreshIp = `${runId}-refresh`;
    for (let index = 0; index < 10; index += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('x-forwarded-for', refreshIp);
      expectError(response, 400, 'REFRESH_TOKEN_INVALID');
    }
    const refreshLimited = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('x-forwarded-for', refreshIp);
    expectError(refreshLimited, 429, 'RATE_LIMITED');
  });

  it('enforces CORS and fails closed safely while Redis is disconnected, then recovers', async () => {
    await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('origin', 'http://127.0.0.1:4173')
      .set('access-control-request-method', 'POST')
      .expect(204)
      .expect('access-control-allow-origin', 'http://127.0.0.1:4173')
      .expect('access-control-allow-credentials', 'true');
    await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('origin', 'https://untrusted.example')
      .set('access-control-request-method', 'POST')
      .expect(({ headers }: { headers: Record<string, string> }) => {
        expect(headers['access-control-allow-origin']).toBeUndefined();
      });
    await redis.quit();
    const requestId = 'dd06bb43-3a57-4f77-8ee4-9c0f41ff63cc';
    const outage = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('x-request-id', requestId)
      .set('idempotency-key', `${runId}-outage`)
      .send({
        email: `${runId}-outage@example.test`,
        password,
        displayName: 'Outage User',
        username: `qa_outage_${runId.replace(/[^a-z0-9]/gi, '').slice(-12)}`,
      });
    expectError(outage, 503, 'PERSISTENCE_UNAVAILABLE');
    expect(outage.body.requestId).toBe(requestId);
    expect(JSON.stringify(outage.body)).not.toMatch(
      /redis|postgres|stack|password/i,
    );
    await redis.connect();
    const recovered = await signup(
      `${runId}-recovered@example.test`,
      `${runId}-recovered`,
      'Recovered User',
      '198.51.100.80',
    );
    expect(recovered.status).toBe(201);
  });

  it('verifies email through the safe local-test delivery seam without exposing proof internals', async () => {
    const anonymous = await request(app.getHttpServer()).get(
      '/api/v1/me/email-verification/status',
    );
    expect(anonymous.status).toBe(401);
    const first = await signup(
      `${runId}-email-verify@example.test`,
      `${runId}-email-verify-signup`,
      'Email Verification User',
      '198.51.100.91',
    );
    const second = await signup(
      `${runId}-email-isolation@example.test`,
      `${runId}-email-isolation-signup`,
      'Email Isolation User',
      '198.51.100.92',
    );
    const unverified = await request(app.getHttpServer())
      .get('/api/v1/me/email-verification/status')
      .set('authorization', `Bearer ${first.body.accessToken}`);
    expect(unverified.status).toBe(200);
    expect(unverified.body).toEqual({
      verified: false,
      verifiedAt: null,
      resendAvailableAt: null,
    });
    const sent = await request(app.getHttpServer())
      .post('/api/v1/me/email-verification/send')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.93');
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      alreadyVerified: false,
      resendAvailableAt: expect.any(String),
    });
    expect(JSON.stringify(sent.body)).not.toMatch(/token|hash|delivery/i);
    const token = app
      .get(LocalTestEmailDelivery)
      .tokenForTest(first.body.user.id);
    expect(token).toBeTruthy();
    const persisted = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: first.body.user.id },
    });
    expect(persisted.tokenHash).not.toContain(token!);
    const confirmed = await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/confirm')
      .set('x-forwarded-for', '198.51.100.94')
      .send({ token });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      verified: true,
      verifiedAt: expect.any(String),
    });
    const status = await request(app.getHttpServer())
      .get('/api/v1/me/email-verification/status')
      .set('authorization', `Bearer ${first.body.accessToken}`);
    expect(status.body).toMatchObject({
      verified: true,
      verifiedAt: expect.any(String),
      resendAvailableAt: null,
    });
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${first.body.accessToken}`);
    expect(me.body).toMatchObject({
      emailVerified: true,
      emailVerificationStatus: 'VERIFIED',
      emailVerifiedAt: expect.any(String),
    });
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/confirm')
      .set('x-forwarded-for', '198.51.100.95')
      .send({ token });
    expectError(replay, 401, 'EMAIL_VERIFICATION_INVALID');
    const alreadyVerified = await request(app.getHttpServer())
      .post('/api/v1/me/email-verification/send')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.96');
    expect(alreadyVerified.body).toEqual({
      alreadyVerified: true,
      resendAvailableAt: null,
    });
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId: first.body.user.id },
      }),
    ).toBe(1);
    const otherStatus = await request(app.getHttpServer())
      .get('/api/v1/me/email-verification/status')
      .set('authorization', `Bearer ${second.body.accessToken}`);
    expect(otherStatus.body).toEqual({
      verified: false,
      verifiedAt: null,
      resendAvailableAt: null,
    });
  });

  it('throttles verification sends through the existing Redis abuse authority', async () => {
    const user = await signup(
      `${runId}-email-rate@example.test`,
      `${runId}-email-rate-signup`,
      'Email Rate User',
      '198.51.100.97',
    );
    const ip = '198.51.100.98';
    for (let index = 0; index < 5; index += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/me/email-verification/send')
        .set('authorization', `Bearer ${user.body.accessToken}`)
        .set('x-forwarded-for', ip);
      expect(response.status).toBe(201);
    }
    const limited = await request(app.getHttpServer())
      .post('/api/v1/me/email-verification/send')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', ip);
    expectError(limited, 429, 'RATE_LIMITED');
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId: user.body.user.id },
      }),
    ).toBe(1);
  });

  it('requires server-authoritative recent password confirmation before TOTP enrollment', async () => {
    const user = await signup(
      `${runId}-recent-auth@example.test`,
      `${runId}-recent-auth-signup`,
      'Recent Auth User',
      '198.51.100.123',
    );
    await prisma.session.updateMany({
      where: { userId: user.body.user.id },
      data: { recentAuthAt: new Date(Date.now() - 86_400_000) },
    });
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/enroll')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.124');
    expectError(blocked, 403, 'RECENT_AUTH_REQUIRED');

    const wrong = await request(app.getHttpServer())
      .post('/api/v1/me/security/recent-auth')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.125')
      .send({ password: 'incorrect-password' });
    expectError(wrong, 401, 'RECENT_AUTH_INVALID');

    const confirmed = await request(app.getHttpServer())
      .post('/api/v1/me/security/recent-auth')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.126')
      .send({ password });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.confirmedAt).toEqual(expect.any(String));

    const enrollment = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/enroll')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.127');
    expect(enrollment.status).toBe(201);
    expect(enrollment.body.expiresAt).toEqual(expect.any(String));
    await expect(
      prisma.auditEvent.findFirst({
        where: { actorUserId: user.body.user.id, action: 'RECENT_AUTH_CONFIRMED' },
      }),
    ).resolves.toMatchObject({ result: 'SUCCESS' });
  });

  it('enrolls, challenges, recovers, regenerates, and disables TOTP without creating a pre-2FA session', async () => {
    const first = await signup(
      `${runId}-two-factor@example.test`,
      `${runId}-two-factor-signup`,
      'Two Factor User',
      '198.51.100.101',
    );
    const second = await signup(
      `${runId}-two-factor-isolation@example.test`,
      `${runId}-two-factor-isolation-signup`,
      'Two Factor Isolation User',
      '198.51.100.102',
    );
    const before = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${first.body.accessToken}`);
    expect(before.body).toMatchObject({
      twoFactorEnabled: false,
      twoFactorEnabledAt: null,
    });
    const enrollment = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/enroll')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.103');
    expect(enrollment.status).toBe(201);
    expect(enrollment.body).toMatchObject({
      issuer: 'Slice',
      accountLabel: `${runId}-two-factor@example.test`,
      manualEntryKey: expect.stringMatching(/^[A-Z2-7]+$/),
      otpauthUri: expect.stringMatching(/^otpauth:\/\/totp\//),
    });
    const wrongConfirm = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/confirm')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.104')
      .send({ code: '000000' });
    expectError(wrongConfirm, 401, 'TWO_FACTOR_INVALID');
    const code = await generateTotpForTest(enrollment.body.manualEntryKey);
    const confirmed = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/confirm')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.105')
      .send({ code });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.recoveryCodes).toHaveLength(8);
    expect(JSON.stringify(confirmed.body)).not.toMatch(/secret|hash|cipher/i);
    const firstRecoveryCode = confirmed.body.recoveryCodes[0] as string;
    const enabled = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${first.body.accessToken}`);
    expect(enabled.body).toMatchObject({
      twoFactorEnabled: true,
      twoFactorEnabledAt: expect.any(String),
    });
    const otherStatus = await request(app.getHttpServer())
      .get('/api/v1/me/2fa/status')
      .set('authorization', `Bearer ${second.body.accessToken}`);
    expect(otherStatus.body).toEqual({ enabled: false, enabledAt: null });

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .expect(204);
    const passwordLogin = await login(
      `${runId}-two-factor@example.test`,
      password,
      '198.51.100.106',
    );
    expect(passwordLogin.status).toBe(200);
    expect(passwordLogin.body).toMatchObject({
      requiresTwoFactor: true,
      challenge: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(readCookie(passwordLogin)).toBeUndefined();
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    const wrongLoginCode = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', '198.51.100.107')
      .send({ challenge: passwordLogin.body.challenge, code: '000000' });
    expectError(wrongLoginCode, 401, 'TWO_FACTOR_INVALID');
    const verifiedLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', '198.51.100.108')
      .send({ challenge: passwordLogin.body.challenge, code });
    expect(verifiedLogin.status).toBe(200);
    expect(verifiedLogin.body.accessToken).toEqual(expect.any(String));
    expect(readCookie(verifiedLogin)).toContain(`${cookieName}=`);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', '198.51.100.109')
      .send({ challenge: passwordLogin.body.challenge, code });
    expectError(replay, 401, 'TWO_FACTOR_INVALID');

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${verifiedLogin.body.accessToken}`)
      .expect(204);
    const recoveryLogin = await login(
      `${runId}-two-factor@example.test`,
      password,
      '198.51.100.110',
    );
    const recoveryVerified = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', '198.51.100.111')
      .send({
        challenge: recoveryLogin.body.challenge,
        recoveryCode: firstRecoveryCode,
      });
    expect(recoveryVerified.status).toBe(200);
    const regenerated = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/recovery-codes/regenerate')
      .set('authorization', `Bearer ${recoveryVerified.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.112');
    expect(regenerated.status).toBe(201);
    expect(regenerated.body.recoveryCodes).toHaveLength(8);
    const newRecoveryCode = regenerated.body.recoveryCodes[0] as string;
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${recoveryVerified.body.accessToken}`)
      .expect(204);
    const oldRecoveryLogin = await login(
      `${runId}-two-factor@example.test`,
      password,
      '198.51.100.113',
    );
    const oldRecovery = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', '198.51.100.114')
      .send({
        challenge: oldRecoveryLogin.body.challenge,
        recoveryCode: firstRecoveryCode,
      });
    expectError(oldRecovery, 401, 'TWO_FACTOR_INVALID');
    const newRecovery = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', '198.51.100.115')
      .send({
        challenge: oldRecoveryLogin.body.challenge,
        recoveryCode: newRecoveryCode,
      });
    expect(newRecovery.status).toBe(200);
    const disableCode = await generateTotpForTest(
      enrollment.body.manualEntryKey,
    );
    const disabled = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/disable')
      .set('authorization', `Bearer ${newRecovery.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.116')
      .send({ code: disableCode });
    expect(disabled.status).toBe(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${newRecovery.body.accessToken}`)
      .expect(204);
    const normalLogin = await login(
      `${runId}-two-factor@example.test`,
      password,
      '198.51.100.117',
    );
    expect(normalLogin.status).toBe(200);
    expect(normalLogin.body.requiresTwoFactor).toBeUndefined();
    expect(normalLogin.body.accessToken).toEqual(expect.any(String));
  });

  it('rate limits failed TOTP challenge attempts without issuing a session', async () => {
    const user = await signup(
      `${runId}-two-factor-rate@example.test`,
      `${runId}-two-factor-rate-signup`,
      'Two Factor Rate User',
      '198.51.100.118',
    );
    const enrollment = await request(app.getHttpServer())
      .post('/api/v1/me/2fa/enroll')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.119');
    const code = await generateTotpForTest(enrollment.body.manualEntryKey);
    await request(app.getHttpServer())
      .post('/api/v1/me/2fa/confirm')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.120')
      .send({ code })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .expect(204);
    const challenge = await login(
      `${runId}-two-factor-rate@example.test`,
      password,
      '198.51.100.121',
    );
    const ip = '198.51.100.122';
    for (let index = 0; index < 5; index += 1) {
      const failed = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .set('x-forwarded-for', ip)
        .send({ challenge: challenge.body.challenge, code: '000000' });
      expectError(failed, 401, 'TWO_FACTOR_INVALID');
    }
    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verify')
      .set('x-forwarded-for', ip)
      .send({ challenge: challenge.body.challenge, code: '000000' });
    expectError(limited, 429, 'RATE_LIMITED');
    expect(
      await prisma.session.count({
        where: { userId: user.body.user.id, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('sets Secure cookies when a secure deployment configuration is used', async () => {
    process.env.COOKIE_SECURE = 'true';
    const secureApp = await createApp(AppModule);
    await secureApp.init();
    const response = await request(secureApp.getHttpServer() as never)
      .post('/api/v1/auth/signup')
      .set('x-forwarded-for', '198.51.100.90')
      .set('idempotency-key', `${runId}-secure-cookie`)
      .send({
        email: `${runId}-secure@example.test`,
        password,
        displayName: 'Secure Cookie',
        username: 'qa_secure_cookie',
      });
    expect(response.status).toBe(201);
    expectCookie(response, true);
    await secureApp.close();
    process.env.COOKIE_SECURE = 'false';
  });

  function signup(
    email: string,
    key: string,
    displayName: string,
    ip: string,
    candidatePassword: string = password,
    username?: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('x-forwarded-for', ip)
      .set('idempotency-key', key)
      .send({ email, password: candidatePassword, displayName, username: username ?? `qa_${email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').slice(-24)}` });
  }

  function login(email: string, candidatePassword: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email, password: candidatePassword });
  }
});

function readCookie(response: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const setCookie = response.headers['set-cookie'];
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return value?.split(';', 1)[0];
}

function expectCookie(
  response: { headers: Record<string, string | string[] | undefined> },
  secure: boolean,
) {
  const value = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie'][0]
    : response.headers['set-cookie'];
  expect(value).toContain(`${cookieName}=`);
  expect(value).toContain('HttpOnly');
  expect(value).toContain('SameSite=Lax');
  expect(value).toContain('Path=/api/v1/auth');
  expect(value).toMatch(/Max-Age=\d+/);
  expect(value?.includes('Secure')).toBe(secure);
}

function expectClearedCookie(response: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const value = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie'][0]
    : response.headers['set-cookie'];
  expect(value).toContain(`${cookieName}=`);
  expect(value).toContain('HttpOnly');
  expect(value).toContain('Path=/api/v1/auth');
  expect(value).toMatch(/Expires=.*1970|Max-Age=0/i);
}

function expectPublic(value: Record<string, unknown>) {
  expect(JSON.stringify(value)).not.toMatch(
    /password|tokenHash|refreshToken|normalizedEmail|audit|ipHash|userAgent|revocationReason/i,
  );
}

function expectError(
  response: { status: number; body: Record<string, unknown> },
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({
    error: { code, message: expect.any(String) },
    requestId: expect.any(String),
    timestamp: expect.any(String),
  });
  expect(JSON.stringify(response.body)).not.toMatch(
    /stack|prisma|redis|passwordHash/i,
  );
}
