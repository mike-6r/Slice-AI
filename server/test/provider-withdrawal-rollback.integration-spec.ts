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
const run = `provider-withdrawal-rollback-${Date.now()}`;

describe('Document 016 withdrawal rollback and recovery', () => {
  const userId = `${run}-user`;
  const cashAccountId = `${run}-cash`;
  const fundingAccountId = `${run}-funding`;
  const config = { providerMode: 'local', providersProductionEnabled: false, providerEncryptionKey: 'provider-withdrawal-rollback-key-not-production', providerWebhookToleranceSeconds: 300, withdrawalLimitPerMovementMinor: 500_000, withdrawalLimit24hMinor: 1_000_000, withdrawalLimit7dMinor: 2_500_000, recentAuthWindowSeconds: 300 } as AppConfig;
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
    await db.financialAccount.createMany({ data: [
      { id: cashAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
      { id: fundingAccountId, ownerType: 'PLATFORM', accountType: 'ASSET', code: `${run}-FUNDING`, currency: 'GBP', normalSide: 'DEBIT' },
    ] });
    await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(run, `compliance:${userId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion } });
    await ledger.post(actor, { type: 'DEMO_FUNDING', correlationId: `${run}-fund`, descriptionCode: 'TEST_FUND', lines: [{ accountId: fundingAccountId, side: 'DEBIT', amountMinor: '10000' }, { accountId: cashAccountId, side: 'CREDIT', amountMinor: '10000' }] }, `${run}-fund-request`, `${run}-fund-key`);
  });

  afterAll(async () => {
    setProviderTestFailureHook(undefined);
    const movementIds = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map((item) => item.id);
    const transactionIds = (await db.journalEntry.findMany({ where: { accountId: { in: [cashAccountId, fundingAccountId] } }, select: { transactionId: true } })).map((item) => item.transactionId);
    await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: userId }, { resourceId: { in: movementIds } }] } });
    await db.providerDiscrepancy.deleteMany({ where: { run: { actorUserId: userId } } });
    await db.providerReconciliationRun.deleteMany({ where: { actorUserId: userId } });
    await db.providerIncident.deleteMany({ where: { ownerUserId: userId } });
    await db.complianceHold.deleteMany({ where: { userId } });
    await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: movementIds } } });
    await db.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.cashReservation.deleteMany({ where: { accountId: cashAccountId } });
    await db.journalEntry.deleteMany({ where: { transactionId: { in: transactionIds } } });
    await db.journalTransaction.deleteMany({ where: { id: { in: transactionIds } } });
    await rebuildProviderClearingProjection();
    await db.accountBalance.deleteMany({ where: { accountId: { in: [cashAccountId, fundingAccountId] } } });
    await db.financialAccount.deleteMany({ where: { id: { in: [cashAccountId, fundingAccountId] } } });
    await db.complianceDecision.deleteMany({ where: { complianceCase: { userId } } });
    await db.complianceCase.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('fails creation without an orphan reservation and a new request can reserve once', async () => {
    setProviderTestFailureHook((stage) => { if (stage === 'movement.withdrawal.before-reservation') throw new Error('INJECTED_BEFORE_RESERVATION'); });
    await expect(movements.createWithdrawal(actor, '5000', `${run}-create-fail`, `${run}-create-fail-key`, 'LOW')).rejects.toThrow('INJECTED_BEFORE_RESERVATION');
    setProviderTestFailureHook(undefined);
    expect(await db.cashReservation.count({ where: { accountId: cashAccountId, status: 'ACTIVE' } })).toBe(0);
    expect(await db.moneyMovement.count({ where: { userId, status: 'FAILED', failureCode: 'RESERVATION_REJECTED' } })).toBe(1);
    await assertWallet('10000', '0', '10000');
    const failedReplay = await movements.createWithdrawal(actor, '5000', `${run}-create-fail`, `${run}-create-fail-key`, 'LOW');
    expect(failedReplay.status).toBe('FAILED');
    const valid = await movements.createWithdrawal(actor, '5000', `${run}-create-ok`, `${run}-create-ok-key`, 'LOW');
    expect(valid.status).toBe('PENDING_PROVIDER');
    await assertWallet('10000', '5000', '5000');
    await movements.cancelFromProvider({ movementId: valid.id, reasonCode: 'TEST_CLEAN_CANCEL', requestId: `${run}-create-ok-cancel` });
    await assertWallet('10000', '0', '10000');
  });

  it('preserves the reservation on a pre-journal completion failure then settles once', async () => {
    const pending = await movements.createWithdrawal(actor, '5000', `${run}-before-create`, `${run}-before-key`, 'LOW');
    setProviderTestFailureHook((stage) => { if (stage === 'movement.complete.before-journal') throw new Error('INJECTED_BEFORE_JOURNAL'); });
    await expect(movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-before-ref`, providerEventId: `${run}-before-event`, requestId: `${run}-before-fail` })).rejects.toThrow('INJECTED_BEFORE_JOURNAL');
    setProviderTestFailureHook(undefined);
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING_PROVIDER');
    expect((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).reservationId! } })).status).toBe('ACTIVE');
    expect(await completionJournalCount(pending.id)).toBe(0);
    await assertWallet('10000', '5000', '5000');
    await complete(pending.id, 'before');
    await assertSettled(pending.id, '5000', '5000');
  });

  it('recovers a post-journal withdrawal failure without a second debit', async () => {
    const pending = await movements.createWithdrawal(actor, '4000', `${run}-after-create`, `${run}-after-key`, 'LOW');
    setProviderTestFailureHook((stage) => { if (stage === 'movement.complete.after-journal') throw new Error('INJECTED_AFTER_JOURNAL'); });
    await expect(movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-after-ref`, providerEventId: `${run}-after-event`, requestId: `${run}-after-fail` })).rejects.toThrow('INJECTED_AFTER_JOURNAL');
    setProviderTestFailureHook(undefined);
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING_PROVIDER');
    expect((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).reservationId! } })).status).toBe('CONSUMED');
    expect(await completionJournalCount(pending.id)).toBe(1);
    await assertWallet('1000', '0', '1000');
    await complete(pending.id, 'after');
    await assertSettled(pending.id, '4000', '1000');
    await complete(pending.id, 'after-replay');
    expect(await completionJournalCount(pending.id)).toBe(1);
    expect(await db.moneyMovementHistory.count({ where: { movementId: pending.id, toStatus: 'SETTLED' } })).toBe(1);
    expect(await reconciliation.run(actor, 'BRIDGE', `${run}-reconcile`)).toMatchObject({ reconciled: true, mismatchCodes: [] });
  });

  it('rolls back cancellation before release and retries one coherent release', async () => {
    const pending = await movements.createWithdrawal(actor, '500', `${run}-cancel-create`, `${run}-cancel-key`, 'LOW');
    setProviderTestFailureHook((stage) => { if (stage === 'movement.cancel.before-release') throw new Error('INJECTED_CANCEL_BEFORE_RELEASE'); });
    await expect(movements.cancelFromProvider({ movementId: pending.id, reasonCode: 'TEST_CANCEL', requestId: `${run}-cancel-fail` })).rejects.toThrow('INJECTED_CANCEL_BEFORE_RELEASE');
    setProviderTestFailureHook(undefined);
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING_PROVIDER');
    expect((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).reservationId! } })).status).toBe('ACTIVE');
    await movements.cancelFromProvider({ movementId: pending.id, reasonCode: 'TEST_CANCEL', requestId: `${run}-cancel-retry` });
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
    expect((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).reservationId! } })).status).toBe('RELEASED');
    expect(await db.moneyMovementHistory.count({ where: { movementId: pending.id, toStatus: 'CANCELLED' } })).toBe(1);
    await movements.cancelFromProvider({ movementId: pending.id, reasonCode: 'TEST_CANCEL', requestId: `${run}-cancel-replay` });
    expect(await db.moneyMovementHistory.count({ where: { movementId: pending.id, toStatus: 'CANCELLED' } })).toBe(1);
    await assertWallet('1000', '0', '1000');
  });

  async function complete(id: string, suffix: string) { return movements.completeFromProvider({ movementId: id, providerReference: `${run}-${suffix}-ref`, providerEventId: `${run}-${suffix}-event`, requestId: `${run}-${suffix}-complete` }); }
  async function completionJournalCount(id: string) { return db.journalTransaction.count({ where: { correlationId: `provider-movement:${id}` } }); }
  async function assertWallet(totalMinor: string, reservedMinor: string, availableMinor: string) { expect((await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE')).toMatchObject({ totalMinor, reservedMinor, availableMinor }); }
  async function assertSettled(id: string, amount: string, total: string) {
    const movement = await db.moneyMovement.findUniqueOrThrow({ where: { id } });
    expect(movement.status).toBe('SETTLED');
    expect(await completionJournalCount(id)).toBe(1);
    expect(await db.moneyMovementHistory.count({ where: { movementId: id, toStatus: 'SETTLED' } })).toBe(1);
    expect((await db.cashReservation.findUniqueOrThrow({ where: { id: movement.reservationId! } })).status).toBe('CONSUMED');
    const journal = await db.journalTransaction.findUniqueOrThrow({ where: { id: movement.ledgerTransactionId! }, include: { entries: true } });
    expect(journal.entries).toHaveLength(2);
    expect(journal.entries.filter((entry) => entry.side === 'DEBIT').reduce((sum, entry) => sum + entry.amountMinor, 0n)).toBe(journal.entries.filter((entry) => entry.side === 'CREDIT').reduce((sum, entry) => sum + entry.amountMinor, 0n));
    await assertWallet(total, '0', total);
    expect(amount).toMatch(/^\d+$/);
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
