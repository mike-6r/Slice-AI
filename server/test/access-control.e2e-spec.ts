import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
const runId = `access-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';

describe('access control HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
    inspector = new Redis(redisUrl, { lazyConnect: true });
    await inspector.connect();
  });

  beforeEach(async () => {
    const keys = await inspector.keys('slice:test:*');
    if (keys.length) await inspector.del(...keys);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { requestId: { startsWith: runId } },
    });
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: runId } },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { key: { startsWith: runId } },
    });
    await app.close();
    await inspector.quit();
  });

  it('enforces admin permissions, transactional status history, role invariants, audit reads and replay protection', async () => {
    const admin = await signup('admin', '198.51.100.151');
    const user = await signup('user', '198.51.100.152');
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-admin-role`,
        userId: admin.body.user.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });

    const denied = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${admin.body.user.id}/status`)
      .set('authorization', `Bearer ${user.body.accessToken}`)
      .set('idempotency-key', `${runId}-denied`)
      .send({ toStatus: 'SUSPENDED', reasonCode: 'security-review' });
    expectError(denied, 403, 'FORBIDDEN');
    await expect(
      prisma.auditEvent.count({
        where: { actorUserId: user.body.user.id, action: 'ACCESS_DENIED' },
      }),
    ).resolves.toBe(1);

    const key = `${runId}-status`;
    const status = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${user.body.user.id}/status`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', key)
      .set('x-forwarded-for', '198.51.100.153')
      .send({ toStatus: 'SUSPENDED', reasonCode: 'security-review' });
    expect(status.status).toBe(201);
    expect(status.body).toMatchObject({
      userId: user.body.user.id,
      accountStatus: 'SUSPENDED',
    });
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${user.body.user.id}/status`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', key)
      .set('x-forwarded-for', '198.51.100.153')
      .send({ toStatus: 'SUSPENDED', reasonCode: 'security-review' });
    expect(replay.status).toBe(201);
    const conflict = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${user.body.user.id}/status`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', key)
      .send({
        toStatus: 'ACTIVE',
        reasonCode: 'security-review',
        restore: true,
      });
    expectError(conflict, 409, 'IDEMPOTENCY_KEY_CONFLICT');
    await expect(
      prisma.accountStatusHistory.count({
        where: { userId: user.body.user.id },
      }),
    ).resolves.toBe(1);
    const suspendedRead = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${user.body.accessToken}`);
    expectError(suspendedRead, 401, 'AUTHENTICATION_REQUIRED');

    const grant = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${user.body.user.id}/roles`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', `${runId}-grant`)
      .set('x-forwarded-for', '198.51.100.154')
      .send({ role: 'SUPPORT' });
    expect(grant.status).toBe(201);
    const selfGrant = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${admin.body.user.id}/roles`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', `${runId}-self`)
      .send({ role: 'SUPPORT' });
    expectError(selfGrant, 403, 'SELF_ADMIN_ACTION_FORBIDDEN');

    const history = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${user.body.user.id}/status-history`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.155');
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(1);
    const audit = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-events?limit=10&action=ACCOUNT_STATUS_CHANGED')
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.156');
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).not.toMatch(
      /password|tokenHash|refreshToken/i,
    );
  });

  it('restricts sessions immediately while retaining only explicit safe reads and logout', async () => {
    const admin = await signup('restricted-admin', '198.51.100.201');
    const user = await signup('restricted-user', '198.51.100.202');
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-restricted-admin-role`,
        userId: admin.body.user.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    const restricted = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${user.body.user.id}/status`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', `${runId}-restrict`)
      .set('x-forwarded-for', '198.51.100.203')
      .send({ toStatus: 'RESTRICTED', reasonCode: 'compliance-hold' });
    expect(restricted.status).toBe(201);
    await expect(
      prisma.session.count({
        where: { userId: user.body.user.id, revokedAt: null },
      }),
    ).resolves.toBe(0);
    expectError(
      await request(app.getHttpServer())
        .patch('/api/v1/me/profile')
        .set('authorization', `Bearer ${user.body.accessToken}`)
        .set('idempotency-key', `${runId}-restricted-profile`)
        .send({ displayName: 'Blocked' }),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Cookie', String(user.headers['set-cookie']).split(';')[0])
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('authorization', `Bearer ${user.body.accessToken}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/session')
          .set('authorization', `Bearer ${user.body.accessToken}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('authorization', `Bearer ${user.body.accessToken}`)
      ).status,
    ).toBe(204);
    const restored = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${user.body.user.id}/status`)
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('idempotency-key', `${runId}-restore`)
      .set('x-forwarded-for', '198.51.100.204')
      .send({
        toStatus: 'ACTIVE',
        reasonCode: 'compliance-cleared',
        restore: true,
      });
    expect(restored.status).toBe(201);
    await expect(
      prisma.auditEvent.count({
        where: {
          resourceId: user.body.user.id,
          action: 'ACCOUNT_STATUS_CHANGED',
        },
      }),
    ).resolves.toBe(2);
  });

  it('requires fresh server-resolved authentication for high-impact actions and ignores non-global roles', async () => {
    const admin = await signup('stale-admin', '198.51.100.205');
    const user = await signup('scoped-user', '198.51.100.206');
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-stale-admin-role`,
        userId: admin.body.user.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-scoped-admin-role`,
        userId: user.body.user.id,
        role: 'ADMIN',
        scopeType: 'ASSET',
        scopeId: 'asset-only',
        assignedByUserId: null,
      },
    });
    expectError(
      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-events')
        .set('authorization', `Bearer ${user.body.accessToken}`),
      403,
      'FORBIDDEN',
    );
    await prisma.session.updateMany({
      where: { userId: admin.body.user.id },
      data: { authenticatedAt: new Date(Date.now() - 600_000) },
    });
    expectError(
      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${user.body.user.id}/status`)
        .set('authorization', `Bearer ${admin.body.accessToken}`)
        .set('idempotency-key', `${runId}-stale`)
        .send({ toStatus: 'SUSPENDED', reasonCode: 'security-hold' }),
      403,
      'RECENT_AUTH_REQUIRED',
    );
    const fresh = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('x-forwarded-for', '198.51.100.207')
      .send({ email: `${runId}-stale-admin@example.test`, password });
    expect(fresh.status).toBe(200);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/admin/users/${user.body.user.id}/status`)
          .set('authorization', `Bearer ${fresh.body.accessToken}`)
          .set('idempotency-key', `${runId}-fresh`)
          .send({ toStatus: 'SUSPENDED', reasonCode: 'security-hold' })
      ).status,
    ).toBe(201);
  });

  it('serializes concurrent administrator removals and status changes', async () => {
    // Dedicated disposable test DB: reset the singleton invariant before the race.
    await prisma.roleAssignment.updateMany({
      where: { role: 'ADMIN', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const first = await signup('race-first', '198.51.100.208');
    const second = await signup('race-second', '198.51.100.209');
    const firstRole = `${runId}-race-first-role`;
    const secondRole = `${runId}-race-second-role`;
    await prisma.roleAssignment.createMany({
      data: [
        {
          id: firstRole,
          userId: first.body.user.id,
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: null,
        },
        {
          id: secondRole,
          userId: second.body.user.id,
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: null,
        },
      ],
    });
    const results = await Promise.all([
      request(app.getHttpServer())
        .delete(
          `/api/v1/admin/users/${second.body.user.id}/roles/${secondRole}`,
        )
        .set('authorization', `Bearer ${first.body.accessToken}`)
        .set('idempotency-key', `${runId}-race-remove-a`)
        .set('x-forwarded-for', '198.51.100.221'),
      request(app.getHttpServer())
        .delete(`/api/v1/admin/users/${first.body.user.id}/roles/${firstRole}`)
        .set('authorization', `Bearer ${second.body.accessToken}`)
        .set('idempotency-key', `${runId}-race-remove-b`)
        .set('x-forwarded-for', '198.51.100.222'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([204, 409]);
    await expect(
      prisma.roleAssignment.count({
        where: {
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          revokedAt: null,
          user: { accountStatus: { in: ['ACTIVE', 'PENDING_REVIEW'] } },
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(1);

    await prisma.roleAssignment.updateMany({
      where: { role: 'ADMIN', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const statusFirst = await signup('race-status-first', '198.51.100.213');
    const statusSecond = await signup('race-status-second', '198.51.100.214');
    await prisma.roleAssignment.createMany({
      data: [
        {
          id: `${runId}-race-status-first-role`,
          userId: statusFirst.body.user.id,
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: null,
        },
        {
          id: `${runId}-race-status-second-role`,
          userId: statusSecond.body.user.id,
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: null,
        },
      ],
    });
    const statusResults = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/admin/users/${statusSecond.body.user.id}/status`)
        .set('authorization', `Bearer ${statusFirst.body.accessToken}`)
        .set('idempotency-key', `${runId}-race-status-a`)
        .set('x-forwarded-for', '198.51.100.223')
        .send({ toStatus: 'SUSPENDED', reasonCode: 'security-hold' }),
      request(app.getHttpServer())
        .post(`/api/v1/admin/users/${statusFirst.body.user.id}/status`)
        .set('authorization', `Bearer ${statusSecond.body.accessToken}`)
        .set('idempotency-key', `${runId}-race-status-b`)
        .set('x-forwarded-for', '198.51.100.224')
        .send({ toStatus: 'SUSPENDED', reasonCode: 'security-hold' }),
    ]);
    expect(statusResults.map((result) => result.status)).toContain(201);
    expect(
      statusResults
        .map((result) => result.status)
        .some((status) => status === 401 || status === 409),
    ).toBe(true);
    await expect(
      prisma.roleAssignment.count({
        where: {
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          revokedAt: null,
          user: { accountStatus: { in: ['ACTIVE', 'PENDING_REVIEW'] } },
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(1);
  });

  it('uses stable composite audit cursors when timestamps are identical', async () => {
    const admin = await signup('cursor-admin', '198.51.100.210');
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-cursor-admin-role`,
        userId: admin.body.user.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    const timestamp = new Date('2026-08-06T00:00:00.000Z');
    await prisma.auditEvent.createMany({
      data: [
        {
          id: `${runId}-cursor-a`,
          actorUserId: admin.body.user.id,
          actorType: 'USER',
          action: 'PAGINATION_TEST',
          resourceType: 'test',
          resourceId: 'a',
          requestId: `${runId}-cursor-a`,
          sessionId: null,
          result: 'SUCCESS',
          metadata: Prisma.JsonNull,
          createdAt: timestamp,
        },
        {
          id: `${runId}-cursor-b`,
          actorUserId: admin.body.user.id,
          actorType: 'USER',
          action: 'PAGINATION_TEST',
          resourceType: 'test',
          resourceId: 'b',
          requestId: `${runId}-cursor-b`,
          sessionId: null,
          result: 'SUCCESS',
          metadata: Prisma.JsonNull,
          createdAt: timestamp,
        },
      ],
    });
    const first = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-events?action=PAGINATION_TEST&limit=1')
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.211');
    expect(first.status).toBe(200);
    const second = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/audit-events?action=PAGINATION_TEST&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .set('authorization', `Bearer ${admin.body.accessToken}`)
      .set('x-forwarded-for', '198.51.100.212');
    expect(second.status).toBe(200);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  function signup(label: string, ip: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('idempotency-key', `${runId}-${label}-signup`)
      .set('x-forwarded-for', ip)
      .send({
        email: `${runId}-${label}@example.test`,
        password,
        displayName: label,
        username: `qa_${label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`,
      });
  }
});

function expectError(
  response: { status: number; body: Record<string, unknown> },
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({
    error: { code },
    requestId: expect.any(String),
  });
}
