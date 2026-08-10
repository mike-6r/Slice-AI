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
const run = `provider-cancel-complete-${Date.now()}`;

describe('Document 016 withdrawal cancellation versus provider completion', () => {
  const userId = `${run}-user`;
  const cashAccountId = `${run}-cash`;
  const fundingAccountId = `${run}-funding`;
  const config = {
    providerMode: 'local', providersProductionEnabled: false,
    providerEncryptionKey: 'provider-cancel-complete-key-not-production',
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
  const actor: Actor = {
    userId: userId as never, sessionId: `${run}-session`, status: 'ACTIVE',
    roles: ['USER'], sessionRevokedAt: null, sessionRevocationReason: null,
    authenticatedAt: new Date(),
  };

  beforeAll(async () => {
    await db.$connect();
    await db.user.create({ data: { id: userId, email: `${run}@example.test`, normalizedEmail: `${run}@example.test`, passwordHash: 'test', accountStatus: 'ACTIVE' } });
    await db.financialAccount.createMany({ data: [
      { id: cashAccountId, ownerType: 'USER', ownerUserId: userId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
      { id: fundingAccountId, ownerType: 'PLATFORM', accountType: 'ASSET', code: `${run}-FUNDING`, currency: 'GBP', normalSide: 'DEBIT' },
    ] });
    await db.complianceCase.create({ data: {
      id: `${run}-case`, userId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED',
      providerReferenceCiphertext: crypto.encrypt(run, `compliance:${userId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion,
    } });
    await ledger.post(actor, {
      type: 'DEMO_FUNDING', correlationId: `${run}-fund`, descriptionCode: 'TEST_FUND',
      lines: [
        { accountId: fundingAccountId, side: 'DEBIT', amountMinor: '10000' },
        { accountId: cashAccountId, side: 'CREDIT', amountMinor: '10000' },
      ],
    }, `${run}-fund-request`, `${run}-fund-key`);
  });

  afterAll(async () => {
    const movementIds = (await db.moneyMovement.findMany({ where: { userId }, select: { id: true } })).map((item) => item.id);
    const transactionIds = (await db.journalEntry.findMany({ where: { accountId: { in: [cashAccountId, fundingAccountId] } }, select: { transactionId: true } })).map((item) => item.transactionId);
    await db.auditEvent.deleteMany({ where: { OR: [{ actorUserId: userId }, { resourceId: { in: movementIds } }] } });
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

  it('commits either cancellation or completion, never a mixed terminal authority', async () => {
    const pending = await movements.createWithdrawal(actor, '5000', `${run}-create`, `${run}-create-key`, 'LOW');
    expect(pending.status).toBe('PENDING_PROVIDER');
    const beforeReservation = await db.cashReservation.findUniqueOrThrow({ where: { id: (await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } })).reservationId! } });
    expect(beforeReservation.status).toBe('ACTIVE');
    expect((await ledger.walletForUser(userId)).accounts.find((item) => item.code === 'CASH_AVAILABLE')).toMatchObject({ totalMinor: '10000', reservedMinor: '5000', availableMinor: '5000' });
    expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${pending.id}` } })).toBe(0);

    await Promise.allSettled([
      movements.cancelFromProvider({ movementId: pending.id, reasonCode: 'RACE_CANCELLED', requestId: `${run}-cancel` }),
      movements.completeFromProvider({ movementId: pending.id, providerReference: `${run}-provider-ref`, providerEventId: `${run}-event`, requestId: `${run}-complete` }),
    ]);

    const movement = await db.moneyMovement.findUniqueOrThrow({ where: { id: pending.id } });
    const reservation = await db.cashReservation.findUniqueOrThrow({ where: { id: movement.reservationId! } });
    const completionJournals = await db.journalTransaction.count({ where: { correlationId: `provider-movement:${movement.id}` } });
    const terminalTransitions = await db.moneyMovementHistory.count({ where: { movementId: movement.id, toStatus: { in: ['SETTLED', 'CANCELLED'] } } });
    expect(['SETTLED', 'CANCELLED']).toContain(movement.status);
    expect(terminalTransitions).toBe(1);
    expect(reservation.status).not.toBe('ACTIVE');
    expect(completionJournals).toBeLessThanOrEqual(1);

    if (movement.status === 'SETTLED') {
      expect(reservation.status).toBe('CONSUMED');
      expect(completionJournals).toBe(1);
      await expect(movements.cancelFromProvider({ movementId: movement.id, reasonCode: 'LATE_CANCEL', requestId: `${run}-late-cancel` })).rejects.toMatchObject({ response: { code: 'MOVEMENT_TERMINAL' } });
      expect((await db.cashReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe('CONSUMED');
    } else {
      expect(reservation.status).toBe('RELEASED');
      expect(completionJournals).toBe(0);
      await expect(movements.completeFromProvider({ movementId: movement.id, providerReference: `${run}-late-ref`, providerEventId: `${run}-late-event`, requestId: `${run}-late-complete` })).rejects.toMatchObject({ response: { code: 'MOVEMENT_TERMINAL' } });
      expect(await db.journalTransaction.count({ where: { correlationId: `provider-movement:${movement.id}` } })).toBe(0);
    }

    const balance = await db.accountBalance.findUniqueOrThrow({ where: { accountId: cashAccountId } });
    const entries = await db.journalEntry.groupBy({ by: ['side'], where: { accountId: cashAccountId }, _sum: { amountMinor: true } });
    const debit = entries.find((item) => item.side === 'DEBIT')?._sum.amountMinor ?? 0n;
    const credit = entries.find((item) => item.side === 'CREDIT')?._sum.amountMinor ?? 0n;
    expect(balance).toMatchObject({ postedDebitMinor: debit, postedCreditMinor: credit });
    expect(balance.postedCreditMinor - balance.postedDebitMinor - balance.reservedMinor).toBeGreaterThanOrEqual(0n);
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
