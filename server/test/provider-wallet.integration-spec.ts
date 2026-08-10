import { PrismaClient } from '@prisma/client';
import { type AppConfig } from '../src/config/app-config';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { ComplianceService } from '../src/modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';
import { WalletMovementService } from '../src/modules/providers/application/wallet-movement.service';
import { ProviderReconciliationService } from '../src/modules/providers/application/provider-reconciliation.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `provider-i-${Date.now()}`;

describe('Document 016 provider-neutral wallet authority', () => {
  const userId = `${run}-user`;
  const cashId = `${run}-cash`;
  const actor: Actor = {
    userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE',
    roles: ['USER'], sessionRevokedAt: null, sessionRevocationReason: null,
    authenticatedAt: new Date(),
  };
  const config = {
    providerMode: 'local', providersProductionEnabled: false,
    providerEncryptionKey: 'provider-wallet-integration-key-not-production',
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
  const movements = new WalletMovementService(
    db as never, ledger, compliance, recentAuth, crypto, config,
  );
  const reconciliation = new ProviderReconciliationService(db as never, recentAuth);

  beforeAll(async () => {
    await db.$connect();
    await cleanup();
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test-only', accountStatus: 'ACTIVE' } });
    await db.financialAccount.create({ data: { id: cashId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await db.complianceCase.create({ data: { id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED', providerReferenceCiphertext: crypto.encrypt(`${run}-reference`, `compliance:${userId}`), providerReferenceHash: crypto.hash(`${run}-reference`), encryptionKeyVersion: crypto.keyVersion } });
  });

  afterAll(async () => { await cleanup(); await db.$disconnect(); });

  it('credits cash exactly once only after provider-confirmed deposit completion', async () => {
    const intent = await movements.createDeposit(actor, '1200', `${run}-request-1`, `${run}-deposit-key`);
    expect((await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE')?.availableMinor).toBe('0');
    await movements.completeFromProvider({ movementId: intent.id, providerReference: `${run}-deposit-provider`, providerEventId: `${run}-event-1`, requestId: `${run}-webhook-1` });
    const replay = await movements.completeFromProvider({ movementId: intent.id, providerReference: `${run}-deposit-provider`, providerEventId: `${run}-event-1`, requestId: `${run}-webhook-2` });
    expect(replay.replayed).toBe(true);
    expect((await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE')?.availableMinor).toBe('1200');
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${intent.id}` } })).toBe(1);
  });

  it('reserves a withdrawal and releases it exactly once on provider failure', async () => {
    const movement = await movements.createWithdrawal(actor, '500', `${run}-request-2`, `${run}-withdrawal-key`);
    const reserved = (await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE');
    expect(reserved).toMatchObject({ totalMinor: '1200', reservedMinor: '500', availableMinor: '700' });
    await movements.failFromProvider({ movementId: movement.id, reasonCode: 'LOCAL_PROVIDER_FAILED', requestId: `${run}-webhook-3` });
    const released = (await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE');
    expect(released).toMatchObject({ totalMinor: '1200', reservedMinor: '0', availableMinor: '1200' });
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: movement.id } })).status).toBe('FAILED');
  });

  it('reverses a settled provider movement with one compensating immutable journal', async () => {
    const intent = await movements.createDeposit(actor, '300', `${run}-reverse-request`, `${run}-reverse-key`);
    await movements.completeFromProvider({ movementId: intent.id, providerReference: `${run}-reverse-provider`, providerEventId: `${run}-reverse-event`, requestId: `${run}-reverse-complete` });
    const original = await db.moneyMovement.findUniqueOrThrow({ where: { id: intent.id } });
    const reversed = await movements.reverseFromProvider({ movementId: intent.id, reasonCode: 'LOCAL_REVERSAL', requestId: `${run}-reverse` });
    expect(reversed.status).toBe('REVERSED');
    expect((await db.journalTransaction.findUniqueOrThrow({ where: { id: original.ledgerTransactionId! } })).status).toBe('REVERSED');
    expect(await db.journalTransaction.count({ where: { reversalOfId: original.ledgerTransactionId! } })).toBe(1);
    expect((await movements.reverseFromProvider({ movementId: intent.id, reasonCode: 'LOCAL_REVERSAL', requestId: `${run}-reverse-replay` })).replayed).toBe(true);
  });

  it('cancels a pending withdrawal and releases its cash reservation once', async () => {
    const movement = await movements.createWithdrawal(actor, '200', `${run}-cancel-request`, `${run}-cancel-key`);
    await movements.cancelFromProvider({ movementId: movement.id, reasonCode: 'LOCAL_CANCELLED', requestId: `${run}-cancel` });
    expect((await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: movement.id } })).reservationId! } })).status).toBe('RELEASED');
    expect((await movements.cancelFromProvider({ movementId: movement.id, reasonCode: 'LOCAL_CANCELLED', requestId: `${run}-cancel-replay` })).replayed).toBe(true);
  });

  it('fails closed on deterministic LOCAL_TEST high-risk screening before cash is reserved', async () => {
    await expect(movements.createWithdrawal(actor, '100', `${run}-request-risk`, `${run}-risk-key`, 'HIGH_RISK_DESTINATION')).rejects.toMatchObject({ response: { code: 'KYT_BLOCKED' } });
    expect(await db.cashReservation.count({ where: { accountId: cashId, status: 'ACTIVE' } })).toBe(0);
    expect(await db.moneyMovement.count({ where: { userId, idempotencyKeyHash: crypto.hash(`${run}-risk-key`) } })).toBe(0);
    expect(await db.complianceHold.count({ where: { userId, scope: 'WITHDRAWAL', status: 'ACTIVE' } })).toBe(1);
  });

  it('persists deterministic provider reconciliation discrepancies without repairing authority', async () => {
    const movement = await db.moneyMovement.create({ data: { id: `${run}-mismatch`, userId, cashAccountId: cashId, type: 'DEPOSIT', amountMinor: 99n, currency: 'GBP', status: 'SETTLED', provider: 'BRIDGE', idempotencyKeyHash: crypto.hash(`${run}-mismatch-key`) } });
    const result = await reconciliation.run(actor, 'BRIDGE', `${run}-reconcile`);
    expect(result).toMatchObject({ reconciled: false, mismatchCodes: ['PROVIDER_COMPLETED_LEDGER_MISSING', 'PROVIDER_REFERENCE_MISSING'] });
    expect((await db.moneyMovement.findUniqueOrThrow({ where: { id: movement.id } })).status).toBe('SETTLED');
    expect(await db.providerDiscrepancy.count({ where: { runId: result.id } })).toBe(2);
  });

  async function cleanup() {
    const movementIds = (await db.moneyMovement.findMany({ where: { userId: { startsWith: 'provider-i-' } }, select: { id: true, cashAccountId: true } })).map((item) => item.id);
    const accountIds = [cashId];
    const journalIds = (await db.journalEntry.findMany({ where: { accountId: { in: accountIds } }, select: { transactionId: true } })).map((item) => item.transactionId);
    await db.auditEvent.deleteMany({ where: { actorUserId: { startsWith: 'provider-i-' } } });
    await db.complianceHold.deleteMany({ where: { OR: [{ movementId: { in: movementIds } }, { userId: { startsWith: 'provider-i-' } }] } });
    await db.providerDiscrepancy.deleteMany({ where: { run: { actorUserId: userId } } });
    await db.providerReconciliationRun.deleteMany({ where: { actorUserId: userId } });
    await db.providerIncident.deleteMany({ where: { ownerUserId: userId } });
    await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: movementIds } } });
    await db.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.journalEntry.deleteMany({ where: { transactionId: { in: journalIds } } });
    await db.journalTransaction.deleteMany({ where: { id: { in: journalIds } } });
    // The clearing account is shared/provider-authoritative. Rebuild it from
    // surviving journal entries instead of deleting its projection.
    const clearing = await db.financialAccount.findFirst({ where: { ownerType: 'CLEARING', code: 'EXTERNAL_GBP_CLEARING', currency: 'GBP' }, select: { id: true } });
    if (clearing) {
      const totals = await db.journalEntry.groupBy({ by: ['side'], where: { accountId: clearing.id }, _sum: { amountMinor: true } });
      const debit = totals.find((item) => item.side === 'DEBIT')?._sum.amountMinor ?? 0n;
      const credit = totals.find((item) => item.side === 'CREDIT')?._sum.amountMinor ?? 0n;
      await db.accountBalance.upsert({ where: { accountId: clearing.id }, create: { accountId: clearing.id, postedDebitMinor: debit, postedCreditMinor: credit }, update: { postedDebitMinor: debit, postedCreditMinor: credit } });
    }
    await db.cashReservation.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.accountBalance.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.financialAccount.deleteMany({ where: { id: { in: accountIds } } });
    await db.complianceDecision.deleteMany({ where: { complianceCase: { userId: { startsWith: 'provider-i-' } } } });
    await db.complianceCase.deleteMany({ where: { userId: { startsWith: 'provider-i-' } } });
    await db.user.deleteMany({ where: { id: { startsWith: 'provider-i-' } } });
  }
});
