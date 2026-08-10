import { PrismaClient } from '@prisma/client';
import { TradingService } from '../src/modules/trading/application/trading.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { AppConfig } from '../src/config/app-config';
import { setTradingTestFailureHook } from '../src/modules/trading/application/trading-test-failure-injection';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url } } });
const run = `trading-i-${Date.now()}`;

describe('Document 014 PostgreSQL order authority', () => {
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const buyerId = `${run}-buyer`;
  const sellerId = `${run}-seller`;
  const sellerOwnershipAccountId = `${run}-seller-ownership`;
  const buyerCashAccountId = `${run}-buyer-cash`;
  const clearingId = `${run}-clearing`;
  const service = new TradingService(
    db as never,
    new RecentAuthService({ recentAuthWindowSeconds: 300 } as AppConfig),
  );
  const actor = (userId: string): Actor => ({
    userId: userId as never,
    sessionId: `${userId}-session`,
    status: 'ACTIVE',
    roles: [],
    sessionRevokedAt: null,
    sessionRevocationReason: null,
    authenticatedAt: new Date(),
  });

  async function createBuyer(label: string, creditMinor = 10_000n) {
    const userId = `${run}-${label}-buyer`;
    const accountId = `${userId}-cash`;
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        normalizedEmail: `${userId}@example.test`,
        passwordHash: 'test',
        accountStatus: 'ACTIVE',
      },
    });
    await db.financialAccount.create({
      data: {
        id: accountId,
        ownerType: 'USER',
        ownerUserId: userId,
        accountType: 'LIABILITY',
        code: 'CASH_AVAILABLE',
        currency: 'GBP',
        normalSide: 'CREDIT',
      },
    });
    await db.accountBalance.create({
      data: { accountId, postedCreditMinor: creditMinor },
    });
    return { userId, accountId };
  }

  async function createSeller(label: string, units = 100n) {
    const userId = `${run}-${label}-seller`;
    const accountId = `${userId}-ownership`;
    await db.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        normalizedEmail: `${userId}@example.test`,
        passwordHash: 'test',
        accountStatus: 'ACTIVE',
      },
    });
    await db.ownershipAccount.create({
      data: { id: accountId, type: 'USER', userId },
    });
    await db.ownershipPosition.create({
      data: {
        id: `${accountId}-position`,
        assetId,
        accountId,
        settledUnits: units,
      },
    });
    await db.portfolioLot.create({
      data: {
        id: `${accountId}-lot`,
        userId,
        assetId,
        acquiredUnits: units,
        remainingUnits: units,
        totalCostMinor: units * 10n,
        currency: 'GBP',
        sourceReference: `${accountId}-acquisition`,
      },
    });
    return { userId, accountId };
  }

  async function clearOpenBook(label: string) {
    const orders = await db.tradingOrder.findMany({
      where: { assetId, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
      select: { id: true, userId: true },
    });
    for (const order of orders)
      await service.cancel(
        actor(order.userId),
        order.id,
        `${run}-${label}-${order.id}`,
        `${run}-${label}-${order.id}`,
      );
  }

  beforeAll(async () => {
    await db.$connect();
    await cleanup();
    await db.user.createMany({
      data: [
        {
          id: buyerId,
          email: `${buyerId}@example.test`,
          normalizedEmail: `${buyerId}@example.test`,
          passwordHash: 'test',
          accountStatus: 'ACTIVE',
        },
        {
          id: sellerId,
          email: `${sellerId}@example.test`,
          normalizedEmail: `${sellerId}@example.test`,
          passwordHash: 'test',
          accountStatus: 'ACTIVE',
        },
      ],
    });
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Trading test' },
    });
    await db.asset.create({
      data: {
        id: assetId,
        publicId: `ast${Date.now()}`,
        slug: assetId,
        title: 'Trading asset',
        categoryId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await db.ownershipAssetSupply.create({
      data: {
        assetId,
        totalUnits: 100n,
        issuedUnits: 100n,
        nextSequence: 1n,
        status: 'ACTIVE',
      },
    });
    await db.ownershipAccount.create({
      data: { id: sellerOwnershipAccountId, type: 'USER', userId: sellerId },
    });
    await db.ownershipPosition.create({
      data: {
        id: `${run}-seller-position`,
        assetId,
        accountId: sellerOwnershipAccountId,
        settledUnits: 100n,
      },
    });
    await db.portfolioLot.create({
      data: {
        id: `${run}-lot`,
        userId: sellerId,
        assetId,
        acquiredUnits: 100n,
        remainingUnits: 100n,
        totalCostMinor: 1_000n,
        currency: 'GBP',
        sourceReference: `${run}-acquisition`,
      },
    });
    await db.financialAccount.createMany({
      data: [
        {
          id: buyerCashAccountId,
          ownerType: 'USER',
          ownerUserId: buyerId,
          accountType: 'LIABILITY',
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
        {
          id: clearingId,
          ownerType: 'PLATFORM',
          accountType: 'ASSET',
          code: `${run}-clearing`,
          currency: 'GBP',
          normalSide: 'DEBIT',
        },
      ],
    });
    await db.accountBalance.create({
      data: { accountId: buyerCashAccountId, postedCreditMinor: 10_000n },
    });
    await db.tradingMarket.create({
      data: {
        assetId,
        status: 'OPEN',
        tickSizeMinor: 1n,
        lotSizeUnits: 1n,
        minimumNotionalMinor: 100n,
        makerFeeBps: 0,
        takerFeeBps: 100,
        selfTradePrevention: 'REJECT_TAKER',
        tradingEnabled: true,
      },
    });
  });

  afterAll(async () => {
    setTradingTestFailureHook(undefined);
    await cleanup();
    await db.$disconnect();
  });

  it('reserves, matches at maker price, settles both authorities, and records one execution', async () => {
    const feeAccountBefore = await db.financialAccount.findFirst({
      where: {
        ownerType: 'PLATFORM',
        code: 'TRADING_FEE_REVENUE',
        currency: 'GBP',
      },
    });
    const feeCreditBefore = feeAccountBefore
      ? (await db.accountBalance.findUnique({ where: { accountId: feeAccountBefore.id } }))?.postedCreditMinor ?? 0n
      : 0n;
    const sell = await service.place(
      actor(sellerId),
      {
        assetId,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '10',
        limitPriceMinor: '125',
      },
      `${run}-sell`,
      `${run}-sell-key`,
    );
    expect(sell.status).toBe('OPEN');
    const buy = await service.place(
      actor(buyerId),
      {
        assetId,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '10',
        limitPriceMinor: '130',
      },
      `${run}-buy`,
      `${run}-buy-key`,
    );
    expect(buy.status).toBe('FILLED');
    expect((await service.orderForUser(sellerId, sell.id)).status).toBe(
      'FILLED',
    );
    expect(await db.tradingExecution.count({ where: { assetId } })).toBe(1);
    const execution = await db.tradingExecution.findFirstOrThrow({ where: { assetId } });
    expect(await db.outboxEvent.findUnique({ where: { eventId: `trade.completed:${execution.id}` } })).toMatchObject({
      eventType: 'trade.completed', aggregateType: 'trading-execution', aggregateId: execution.id,
      schemaVersion: 1, correlationId: execution.correlationId,
      payload: { executionId: execution.id, assetId, units: '10', priceMinor: '125', grossMinor: '1250', currency: 'GBP' },
    });
    await expect(service.place(actor(buyerId), { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '10', limitPriceMinor: '130' }, `${run}-buy`, `${run}-buy-key`)).resolves.toMatchObject({ id: buy.id });
    expect(await db.outboxEvent.count({ where: { eventId: `trade.completed:${execution.id}` } })).toBe(1);
    expect(
      await db.ownershipPosition.findUnique({
        where: {
          assetId_accountId: { assetId, accountId: sellerOwnershipAccountId },
        },
      }),
    ).toMatchObject({ settledUnits: 90n, reservedUnits: 0n });
    const buyerAccount = await db.ownershipAccount.findUnique({
      where: { userId: buyerId },
    });
    expect(
      await db.ownershipPosition.findUnique({
        where: { assetId_accountId: { assetId, accountId: buyerAccount!.id } },
      }),
    ).toMatchObject({ settledUnits: 10n, reservedUnits: 0n });
    expect(
      await db.accountBalance.findUnique({
        where: { accountId: buyerCashAccountId },
      }),
    ).toMatchObject({
      postedCreditMinor: 10_000n,
      postedDebitMinor: 1_263n,
      reservedMinor: 0n,
    });
    expect(
      await db.tradingExecution.findFirstOrThrow({ where: { assetId } }),
    ).toMatchObject({ buyerFeeMinor: 13n, sellerFeeMinor: 0n });
    const feeAccount = await db.financialAccount.findFirstOrThrow({
      where: {
        ownerType: 'PLATFORM',
        code: 'TRADING_FEE_REVENUE',
        currency: 'GBP',
      },
    });
    expect(
      await db.accountBalance.findUnique({ where: { accountId: feeAccount.id } }),
    ).toMatchObject({ postedCreditMinor: feeCreditBefore + 13n });
    const book = await service.publicBook(assetId, 10);
    expect(book).toMatchObject({ status: 'OPEN', bids: [], asks: [] });
  });

  it('charges the seller when a resting buy is maker and keeps FIFO proceeds net of the taker fee', async () => {
    const seller = await createSeller('seller-taker-fee', 4n);
    const restingBuy = await service.place(
      actor(buyerId),
      { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '4', limitPriceMinor: '200' },
      `${run}-seller-taker-buy`,
      `${run}-seller-taker-buy-key`,
    );
    const ask = await service.place(
      actor(seller.userId),
      { assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', units: '4', limitPriceMinor: '100' },
      `${run}-seller-taker-sell`,
      `${run}-seller-taker-sell-key`,
    );
    const execution = await db.tradingExecution.findFirstOrThrow({
      where: { buyOrderId: restingBuy.id, sellOrderId: ask.id },
    });
    expect(execution).toMatchObject({
      grossMinor: 800n,
      buyerFeeMinor: 0n,
      sellerFeeMinor: 8n,
      makerOrderId: restingBuy.id,
      takerOrderId: ask.id,
    });
    const sellerCash = await db.financialAccount.findFirstOrThrow({
      where: { ownerUserId: seller.userId, code: 'CASH_AVAILABLE', currency: 'GBP' },
    });
    expect(await db.accountBalance.findUnique({ where: { accountId: sellerCash.id } })).toMatchObject({ postedCreditMinor: 792n });
    expect(await db.lotDisposal.findFirstOrThrow({ where: { lot: { userId: seller.userId } } })).toMatchObject({
      proceedsMinor: 800n,
      feeMinor: 8n,
      realizedPnlMinor: 752n,
    });
  });

  it('returns caller-scoped safe execution history with an opaque cursor', async () => {
    const buyerHistory = await service.ownExecutions(buyerId, undefined, 10);
    const sellerHistory = await service.ownExecutions(sellerId, undefined, 1);
    expect(buyerHistory.items).toHaveLength(2);
    expect(buyerHistory.items.find((item) => item.priceMinor === '125')).toMatchObject({ side: 'BUY', units: '10', priceMinor: '125', feeMinor: '13' });
    expect(sellerHistory.items[0]).toMatchObject({ side: 'SELL', units: '10', priceMinor: '125', feeMinor: '0' });
    expect(JSON.stringify(buyerHistory.items[0])).not.toMatch(/userId|accountId|counterparty|reservation|journal/i);
    const unrelated = await createBuyer('execution-history-isolation');
    await expect(service.ownExecutions(unrelated.userId)).resolves.toEqual({ items: [], nextCursor: null });
    const buyerCursor = Buffer.from(JSON.stringify({
      scope: 'trading.executions.v1',
      userId: buyerId,
      executedAt: buyerHistory.items[0].executedAt,
      id: buyerHistory.items[0].executionId,
    })).toString('base64url');
    await expect(service.ownExecutions(sellerId, buyerCursor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_CURSOR' }),
    });
  });

  it('replays a placement without duplicate order/reservation state and rejects a conflicting fingerprint', async () => {
    const input = {
      assetId,
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      timeInForce: 'GTC' as const,
      units: '1',
      limitPriceMinor: '100',
    };
    const first = await service.place(
      actor(buyerId),
      input,
      `${run}-replay`,
      `${run}-replay-key`,
    );
    await expect(
      service.place(
        actor(buyerId),
        input,
        `${run}-replay`,
        `${run}-replay-key`,
      ),
    ).resolves.toMatchObject({ id: first.id });
    await expect(
      service.place(
        actor(buyerId),
        { ...input, units: '2' },
        `${run}-replay`,
        `${run}-replay-key`,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_CONFLICT' }),
    });
    expect(
      await db.tradingOrder.count({
        where: { userId: buyerId, limitPriceMinor: 100n },
      }),
    ).toBe(1);
  });

  it('cancels IOC remainder, blocks a self-match, and releases each remaining reservation', async () => {
    const ioc = await service.place(
      actor(sellerId),
      {
        assetId,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'IOC',
        units: '5',
        limitPriceMinor: '500',
      },
      `${run}-ioc`,
      `${run}-ioc-key`,
    );
    expect(ioc.status).toBe('CANCELLED');
    const sellerPosition = await db.ownershipPosition.findUnique({
      where: {
        assetId_accountId: { assetId, accountId: sellerOwnershipAccountId },
      },
    });
    expect(sellerPosition?.reservedUnits).toBe(0n);
    const self = await service.place(
      actor(buyerId),
      {
        assetId,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '100',
      },
      `${run}-self`,
      `${run}-self-key`,
    );
    expect(self.status).toBe('CANCELLED');
    const openBuy = await db.tradingOrder.findFirst({
      where: {
        userId: buyerId,
        side: 'BUY',
        status: 'OPEN',
        limitPriceMinor: 100n,
      },
    });
    const cancelled = await service.cancel(
      actor(buyerId),
      openBuy!.id,
      `${run}-cancel`,
      `${run}-cancel-key`,
    );
    expect(cancelled.status).toBe('CANCELLED');
    expect(
      await db.cashReservation.findFirst({
        where: { id: openBuy!.cashReservationId! },
      }),
    ).toMatchObject({ status: 'RELEASED' });
  });

  it('serializes competing buy reservations so the same cash cannot be overspent', async () => {
    const input = (key: string) =>
      service.place(
        actor(buyerId),
        {
          assetId,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '50',
          limitPriceMinor: '100',
        },
        `${run}-${key}`,
        key,
      );
    const results = await Promise.allSettled([
      input(`${run}-race-a`),
      input(`${run}-race-b`),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const balance = await db.accountBalance.findUnique({
      where: { accountId: buyerCashAccountId },
    });
    expect(
      balance!.postedCreditMinor -
        balance!.postedDebitMinor -
        balance!.reservedMinor,
    ).toBeGreaterThanOrEqual(0n);
  });

  it('rolls back a failure after reservation and leaves its idempotency key retryable', async () => {
    const before = await db.cashReservation.count({
      where: { accountId: buyerCashAccountId },
    });
    setTradingTestFailureHook((point) => {
      if (point === 'order.after-reservation')
        throw new Error('INJECTED_TRADING_FAILURE');
    });
    await expect(
      service.place(
        actor(buyerId),
        {
          assetId,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '1',
          limitPriceMinor: '100',
        },
        `${run}-rollback`,
        `${run}-rollback-key`,
      ),
    ).rejects.toThrow('INJECTED_TRADING_FAILURE');
    setTradingTestFailureHook(undefined);
    expect(
      await db.cashReservation.count({
        where: { accountId: buyerCashAccountId },
      }),
    ).toBe(before);
    expect(
      await db.idempotencyRecord.findFirst({
        where: { key: `${run}-rollback-key` },
      }),
    ).toBeNull();
    await expect(
      service.place(
        actor(buyerId),
        {
          assetId,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '1',
          limitPriceMinor: '100',
        },
        `${run}-rollback`,
        `${run}-rollback-key`,
      ),
    ).resolves.toMatchObject({ status: 'OPEN' });
  });

  it('rolls back buy and sell placement after persistence with no orphan authority state', async () => {
    const cases = [
      {
        point: 'order.after-insert' as const,
        side: 'BUY' as const,
        input: { units: '1', limitPriceMinor: '100' },
      },
      {
        point: 'order.before-commit' as const,
        side: 'SELL' as const,
        input: { units: '1', limitPriceMinor: '900' },
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const buyer =
        testCase.side === 'BUY'
          ? await createBuyer(`rollback-${index}`)
          : undefined;
      const seller =
        testCase.side === 'SELL'
          ? await createSeller(`rollback-${index}`)
          : undefined;
      const userId = buyer?.userId ?? seller!.userId;
      const key = `${run}-rollback-insert-${index}`;
      setTradingTestFailureHook((point) => {
        if (point === testCase.point) throw new Error('INJECTED_TRADING_FAILURE');
      });
      await expect(
        service.place(
          actor(userId),
          {
            assetId,
            side: testCase.side,
            type: 'LIMIT',
            timeInForce: 'GTC',
            ...testCase.input,
          },
          `${run}-rollback-insert-${index}`,
          key,
        ),
      ).rejects.toThrow('INJECTED_TRADING_FAILURE');
      setTradingTestFailureHook(undefined);
      expect(await db.tradingOrder.count({ where: { userId } })).toBe(0);
      expect(
        await db.idempotencyRecord.findFirst({ where: { key } }),
      ).toBeNull();
      if (buyer)
        expect(
          await db.cashReservation.count({ where: { accountId: buyer.accountId } }),
        ).toBe(0);
      if (seller)
        expect(
          await db.ownershipReservation.count({
            where: { accountId: seller.accountId, assetId },
          }),
        ).toBe(0);
      await expect(
        service.place(
          actor(userId),
          {
            assetId,
            side: testCase.side,
            type: 'LIMIT',
            timeInForce: 'GTC',
            ...testCase.input,
          },
          `${run}-rollback-insert-${index}`,
          key,
        ),
      ).resolves.toMatchObject({ status: 'OPEN' });
    }
  });

  it('rolls back every execution boundary without changing orders, authorities, or lots', async () => {
    const points = [
      'execution.after-lock',
      'execution.after-ownership',
      'execution.after-cash',
      'execution.after-execution-create',
      'execution.after-outbox-append',
      'execution.after-order-updates',
    ] as const;
    for (const [index, failurePoint] of points.entries()) {
      const buyer = await createBuyer(`execution-rollback-${index}`);
      const seller = await createSeller(`execution-rollback-${index}`, 2n);
      await service.place(
        actor(buyer.userId),
        {
          assetId,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '1',
          limitPriceMinor: '500',
        },
        `${run}-execution-rollback-buy-${index}`,
        `${run}-execution-rollback-buy-key-${index}`,
      );
      setTradingTestFailureHook((point) => {
        if (point === 'execution.after-lock')
          throw new Error('INJECTED_TRADING_FAILURE');
      });
      try {
        await expect(
          service.place(
            actor(seller.userId),
            {
              assetId,
              side: 'SELL',
              type: 'LIMIT',
              timeInForce: 'GTC',
              units: '1',
              limitPriceMinor: '100',
            },
            `${run}-execution-rollback-sell-${index}`,
            `${run}-execution-rollback-sell-key-${index}`,
          ),
        ).rejects.toThrow('INJECTED_TRADING_FAILURE');
      } finally {
        setTradingTestFailureHook(undefined);
      }
      setTradingTestFailureHook((point) => {
        if (point === failurePoint) throw new Error('INJECTED_TRADING_FAILURE');
      });
      const beforeExecutionCount = await db.tradingExecution.count({ where: { assetId } });
      const beforeOutboxCount = await db.outboxEvent.count({ where: { eventType: 'trade.completed' } });
      const beforeSeller = await db.ownershipPosition.findUniqueOrThrow({
        where: { assetId_accountId: { assetId, accountId: seller.accountId } },
      });
      const beforeBuyer = await db.ownershipPosition.findFirst({
        where: { assetId, account: { userId: buyer.userId } },
      });
      try {
        await expect(
          service.matchMarket(assetId, actor(buyer.userId), `${run}-execution-rollback-match-${index}`),
        ).rejects.toThrow('INJECTED_TRADING_FAILURE');
      } finally {
        setTradingTestFailureHook(undefined);
      }
      expect(await db.tradingExecution.count({ where: { assetId } })).toBe(beforeExecutionCount);
      expect(await db.outboxEvent.count({ where: { eventType: 'trade.completed' } })).toBe(beforeOutboxCount);
      expect(
        await db.ownershipPosition.findUnique({
          where: { assetId_accountId: { assetId, accountId: seller.accountId } },
        }),
      ).toMatchObject({ settledUnits: beforeSeller.settledUnits, reservedUnits: beforeSeller.reservedUnits });
      expect(
        await db.ownershipPosition.findFirst({
          where: { assetId, account: { userId: buyer.userId } },
        }),
      ).toEqual(beforeBuyer);
      await service.matchMarket(assetId, actor(buyer.userId), `${run}-execution-rollback-retry-${index}`);
      expect(await db.tradingExecution.count({ where: { assetId } })).toBe(beforeExecutionCount + 1);
    }
  });

  it('serializes competing sell reservations and never reserves more units than are owned', async () => {
    const seller = await createSeller('sell-race', 50n);
    const place = (key: string) =>
      service.place(
        actor(seller.userId),
        {
          assetId,
          side: 'SELL',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '40',
          limitPriceMinor: '900',
        },
        `${run}-${key}`,
        key,
      );
    const results = await Promise.allSettled([
      place(`${run}-sell-race-a`),
      place(`${run}-sell-race-b`),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const position = await db.ownershipPosition.findUniqueOrThrow({
      where: { assetId_accountId: { assetId, accountId: seller.accountId } },
    });
    expect(position.reservedUnits).toBe(40n);
    expect(position.settledUnits - position.reservedUnits).toBe(10n);
  });

  it('serializes match and cancellation races into one terminal result with one reservation outcome', async () => {
    const buyer = await createBuyer('cancel-match');
    const seller = await createSeller('cancel-match', 2n);
    await service.place(
      actor(buyer.userId),
      {
        assetId,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '500',
      },
      `${run}-cancel-match-buy`,
      `${run}-cancel-match-buy-key`,
    );
    setTradingTestFailureHook((point) => {
      if (point === 'execution.after-lock') throw new Error('INJECTED_TRADING_FAILURE');
    });
    await expect(
      service.place(
        actor(seller.userId),
        {
          assetId,
          side: 'SELL',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '1',
          limitPriceMinor: '100',
        },
        `${run}-cancel-match-sell`,
        `${run}-cancel-match-sell-key`,
      ),
    ).rejects.toThrow('INJECTED_TRADING_FAILURE');
    setTradingTestFailureHook(undefined);
    const sell = await db.tradingOrder.findFirstOrThrow({
      where: { userId: seller.userId, side: 'SELL', status: 'OPEN' },
    });
    const executionsBefore = await db.tradingExecution.count({ where: { assetId } });
    await Promise.allSettled([
      service.cancel(actor(seller.userId), sell.id, `${run}-cancel-race`, `${run}-cancel-race-key`),
      service.matchMarket(assetId, actor(buyer.userId), `${run}-match-race`),
    ]);
    const final = await db.tradingOrder.findUniqueOrThrow({ where: { id: sell.id } });
    expect(['CANCELLED', 'FILLED']).toContain(final.status);
    expect(final.remainingUnits + final.filledUnits).toBe(final.originalUnits);
    const reservation = await db.ownershipReservation.findUniqueOrThrow({
      where: { id: sell.ownershipReservationId! },
    });
    expect(reservation.status).toBe(
      final.status === 'FILLED' ? 'CONSUMED' : 'RELEASED',
    );
    expect(await db.tradingExecution.count({ where: { assetId } })).toBeLessThanOrEqual(executionsBefore + 1);
  });

  it('serializes concurrent matchers so one crossed pair yields one canonical fill', async () => {
    await clearOpenBook('before-match-race');
    const buyer = await createBuyer('match-race');
    const seller = await createSeller('match-race', 2n);
    const buy = await service.place(
      actor(buyer.userId),
      {
        assetId,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '1000',
      },
      `${run}-match-race-buy`,
      `${run}-match-race-buy-key`,
    );
    setTradingTestFailureHook((point) => {
      if (point === 'execution.after-lock') throw new Error('INJECTED_TRADING_FAILURE');
    });
    try {
      await expect(
        service.place(
          actor(seller.userId),
          {
            assetId,
            side: 'SELL',
            type: 'LIMIT',
            timeInForce: 'GTC',
            units: '1',
            limitPriceMinor: '100',
          },
          `${run}-match-race-sell`,
          `${run}-match-race-sell-key`,
        ),
      ).rejects.toThrow('INJECTED_TRADING_FAILURE');
    } finally {
      setTradingTestFailureHook(undefined);
    }
    const before = await db.tradingExecution.count({ where: { assetId } });
    await Promise.all([
      service.matchMarket(assetId, actor(buyer.userId), `${run}-match-race-a`),
      service.matchMarket(assetId, actor(seller.userId), `${run}-match-race-b`),
    ]);
    const executions = await db.tradingExecution.findMany({
      where: { assetId, buyOrderId: buy.id },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ units: 1n, priceMinor: 1000n });
    expect(await db.tradingExecution.count({ where: { assetId } })).toBe(before + 1);
    const final = await db.tradingOrder.findUniqueOrThrow({ where: { id: buy.id } });
    expect(final).toMatchObject({ status: 'FILLED', remainingUnits: 0n, filledUnits: 1n });
  });

  it('honours same-price FIFO priority while concurrent matcher calls remain serialized', async () => {
    await clearOpenBook('before-priority-race');
    const first = await createBuyer('priority-first');
    const second = await createBuyer('priority-second');
    const seller = await createSeller('priority', 2n);
    const firstOrder = await service.place(
      actor(first.userId),
      { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '1100' },
      `${run}-priority-first`,
      `${run}-priority-first-key`,
    );
    await service.place(
      actor(second.userId),
      { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '1100' },
      `${run}-priority-second`,
      `${run}-priority-second-key`,
    );
    setTradingTestFailureHook((point) => {
      if (point === 'execution.after-lock') throw new Error('INJECTED_TRADING_FAILURE');
    });
    try {
      await expect(
        service.place(
          actor(seller.userId),
          { assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '100' },
          `${run}-priority-sell`,
          `${run}-priority-sell-key`,
        ),
      ).rejects.toThrow('INJECTED_TRADING_FAILURE');
    } finally {
      setTradingTestFailureHook(undefined);
    }
    await Promise.all([
      service.matchMarket(assetId, actor(first.userId), `${run}-priority-a`, 1),
      service.matchMarket(assetId, actor(second.userId), `${run}-priority-b`, 1),
    ]);
    const execution = await db.tradingExecution.findFirstOrThrow({
      where: { assetId, priceMinor: 1100n },
    });
    expect(execution.buyOrderId).toBe(firstOrder.id);
    expect((await db.tradingOrder.findUniqueOrThrow({ where: { id: firstOrder.id } })).status).toBe('FILLED');
  });

  it('rolls back cancellation after the state transition and keeps its reservation and idempotency retryable', async () => {
    const buyer = await createBuyer('cancel-rollback');
    const order = await service.place(
      actor(buyer.userId),
      {
        assetId,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '100',
      },
      `${run}-cancel-rollback-place`,
      `${run}-cancel-rollback-place-key`,
    );
    const key = `${run}-cancel-rollback-key`;
    setTradingTestFailureHook((point) => {
      if (point === 'cancel.after-order-update')
        throw new Error('INJECTED_TRADING_FAILURE');
    });
    try {
      await expect(
        service.cancel(
          actor(buyer.userId),
          order.id,
          `${run}-cancel-rollback`,
          key,
        ),
      ).rejects.toThrow('INJECTED_TRADING_FAILURE');
    } finally {
      setTradingTestFailureHook(undefined);
    }
    expect(await db.tradingOrder.findUnique({ where: { id: order.id } })).toMatchObject({
      status: 'OPEN',
      remainingUnits: 1n,
    });
    expect(
      await db.cashReservation.findUnique({ where: { id: (await db.tradingOrder.findUniqueOrThrow({ where: { id: order.id } })).cashReservationId! } }),
    ).toMatchObject({ status: 'ACTIVE', amountMinor: 101n });
    expect(await db.idempotencyRecord.findFirst({ where: { key } })).toBeNull();
    await expect(
      service.cancel(
        actor(buyer.userId),
        order.id,
        `${run}-cancel-rollback`,
        key,
      ),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it('expires eligible buy and sell orders, releasing only their scoped reservations once', async () => {
    await clearOpenBook('before-expiry-release');
    const buyer = await createBuyer('expiry-release');
    const seller = await createSeller('expiry-release', 2n);
    const buy = await service.place(
      actor(buyer.userId),
      { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '100' },
      `${run}-expiry-buy`,
      `${run}-expiry-buy-key`,
    );
    const sell = await service.place(
      actor(seller.userId),
      { assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '900' },
      `${run}-expiry-sell`,
      `${run}-expiry-sell-key`,
    );
    const expiredAt = new Date(Date.now() - 1_000);
    await db.tradingOrder.updateMany({
      where: { id: { in: [buy.id, sell.id] } },
      data: { expiresAt: expiredAt },
    });
    await expect(service.expireOrders(new Date(), 10, `${run}-expiry`)).resolves.toEqual({ expired: 2 });
    await expect(service.expireOrders(new Date(), 10, `${run}-expiry-replay`)).resolves.toEqual({ expired: 0 });
    expect(await db.tradingOrder.findUnique({ where: { id: buy.id } })).toMatchObject({ status: 'EXPIRED', remainingUnits: 1n, filledUnits: 0n });
    expect(await db.tradingOrder.findUnique({ where: { id: sell.id } })).toMatchObject({ status: 'EXPIRED', remainingUnits: 1n, filledUnits: 0n });
    expect(await db.cashReservation.findUnique({ where: { id: (await db.tradingOrder.findUniqueOrThrow({ where: { id: buy.id } })).cashReservationId! } })).toMatchObject({ status: 'RELEASED' });
    expect(await db.ownershipReservation.findUnique({ where: { id: (await db.tradingOrder.findUniqueOrThrow({ where: { id: sell.id } })).ownershipReservationId! } })).toMatchObject({ status: 'RELEASED' });
  });

  it('expires only the unfilled remainder and serializes concurrent expiry sweeps', async () => {
    await clearOpenBook('before-partial-expiry');
    const buyer = await createBuyer('partial-expiry');
    const seller = await createSeller('partial-expiry', 1n);
    const buy = await service.place(
      actor(buyer.userId),
      { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '2', limitPriceMinor: '500' },
      `${run}-partial-expiry-buy`,
      `${run}-partial-expiry-buy-key`,
    );
    await service.place(
      actor(seller.userId),
      { assetId, side: 'SELL', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '100' },
      `${run}-partial-expiry-sell`,
      `${run}-partial-expiry-sell-key`,
    );
    await db.tradingOrder.update({ where: { id: buy.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    const [first, second] = await Promise.all([
      service.expireOrders(new Date(), 10, `${run}-partial-expiry-a`),
      service.expireOrders(new Date(), 10, `${run}-partial-expiry-b`),
    ]);
    expect(first.expired + second.expired).toBe(1);
    const expired = await db.tradingOrder.findUniqueOrThrow({ where: { id: buy.id } });
    expect(expired).toMatchObject({ status: 'EXPIRED', filledUnits: 1n, remainingUnits: 1n });
    expect(await db.tradingExecution.count({ where: { assetId, buyOrderId: buy.id } })).toBe(1);
    expect(await db.cashReservation.findUnique({ where: { id: expired.cashReservationId! } })).toMatchObject({ status: 'RELEASED' });
  });

  it('rolls back expiry after the terminal update and leaves the order and reservation active', async () => {
    await clearOpenBook('before-expiry-rollback');
    const buyer = await createBuyer('expiry-rollback');
    const order = await service.place(
      actor(buyer.userId),
      { assetId, side: 'BUY', type: 'LIMIT', timeInForce: 'GTC', units: '1', limitPriceMinor: '100' },
      `${run}-expiry-rollback-place`,
      `${run}-expiry-rollback-place-key`,
    );
    await db.tradingOrder.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    setTradingTestFailureHook((point) => {
      if (point === 'expiry.after-order-update') throw new Error('INJECTED_TRADING_FAILURE');
    });
    try {
      await expect(service.expireOrders(new Date(), 10, `${run}-expiry-rollback`)).rejects.toThrow('INJECTED_TRADING_FAILURE');
    } finally {
      setTradingTestFailureHook(undefined);
    }
    const active = await db.tradingOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(active).toMatchObject({ status: 'OPEN', remainingUnits: 1n });
    expect(await db.cashReservation.findUnique({ where: { id: active.cashReservationId! } })).toMatchObject({ status: 'ACTIVE' });
    await expect(service.expireOrders(new Date(), 10, `${run}-expiry-retry`)).resolves.toEqual({ expired: 1 });
  });

  async function cleanup() {
    const scopedFees = await db.tradingExecution.aggregate({
      where: { assetId },
      _sum: { buyerFeeMinor: true, sellerFeeMinor: true },
    });
    const totalScopedFees =
      (scopedFees._sum.buyerFeeMinor ?? 0n) +
      (scopedFees._sum.sellerFeeMinor ?? 0n);
    const orders = await db.tradingOrder.findMany({
      where: { OR: [{ assetId }, { userId: { startsWith: 'trading-i-' } }] },
      select: {
        id: true,
        cashReservationId: true,
        ownershipReservationId: true,
      },
    });
    const ids = orders.map((order) => order.id);
    await db.auditEvent.deleteMany({
      where: { actorUserId: { startsWith: 'trading-i-' } },
    });
    await db.idempotencyRecord.deleteMany({
      where: { actorScope: { startsWith: 'user:trading-i-' } },
    });
    await db.orderStatusHistory.deleteMany({ where: { orderId: { in: ids } } });
    const executionIds = (
      await db.tradingExecution.findMany({
        where: { OR: [{ assetId }, { buyOrderId: { in: ids } }, { sellOrderId: { in: ids } }] },
        select: { id: true },
      })
    ).map((execution) => execution.id);
    await db.outboxEvent.deleteMany({
      where: { aggregateType: 'trading-execution', aggregateId: { in: executionIds } },
    });
    await db.tradingExecution.deleteMany({
      where: {
        OR: [
          { assetId },
          { buyOrderId: { in: ids } },
          { sellOrderId: { in: ids } },
        ],
      },
    });
    await db.tradingOrder.deleteMany({ where: { id: { in: ids } } });
    await db.tradingMarket.deleteMany({ where: { assetId } });
    await db.lotDisposal.deleteMany({
      where: { lot: { userId: { startsWith: 'trading-i-' } } },
    });
    await db.portfolioLot.deleteMany({
      where: { userId: { startsWith: 'trading-i-' } },
    });
    const financeAccountIds = (
      await db.financialAccount.findMany({
        where: {
          OR: [
            { id: { startsWith: 'trading-i-' } },
            { ownerUserId: { startsWith: 'trading-i-' } },
          ],
        },
        select: { id: true },
      })
    ).map((row) => row.id);
    await db.cashReservation.deleteMany({
      where: { accountId: { in: financeAccountIds } },
    });
    const journalIds = (
      await db.journalTransaction.findMany({
        where: { correlationId: { startsWith: 'trade:trading-i-' } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await db.journalEntry.deleteMany({
      where: {
        OR: [
          { accountId: { startsWith: 'trading-i-' } },
          { transactionId: { in: journalIds } },
        ],
      },
    });
    await db.journalTransaction.deleteMany({
      where: { id: { in: journalIds } },
    });
    if (totalScopedFees > 0n) {
      const feeAccount = await db.financialAccount.findFirst({
        where: {
          ownerType: 'PLATFORM',
          code: 'TRADING_FEE_REVENUE',
          currency: 'GBP',
        },
      });
      if (feeAccount)
        await db.accountBalance.update({
          where: { accountId: feeAccount.id },
          data: { postedCreditMinor: { decrement: totalScopedFees } },
        });
    }
    await db.accountBalance.deleteMany({
      where: { accountId: { in: financeAccountIds } },
    });
    await db.financialAccount.deleteMany({
      where: { id: { in: financeAccountIds } },
    });
    const ownershipAccountIds = (
      await db.ownershipAccount.findMany({
        where: { userId: { startsWith: 'trading-i-' } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await db.ownershipLedgerEntry.deleteMany({
      where: {
        OR: [
          { assetId },
          { debitAccountId: { in: ownershipAccountIds } },
          { creditAccountId: { in: ownershipAccountIds } },
        ],
      },
    });
    await db.ownershipReservation.deleteMany({
      where: { OR: [{ assetId }, { accountId: { in: ownershipAccountIds } }] },
    });
    await db.ownershipPosition.deleteMany({
      where: { OR: [{ assetId }, { accountId: { in: ownershipAccountIds } }] },
    });
    await db.ownershipAccount.deleteMany({
      where: { id: { in: ownershipAccountIds } },
    });
    await db.ownershipAssetSupply.deleteMany({ where: { assetId } });
    await db.asset.deleteMany({ where: { id: assetId } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: { startsWith: 'trading-i-' } } });
  }
});
