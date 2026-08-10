import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl, loadAppConfig } from '../src/config/app-config';
import { AuthService } from '../src/modules/identity/auth/auth.service';
import { IdempotencyCoordinator } from '../src/modules/identity/auth/idempotency-coordinator';
import { AuthTokenService } from '../src/modules/identity/security/auth-token.service';
import { Argon2idPasswordHasher } from '../src/modules/identity/security/argon2id-password-hasher';
import { createIdentityTransaction } from '../src/modules/identity/persistence/prisma-identity.repositories';
import type { IdentityUnitOfWork } from '../src/modules/identity/ports/repositories';
import type { PasswordHasher } from '../src/modules/identity/ports/security.ports';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('TEST_DATABASE_URL is required for auth integration tests.');
assertTestDatabaseUrl(databaseUrl);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = loadAppConfig({
  NODE_ENV: 'test',
  TEST_DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
  COOKIE_SECURE: 'false',
});
const uow: IdentityUnitOfWork = {
  withinTransaction: (work) =>
    prisma.$transaction((db) => work(createIdentityTransaction(db))),
};
const tx = createIdentityTransaction(prisma);
const auth = new AuthService(
  config,
  uow,
  tx.users,
  tx.sessions,
  tx.roles,
  new Argon2idPasswordHasher(),
  new AuthTokenService(config),
  new IdempotencyCoordinator(uow),
);

