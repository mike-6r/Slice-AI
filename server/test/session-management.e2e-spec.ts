import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');

const runId = `session-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';

describe('customer session management HTTP E2E', () => {
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
    const keys = await inspector.keys('slice:test:auth-*');
    if (keys.length) await inspector.del(...keys);
  });

  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({
      where: { key: { startsWith: runId } },
    });
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: runId } },
    });
    await app?.close();
    await inspector.quit();
  });

  it('lists multi-device sessions, revokes an owned other session, and blocks its refresh', async () => {
    const email = `${runId}-revoke@example.test`;
    const first = await signup(email, `${runId}-revoke-signup`, 'Session User', '198.51.100.71');
    const second = await login(email, '198.51.100.72');
    const listed = await listSessions(first.body.accessToken);

    expect(listed.status).toBe(200);
    expect(listed.body.sessions).toHaveLength(2);
    expect(listed.body.sessions.filter((item: { currentSession: boolean }) => item.currentSession)).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(first.body.session.id);
    expect(JSON.stringify(listed.body)).not.toContain(second.body.session.id);
    expect(JSON.stringify(listed.body)).not.toMatch(/tokenhash|iph?hash|familyid/i);

    const secondReference = listed.body.sessions.find(
      (item: { currentSession: boolean }) => !item.currentSession,
    ).reference;
    const revoked = await request(app.getHttpServer())
      .delete(`/api/v1/me/sessions/${encodeURIComponent(secondReference)}`)
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.73');
    expect(revoked.status).toBe(204);

    await expectRefreshFailure(readCookie(second));
    const refreshed = await refresh(readCookie(first));
    expect(refreshed.status).toBe(200);
    const after = await listSessions(refreshed.body.accessToken);
    expect(after.body.sessions).toHaveLength(1);
    expect(after.body.sessions[0].currentSession).toBe(true);
    await expect(
      prisma.auditEvent.count({
        where: { actorUserId: first.body.user.id, action: 'SESSION_REVOKED' },
      }),
    ).resolves.toBe(1);
  });

  it('revokes all other sessions with recent authentication and preserves the current session', async () => {
    const email = `${runId}-others@example.test`;
    const first = await signup(email, `${runId}-others-signup`, 'Other Sessions User', '198.51.100.74');
    const second = await login(email, '198.51.100.75');
    const third = await login(email, '198.51.100.76');

    const outcome = await request(app.getHttpServer())
      .post('/api/v1/me/sessions/revoke-others')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.77');
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({ revokedSessionCount: 2 });
    await expectRefreshFailure(readCookie(second));
    await expectRefreshFailure(readCookie(third));
    await expect(refresh(readCookie(first))).resolves.toMatchObject({ status: 200 });
  });

  it('revokes the current session, clears its refresh cookie, and denies future access and refresh', async () => {
    const email = `${runId}-current@example.test`;
    const signedUp = await signup(email, `${runId}-current-signup`, 'Current Session User', '198.51.100.78');
    const listed = await listSessions(signedUp.body.accessToken);
    const currentReference = listed.body.sessions.find(
      (item: { currentSession: boolean }) => item.currentSession,
    ).reference;

    const revoked = await request(app.getHttpServer())
      .delete(`/api/v1/me/sessions/${encodeURIComponent(currentReference)}`)
      .set('authorization', `Bearer ${signedUp.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.79');
    expect(revoked.status).toBe(204);
    expect(readSetCookies(revoked).join(';')).toMatch(/slice_refresh=;/);
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${signedUp.body.accessToken}`);
    expect(me.status).toBe(401);
    await expectRefreshFailure(readCookie(signedUp));
  });

  it('keeps the current session after a password change while session listing excludes revoked others', async () => {
    const email = `${runId}-password@example.test`;
    const first = await signup(email, `${runId}-password-signup`, 'Password Session User', '198.51.100.83');
    const second = await login(email, '198.51.100.84');
    const changed = await request(app.getHttpServer())
      .post('/api/v1/me/security/password')
      .set('authorization', `Bearer ${first.body.accessToken}`)
      .set('idempotency-key', `${runId}-password-change`)
      .set('x-forwarded-for', '198.51.100.85')
      .send({
        currentPassword: password,
        newPassword: 'a different sufficiently strong password',
      });
    expect(changed.status).toBe(201);
    expect(changed.body.revokedOtherSessionCount).toBe(1);
    await expectRefreshFailure(readCookie(second));
    const currentSessions = await listSessions(first.body.accessToken);
    expect(currentSessions.status).toBe(200);
    expect(currentSessions.body.sessions).toHaveLength(1);
    expect(currentSessions.body.sessions[0].currentSession).toBe(true);
  });

  it('does not reveal or revoke another user’s session reference', async () => {
    const alice = await signup(
      `${runId}-alice@example.test`,
      `${runId}-alice-signup`,
      'Alice',
      '198.51.100.80',
    );
    const bob = await signup(
      `${runId}-bob@example.test`,
      `${runId}-bob-signup`,
      'Bob',
      '198.51.100.81',
    );
    const bobReference = (await listSessions(bob.body.accessToken)).body.sessions[0].reference;
    const attempted = await request(app.getHttpServer())
      .delete(`/api/v1/me/sessions/${encodeURIComponent(bobReference)}`)
      .set('authorization', `Bearer ${alice.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.82');
    expect(attempted.status).toBe(404);
    expect(attempted.body.error.code).toBe('SESSION_NOT_FOUND');
    await expect(refresh(readCookie(bob))).resolves.toMatchObject({ status: 200 });
  });

  function signup(email: string, key: string, displayName: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('idempotency-key', key)
      .set('x-forwarded-for', ip)
      .send({ email, password, displayName, username: `qa_${displayName.replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 24)}` });
  }
  function login(email: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', ip)
      .send({ email, password });
  }
  function listSessions(accessToken: string) {
    return request(app.getHttpServer())
      .get('/api/v1/me/sessions')
      .set('authorization', `Bearer ${accessToken}`);
  }
  function refresh(cookie: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/refresh').set('cookie', cookie);
  }
  async function expectRefreshFailure(cookie: string) {
    const response = await refresh(cookie);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toMatch(/REFRESH_TOKEN_REUSED|REFRESH_TOKEN_INVALID/);
  }
});

function readCookie(response: { headers: Record<string, string> }) {
  const cookie = readSetCookies(response).find((value) => value.startsWith('slice_refresh='));
  if (!cookie) throw new Error('Expected a refresh cookie.');
  return cookie.split(';', 1)[0];
}

function readSetCookies(response: { headers: Record<string, string> }) {
  const value = (response.headers as Record<string, unknown>)['set-cookie'];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
