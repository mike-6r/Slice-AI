import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl } from '../src/config/app-config';
import { RepositoryConflict } from '../src/modules/identity/domain/errors';
import { createIdentityTransaction } from '../src/modules/identity/persistence/prisma-identity.repositories';
import { bootstrapAdministrator } from '../src/scripts/bootstrap-admin';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'TEST_DATABASE_URL is required for identity persistence integration tests.',
  );
assertTestDatabaseUrl(databaseUrl);

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `identity-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = new Date();
const userInput = (id: string) => ({
  id: id as never,
  email: `${id}@example.test`,
  normalizedEmail: `${id}@example.test` as never,
  passwordHash: 'argon2id-private-test-hash',
  emailVerifiedAt: null,
  accountStatus: 'ACTIVE' as const,
  profile: {
    displayName: 'Integration User',
    publicUsername: null,
    avatarReference: null,
    countryCode: 'GB',
    preferredCurrency: 'GBP' as const,
    timezone: 'Europe/London',
  },
});

describe('identity persistence integration', () => {
  beforeAll(() => prisma.$connect());
  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({
      where: { key: { startsWith: runId } },
    });
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: runId } },
    });
    await prisma.$disconnect();
  });

  it('maps user/profile records and deterministically translates a normalized-email race', async () => {
    const repositories = createIdentityTransaction(prisma);
    const id = `${runId}-email`;
    const results = await Promise.allSettled([
      repositories.users.create(userInput(id)),
      repositories.users.create(userInput(id)),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RepositoryConflict);
    expect(rejected.reason.code).toBe('IDENTITY_EMAIL_CONFLICT');
    await expect(
      repositories.users.getProfile(id as never),
    ).resolves.toMatchObject({ displayName: 'Integration User' });
  });

  it('rolls back user/profile/status history/audit writes in one transaction', async () => {
    const id = `${runId}-rollback`;
    await expect(
      prisma.$transaction(async (db) => {
        const repositories = createIdentityTransaction(db);
        await repositories.users.create(userInput(id));
        await repositories.statusHistory.append({
          id: `${id}-history`,
          userId: id as never,
          fromStatus: null,
          toStatus: 'ACTIVE',
          reason: 'integration',
          actorUserId: null,
          createdAt: now,
        });
        await repositories.audit.append({
          id: `${id}-audit`,
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'identity.test',
          resourceType: 'user',
          resourceId: id,
          requestId: id,
          sessionId: null,
          result: 'SUCCESS',
          metadata: null,
          createdAt: now,
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    await expect(prisma.user.findUnique({ where: { id } })).resolves.toBeNull();
    await expect(
      prisma.auditEvent.count({ where: { requestId: id } }),
    ).resolves.toBe(0);
  });

  it('rotates sessions atomically, enforces token hash uniqueness, and supports monotonic revocation', async () => {
    const id = `${runId}-session-user`;
    const repositories = createIdentityTransaction(prisma);
    await repositories.users.create(userInput(id));
    const old = {
      id: `${id}-old` as never,
      userId: id as never,
      tokenHash: `${id}-hash-old`,
      familyId: `${id}-family`,
      replacedBySessionId: null,
      issuedAt: now,
      authenticatedAt: now,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      revocationReason: null,
      lastActivityAt: now,
      userAgent: null,
      ipHash: null,
    };
    const successor = {
      ...old,
      id: `${id}-new` as never,
      tokenHash: `${id}-hash-new`,
      replacedBySessionId: null,
    };
    await repositories.sessions.create(old);
    await prisma.$transaction((db) =>
      createIdentityTransaction(db).sessions.rotate(
        old.id,
        successor,
        new Date(),
      ),
    );
    await expect(repositories.sessions.findById(old.id)).resolves.toMatchObject(
      {
        replacedBySessionId: successor.id,
        revokedAt: expect.any(Date),
        revocationReason: 'ROTATED',
      },
    );
    await expect(
      repositories.sessions.findByRefreshTokenHash(successor.tokenHash),
    ).resolves.toMatchObject({ id: successor.id });
    await expect(
      repositories.sessions.create({
        ...successor,
        id: `${id}-duplicate` as never,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_TOKEN_CONFLICT' });
    await repositories.sessions.revokeSessionFamily(
      old.familyId,
      'LOGOUT',
      new Date(),
    );
    await expect(
      repositories.sessions.listActiveByUser(id as never, new Date()),
    ).resolves.toHaveLength(0);
  });

  it('enforces one active role and atomically protects idempotency completion', async () => {
    const id = `${runId}-role-user`;
    const repositories = createIdentityTransaction(prisma);
    await repositories.users.create(userInput(id));
    const role = {
      id: `${id}-role` as never,
      userId: id as never,
      role: 'ADMIN' as const,
      scopeType: 'GLOBAL',
      scopeId: '*',
      assignedByUserId: null,
      createdAt: now,
      revokedAt: null,
    };
    const roleResults = await Promise.allSettled([
      repositories.roles.assign(role),
      repositories.roles.assign({ ...role, id: `${id}-role-2` as never }),
    ]);
    expect(
      roleResults.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await repositories.roles.remove(id as never, 'ADMIN');
    await expect(
      repositories.roles.assign({
        ...role,
        id: `${id}-role-3` as never,
        createdAt: new Date(),
      }),
    ).resolves.toMatchObject({ role: 'ADMIN' });
    const identity = {
      actorScope: `user:${id}`,
      scope: 'integration.role',
      key: `${runId}-idem`,
    };
    await expect(
      repositories.idempotency.acquire(
        identity,
        'fingerprint',
        new Date(Date.now() + 60_000),
      ),
    ).resolves.toMatchObject({ state: 'ACQUIRED' });
    await repositories.idempotency.complete(
      identity,
      { status: 201, body: { created: true } },
      new Date(),
    );
    await expect(
      repositories.idempotency.complete(
        identity,
        { status: 201, body: { created: true } },
        new Date(),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('acquires a composite idempotency identity once, isolates scopes, and reacquires expired records', async () => {
    const repositories = createIdentityTransaction(prisma);
    const key = `${runId}-composite`;
    const identity = {
      actorScope: `user:${runId}-one`,
      scope: 'profile.update',
      key,
    };
    const [first, duplicate] = await Promise.all([
      repositories.idempotency.acquire(
        identity,
        'same-fingerprint',
        new Date(Date.now() + 60_000),
      ),
      repositories.idempotency.acquire(
        identity,
        'same-fingerprint',
        new Date(Date.now() + 60_000),
      ),
    ]);
    expect([first.state, duplicate.state].sort()).toEqual([
      'ACQUIRED',
      'EXISTING_IN_PROGRESS',
    ]);
    await expect(
      repositories.idempotency.acquire(
        { ...identity, actorScope: `user:${runId}-two` },
        'different-actor',
        new Date(Date.now() + 60_000),
      ),
    ).resolves.toMatchObject({ state: 'ACQUIRED' });
    await expect(
      repositories.idempotency.acquire(
        { ...identity, scope: 'auth.logout-all' },
        'different-scope',
        new Date(Date.now() + 60_000),
      ),
    ).resolves.toMatchObject({ state: 'ACQUIRED' });
    const expired = { ...identity, key: `${runId}-expired` };
    await repositories.idempotency.acquire(
      expired,
      'old-fingerprint',
      new Date(Date.now() - 1_000),
    );
    await expect(
      repositories.idempotency.acquire(
        expired,
        'new-fingerprint',
        new Date(Date.now() + 60_000),
      ),
    ).resolves.toMatchObject({ state: 'EXPIRED_REACQUIRED' });
  });

  it('rolls back an acquired idempotency completion with its transaction', async () => {
    const identity = {
      actorScope: `user:${runId}-rollback`,
      scope: 'profile.update',
      key: `${runId}-rollback-idempotency`,
    };
    await expect(
      prisma.$transaction(async (db) => {
        const repositories = createIdentityTransaction(db);
        await repositories.idempotency.acquire(
          identity,
          'rollback-fingerprint',
          new Date(Date.now() + 60_000),
        );
        await repositories.idempotency.complete(
          identity,
          { status: 200, body: { updated: true } },
          new Date(),
        );
        throw new Error('force idempotency rollback');
      }),
    ).rejects.toThrow('force idempotency rollback');
    await expect(
      createIdentityTransaction(prisma).idempotency.find(identity),
    ).resolves.toBeNull();
  });

  it('serializes one-time administrator bootstrap attempts with the global admin lock', async () => {
    await prisma.roleAssignment.updateMany({
      where: {
        user: { normalizedEmail: { startsWith: runId } },
        role: 'ADMIN',
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    const first = `${runId}-bootstrap-one`;
    const second = `${runId}-bootstrap-two`;
    await prisma.user.create({
      data: {
        ...userInput(first),
        profile: { create: userInput(first).profile },
      },
    });
    await prisma.user.create({
      data: {
        ...userInput(second),
        profile: { create: userInput(second).profile },
      },
    });
    const results = await Promise.allSettled([
      bootstrapAdministrator(
        prisma,
        `${first}@example.test`,
        `${runId}-operator-one`,
      ),
      bootstrapAdministrator(
        prisma,
        `${second}@example.test`,
        `${runId}-operator-two`,
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(
      prisma.roleAssignment.count({
        where: {
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          revokedAt: null,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({ where: { action: 'ADMIN_BOOTSTRAPPED' } }),
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});
