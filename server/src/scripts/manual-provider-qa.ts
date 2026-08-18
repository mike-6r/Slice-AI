import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl, type AppConfig } from '../config/app-config';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../modules/identity/access/recent-auth.service';
import type { Actor } from '../modules/identity/auth/auth.service';
import { ComplianceHoldService } from '../modules/providers/application/compliance-hold.service';
import { ComplianceService } from '../modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../modules/providers/application/provider-crypto.service';
import { ProviderReconciliationService } from '../modules/providers/application/provider-reconciliation.service';
import { WalletMovementService } from '../modules/providers/application/wallet-movement.service';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for qa:providers.');
assertTestDatabaseUrl(databaseUrl);

const run = `provider-qa-${Date.now()}`;
const userId = `${run}-user`;
const cashAccountId = `${run}-cash`;
const proceedsAccountId = `${run}-proceeds`;
const clearingAccountId = `${run}-clearing`;
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const config = {
  providerMode: 'local',
  stripeLiveEnabled: false,
  providerEncryptionKey: 'provider-qa-local-key-not-production',
  providerWebhookToleranceSeconds: 300,
  withdrawalLimitPerMovementMinor: 500_000,
  withdrawalLimit24hMinor: 1_000_000,
  withdrawalLimit7dMinor: 2_500_000,
  recentAuthWindowSeconds: 300,
} as AppConfig;

const actor: Actor = {
  userId: userId as never,
  sessionId: `${run}-session`,
  status: 'ACTIVE',
  roles: ['USER'],
  sessionRevokedAt: null,
  sessionRevocationReason: null,
  authenticatedAt: new Date(),
};

function requireEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

