import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../config/app-config';
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

const run = `provider-qa-${Date.now()}`;
const userId = `${run}-user`;
const cashAccountId = `${run}-cash`;
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const config = {
  providerMode: 'local',
  providersProductionEnabled: false,
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
    await db.financialAccount.create({ data: { id: cashAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(`${run}-case-ref`, `compliance:${userId}`), providerReferenceHash: crypto.hash(`${run}-case-ref`), encryptionKeyVersion: crypto.keyVersion } });

    const deposit = await movements.createDeposit(actor, '10000', `${run}-deposit-create`, `${run}-deposit-key`);
    await movements.completeFromProvider({ movementId: deposit.id, providerReference: `${run}-deposit-ref`, providerEventId: `${run}-deposit-event`, requestId: `${run}-deposit-complete` });
    const depositReplay = await movements.completeFromProvider({ movementId: deposit.id, providerReference: `${run}-deposit-ref`, providerEventId: `${run}-deposit-event`, requestId: `${run}-deposit-replay` });
    requireEqual(depositReplay.replayed, true, 'deposit replay');
    requireEqual((await ledger.walletForUser(userId)).accounts.find((account) => account.code === 'CASH_AVAILABLE')?.availableMinor, '10000', 'deposit credit');

    const withdrawal = await movements.createWithdrawal(actor, '1500', `${run}-withdrawal-create`, `${run}-withdrawal-key`, 'LOCAL_LOW_RISK');
    requireEqual((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: withdrawal.id } })).reservationId! } })).status, 'ACTIVE', 'withdrawal reservation');
    await movements.completeFromProvider({ movementId: withdrawal.id, providerReference: `${run}-withdrawal-ref`, providerEventId: `${run}-withdrawal-event`, requestId: `${run}-withdrawal-complete` });
    requireEqual((await ledger.walletForUser(userId)).accounts.find((account) => account.code === 'CASH_AVAILABLE')?.availableMinor, '8500', 'withdrawal debit');

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
    await movements.reverseFromProvider({ movementId: reversible.id, reasonCode: 'LOCAL_QA_REVERSAL', requestId: `${run}-reverse` });
    requireEqual((await db.moneyMovement.findUniqueOrThrow({ where: { id: reversible.id } })).status, 'REVERSED', 'reversal status');

    const result = await reconciliation.run(actor, 'BRIDGE', `${run}-reconciliation`);
    requireEqual(result.reconciled, true, 'provider reconciliation');
    console.log(JSON.stringify({ run, deposit: 'SETTLED_ONCE', withdrawal: 'SETTLED_ONCE', cancellation: 'RELEASED_ONCE', hold: 'ENFORCED_AND_RELEASED', reversal: 'APPEND_ONLY', reconciliation: 'RECONCILED' }));
  } finally {
    const movementIds = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map((movement) => movement.id);
    const journalIds = (await db.journalEntry.findMany({ where: { accountId: cashAccountId }, select: { transactionId: true } })).map((entry) => entry.transactionId);
    await db.auditEvent.deleteMany({ where: { actorUserId: userId } });
    await db.complianceHold.deleteMany({ where: { userId } });
    await db.providerDiscrepancy.deleteMany({ where: { run: { actorUserId: userId } } });
    await db.providerReconciliationRun.deleteMany({ where: { actorUserId: userId } });
    await db.providerIncident.deleteMany({ where: { ownerUserId: userId } });
    await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: movementIds } } });
    await db.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.journalEntry.deleteMany({ where: { transactionId: { in: journalIds } } });
    await db.journalTransaction.deleteMany({ where: { id: { in: journalIds } } });
    await db.cashReservation.deleteMany({ where: { accountId: cashAccountId } });
    await db.accountBalance.deleteMany({ where: { accountId: cashAccountId } });
    await db.financialAccount.deleteMany({ where: { id: cashAccountId } });
    await db.complianceDecision.deleteMany({ where: { complianceCase: { userId } } });
    await db.complianceCase.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    const residual = await Promise.all([
      db.user.count({ where: { id: userId } }),
      db.moneyMovement.count({ where: { userId } }),
      db.cashReservation.count({ where: { accountId: cashAccountId } }),
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
