import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { ComplianceService } from '../src/modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';
import { WalletMovementService } from '../src/modules/providers/application/wallet-movement.service';

const url = process.env.TEST_DATABASE_URL; if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } }); const run = `provider-withdraw-race-${Date.now()}`;

describe('Document 016 concurrent withdrawal reservations', () => {
  const userId = `${run}-user`, cashId = `${run}-cash`, clearingId = `${run}-clearing`;
  const config = { providerMode: 'local', providersProductionEnabled: false, providerEncryptionKey: 'provider-withdrawal-race-key-not-production', providerWebhookToleranceSeconds: 300, withdrawalLimitPerMovementMinor: 500000, withdrawalLimit24hMinor: 1000000, withdrawalLimit7dMinor: 2500000, recentAuthWindowSeconds: 300 } as AppConfig;
  const recent = new RecentAuthService(config), crypto = new ProviderCryptoService(config), ledger = new FinancialLedgerService(db as never, recent), compliance = new ComplianceService(db as never, crypto), movements = new WalletMovementService(db as never, ledger, compliance, recent, crypto, config);
  const actor: Actor = { userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE', roles: ['USER'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() };
  beforeAll(async () => { await db.$connect(); await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test', accountStatus: 'ACTIVE' } }); await db.financialAccount.createMany({ data: [{ id: cashId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' }, { id: clearingId, ownerType: 'PLATFORM', accountType: 'ASSET', code: `${run}-CLEARING`, currency: 'GBP', normalSide: 'DEBIT' }] }); await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(run, `compliance:${userId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion } }); await ledger.post(actor, { type: 'DEMO_FUNDING', correlationId: `${run}-fund`, descriptionCode: 'TEST_FUND', lines: [{ accountId: clearingId, side: 'DEBIT', amountMinor: '10000' }, { accountId: cashId, side: 'CREDIT', amountMinor: '10000' }] }, `${run}-fund`, `${run}-fund-key`); });
  afterAll(async () => { const ids = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map(x => x.id); const txIds = (await db.journalEntry.findMany({ where: { accountId: { in: [cashId, clearingId] } }, select: { transactionId: true } })).map(x => x.transactionId); await db.auditEvent.deleteMany({ where: { actorUserId: userId } }); await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: ids } } }); await db.moneyMovement.deleteMany({ where: { id: { in: ids } } }); await db.cashReservation.deleteMany({ where: { accountId: cashId } }); await db.journalEntry.deleteMany({ where: { transactionId: { in: txIds } } }); await db.journalTransaction.deleteMany({ where: { id: { in: txIds } } }); await db.accountBalance.deleteMany({ where: { accountId: { in: [cashId, clearingId] } } }); await db.financialAccount.deleteMany({ where: { id: { in: [cashId, clearingId] } } }); await db.complianceDecision.deleteMany({ where: { complianceCase: { userId } } }); await db.complianceCase.deleteMany({ where: { userId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); });
  it('never reserves more than the same available GBP cash concurrently', async () => {
    const outcomes = await Promise.allSettled([movements.createWithdrawal(actor, '7000', `${run}-a`, `${run}-a-key`, 'LOW_A'), movements.createWithdrawal(actor, '7000', `${run}-b`, `${run}-b-key`, 'LOW_B')]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    const active = await db.cashReservation.findMany({ where: { accountId: cashId, status: 'ACTIVE' } });
    expect(active).toHaveLength(1); expect(active[0].amountMinor).toBe(7000n);
    const wallet = (await ledger.walletForUser(userId)).accounts.find(x => x.code === 'CASH_AVAILABLE')!;
    expect(wallet).toMatchObject({ totalMinor: '10000', reservedMinor: '7000', availableMinor: '3000' });
    expect(await db.moneyMovement.count({ where: { userId, type: 'WITHDRAWAL', status: 'PENDING_PROVIDER' } })).toBe(1);
    expect(await db.moneyMovement.count({ where: { userId, type: 'WITHDRAWAL', status: 'FAILED', failureCode: 'RESERVATION_REJECTED' } })).toBe(1);
  });
});