async function main() {
  const recentAuth = new RecentAuthService(config);
  const crypto = new ProviderCryptoService(config);
  const ledger = new FinancialLedgerService(db as never, recentAuth);
  const compliance = new ComplianceService(db as never, crypto);
  const movements = new WalletMovementService(db as never, ledger, compliance, recentAuth, crypto, config);
  const holds = new ComplianceHoldService(db as never, recentAuth);
  const reconciliation = new ProviderReconciliationService(db as never, recentAuth);

  await db.$connect();
  try {
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'local-qa-only', accountStatus: 'ACTIVE' } });
    await db.financialAccount.createMany({ data: [
      { id: cashAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
      { id: proceedsAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'COLLECTOR_PROCEEDS_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
      { id: clearingAccountId, ownerType: 'CLEARING', accountType: 'ASSET', code: 'EXTERNAL_GBP_CLEARING', currency: 'GBP', normalSide: 'DEBIT' },
    ] });
    await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(`${run}-case-ref`, `compliance:${userId}`), providerReferenceHash: crypto.hash(`${run}-case-ref`), encryptionKeyVersion: crypto.keyVersion } });

    await ledger.post(actor, { type: 'DEMO_FUNDING', correlationId: `${run}-proceeds-funding`, descriptionCode: 'LOCAL_QA_PROCEEDS_FUNDING', lines: [
      { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '10000' },
      { accountId: proceedsAccountId, side: 'CREDIT', amountMinor: '10000' },
    ] }, `${run}-proceeds-funding-request`, `${run}-proceeds-funding-key`);

    const deposit = await movements.createDeposit(actor, '10000', `${run}-deposit-create`, `${run}-deposit-key`);
    requireEqual((await ledger.walletForUser(userId)).pendingMinor, '10000', 'pending deposit');
    requireEqual((await ledger.walletForUser(userId)).accounts.find((account) => account.code === 'CASH_AVAILABLE')?.availableMinor, '0', 'deposit remains pending');
    await movements.completeFromProvider({ movementId: deposit.id, providerReference: `${run}-deposit-ref`, providerEventId: `${run}-deposit-event`, requestId: `${run}-deposit-complete` });
    const depositReplay = await movements.completeFromProvider({ movementId: deposit.id, providerReference: `${run}-deposit-ref`, providerEventId: `${run}-deposit-event`, requestId: `${run}-deposit-replay` });
    requireEqual(depositReplay.replayed, true, 'deposit replay');
    requireEqual((await ledger.walletForUser(userId)).accounts.find((account) => account.code === 'CASH_AVAILABLE')?.availableMinor, '10000', 'deposit credit');

    const proceedsWithdrawal = await movements.createWithdrawal(actor, '6000', `${run}-proceeds-withdrawal-create`, `${run}-proceeds-withdrawal-key`, 'LOCAL_LOW_RISK');
    requireEqual((await db.moneyMovement.findUniqueOrThrow({ where: { id: proceedsWithdrawal.id } })).cashAccountId, proceedsAccountId, 'collector proceeds withdrawal source');
    await movements.completeFromProvider({ movementId: proceedsWithdrawal.id, providerReference: `${run}-proceeds-withdrawal-ref`, providerEventId: `${run}-proceeds-withdrawal-event`, requestId: `${run}-proceeds-withdrawal-complete` });
    requireEqual((await ledger.walletForUser(userId)).collectorProceedsMinor, '4000', 'collector proceeds after withdrawal');

    const withdrawal = await movements.createWithdrawal(actor, '5000', `${run}-withdrawal-create`, `${run}-withdrawal-key`, 'LOCAL_LOW_RISK');
    requireEqual((await db.moneyMovement.findUniqueOrThrow({ where: { id: withdrawal.id } })).cashAccountId, cashAccountId, 'cash fallback withdrawal source');
    requireEqual((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: withdrawal.id } })).reservationId! } })).status, 'ACTIVE', 'withdrawal reservation');
    await movements.completeFromProvider({ movementId: withdrawal.id, providerReference: `${run}-withdrawal-ref`, providerEventId: `${run}-withdrawal-event`, requestId: `${run}-withdrawal-complete` });
    requireEqual((await ledger.walletForUser(userId)).accounts.find((account) => account.code === 'CASH_AVAILABLE')?.availableMinor, '5000', 'cash withdrawal debit');

    const failed = await movements.createWithdrawal(actor, '500', `${run}-failed-create`, `${run}-failed-key`, 'LOCAL_LOW_RISK');
    await movements.failFromProvider({ movementId: failed.id, reasonCode: 'LOCAL_QA_FAILED', requestId: `${run}-failed` });
    requireEqual((await ledger.walletForUser(userId)).accounts.find((account) => account.code === 'CASH_AVAILABLE')?.availableMinor, '5000', 'failed withdrawal release');

    const cancellable = await movements.createWithdrawal(actor, '500', `${run}-cancel-create`, `${run}-cancel-key`, 'LOCAL_LOW_RISK');
    await movements.cancelFromProvider({ movementId: cancellable.id, reasonCode: 'LOCAL_QA_CANCELLED', requestId: `${run}-cancel` });
    requireEqual((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: cancellable.id } })).reservationId! } })).status, 'RELEASED', 'cancelled withdrawal release');

    const hold = await holds.create(actor, { userId, scope: 'WITHDRAWAL', reasonCode: 'LOCAL_QA_HOLD', requestId: `${run}-hold` });
    await movements.createWithdrawal(actor, '100', `${run}-blocked`, `${run}-blocked-key`, 'LOCAL_LOW_RISK').then(
      () => { throw new Error('active compliance hold did not block withdrawal'); },
      () => undefined,
    );
    await holds.release(actor, hold.id);

    const reversible = await movements.createDeposit(actor, '700', `${run}-reverse-create`, `${run}-reverse-key`);
    await movements.completeFromProvider({ movementId: reversible.id, providerReference: `${run}-reverse-ref`, providerEventId: `${run}-reverse-event`, requestId: `${run}-reverse-complete` });
    await movements.returnFromProvider({ movementId: reversible.id, reasonCode: 'LOCAL_QA_RETURNED', requestId: `${run}-return` });
    await movements.returnFromProvider({ movementId: reversible.id, reasonCode: 'LOCAL_QA_RETURNED_REPLAY', requestId: `${run}-return-replay` });
    requireEqual((await db.moneyMovement.findUniqueOrThrow({ where: { id: reversible.id } })).status, 'RETURNED', 'returned status');
    const returnedRecord = await db.moneyMovement.findUniqueOrThrow({ where: { id: reversible.id } });
    const returnReversal = await db.journalTransaction.findFirstOrThrow({ where: { reversalOfId: returnedRecord.ledgerTransactionId! } });

    const result = await reconciliation.run(actor, 'LOCAL_TEST', `${run}-reconciliation`);
    requireEqual(result.reconciled, true, 'provider reconciliation');
    console.log(JSON.stringify({ run, movementIds: { deposit: deposit.id, proceedsWithdrawal: proceedsWithdrawal.id, withdrawal: withdrawal.id, failedWithdrawal: failed.id, cancellation: cancellable.id, returnedDeposit: reversible.id }, returnJournalIds: { original: returnedRecord.ledgerTransactionId, reversal: returnReversal.id }, deposit: 'PENDING_THEN_SETTLED_ONCE', proceedsWithdrawal: 'SETTLED_ONCE', withdrawal: 'SETTLED_ONCE', failedWithdrawal: 'RELEASED_ONCE', cancellation: 'RELEASED_ONCE', hold: 'ENFORCED_AND_RELEASED', returned: 'APPEND_ONLY_AND_REPLAY_SAFE', reconciliation: 'RECONCILED' }));
  } finally {
    const movementIds = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map((movement) => movement.id);
    const accountIds = [cashAccountId, proceedsAccountId, clearingAccountId];
    const journalIds = (await db.journalEntry.findMany({ where: { accountId: { in: accountIds } }, select: { transactionId: true } })).map((entry) => entry.transactionId);
    await db.auditEvent.deleteMany({ where: { actorUserId: userId } });
    await db.complianceHold.deleteMany({ where: { userId } });
    await db.providerDiscrepancy.deleteMany({ where: { run: { actorUserId: userId } } });
    await db.providerReconciliationRun.deleteMany({ where: { actorUserId: userId } });
    await db.providerIncident.deleteMany({ where: { ownerUserId: userId } });
    await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: movementIds } } });
    await db.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.journalEntry.deleteMany({ where: { transactionId: { in: journalIds } } });
    await db.journalTransaction.deleteMany({ where: { id: { in: journalIds } } });
    await db.cashReservation.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.accountBalance.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.financialAccount.deleteMany({ where: { id: { in: accountIds } } });
    await db.complianceDecision.deleteMany({ where: { complianceCase: { userId } } });
    await db.complianceCase.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    const residual = await Promise.all([
      db.user.count({ where: { id: userId } }),
      db.moneyMovement.count({ where: { userId } }),
      db.cashReservation.count({ where: { accountId: { in: accountIds } } }),
      db.complianceCase.count({ where: { userId } }),
    ]);
    console.log(JSON.stringify({ cleanup: { users: residual[0], movements: residual[1], reservations: residual[2], complianceCases: residual[3] } }));
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
