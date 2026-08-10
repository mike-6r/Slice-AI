import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { assertTestDatabaseUrl } from '../config/app-config';
import type { AppConfig } from '../config/app-config';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { PortfolioLotService } from '../modules/finance/application/portfolio-lot.service';
import { RecentAuthService } from '../modules/identity/access/recent-auth.service';
import type { Actor } from '../modules/identity/auth/auth.service';
import { TradingService } from '../modules/trading/application/trading.service';

const run = `manual-trading-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Manual trading QA failed: ${message}`);
}

async function expectCode(work: () => Promise<unknown>, code: string) {
  try {
    await work();
  } catch (error) {
    const actual =
      typeof error === 'object' && error && 'response' in error
        ? (error as { response?: { code?: string } }).response?.code
        : undefined;
    assert(actual === code, `expected ${code}, received ${String(actual)}`);
    return;
  }
  throw new Error(`Manual trading QA failed: expected ${code}.`);
}

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl)
    throw new Error('TEST_DATABASE_URL (or DATABASE_URL) and REDIS_URL are required.');
  assertTestDatabaseUrl(databaseUrl);

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redis = new Redis(redisUrl, { lazyConnect: true });
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const buyerId = `${run}-buyer`;
  const sellerId = `${run}-seller`;
  const buyerCashId = `${run}-buyer-cash`;
  const clearingId = `${run}-clearing`;
  const sellerOwnershipId = `${run}-seller-ownership`;
  const actor = (userId: string): Actor => ({
    userId: userId as never,
    sessionId: `${userId}-session`,
    status: 'ACTIVE',
    roles: ['ADMIN'],
    sessionRevokedAt: null,
    sessionRevocationReason: null,
    authenticatedAt: new Date(),
  });
  const recentAuth = new RecentAuthService({ recentAuthWindowSeconds: 300 } as AppConfig);
  const ledger = new FinancialLedgerService(db as never, recentAuth);
  const lots = new PortfolioLotService(db as never, recentAuth);
  const trading = new TradingService(db as never, recentAuth);

  try {
    await db.$connect();
    await redis.connect();
    assert((await redis.ping()) === 'PONG', 'Redis PING did not return PONG.');
    await db.user.createMany({
      data: [buyerId, sellerId].map((id) => ({
        id,
        email: `${id}@slice.test`,
        normalizedEmail: `${id}@slice.test`,
        passwordHash: 'manual-qa-not-a-login-password',
        accountStatus: 'ACTIVE',
      })),
    });
    await db.category.create({ data: { id: categoryId, slug: categoryId, name: 'Manual trading QA' } });
    await db.asset.create({
      data: {
        id: assetId,
        publicId: `ast${Date.now()}`,
        slug: assetId,
        title: 'Manual trading asset',
        categoryId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await db.ownershipAssetSupply.create({
      data: { assetId, totalUnits: 10n, issuedUnits: 10n, nextSequence: 1n, status: 'ACTIVE' },
    });
    await db.ownershipAccount.create({ data: { id: sellerOwnershipId, type: 'USER', userId: sellerId } });
    await db.ownershipPosition.create({
      data: { id: `${run}-seller-position`, assetId, accountId: sellerOwnershipId, settledUnits: 10n },
    });
    await db.financialAccount.createMany({
      data: [
        { id: buyerCashId, ownerType: 'USER', ownerUserId: buyerId, accountType: 'LIABILITY', code: 'CASH_AVAILABLE', currency: 'GBP', normalSide: 'CREDIT' },
        { id: clearingId, ownerType: 'PLATFORM', accountType: 'ASSET', code: `${run}-CLEARING`, currency: 'GBP', normalSide: 'DEBIT' },
      ],
    });
    await ledger.post(actor(buyerId), {
      type: 'DEMO_FUNDING', correlationId: `${run}-funding`, descriptionCode: 'MANUAL_TRADING_QA_FUNDING',
      lines: [
        { accountId: clearingId, side: 'DEBIT', amountMinor: '10000' },
        { accountId: buyerCashId, side: 'CREDIT', amountMinor: '10000' },
      ],
    }, `${run}-funding-request`, `${run}-funding-key`);
    await lots.recordAcquisition(actor(sellerId), {
      userId: sellerId, assetId, units: '10', totalCostMinor: '500', sourceReference: `${run}-seller-acquisition`,
    }, `${run}-lot-request`, `${run}-lot-key`);
    await db.tradingMarket.create({
      data: {
        assetId, status: 'OPEN', tickSizeMinor: 1n, lotSizeUnits: 1n, minimumNotionalMinor: 100n,
        makerFeeBps: 0, takerFeeBps: 100, selfTradePrevention: 'REJECT_TAKER', tradingEnabled: true,
      },
    });

    const sell = await trading.place(actor(sellerId), {
      assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', units: '4', limitPriceMinor: '100',
    }, `${run}-sell-request`, `${run}-sell-key`);
    const buyInput = { assetId, side: 'BUY' as const, type: 'LIMIT' as const, timeInForce: 'GTC' as const, units: '4', limitPriceMinor: '110' };
    const buy = await trading.place(actor(buyerId), buyInput, `${run}-buy-request`, `${run}-buy-key`);
    const replay = await trading.place(actor(buyerId), buyInput, `${run}-buy-request`, `${run}-buy-key`);
    assert(buy.id === replay.id && buy.status === 'FILLED', 'buy replay or matching was not stable.');
    const execution = await db.tradingExecution.findFirstOrThrow({ where: { buyOrderId: buy.id, sellOrderId: sell.id } });
    assert(execution.priceMinor === 100n && execution.units === 4n, 'maker-price execution was incorrect.');
    assert(execution.buyerFeeMinor === 4n && execution.sellerFeeMinor === 0n, 'configured 0/100 bps fees were not applied.');
    assert((await db.accountBalance.findUniqueOrThrow({ where: { accountId: buyerCashId } })).reservedMinor === 0n, 'filled buy did not consume its cash reservation.');
    const buyerOwnership = await db.ownershipAccount.findUniqueOrThrow({ where: { userId: buyerId } });
    assert((await db.ownershipPosition.findUniqueOrThrow({ where: { assetId_accountId: { assetId, accountId: buyerOwnership.id } } })).settledUnits === 4n, 'buyer ownership did not settle.');
    await expectCode(() => trading.place(actor(buyerId), {
      assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '100', limitPriceMinor: '10000',
    }, `${run}-insufficient-request`, `${run}-insufficient-key`), 'INSUFFICIENT_FUNDS');
    const open = await trading.place(actor(buyerId), {
      assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '100',
    }, `${run}-cancel-request`, `${run}-cancel-key`);
    const cancelled = await trading.cancel(actor(buyerId), open.id, `${run}-cancel-action`, `${run}-cancel-action-key`);
    assert(cancelled.status === 'CANCELLED', 'cancellation did not close the open remainder.');
    const book = await trading.publicBook(assetId, 10);
    assert(JSON.stringify(book).match(/buyer|seller|account|reservation/i) === null, 'public book leaked private data.');
    const history = await trading.ownExecutions(buyerId, undefined, 10);
    assert(history.items.length === 1 && history.items[0].feeMinor === '4', 'safe execution history was incomplete.');

    console.log(JSON.stringify({ run, executionId: execution.id, feeMinor: '4', qa: 'PASSED' }));
  } finally {
    const executions = await db.tradingExecution.findMany({
      where: { assetId }, select: { buyerFeeMinor: true, sellerFeeMinor: true },
    }).catch(() => []);
    const totalFees = executions.reduce((sum, item) => sum + item.buyerFeeMinor + item.sellerFeeMinor, 0n);
    const orderIds = (await db.tradingOrder.findMany({ where: { assetId }, select: { id: true } }).catch(() => [])).map((row) => row.id);
    const journalIds = (await db.journalTransaction.findMany({ where: { OR: [{ correlationId: { startsWith: `trade:${assetId}` } }, { correlationId: `${run}-funding` }] }, select: { id: true } }).catch(() => [])).map((row) => row.id);
    await db.auditEvent.deleteMany({ where: { actorUserId: { in: [buyerId, sellerId] } } }).catch(() => undefined);
    await db.idempotencyRecord.deleteMany({ where: { actorScope: { in: [`user:${buyerId}`, `user:${sellerId}`] } } }).catch(() => undefined);
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } }).catch(() => undefined);
    await db.tradingExecution.deleteMany({ where: { assetId } }).catch(() => undefined);
    await db.tradingOrder.deleteMany({ where: { id: { in: orderIds } } }).catch(() => undefined);
    await db.tradingMarket.deleteMany({ where: { assetId } }).catch(() => undefined);
    await db.journalEntry.deleteMany({ where: { transactionId: { in: journalIds } } }).catch(() => undefined);
    await db.journalTransaction.deleteMany({ where: { id: { in: journalIds } } }).catch(() => undefined);
    if (totalFees > 0n) {
      const feeAccount = await db.financialAccount.findFirst({ where: { ownerType: 'PLATFORM', code: 'TRADING_FEE_REVENUE', currency: 'GBP' } }).catch(() => null);
      if (feeAccount) await db.accountBalance.update({ where: { accountId: feeAccount.id }, data: { postedCreditMinor: { decrement: totalFees } } }).catch(() => undefined);
    }
    await db.lotDisposal.deleteMany({ where: { lot: { userId: { in: [buyerId, sellerId] } } } }).catch(() => undefined);
    await db.portfolioLot.deleteMany({ where: { userId: { in: [buyerId, sellerId] } } }).catch(() => undefined);
    await db.cashReservation.deleteMany({ where: { account: { ownerUserId: { in: [buyerId, sellerId] } } } }).catch(() => undefined);
    const ownershipIds = (await db.ownershipAccount.findMany({ where: { userId: { in: [buyerId, sellerId] } }, select: { id: true } }).catch(() => [])).map((row) => row.id);
    await db.ownershipLedgerEntry.deleteMany({ where: { assetId } }).catch(() => undefined);
    await db.ownershipReservation.deleteMany({ where: { assetId } }).catch(() => undefined);
    await db.ownershipPosition.deleteMany({ where: { accountId: { in: ownershipIds } } }).catch(() => undefined);
    await db.ownershipAccount.deleteMany({ where: { id: { in: ownershipIds } } }).catch(() => undefined);
    const financialIds = (await db.financialAccount.findMany({ where: { ownerUserId: { in: [buyerId, sellerId] } }, select: { id: true } }).catch(() => [])).map((row) => row.id);
    await db.accountBalance.deleteMany({ where: { accountId: { in: [...financialIds, clearingId] } } }).catch(() => undefined);
    await db.financialAccount.deleteMany({ where: { id: { in: [...financialIds, clearingId] } } }).catch(() => undefined);
    await db.ownershipAssetSupply.deleteMany({ where: { assetId } }).catch(() => undefined);
    await db.asset.deleteMany({ where: { id: assetId } }).catch(() => undefined);
    await db.category.deleteMany({ where: { id: categoryId } }).catch(() => undefined);
    await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } }).catch(() => undefined);
    const [
      orders,
      executionsAfterCleanup,
      cashReservations,
      lotsAfterCleanup,
      financialAccounts,
      journalTransactions,
      ownershipAccounts,
      ownershipPositions,
      users,
      assets,
    ] = await Promise.all([
      db.tradingOrder.count({ where: { assetId } }),
      db.tradingExecution.count({ where: { assetId } }),
      db.cashReservation.count({ where: { account: { ownerUserId: { in: [buyerId, sellerId] } } } }),
      db.portfolioLot.count({ where: { userId: { in: [buyerId, sellerId] } } }),
      db.financialAccount.count({ where: { OR: [{ ownerUserId: { in: [buyerId, sellerId] } }, { id: clearingId }] } }),
      db.journalTransaction.count({ where: { OR: [{ correlationId: { startsWith: `trade:${assetId}` } }, { correlationId: `${run}-funding` }] } }),
      db.ownershipAccount.count({ where: { userId: { in: [buyerId, sellerId] } } }),
      db.ownershipPosition.count({ where: { assetId } }),
      db.user.count({ where: { id: { in: [buyerId, sellerId] } } }),
      db.asset.count({ where: { id: assetId } }),
    ]);
    console.log(JSON.stringify({ run, cleanup: { orders, executions: executionsAfterCleanup, cashReservations, lots: lotsAfterCleanup, financialAccounts, journalTransactions, ownershipAccounts, ownershipPositions, users, assets } }));
    await redis.quit().catch(() => undefined);
    await db.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
