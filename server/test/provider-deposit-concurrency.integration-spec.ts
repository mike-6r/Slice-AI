import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { ComplianceService } from '../src/modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';
import { WalletMovementService } from '../src/modules/providers/application/wallet-movement.service';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `provider-concurrency-${Date.now()}`;

describe('Document 016 duplicate provider deposit completion', () => {
  const userId = `${run}-user`, cashId = `${run}-cash`;
  const config = { providerMode: 'local', providersProductionEnabled: false, providerEncryptionKey: 'provider-concurrency-key-not-production', providerWebhookToleranceSeconds: 300, withdrawalLimitPerMovementMinor: 500000, withdrawalLimit24hMinor: 1000000, withdrawalLimit7dMinor: 2500000, recentAuthWindowSeconds: 300 } as AppConfig;
  const recent = new RecentAuthService(config), crypto = new ProviderCryptoService(config), ledger = new FinancialLedgerService(db as never, recent), compliance = new ComplianceService(db as never, crypto), movements = new WalletMovementService(db as never, ledger, compliance, recent, crypto, config);
  const actor: Actor = { userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE', roles: ['USER'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() };

  beforeAll(async () => {
    await db.$connect();
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test', accountStatus: 'ACTIVE' } });
    await db.financialAccount.create({ data: { id: cashId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(run, `compliance:${userId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion } });
  });
  afterAll(async () => {
    const ids = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map(x => x.id);
    const txIds = (await db.journalEntry.findMany({ where: { accountId: cashId }, select: { transactionId: true } })).map(x => x.transactionId);
    await db.auditEvent.deleteMany({ where: { actorUserId: userId } }); await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: ids } } }); await db.moneyMovement.deleteMany({ where: { id: { in: ids } } }); await db.journalEntry.deleteMany({ where: { transactionId: { in: txIds } } }); await db.journalTransaction.deleteMany({ where: { id: { in: txIds } } }); await rebuildProviderClearingProjection(); await db.accountBalance.deleteMany({ where: { accountId: cashId } }); await db.financialAccount.deleteMany({ where: { id: cashId } }); await db.complianceDecision.deleteMany({ where: { complianceCase: { userId } } }); await db.complianceCase.deleteMany({ where: { userId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect();
  });

  it('posts one journal credit under concurrent completion', async () => {
    const intent = await movements.createDeposit(actor, '700', `${run}-request`, `${run}-key`);
    const results = await Promise.allSettled([movements.completeFromProvider({ movementId: intent.id, providerReference: `${run}-provider`, providerEventId: `${run}-event`, requestId: `${run}-a` }), movements.completeFromProvider({ movementId: intent.id, providerReference: `${run}-provider`, providerEventId: `${run}-event`, requestId: `${run}-b` })]);
    expect(results.some(result => result.status === 'fulfilled')).toBe(true);
    const movement = await db.moneyMovement.findUniqueOrThrow({ where: { id: intent.id } });
    expect(movement.status).toBe('SETTLED');
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${intent.id}` } })).toBe(1);
    const entries = await db.journalEntry.findMany({ where: { transactionId: movement.ledgerTransactionId! } });
    expect(entries).toHaveLength(2);
    expect(entries.filter(x => x.side === 'DEBIT').reduce((s, x) => s + x.amountMinor, 0n)).toBe(entries.filter(x => x.side === 'CREDIT').reduce((s, x) => s + x.amountMinor, 0n));
    expect((await ledger.walletForUser(userId)).accounts.find(x => x.code === 'CASH_AVAILABLE')?.availableMinor).toBe('700');
    expect(await db.moneyMovementHistory.count({ where: { movementId: intent.id, toStatus: 'SETTLED' } })).toBe(1);
  });

  async function rebuildProviderClearingProjection() {
    const account = await db.financialAccount.findFirst({ where: { ownerType: 'CLEARING', code: 'EXTERNAL_GBP_CLEARING', currency: 'GBP' }, select: { id: true } });
    if (!account) return;
    const totals = await db.journalEntry.groupBy({ by: ['side'], where: { accountId: account.id }, _sum: { amountMinor: true } });
    const debit = totals.find((item) => item.side === 'DEBIT')?._sum.amountMinor ?? 0n;
    const credit = totals.find((item) => item.side === 'CREDIT')?._sum.amountMinor ?? 0n;
    await db.accountBalance.upsert({ where: { accountId: account.id }, create: { accountId: account.id, postedDebitMinor: debit, postedCreditMinor: credit }, update: { postedDebitMinor: debit, postedCreditMinor: credit } });
  }
});
