import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { type AppConfig } from '../src/config/app-config';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { ComplianceService } from '../src/modules/providers/application/compliance.service';
import { ProviderCryptoService } from '../src/modules/providers/application/provider-crypto.service';
import { WalletMovementService } from '../src/modules/providers/application/wallet-movement.service';
import { TradingService } from '../src/modules/trading/application/trading.service';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `phase3-offering-${Date.now()}-${randomUUID().slice(0, 8)}`;
const config = {
  providerMode: 'local', providersProductionEnabled: false,
  providerEncryptionKey: 'phase3-offering-local-key-not-production',
  providerWebhookToleranceSeconds: 300, withdrawalLimitPerMovementMinor: 500_000,
  withdrawalLimit24hMinor: 1_000_000, withdrawalLimit7dMinor: 2_500_000,
  recentAuthWindowSeconds: 300,
} as AppConfig;
const recent = new RecentAuthService(config);
const crypto = new ProviderCryptoService(config);
const ledger = new FinancialLedgerService(db as never, recent);
const compliance = new ComplianceService(db as never, crypto);
const movements = new WalletMovementService(db as never, ledger, compliance, recent, crypto, config);
const trading = new TradingService(db as never, recent);
const actor = (userId: string): Actor => ({
  userId: userId as never, sessionId: `${userId}-session`, status: 'ACTIVE', roles: ['USER'],
  sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date(),
});
const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };

