import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { ComplianceService } from '../src/modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';
import { ProviderReconciliationService } from '../src/modules/providers/application/provider-reconciliation.service';
import { setProviderTestFailureHook } from '../src/modules/providers/application/provider-test-failure-injection';
import { WalletMovementService } from '../src/modules/providers/application/wallet-movement.service';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `provider-deposit-rollback-${Date.now()}`;

describe('Document 016 deposit completion rollback and recovery', () => {
  const userId = `${run}-user`;
  const cashAccountId = `${run}-cash`;
  const config = {
    providerMode: 'local', providersProductionEnabled: false,
    providerEncryptionKey: 'provider-deposit-rollback-key-not-production',
    providerWebhookToleranceSeconds: 300,
    withdrawalLimitPerMovementMinor: 500_000,
    withdrawalLimit24hMinor: 1_000_000,
    withdrawalLimit7dMinor: 2_500_000,
    recentAuthWindowSeconds: 300,
  } as AppConfig;
  const recentAuth = new RecentAuthService(config);
  const crypto = new ProviderCryptoService(config);
  const ledger = new FinancialLedgerService(db as never, recentAuth);
  const compliance = new ComplianceService(db as never, crypto);
  const movements = new WalletMovementService(db as never, ledger, compliance, recentAuth, crypto, config);
  const reconciliation = new ProviderReconciliationService(db as never, recentAuth);
  const actor: Actor = { userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE', roles: ['ADMIN'], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() };

  beforeAll(async () => {
    await db.$connect();
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test', accountStatus: 'ACTIVE' } });
    await db.financialAccount.create({ data: { id: cashAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(run, `compliance:${userId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion } });
  });

  afterAll(async () => {
    setProviderTestFailureHook(undefined);
    const movementIds = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map((item) => item.id);
    const transactionIds = (await db.journalEntry.findMany({ where: { accountId: cashAccountId }, select: { transactionId: true } })).map((item) => item.transactionId);
    await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: userId }, { resourceId: { in: movementIds } }] } });
    await db.providerDiscrepancy.deleteMany({ where: { run: { actorUserId: userId } } });
    await db.providerReconciliationRun.deleteMany({ where: { actorUserId: userId } });
    await db.providerIncident.deleteMany({ where: { ownerUserId: userId } });
    await db.complianceHold.deleteMany({ where: { userId } });
    await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: movementIds } } });
    await db.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.journalEntry.deleteMany({ where: { transactionId: { in: transactionIds } } });
    await db.journalTransaction.deleteMany({ where: { reversalOfId: { in: transactionIds } } });
    await db.journalTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await rebuildProviderClearingProjection();
    await db.accountBalance.deleteMany({ where: { accountId: cashAccountId } });
    await db.financialAccount.deleteMany({ where: { id: cashAccountId } });
    await db.complianceDecision.deleteMany({ where: { complianceCase: { userId } } });
    await db.complianceCase.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('rolls back before journal posting and retries to one settled credit', async () => {
    const pending = await movements.createDeposit(actor, '700', `${run}-before-create`, `${run}-before-key`);
    setProviderTestFailureHook((stage) => { if (stage === 'movement.complete.before-journal') throw new Error('INJECTED_BEFORE_JOURNAL'); });
    await expect(movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-before-ref`, providerEventId: `${run}-before-event`, requestId: `${run}-before-failed` })).rejects.toThrow('INJECTED_BEFORE_JOURNAL');
    setProviderTestFailureHook(undefined);
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING_PROVIDER');
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${pending.id}` } })).toBe(0);
    expect(await db.moneyMovementHistory.count({ where: { movementId: pending.id, toStatus: 'SETTLED' } })).toBe(0);
    expect((await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE')?.availableMinor).toBe('0');

    await movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-before-ref`, providerEventId: `${run}-before-event`, requestId: `${run}-before-retry` });
    await assertSettledExactlyOnce(pending.id, '700');
  });

  it('recovers a committed journal after finalization fails without a second credit', async () => {
    const pending = await movements.createDeposit(actor, '900', `${run}-after-create`, `${run}-after-key`);
    setProviderTestFailureHook((stage) => { if (stage === 'movement.complete.after-journal') throw new Error('INJECTED_AFTER_JOURNAL'); });
    await expect(movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-after-ref`, providerEventId: `${run}-after-event`, requestId: `${run}-after-failed` })).rejects.toThrow('INJECTED_AFTER_JOURNAL');
    setProviderTestFailureHook(undefined);
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING_PROVIDER');
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${pending.id}` } })).toBe(1);
    expect(await db.moneyMovementHistory.count({ where: { movementId: pending.id, toStatus: 'SETTLED' } })).toBe(0);

    await movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-after-ref`, providerEventId: `${run}-after-event`, requestId: `${run}-after-retry` });
    await assertSettledExactlyOnce(pending.id, '900');
    await movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-after-ref`, providerEventId: `${run}-after-event`, requestId: `${run}-after-replay` });
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${pending.id}` } })).toBe(1);
    expect(await db.moneyMovementHistory.count({ where: { movementId: pending.id, toStatus: 'SETTLED' } })).toBe(1);
    expect(await reconciliation.run(actor, 'BRIDGE', `${run}-reconcile`)).toMatchObject({ reconciled: true, mismatchCodes: [] });
  });

  async function assertSettledExactlyOnce(movementId: string, amount: string) {
    const movement = await db.moneyMovement.findUniqueOrThrow({ where: { id: movementId } });
    expect(movement.status).toBe('SETTLED');
    const journal = await db.journalTransaction.findUniqueOrThrow({ where: { id: movement.ledgerTransactionId! }, include: { entries: true } });
    expect(journal.entries).toHaveLength(2);
    expect(journal.entries.filter((entry) => entry.side === 'DEBIT').reduce((sum, entry) => sum + entry.amountMinor, 0n)).toBe(journal.entries.filter((entry) => entry.side === 'CREDIT').reduce((sum, entry) => sum + entry.amountMinor, 0n));
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${movementId}` } })).toBe(1);
    expect(await db.moneyMovementHistory.count({ where: { movementId, toStatus: 'SETTLED' } })).toBe(1);
    expect((await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE')?.totalMinor).toBe(amount === '700' ? '700' : '1600');
  }

  async function rebuildProviderClearingProjection() {
    const clearing = await db.financialAccount.findFirst({ where: { ownerType: 'CLEARING', code: 'EXTERNAL_GBP_CLEARING', currency: 'GBP' }, select: { id: true } });
    if (!clearing) return;
    const totals = await db.journalEntry.groupBy({ by: ['side'], where: { accountId: clearing.id }, _sum: { amountMinor: true } });
    const debit = totals.find((item) => item.side === 'DEBIT')?._sum.amountMinor ?? 0n;
    const credit = totals.find((item) => item.side === 'CREDIT')?._sum.amountMinor ?? 0n;
    await db.accountBalance.upsert({ where: { accountId: clearing.id }, create: { accountId: clearing.id, postedDebitMinor: debit, postedCreditMinor: credit }, update: { postedDebitMinor: debit, postedCreditMinor: credit } });
  }
});
