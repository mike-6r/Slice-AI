import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl, loadAppConfig } from '../src/config/app-config';
import { AuthService } from '../src/modules/identity/auth/auth.service';
import { SignupConsentService } from '../src/modules/identity/auth/signup-consent.service';
import { IdempotencyCoordinator } from '../src/modules/identity/auth/idempotency-coordinator';
import { AuthTokenService } from '../src/modules/identity/security/auth-token.service';
import { Argon2idPasswordHasher } from '../src/modules/identity/security/argon2id-password-hasher';
import { createIdentityTransaction } from '../src/modules/identity/persistence/prisma-identity.repositories';
import type { IdentityUnitOfWork } from '../src/modules/identity/ports/repositories';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
assertTestDatabaseUrl(databaseUrl);
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `signup-consent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = loadAppConfig({ NODE_ENV: 'test', TEST_DATABASE_URL: databaseUrl, JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256', SIGNUP_CONSENT_REQUIRED: 'true', TERMS_POLICY_VERSION: 'terms-development-v1', PRIVACY_POLICY_VERSION: 'privacy-development-v1' });
const uow: IdentityUnitOfWork = { withinTransaction: (work) => db.$transaction((tx) => work(createIdentityTransaction(tx))) };
const tx = createIdentityTransaction(db);
const auth = new AuthService(config, uow, tx.users, tx.sessions, tx.roles, new Argon2idPasswordHasher(), new AuthTokenService(config), new IdempotencyCoordinator(uow), undefined, undefined, new SignupConsentService(config, db as never));
const consent = { termsAccepted: true as const, privacyAccepted: true as const, termsVersion: 'terms-development-v1', privacyVersion: 'privacy-development-v1' };

describe('signup consent PostgreSQL integration', () => {
  beforeAll(() => db.$connect());
  afterAll(async () => { await db.user.deleteMany({ where: { normalizedEmail: { startsWith: run } } }); await db.$disconnect(); });

  it('atomically persists immutable Terms and Privacy evidence once for an idempotent signup', async () => {
    const input = { email: `${run}-valid@example.test`, password: 'a sufficiently strong password', displayName: 'Consent user', consent };
    const first = await auth.signup(input, 'request-valid', `${run}-key`);
    const replay = await auth.signup(input, 'request-replay', `${run}-key`);
    expect(replay.user).toEqual(first.user);
    const rows = await db.consentAcceptance.findMany({ where: { userId: first.user.id }, orderBy: { consentType: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.consentType, row.policyVersion, row.source])).toEqual([
      ['TERMS_OF_SERVICE', 'terms-development-v1', 'SIGNUP'],
      ['PRIVACY_POLICY', 'privacy-development-v1', 'SIGNUP'],
    ]);
    await expect(db.consentAcceptance.count({ where: { userId: first.user.id } })).resolves.toBe(2);
  });

  it('rejects missing or stale consent before creating any user or consent evidence', async () => {
    const email = `${run}-missing@example.test`;
    await expect(auth.signup({ email, password: 'a sufficiently strong password', displayName: 'Missing consent' }, 'request-missing', `${run}-missing`)).rejects.toMatchObject({ response: { code: 'REQUIRED_CONSENT_MISSING' } });
    await expect(db.user.count({ where: { normalizedEmail: email } })).resolves.toBe(0);
    await expect(db.consentAcceptance.count({ where: { user: { normalizedEmail: email } } })).resolves.toBe(0);
    await expect(auth.signup({ email: `${run}-stale@example.test`, password: 'a sufficiently strong password', displayName: 'Stale consent', consent: { ...consent, termsVersion: 'terms-development-v0' } }, 'request-stale', `${run}-stale`)).rejects.toMatchObject({ response: { code: 'REQUIRED_CONSENT_MISSING' } });
  });
});