describe('auth integration', () => {
  beforeAll(() => prisma.$connect());
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: runId } },
    });
    await prisma.$disconnect();
  });
  it('signs up, authenticates access claims, rotates refresh once, and revokes on replay', async () => {
    const requestId = '00000000-0000-4000-8000-000000000004';
    const email = `${runId}@example.test`;
    const signup = await auth.signup(
      {
        email,
        password: 'a sufficiently strong password',
        displayName: 'Auth Integration',
      },
      requestId,
    );
    expect(signup.refreshToken).toHaveLength(43);
    expect(JSON.stringify(signup)).not.toContain('passwordHash');
    await expect(auth.actor(signup.accessToken)).resolves.toMatchObject({
      userId: signup.user.id,
    });
    const refreshed = await auth.refresh(signup.refreshToken, requestId);
    await expect(
      auth.refresh(signup.refreshToken, requestId),
    ).rejects.toMatchObject({ status: 401 });
    await expect(auth.actor(refreshed.accessToken)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('returns a generic invalid-credentials result for unknown and wrong-password login', async () => {
    const requestId = '00000000-0000-4000-8000-000000000005';
    await expect(
      auth.login(
        {
          email: `${runId}-unknown@example.test`,
          password: 'a sufficiently strong password',
        },
        requestId,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      auth.login(
        { email: `${runId}@example.test`, password: 'wrong password value' },
        requestId,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('uses one configured password verification for both unknown and wrong-password login', async () => {
    class CountingPasswordHasher implements PasswordHasher {
      hashCalls = 0;
      verifyCalls = 0;
      async hash(value: string) {
        this.hashCalls += 1;
        return `counting-hash:${value}`;
      }
      async verify(hash: string, value: string) {
        this.verifyCalls += 1;
        return hash === `counting-hash:${value}`;
      }
      needsRehash() {
        return false;
      }
    }

    const passwords = new CountingPasswordHasher();
    const countedAuth = new AuthService(
      config,
      uow,
      tx.users,
      tx.sessions,
      tx.roles,
      passwords,
      new AuthTokenService(config),
      new IdempotencyCoordinator(uow),
    );
    await countedAuth.onModuleInit();
    expect(passwords.hashCalls).toBe(1);
    const email = `${runId}-counted@example.test`;
    await countedAuth.signup(
      {
        email,
        password: 'a sufficiently strong password',
        displayName: 'Counting User',
      },
      '00000000-0000-4000-8000-000000000010',
      `${runId}-counted-signup`,
    );
    passwords.hashCalls = 0;
    passwords.verifyCalls = 0;
    await expect(
      countedAuth.login(
        { email: `${runId}-missing@example.test`, password: 'wrong password' },
        '00000000-0000-4000-8000-000000000010',
      ),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(passwords.verifyCalls).toBe(1);
    expect(passwords.hashCalls).toBe(0);
    passwords.verifyCalls = 0;
    await expect(
      countedAuth.login(
        { email, password: 'wrong password' },
        '00000000-0000-4000-8000-000000000010',
      ),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(passwords.verifyCalls).toBe(1);
    expect(passwords.hashCalls).toBe(0);
  });

  it('allows only one concurrent refresh rotation to create a successor session', async () => {
    const requestId = '00000000-0000-4000-8000-000000000009';
    const signup = await auth.signup(
      {
        email: `${runId}-concurrent-refresh@example.test`,
        password: 'a sufficiently strong password',
        displayName: 'Concurrent Refresh',
      },
      requestId,
      `${runId}-concurrent-refresh-signup`,
    );
    const results = await Promise.allSettled([
      auth.refresh(signup.refreshToken, requestId),
      auth.refresh(signup.refreshToken, requestId),
    ]);
    const successful = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<typeof signup>> =>
        result.status === 'fulfilled',
    );
    expect(successful).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      auth.actor(successful[0].value.accessToken),
    ).resolves.toMatchObject({
      userId: signup.user.id,
    });
  });

  it('persists only a safe signup result and mints a fresh credential on exact replay', async () => {
    const requestId = '00000000-0000-4000-8000-000000000006';
    const email = `${runId}-replay@example.test`;
    const key = `${runId}-signup-replay`;
    const input = {
      email,
      password: 'a sufficiently strong password',
      displayName: 'Replay Safe',
    };
    const first = await auth.signup(input, requestId, key);
    const replay = await auth.signup(input, requestId, key);
    expect(replay.user).toEqual(first.user);
    expect(replay.refreshToken).not.toEqual(first.refreshToken);
    await expect(
      prisma.user.count({ where: { normalizedEmail: email } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: { resourceId: first.user.id, action: 'AUTH_SIGNUP_SUCCEEDED' },
      }),
    ).resolves.toBe(1);
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { key, scope: 'auth.signup' },
    });
    const persisted = JSON.stringify(record.responseBody);
    expect(persisted).not.toMatch(
      /token|cookie|password|hash|normalizedemail/i,
    );
    expect(persisted).toContain(first.user.id);
  });

  it('makes logout-all and profile updates durable exact replays', async () => {
    const requestId = '00000000-0000-4000-8000-000000000007';
    const signup = await auth.signup(
      {
        email: `${runId}-profile@example.test`,
        password: 'a sufficiently strong password',
        displayName: 'Before Update',
      },
      requestId,
      `${runId}-profile-signup`,
    );
    const actor = await auth.actor(signup.accessToken);
    const profileKey = `${runId}-profile-update`;
    const firstProfile = await auth.updateProfile(
      actor,
      { displayName: 'After Update' },
      requestId,
      profileKey,
    );
    const profileAfterFirst = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: actor.userId },
    });
    const replayProfile = await auth.updateProfile(
      actor,
      { displayName: 'After Update' },
      requestId,
      profileKey,
    );
    const profileAfterReplay = await prisma.userProfile.findUniqueOrThrow({
      where: { userId: actor.userId },
    });
    expect(replayProfile).toEqual(firstProfile);
    expect(profileAfterReplay.updatedAt).toEqual(profileAfterFirst.updatedAt);
    await expect(
      prisma.auditEvent.count({
        where: { resourceId: actor.userId, action: 'AUTH_PROFILE_UPDATED' },
      }),
    ).resolves.toBe(1);
    const logoutKey = `${runId}-logout-all`;
    const firstLogout = await auth.logoutAll(actor, requestId, logoutKey);
    const replayLogout = await auth.logoutAll(actor, requestId, logoutKey);
    expect(replayLogout).toEqual(firstLogout);
    expect(firstLogout.revokedSessionCount).toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: { resourceId: actor.userId, action: 'AUTH_LOGOUT_ALL' },
      }),
    ).resolves.toBe(1);
  });

  it('rejects conflicting idempotency fingerprints within the same anonymous scope', async () => {
    const requestId = '00000000-0000-4000-8000-000000000008';
    const key = `${runId}-signup-conflict`;
    const input = {
      email: `${runId}-conflict@example.test`,
      password: 'a sufficiently strong password',
      displayName: 'Original',
    };
    await auth.signup(input, requestId, key);
    await expect(
      auth.signup({ ...input, displayName: 'Changed' }, requestId, key),
    ).rejects.toMatchObject({ status: 409 });
  });
});
