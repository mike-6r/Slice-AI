import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl, loadAppConfig } from '../src/config/app-config';
import { AuthService } from '../src/modules/identity/auth/auth.service';
import { IdempotencyCoordinator } from '../src/modules/identity/auth/idempotency-coordinator';
import { SessionManagementService } from '../src/modules/identity/auth/session-management.service';
import { createIdentityTransaction } from '../src/modules/identity/persistence/prisma-identity.repositories';
import type { IdentityUnitOfWork } from '../src/modules/identity/ports/repositories';
import { Argon2idPasswordHasher } from '../src/modules/identity/security/argon2id-password-hasher';
import { AuthTokenService } from '../src/modules/identity/security/auth-token.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('TEST_DATABASE_URL is required for session management tests.');
assertTestDatabaseUrl(databaseUrl);

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `session-management-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
const repositories = createIdentityTransaction(prisma);
const auth = new AuthService(
  config,
  uow,
  repositories.users,
  repositories.sessions,
  repositories.roles,
  new Argon2idPasswordHasher(),
  new AuthTokenService(config),
  new IdempotencyCoordinator(uow),
);
const sessionManagement = new SessionManagementService(
  uow,
  repositories.sessions,
  { enforce: async () => undefined } as never,
  { require: () => undefined } as never,
);

describe('customer session management with PostgreSQL', () => {
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

  it('lists only active sessions, identifies the caller, and revokes a second refresh authority', async () => {
    const email = `${runId}-revoke@example.test`;
    const first = await auth.signup(
      { email, password: 'a sufficiently strong password', displayName: 'Session User' },
      '00000000-0000-4000-8000-000000000061',
      `${runId}-signup`,
    );
    const second = await auth.login(
      { email, password: 'a sufficiently strong password' },
      '00000000-0000-4000-8000-000000000062',
    );
    const expired = await prisma.session.create({
      data: {
        id: `${runId}-expired`,
        publicId: `session_${runId}_expired`,
        userId: first.user.id,
        tokenHash: `${runId}-expired-hash`,
        familyId: `${runId}-expired-family`,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const actor = await auth.actor(first.accessToken);

    const listed = await sessionManagement.list(actor);
    expect(listed.sessions).toHaveLength(2);
    expect(listed.sessions.filter((item) => item.currentSession)).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(second.session.id);
    expect(listed.sessions.map((item) => item.reference)).not.toContain(expired.publicId);

    const secondReference = listed.sessions.find(
      (item) => !item.currentSession,
    )!.reference;
    await expect(
      sessionManagement.revoke(actor, secondReference, '198.51.100.61', 'request-61'),
    ).resolves.toEqual({ currentSessionRevoked: false });

    await expect(auth.refresh(second.refreshToken, 'request-62')).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.refresh(first.refreshToken, 'request-63')).resolves.toMatchObject({
      user: { id: first.user.id },
    });
    const secondRow = await prisma.session.findUniqueOrThrow({
      where: { id: second.session.id },
    });
    expect(secondRow.revocationReason).toBe('SESSION_REVOKED');
    expect(secondRow.revokedAt).not.toBeNull();
  });

  it('atomically revokes all other active sessions while preserving the caller', async () => {
    const email = `${runId}-others@example.test`;
    const first = await auth.signup(
      { email, password: 'a sufficiently strong password', displayName: 'Other Sessions User' },
      '00000000-0000-4000-8000-000000000064',
      `${runId}-others-signup`,
    );
    const second = await auth.login(
      { email, password: 'a sufficiently strong password' },
      '00000000-0000-4000-8000-000000000065',
    );
    const third = await auth.login(
      { email, password: 'a sufficiently strong password' },
      '00000000-0000-4000-8000-000000000066',
    );
    const actor = await auth.actor(first.accessToken);

    await expect(
      sessionManagement.revokeOthers(actor, '198.51.100.64', 'request-64'),
    ).resolves.toEqual({ revokedSessionCount: 2 });

    await expect(auth.actor(first.accessToken)).resolves.toMatchObject({
      sessionId: first.session.id,
    });
    await expect(auth.refresh(second.refreshToken, 'request-65')).rejects.toMatchObject({
      status: 401,
    });
    await expect(auth.refresh(third.refreshToken, 'request-66')).rejects.toMatchObject({
      status: 401,
    });
    const active = await sessionManagement.list(actor);
    expect(active.sessions).toHaveLength(1);
    expect(active.sessions[0]).toMatchObject({ currentSession: true });
  });

  it('handles concurrent revocation of the same session without duplicate audit state', async () => {
    const email = `${runId}-race@example.test`;
    const first = await auth.signup(
      { email, password: 'a sufficiently strong password', displayName: 'Session Race User' },
      '00000000-0000-4000-8000-000000000067',
      `${runId}-race-signup`,
    );
    const second = await auth.login(
      { email, password: 'a sufficiently strong password' },
      '00000000-0000-4000-8000-000000000068',
    );
    const actor = await auth.actor(first.accessToken);
    const reference = (await sessionManagement.list(actor)).sessions.find(
      (item) => !item.currentSession,
    )!.reference;

    const outcomes = await Promise.all([
      sessionManagement.revoke(actor, reference, '198.51.100.67', 'request-67a'),
      sessionManagement.revoke(actor, reference, '198.51.100.67', 'request-67b'),
    ]);

    expect(outcomes).toEqual([
      { currentSessionRevoked: false },
      { currentSessionRevoked: false },
    ]);
    await expect(
      prisma.session.findUniqueOrThrow({ where: { id: second.session.id } }),
    ).resolves.toMatchObject({ revocationReason: 'SESSION_REVOKED' });
    await expect(
      prisma.auditEvent.count({
        where: { actorUserId: first.user.id, action: 'SESSION_REVOKED' },
      }),
    ).resolves.toBe(1);
  });
});
