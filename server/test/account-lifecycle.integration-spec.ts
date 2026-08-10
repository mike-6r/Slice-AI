import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl } from '../src/config/app-config';
import { AccountLifecycleService } from '../src/modules/identity/auth/account-lifecycle.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
assertTestDatabaseUrl(databaseUrl);
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `account-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const service = new AccountLifecycleService(db as never, { require: () => undefined } as never, { enforce: async () => undefined } as never);

function actor(userId: string, sessionId: string) {
  return { userId, sessionId, status: 'ACTIVE', roles: ['USER'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() } as never;
}

describe('customer account lifecycle with PostgreSQL', () => {
  beforeAll(() => db.$connect());
  afterAll(async () => {
    await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: run } } });
    await db.accountDeletionRequest.deleteMany({ where: { user: { normalizedEmail: { startsWith: run } } } });
    await db.cashReservation.deleteMany({ where: { purposeId: { startsWith: run } } });
    await db.financialAccount.deleteMany({ where: { id: { startsWith: run } } });
    await db.user.deleteMany({ where: { normalizedEmail: { startsWith: run } } });
    await db.$disconnect();
  });

  it('produces a bounded safe JSON export without credentials or internal identifiers', async () => {
    const user = await createUser('export');
    const result = await service.exportData(actor(user.id, `${run}-export-session`), '198.51.100.1', 'request-export', `${run}-export`);
    expect(result.format).toBe('JSON');
    expect(result.data.account.email).toBe(user.email);
    expect(result.data.preferences).toMatchObject({ timezone: 'Europe/London', locale: 'en-GB' });
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|tokenHash|secretCiphertext|accessTokenCiphertext|providerReferenceCiphertext/);
    await expect(service.exportData(actor(user.id, `${run}-export-session`), '198.51.100.1', 'request-export-replay', `${run}-export`)).resolves.toEqual(result);
  });

  it('creates one durable deletion lifecycle under concurrent customer requests and permits cancellation', async () => {
    const user = await createUser('deletion');
    const value = actor(user.id, `${run}-deletion-session`);
    const results = await Promise.all([
      service.requestDeletion(value, {}, '198.51.100.2', 'request-delete-a', `${run}-delete-a`),
      service.requestDeletion(value, {}, '198.51.100.2', 'request-delete-b', `${run}-delete-b`),
    ]);
    expect(results.map((item) => item.status)).toEqual(['REQUESTED', 'REQUESTED']);
    await expect(db.accountDeletionRequest.count({ where: { userId: user.id, status: { in: ['REQUESTED', 'UNDER_REVIEW', 'BLOCKED', 'APPROVED', 'PROCESSING'] } } })).resolves.toBe(1);
    await expect(service.cancelDeletion(value, '198.51.100.2', 'request-cancel', `${run}-cancel`)).resolves.toMatchObject({ status: 'CANCELLED', canCancel: false });
  });

  it('deactivates only eligible accounts, revokes every session, and preserves finance rows', async () => {
    const user = await createUser('deactivate');
    const sessionId = `${run}-deactivate-session`;
    await db.session.create({ data: { id: sessionId, publicId: `session_${sessionId}`, userId: user.id, tokenHash: `${sessionId}-hash`, familyId: `${sessionId}-family`, expiresAt: new Date(Date.now() + 60_000) } });
    const financial = await db.financialAccount.create({ data: { id: `${run}-financial`, ownerType: 'USER', ownerUserId: user.id, accountType: 'LIABILITY', code: 'EXPORT_TEST', currency: 'GBP', normalSide: 'CREDIT' } });
    const result = await service.deactivate(actor(user.id, sessionId), {}, '198.51.100.3', 'request-deactivate', `${run}-deactivate`);
    expect(result.accountStatus).toBe('DEACTIVATED');
    await expect(db.session.findUniqueOrThrow({ where: { id: sessionId } })).resolves.toMatchObject({ revocationReason: 'DEACTIVATED' });
    await expect(db.financialAccount.findUnique({ where: { id: financial.id } })).resolves.not.toBeNull();
  });

  it('blocks deactivation and marks deletion review blocked when a real active cash reservation exists', async () => {
    const user = await createUser('blocked');
    const account = await db.financialAccount.create({ data: { id: `${run}-blocked-cash`, ownerType: 'USER', ownerUserId: user.id, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await db.cashReservation.create({ data: { accountId: account.id, purposeType: 'TEST', purposeId: `${run}-blocked`, amountMinor: 100, status: 'ACTIVE' } });
    const value = actor(user.id, `${run}-blocked-session`);
    await expect(service.deactivate(value, {}, '198.51.100.4', 'request-blocked', `${run}-blocked-deactivate`)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DEACTIVATION_BLOCKED' }) });
    await expect(service.requestDeletion(value, {}, '198.51.100.4', 'request-blocked-delete', `${run}-blocked-delete`)).resolves.toMatchObject({ status: 'BLOCKED', blockedReason: 'ACTIVE_RESERVATIONS' });
    await expect(db.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({ accountStatus: 'ACTIVE' });
  });

  async function createUser(label: string) {
    return db.user.create({ data: { id: `${run}-${label}`, email: `${run}-${label}@example.test`, normalizedEmail: `${run}-${label}@example.test`, passwordHash: 'test-only-hash', accountStatus: 'ACTIVE', profile: { create: { displayName: label, countryCode: 'GB', preferredCurrency: 'GBP', timezone: 'Europe/London', locale: 'en-GB' } } } });
  }
});
