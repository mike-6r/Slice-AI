import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { PlaidBankLinkService } from '../src/modules/providers/application/plaid-bank-link.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `plaid-link-i-${Date.now()}`;

describe('Document 018 encrypted Plaid Link persistence', () => {
  const userId = `${run}-user`;
  const actor: Actor = { userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE', roles: ['USER'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() };
  const config = { providerMode: 'sandbox', providersProductionEnabled: false, providerEncryptionKey: 'plaid-link-integration-encryption-key-not-production', plaidClientId: 'test-client', plaidSecret: 'test-secret-not-real', plaidEnvironment: 'sandbox', plaidRequestTimeoutMs: 1_000 } as AppConfig;
  const crypto = new ProviderCryptoService(config);
  const links = new PlaidBankLinkService(db as never, crypto, config);

  beforeAll(async () => {
    await db.$connect();
    await cleanup();
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test-only', accountStatus: 'ACTIVE' } });
    Object.defineProperty(links, 'plaid', { value: {
      exchangePublicToken: jest.fn().mockResolvedValue({ accessToken: `${run}-access-token`, itemId: `${run}-item` }),
      listAccounts: jest.fn().mockResolvedValue([{ accountId: `${run}-account`, name: 'Sandbox current account', mask: '1234', type: 'depository', institutionName: null }]),
    } });
  });
  afterAll(async () => { await cleanup(); await db.$disconnect(); });

  it('persists only encrypted provider material and exact replay returns the safe saved connection', async () => {
    const first = await links.exchangePublicToken(actor, `${run}-public-token`, `${run}-request`, `${run}-key`);
    const replay = await links.exchangePublicToken(actor, `${run}-public-token`, `${run}-request-replay`, `${run}-key`);
    expect(first).toMatchObject({ replayed: false, connections: [{ accountName: 'Sandbox current account', accountMask: '1234', currency: 'GBP', status: 'CONNECTED' }] });
    expect(replay).toEqual({ connections: first.connections, replayed: true });
    const row = await db.externalFinancialAccount.findUniqueOrThrow({ where: { provider_providerReferenceHash: { provider: 'PLAID', providerReferenceHash: crypto.hash(`${run}-account`) } } });
    expect(row.accessTokenCiphertext).not.toContain(`${run}-access-token`);
    expect(row.itemReferenceCiphertext).not.toContain(`${run}-item`);
    expect(await links.list(userId)).toEqual({ items: first.connections });
    expect(await db.idempotencyRecord.count({ where: { actorScope: `user:${userId}`, scope: 'plaid.link.exchange', status: 'COMPLETED' } })).toBe(1);
  });

  async function cleanup() {
    await db.auditEvent.deleteMany({ where: { actorUserId: { startsWith: 'plaid-link-i-' } } });
    await db.idempotencyRecord.deleteMany({ where: { actorScope: { contains: 'plaid-link-i-' } } });
    await db.externalFinancialAccount.deleteMany({ where: { userId: { startsWith: 'plaid-link-i-' } } });
    await db.user.deleteMany({ where: { id: { startsWith: 'plaid-link-i-' } } });
  }
});