describe('Phase 3 initial offering and order/withdrawal runtime QA', () => {
  const collectorId = `${run}-collector`;
  const investorId = `${run}-investor`;
  const raceId = `${run}-race`;
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const marketId = assetId;
  const investorCashId = `${run}-investor-cash`;
  const raceCashId = `${run}-race-cash`;
  const clearingId = `${run}-clearing`;
  const inventoryAccountId = `${run}-inventory-account`;
  const supplyPolicyId = `${run}-policy`;
  const valuationId = `${run}-valuation`;
  const offeringId = `${run}-offering`;
  const inventoryId = `${run}-inventory`;
  const offeringOrderId = `${run}-offering-order`;
  const offeringReservationId = `${run}-offering-reservation`;

  beforeAll(async () => {
    await db.$connect();
    await db.user.createMany({ data: [collectorId, investorId, raceId].map((id) => ({
      id, email: `${id}@slice.test`, normalizedEmail: `${id}@slice.test`,
      passwordHash: 'phase3-qa-not-a-login-password', accountStatus: 'ACTIVE',
    })) });
    await db.category.create({ data: { id: categoryId, slug: categoryId, name: 'Phase 3 offering QA' } });
    await db.asset.create({ data: {
      id: assetId, publicId: `ast_${run.replace(/[^a-z0-9]/gi, '').slice(-24)}`,
      slug: assetId, title: 'Phase 3 offering QA asset', categoryId, status: 'PUBLISHED', publishedAt: new Date(),
    } });
    await db.ownershipAssetSupply.create({ data: { assetId, totalUnits: 10n, issuedUnits: 10n, nextSequence: 1n, status: 'ACTIVE' } });
    await db.ownershipSupplyPolicy.create({ data: {
      id: supplyPolicyId, assetId, policyCode: `${run}-policy`, status: 'ISSUED', proposedUnits: 10n,
      valuationMinor: 100000n, valuationCurrency: 'GBP', pricePerUnitMinor: 10000n, remainderMinor: 0n,
      reason: 'Disposable Phase 3 QA fixture', proposedByUserId: collectorId, approvedByUserId: collectorId,
      approvedAt: new Date(), issuedAt: new Date(),
    } });
    await db.valuationDecision.create({ data: {
      id: valuationId, assetId, valueMinor: 1000n, currency: 'GBP', confidence: 100,
      methodologyCode: 'PHASE3_QA', decidedByUserId: collectorId, decidedAt: new Date(), status: 'ACTIVE',
    } });
    await db.initialOffering.create({ data: {
      id: offeringId, assetId, originatingCollectorUserId: collectorId, beneficiaryUserId: collectorId,
      ownershipSupplyPolicyId: supplyPolicyId, valuationDecisionId: valuationId, currency: 'GBP',
      totalUnits: 10n, offeredUnits: 10n, retainedUnits: 0n, pricePerUnitMinor: 10000n,
      grossOfferingMinor: 100000n, feeScheduleVersion: 'INITIAL_OFFERING_ZERO_FEE_V1', feeBps: 0,
      status: 'OPEN', approvedAt: new Date(), openedAt: new Date(), issuedAt: new Date(),
    } });
    await db.ownershipAccount.create({ data: { id: inventoryAccountId, type: 'INITIAL_OFFERING', status: 'ACTIVE' } });
    await db.ownershipPosition.create({ data: { id: `${run}-inventory-position`, assetId, accountId: inventoryAccountId, settledUnits: 10n, reservedUnits: 10n } });
    await db.initialOfferingInventory.create({ data: {
      id: inventoryId, offeringId, assetId, accountId: inventoryAccountId, beneficiaryUserId: collectorId,
      offeredUnits: 10n, availableUnits: 0n, reservedUnits: 10n, settledUnits: 0n,
    } });
    await db.ownershipReservation.create({ data: {
      id: offeringReservationId, assetId, accountId: inventoryAccountId, purposeType: 'INITIAL_OFFERING',
      purposeId: offeringId, units: 10n, status: 'ACTIVE', idempotencyRef: `${run}-opening`,
    } });
    await db.tradingMarket.create({ data: {
      assetId: marketId, status: 'OPEN', tickSizeMinor: 1n, lotSizeUnits: 1n, minimumNotionalMinor: 100n,
      makerFeeBps: 0, takerFeeBps: 100, selfTradePrevention: 'REJECT_TAKER', tradingEnabled: true,
      nextPrioritySequence: 2n,
    } });
    await db.tradingOrder.create({ data: {
      id: offeringOrderId, principalType: 'INITIAL_OFFERING', principalId: offeringId, channel: 'INITIAL_OFFERING',
      initialOfferingId: offeringId, actorUserId: collectorId, assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC',
      status: 'OPEN', limitPriceMinor: 10000n, originalUnits: 10n, remainingUnits: 10n, filledUnits: 0n,
      prioritySequence: 1n, ownershipReservationId: offeringReservationId,
    } });
    await db.orderStatusHistory.create({ data: { id: `${run}-offering-history`, orderId: offeringOrderId, fromStatus: null, toStatus: 'OPEN', reasonCode: 'INITIAL_OFFERING_OPENED' } });
    await db.financialAccount.createMany({ data: [
      { id: investorCashId, ownerType: 'USER', ownerUserId: investorId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
      { id: raceCashId, ownerType: 'USER', ownerUserId: raceId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
      { id: clearingId, ownerType: 'PLATFORM', accountType: 'ASSET', code: `${run}-CLEARING`, currency: 'GBP', normalSide: 'DEBIT' },
    ] });
    await db.complianceCase.create({ data: {
      id: `${run}-race-compliance`, userId: raceId, provider: 'LOCAL_TEST', type: 'KYC', status: 'APPROVED',
      providerReferenceCiphertext: crypto.encrypt(run, `compliance:${raceId}`), providerReferenceHash: crypto.hash(run), encryptionKeyVersion: crypto.keyVersion,
    } });
    await ledger.post(actor(investorId), { type: 'DEMO_FUNDING', correlationId: `${run}-investor-funding`, descriptionCode: 'PHASE3_QA_FUNDING', lines: [
      { accountId: clearingId, side: 'DEBIT', amountMinor: '50000' }, { accountId: investorCashId, side: 'CREDIT', amountMinor: '50000' },
    ] }, `${run}-investor-funding`, `${run}-investor-funding-key`);
    await ledger.post(actor(raceId), { type: 'DEMO_FUNDING', correlationId: `${run}-race-funding`, descriptionCode: 'PHASE3_QA_FUNDING', lines: [
      { accountId: clearingId, side: 'DEBIT', amountMinor: '10000' }, { accountId: raceCashId, side: 'CREDIT', amountMinor: '10000' },
    ] }, `${run}-race-funding`, `${run}-race-funding-key`);
  });

  it('settles a £100 initial offering purchase with zero fee and no provider movement', async () => {
    const buy = await trading.place(actor(investorId), { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '10000' }, `${run}-offering-buy`, `${run}-offering-buy-key`);
    assert(buy.status === 'FILLED', 'initial offering buy did not fill');
    const execution = await db.tradingExecution.findFirstOrThrow({ where: { assetId, channel: 'INITIAL_OFFERING' } });
    const investorWallet = await ledger.walletForUser(investorId);
    const cash = investorWallet.accounts.find((item) => item.code === 'CASH_AVAILABLE');
    const proceeds = await db.financialAccount.findFirstOrThrow({ where: { ownerUserId: collectorId, code: 'COLLECTOR_PROCEEDS_AVAILABLE', currency: 'GBP' }, include: { balance: true } });
    const buyerAccount = await db.ownershipAccount.findUniqueOrThrow({ where: { userId: investorId } });
    const buyerPosition = await db.ownershipPosition.findUniqueOrThrow({ where: { assetId_accountId: { assetId, accountId: buyerAccount.id } } });
    const fee = await db.financialAccount.findFirst({ where: { ownerType: 'PLATFORM', code: 'INITIAL_OFFERING_FEE_REVENUE', currency: 'GBP' }, include: { balance: true } });
    assert(cash?.availableMinor === '40000', `investor available was ${cash?.availableMinor}`);
    assert(proceeds.balance?.postedCreditMinor === 10000n, 'collector proceeds did not credit £100');
    assert(!fee?.balance || (fee.balance.postedCreditMinor - fee.balance.postedDebitMinor) === 0n, 'initial offering fee was not zero');
    assert(buyerPosition.settledUnits === 1n, 'ownership did not settle to investor');
    assert(execution.buyerFeeMinor === 0n && execution.sellerFeeMinor === 0n, 'initial offering fee was non-zero');
    assert(await db.moneyMovement.count({ where: { userId: investorId } }) === 0, 'initial offering created a provider movement');
    console.log(JSON.stringify({ run, initialOfferingExecutionId: execution.id, investorAvailableMinor: cash?.availableMinor, collectorProceedsMinor: proceeds.balance?.postedCreditMinor.toString(), providerMovements: 0 }));
  });

  it('keeps combined order and withdrawal reservations within £100 under concurrency', async () => {
    const results = await Promise.allSettled([
      trading.place(actor(raceId), { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '7000' }, `${run}-race-order`, `${run}-race-order-key`),
      movements.createWithdrawal(actor(raceId), '5000', `${run}-race-withdrawal`, `${run}-race-withdrawal-key`, 'LOW'),
    ]);
    const wallet = await ledger.walletForUser(raceId);
    const reservations = await db.cashReservation.findMany({ where: { accountId: raceCashId, status: 'ACTIVE' } });
    const totalReserved = reservations.reduce((sum, item) => sum + item.amountMinor, 0n);
    assert(totalReserved <= 10000n, `combined reservations exceeded £100: ${totalReserved}`);
    assert(results.filter((item) => item.status === 'fulfilled').length >= 1, 'both race participants were rejected');
    assert(wallet.accounts.find((item) => item.code === 'CASH_AVAILABLE')?.availableMinor !== undefined, 'race wallet projection missing');
    console.log(JSON.stringify({ run, orderWithdrawalRace: 'PASS', activeReservedMinor: totalReserved.toString(), successfulOperations: results.filter((item) => item.status === 'fulfilled').length }));
  });

  afterAll(async () => {
    const orderIds = (await db.tradingOrder.findMany({ where: { assetId }, select: { id: true } })).map((item) => item.id);
    const executionIds = (await db.tradingExecution.findMany({ where: { assetId }, select: { id: true } })).map((item) => item.id);
    const outboxIds = (await db.outboxEvent.findMany({ where: { OR: [{ correlationId: { startsWith: `trade:${assetId}` } }, { actorUserId: { in: [collectorId, investorId, raceId] } }] }, select: { id: true } })).map((item) => item.id);
    const journalIds = (await db.journalEntry.findMany({ where: { accountId: { in: [investorCashId, raceCashId, clearingId] } }, select: { transactionId: true } })).map((item) => item.transactionId);
    const movementIds = (await db.moneyMovement.findMany({ where: { userId: { in: [investorId, raceId] } }, select: { id: true } })).map((item) => item.id);
    await db.notificationDelivery.deleteMany({ where: { outboxEventId: { in: outboxIds } } });
    await db.outboxEvent.deleteMany({ where: { id: { in: outboxIds } } });
    await db.auditEvent.deleteMany({ where: { actorUserId: { in: [collectorId, investorId, raceId] } } });
    await db.idempotencyRecord.deleteMany({ where: { actorScope: { in: [`user:${investorId}`, `user:${raceId}`] } } });
    await db.moneyMovementHistory.deleteMany({ where: { movementId: { in: movementIds } } });
    await db.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
    await db.cashReservation.deleteMany({ where: { accountId: { in: [investorCashId, raceCashId] } } });
    await db.lotDisposal.deleteMany({ where: { lot: { userId: { in: [investorId, raceId] } } } });
    await db.portfolioLot.deleteMany({ where: { userId: { in: [investorId, raceId] } } });
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.tradingExecution.deleteMany({ where: { id: { in: executionIds } } });
    await db.tradingOrder.deleteMany({ where: { id: { in: orderIds } } });
    await db.ownershipReservation.deleteMany({ where: { assetId } });
    await db.ownershipLedgerEntry.deleteMany({ where: { assetId } });
    await db.ownershipPosition.deleteMany({ where: { assetId } });
    await db.initialOfferingInventory.deleteMany({ where: { id: inventoryId } });
    await db.initialOffering.deleteMany({ where: { id: offeringId } });
    await db.tradingMarket.deleteMany({ where: { assetId } });
    await db.ownershipSupplyPolicy.deleteMany({ where: { id: supplyPolicyId } });
    await db.valuationDecision.deleteMany({ where: { id: valuationId } });
    await db.ownershipAssetSupply.deleteMany({ where: { assetId } });
    await db.journalEntry.deleteMany({ where: { transactionId: { in: journalIds } } });
    await db.journalTransaction.deleteMany({ where: { id: { in: journalIds } } });
    const userFinancialIds = (await db.financialAccount.findMany({ where: { ownerUserId: { in: [collectorId, investorId, raceId] } }, select: { id: true } })).map((item) => item.id);
    await db.accountBalance.deleteMany({ where: { accountId: { in: [...userFinancialIds, clearingId] } } });
    await db.financialAccount.deleteMany({ where: { id: { in: [...userFinancialIds, clearingId] } } });
    await db.complianceDecision.deleteMany({ where: { complianceCase: { userId: raceId } } });
    await db.complianceCase.deleteMany({ where: { userId: raceId } });
    await db.ownershipAccount.deleteMany({ where: { userId: { in: [collectorId, investorId, raceId] } } });
    await db.ownershipAccount.deleteMany({ where: { id: inventoryAccountId } });
    await db.asset.deleteMany({ where: { id: assetId } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: { in: [collectorId, investorId, raceId] } } });
    await db.$disconnect();
  });
});
