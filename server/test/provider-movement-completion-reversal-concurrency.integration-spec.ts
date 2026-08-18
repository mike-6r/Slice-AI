import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { ComplianceService } from '../src/modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';
import { ProviderReconciliationService } from '../src/modules/providers/application/provider-reconciliation.service';
import { WalletMovementService } from '../src/modules/providers/application/wallet-movement.service';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `provider-complete-reverse-${Date.now()}`;

describe('Document 016 provider completion versus reversal', () => {
  const userId = `${run}-user`;
  const cashAccountId = `${run}-cash`;
  const config = {
    providerMode: 'local', providersProductionEnabled: false,
    providerEncryptionKey: 'provider-complete-reverse-key-not-production',
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
  const actor: Actor = {
    userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE',
    roles: ['ADMIN'], sessionRevokedAt: null, sessionRevocationReason: null,
    authenticatedAt: new Date(),
  };

  beforeAll(async () => {
    await db.$connect();
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test', accountStatus: 'ACTIVE' } });
    await db.financialAccount.create({ data: { id: cashAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' } });
    await db.complianceCase.create({ data: {
      id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED',
      providerReferenceCiphertext: crypto.encrypt(run, `compliance:${userId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion,
    } });
  });

  afterAll(async () => {
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

  it('permits compensation only after exactly one authoritative completion', async () => {
    const pending = await movements.createDeposit(actor, '700', `${run}-create`, `${run}-create-key`);
    expect(pending.status).toBe('PENDING_PROVIDER');
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${pending.id}` } })).toBe(0);

    await Promise.allSettled([
      movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-provider-ref`, providerEventId: `${run}-event`, requestId: `${run}-complete` }),
      movements.reverseFromProvider({ movementId: pending.id, reasonCode: 'RACE_REVERSAL', requestId: `${run}-reverse` }),
    ]);

    let movement = await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } });
    expect(['SETTLED', 'REVERSED']).toContain(movement.status);
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${movement.id}` } })).toBe(1);
    const original = await db.journalTransaction.findUniqueOrThrow({ where: { id: movement.ledgerTransactionId! }, include: { entries: { orderBy: { sequence: 'asc' } } } });
    const originalEntries = original.entries.map((entry) => ({ accountId: entry.accountId, side: entry.side, amountMinor: entry.amountMinor }));

    if (movement.status === 'SETTLED') {
      await movements.reverseFromProvider({ movementId: movement.id, reasonCode: 'RETRY_REVERSAL', requestId: `${run}-retry-reverse` });
      movement = await db.moneyMovement.findUniqueOrThrow({ where: { id: movement.id } });
    }
    expect(movement.status).toBe('REVERSED');
    expect(await db.journalTransaction.count({ where: { reversalOfId: original.id } })).toBe(1);
    expect((await db.journalEntry.findMany({ where: { transactionId: original.id }, orderBy: { sequence: 'asc' } })).map((entry) => ({ accountId: entry.accountId, side: entry.side, amountMinor: entry.amountMinor }))).toEqual(originalEntries);
    expect(await db.moneyMovementHistory.count({ where: { movementId: movement.id, toStatus: 'SETTLED' } })).toBe(1);
    expect(await db.moneyMovementHistory.count({ where: { movementId: movement.id, toStatus: 'REVERSED' } })).toBe(1);

    await movements.reverseFromProvider({ movementId: movement.id, reasonCode: 'REPLAY_REVERSAL', requestId: `${run}-replay-reverse` });
    await expect(movements.completeFromProvider({ movementId: movement.id, providerReference: `${run}-late-ref`, providerEventId: `${run}-late-event`, requestId: `${run}-late-complete` })).rejects.toMatchObject({ response: { code: 'MOVEMENT_TERMINAL' } });
    expect(await db.journalTransaction.count({ where: { reversalOfId: original.id } })).toBe(1);
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${movement.id}` } })).toBe(1);

    const balance = await db.accountBalance.findUniqueOrThrow({ where: { accountId: cashAccountId } });
    const totals = await db.journalEntry.groupBy({ by: ['side'], where: { accountId: cashAccountId }, _sum: { amountMinor: true } });
    expect(balance.postedDebitMinor).toBe(totals.find((item) => item.side === 'DEBIT')?._sum.amountMinor ?? 0n);
    expect(balance.postedCreditMinor).toBe(totals.find((item) => item.side === 'CREDIT')?._sum.amountMinor ?? 0n);
    expect(balance.postedCreditMinor - balance.postedDebitMinor - balance.reservedMinor).toBeGreaterThanOrEqual(0n);
    expect(await reconciliation.run(actor, 'LOCAL_TEST', `${run}-reconcile`)).toMatchObject({ reconciled: true, mismatchCodes: [] });
  });

  async function rebuildProviderClearingProjection() {
    const clearing = await db.financialAccount.findFirst({ where: { ownerType: 'CLEARING', code: 'EXTERNAL_GBP_CLEARING', currency: 'GBP' }, select: { id: true } });
    if (!clearing) return;
    const totals = await db.journalEntry.groupBy({ by: ['side'], where: { accountId: clearing.id }, _sum: { amountMinor: true } });
    const debit = totals.find((item) => item.side === 'DEBIT')?._sum.amountMinor ?? 0n;
    const credit = totals.find((item) => item.side === 'CREDIT')?._sum.amountMinor ?? 0n;
    await db.accountBalance.upsert({ where: { accountId: clearing.id }, create: { accountId: clearing.id, postedDebitMinor: debit, postedCreditMinor: credit }, update: { postedDebitMinor: debit, postedCreditMinor: credit } });
  }
});
