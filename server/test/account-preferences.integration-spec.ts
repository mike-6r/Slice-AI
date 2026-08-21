import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl, loadAppConfig } from '../src/config/app-config';
import { AccountPreferencesService } from '../src/modules/identity/auth/account-preferences.service';
import { AuthService } from '../src/modules/identity/auth/auth.service';
import { CustomerActivityService } from '../src/modules/identity/auth/customer-activity.service';
import { IdempotencyCoordinator } from '../src/modules/identity/auth/idempotency-coordinator';
import { createIdentityTransaction } from '../src/modules/identity/persistence/prisma-identity.repositories';
import type { IdentityUnitOfWork } from '../src/modules/identity/ports/repositories';
import { Argon2idPasswordHasher } from '../src/modules/identity/security/argon2id-password-hasher';
import { AuthTokenService } from '../src/modules/identity/security/auth-token.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
assertTestDatabaseUrl(databaseUrl);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `account-preferences-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = loadAppConfig({ NODE_ENV: 'test', TEST_DATABASE_URL: databaseUrl, JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256', COOKIE_SECURE: 'false' });
const uow: IdentityUnitOfWork = { withinTransaction: (work) => prisma.$transaction((db) => work(createIdentityTransaction(db))) };
const repositories = createIdentityTransaction(prisma);
const auth = new AuthService(config, uow, repositories.users, repositories.sessions, repositories.roles, new Argon2idPasswordHasher(), new AuthTokenService(config), new IdempotencyCoordinator(uow));
const preferences = new AccountPreferencesService(uow, repositories.users, new IdempotencyCoordinator(uow), { enforce: async () => undefined } as never);
const activity = new CustomerActivityService(repositories.audit);

describe('account preferences and customer activity with PostgreSQL', () => {
  beforeAll(() => prisma.$connect());
  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany({ where: { key: { startsWith: runId } } });
    await prisma.user.deleteMany({ where: { normalizedEmail: { startsWith: runId } } });
    await prisma.$disconnect();
  });

  it('persists defaults and partial preference updates without crossing users', async () => {
    const a = await auth.signup({ email: `${runId}-a@example.test`, password: 'a sufficiently strong password', displayName: 'User A' }, 'request-a', `${runId}-a-signup`);
    const b = await auth.signup({ email: `${runId}-b@example.test`, password: 'a sufficiently strong password', displayName: 'User B' }, 'request-b', `${runId}-b-signup`);
    const actorA = await auth.actor(a.accessToken);
    const actorB = await auth.actor(b.accessToken);
    await expect(preferences.get(actorA)).resolves.toEqual({ timezone: 'Europe/London', locale: 'en-GB', preferredCurrency: 'GBP' });
    await expect(preferences.update(actorA, { timezone: 'America/New_York' }, '198.51.100.1', 'request-update', `${runId}-prefs-a`)).resolves.toEqual({ timezone: 'America/New_York', locale: 'en-GB', preferredCurrency: 'GBP' });
    await expect(preferences.get(actorB)).resolves.toEqual({ timezone: 'Europe/London', locale: 'en-GB', preferredCurrency: 'GBP' });
    await expect(prisma.auditEvent.count({ where: { actorUserId: a.user.id, action: 'ACCOUNT_PREFERENCES_UPDATED' } })).resolves.toBe(1);
  });

  it('returns newest-first safe allowlisted activity with a stable cursor', async () => {
    const signedUp = await auth.signup({ email: `${runId}-activity@example.test`, password: 'a sufficiently strong password', displayName: 'Activity User' }, 'request-activity', `${runId}-activity-signup`);
    const actor = await auth.actor(signedUp.accessToken);
    await preferences.update(actor, { locale: 'en-US' }, '198.51.100.2', 'request-pref', `${runId}-activity-prefs`);
    await prisma.auditEvent.create({ data: { actorUserId: signedUp.user.id, actorType: 'USER', action: 'ACCESS_DENIED', resourceType: 'internal', result: 'SUCCESS' } });
    const first = await activity.list(actor, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({ type: 'PREFERENCES_UPDATED', metadata: {}, context: null });
    expect(JSON.stringify(first)).not.toContain(signedUp.user.id);
    expect(first.nextCursor).not.toBeNull();
    const second = await activity.list(actor, { cursor: first.nextCursor!, limit: 10 });
    expect(second.items.some((item) => item.type === 'ACCOUNT_CREATED')).toBe(true);
    expect(second.items.some((item) => item.type === 'ACCESS_DENIED')).toBe(false);
  });
});
