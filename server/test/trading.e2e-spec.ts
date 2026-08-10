import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 014 trading HTTP contracts', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let buyer: Awaited<ReturnType<typeof signup>>;
  let seller: Awaited<ReturnType<typeof signup>>;
  let unverified: Awaited<ReturnType<typeof signup>>;
  let assetId: string;
  let publicAssetId: string;
  let sellerOwnershipId: string;
  let buyerCashId: string;
  let clearingId: string;

  beforeAll(async () => {
    h = await bootSubmissionHarness('trading');
    categoryId = await createCategory(h);
    buyer = await signup(h, 'trading-buyer', 960);
    seller = await signup(h, 'trading-seller', 961);
    unverified = await signup(h, 'trading-unverified', 962);
    await h.db.user.updateMany({
      where: { id: { in: [buyer.id, seller.id] } },
      data: { accountStatus: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    await h.db.user.update({
      where: { id: unverified.id },
      data: { accountStatus: 'ACTIVE' },
    });
    await h.db.complianceCase.createMany({
      data: [buyer.id, seller.id].map((userId) => ({
        id: `${h.runId}-compliance-${userId}`,
        userId,
        provider: 'LOCAL_TEST',
        type: 'KYC',
        status: 'APPROVED',
      })),
    });
    assetId = `${h.runId}-asset`;
    publicAssetId = `ast${h.runId.replace(/\W/g, '').slice(-18)}`;
    sellerOwnershipId = `${h.runId}-seller-own`;
    buyerCashId = `${h.runId}-buyer-cash`;
    clearingId = `${h.runId}-clearing`;
    await h.db.asset.create({
      data: {
        id: assetId,
        publicId: publicAssetId,
        slug: `${h.runId}-asset`,
        title: 'Trading E2E asset',
        categoryId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await h.db.ownershipAssetSupply.create({
      data: { assetId, totalUnits: 100n, issuedUnits: 100n, status: 'ACTIVE' },
    });
    await h.db.ownershipAccount.create({
      data: { id: sellerOwnershipId, type: 'USER', userId: seller.id },
    });
    await h.db.ownershipPosition.create({
      data: {
        id: `${h.runId}-seller-pos`,
        assetId,
        accountId: sellerOwnershipId,
        settledUnits: 100n,
      },
    });
    await h.db.portfolioLot.create({
      data: {
        id: `${h.runId}-lot`,
        userId: seller.id,
        assetId,
        acquiredUnits: 100n,
        remainingUnits: 100n,
        totalCostMinor: 1_000n,
        currency: 'GBP',
        sourceReference: `${h.runId}-lot`,
      },
    });
    await h.db.financialAccount.createMany({
      data: [
        {
          id: buyerCashId,
          ownerType: 'USER',
          ownerUserId: buyer.id,
          accountType: 'LIABILITY',
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
        {
          id: clearingId,
          ownerType: 'PLATFORM',
          accountType: 'ASSET',
          code: `${h.runId}-clearing`,
          currency: 'GBP',
          normalSide: 'DEBIT',
        },
      ],
    });
    await h.db.accountBalance.create({
      data: { accountId: buyerCashId, postedCreditMinor: 10_000n },
    });
    await h.db.tradingMarket.create({
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
    if (!h) return;
    const scopedFees = await h.db.tradingExecution.aggregate({
      where: { assetId },
      _sum: { buyerFeeMinor: true, sellerFeeMinor: true },
    });
    const totalScopedFees =
      (scopedFees._sum.buyerFeeMinor ?? 0n) +
      (scopedFees._sum.sellerFeeMinor ?? 0n);
    const orderIds = (
      await h.db.tradingOrder.findMany({
        where: { assetId },
        select: { id: true },
      })
    ).map((row) => row.id);
    await h.db.orderStatusHistory.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await h.db.tradingExecution.deleteMany({ where: { assetId } });
    await h.db.tradingOrder.deleteMany({ where: { id: { in: orderIds } } });
    await h.db.tradingMarket.deleteMany({ where: { assetId } });
    const journalIds = (
      await h.db.journalTransaction.findMany({
        where: { correlationId: { startsWith: `trade:${assetId}` } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await h.db.journalEntry.deleteMany({
      where: { transactionId: { in: journalIds } },
    });
    await h.db.journalTransaction.deleteMany({
      where: { id: { in: journalIds } },
    });
    if (totalScopedFees > 0n) {
      const feeAccount = await h.db.financialAccount.findFirst({
        where: {
          ownerType: 'PLATFORM',
          code: 'TRADING_FEE_REVENUE',
          currency: 'GBP',
        },
      });
      if (feeAccount)
        await h.db.accountBalance.update({
          where: { accountId: feeAccount.id },
          data: { postedCreditMinor: { decrement: totalScopedFees } },
        });
    }
    await h.db.lotDisposal.deleteMany({
      where: { lot: { userId: seller.id } },
    });
    await h.db.portfolioLot.deleteMany({
      where: { userId: { in: [buyer.id, seller.id] } },
    });
    await h.db.cashReservation.deleteMany({
      where: { account: { ownerUserId: { in: [buyer.id, seller.id] } } },
    });
    const financialIds = (
      await h.db.financialAccount.findMany({
        where: { ownerUserId: { in: [buyer.id, seller.id] } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await h.db.accountBalance.deleteMany({
      where: { accountId: { in: [...financialIds, clearingId] } },
    });
    await h.db.financialAccount.deleteMany({
      where: { id: { in: [...financialIds, clearingId] } },
    });
    await h.db.ownershipLedgerEntry.deleteMany({ where: { assetId } });
    await h.db.ownershipReservation.deleteMany({ where: { assetId } });
    const ownershipIds = (
      await h.db.ownershipAccount.findMany({
        where: { userId: { in: [buyer.id, seller.id] } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await h.db.ownershipPosition.deleteMany({
      where: { accountId: { in: ownershipIds } },
    });
    await h.db.ownershipAccount.deleteMany({
      where: { id: { in: ownershipIds } },
    });
    await h.db.ownershipAssetSupply.deleteMany({ where: { assetId } });
    await h.db.asset.deleteMany({ where: { id: assetId } });
    await h.db.complianceDecision.deleteMany({
      where: { complianceCase: { userId: { in: [buyer.id, seller.id] } } },
    });
    await h.db.complianceCase.deleteMany({
      where: { userId: { in: [buyer.id, seller.id] } },
    });
    await h.db.auditEvent.deleteMany({
      where: { actorUserId: { in: [buyer.id, seller.id, unverified.id] } },
    });
    await h.db.idempotencyRecord.deleteMany({
      where: { key: { startsWith: h.runId } },
    });
    await closeSubmissionHarness(
      h,
      [buyer.id, seller.id, unverified.id],
      categoryId,
    );
  });

  it('validates authentication and exposes an identity-free empty public book', async () => {
    expect(
      (
        await request(h.app.getHttpServer())
          .post('/api/v1/trading/orders')
          .send({})
      ).status,
    ).toBe(401);
    const book = await request(h.app.getHttpServer()).get(
      `/api/v1/market/assets/${h.runId}-asset/order-book`,
    );
    expect(book.status).toBe(200);
    expect(book.body).toMatchObject({ status: 'OPEN', bids: [], asks: [] });
    expect(JSON.stringify(book.body)).not.toContain(buyer.id);
  });

  it('denies direct unverified trading requests before any order or reservation is created', async () => {
    const capabilities = await request(h.app.getHttpServer())
      .get('/api/v1/me/capabilities')
      .set('authorization', unverified.auth);
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: 'BROWSE_MARKETS',
          allowed: true,
          reason: null,
        }),
        expect.objectContaining({
          capability: 'PLACE_BUY_ORDER',
          allowed: false,
          reason: 'EMAIL_VERIFICATION_REQUIRED',
        }),
      ]),
    );
    expect(JSON.stringify(capabilities.body)).not.toMatch(
      /complianceCase|provider|hold|journal|accountId/i,
    );
    const response = await request(h.app.getHttpServer())
      .post('/api/v1/trading/orders')
      .set('authorization', unverified.auth)
      .set('x-forwarded-for', unverified.clientIp)
      .set('idempotency-key', `${h.runId}-unverified-bypass`)
      .send({
        assetId,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '125',
      });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
    await expect(
      h.db.tradingOrder.count({ where: { userId: unverified.id } }),
    ).resolves.toBe(0);

    const deposit = await request(h.app.getHttpServer())
      .post('/api/v1/wallet/deposits')
      .set('authorization', unverified.auth)
      .set('x-forwarded-for', unverified.clientIp)
      .set('idempotency-key', `${h.runId}-unverified-deposit`)
      .send({ amountMinor: '100' });
    expect(deposit.status).toBe(403);
    expect(deposit.body.error).toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });

    const bankLink = await request(h.app.getHttpServer())
      .post('/api/v1/wallet/bank-link/token')
      .set('authorization', unverified.auth)
      .set('x-forwarded-for', unverified.clientIp);
    expect(bankLink.status).toBe(403);
    expect(bankLink.body.error).toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });

    const submission = await request(h.app.getHttpServer())
      .post('/api/v1/submissions')
      .set('authorization', unverified.auth)
      .set('x-forwarded-for', unverified.clientIp)
      .set('idempotency-key', `${h.runId}-unverified-submission`)
      .send({ categoryId });
    expect(submission.status).toBe(403);
    expect(submission.body.error).toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
    await expect(
      h.db.assetSubmission.count({ where: { ownerUserId: unverified.id } }),
    ).resolves.toBe(0);

    await h.db.user.update({
      where: { id: unverified.id },
      data: { emailVerifiedAt: new Date() },
    });
    const withdrawal = await request(h.app.getHttpServer())
      .post('/api/v1/wallet/withdrawals')
      .set('authorization', unverified.auth)
      .set('x-forwarded-for', unverified.clientIp)
      .set('idempotency-key', `${h.runId}-unverified-withdrawal`)
      .send({ amountMinor: '100', destinationReference: 'local-test' });
    expect(withdrawal.status).toBe(403);
    expect(withdrawal.body.error).toMatchObject({
      code: 'PHONE_VERIFICATION_REQUIRED',
    });
  });

  it('places, matches and replays a safe order response without reservation/account leakage', async () => {
    const sell = await request(h.app.getHttpServer())
      .post('/api/v1/trading/orders')
      .set('authorization', seller.auth)
      .set('x-forwarded-for', seller.clientIp)
      .set('idempotency-key', `${h.runId}-sell`)
      .send({
        assetId: publicAssetId,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '10',
        limitPriceMinor: '125',
      });
    expect(sell.status).toBe(201);
    const buyRequest = () =>
      request(h.app.getHttpServer())
        .post('/api/v1/trading/orders')
        .set('authorization', buyer.auth)
        .set('x-forwarded-for', buyer.clientIp)
        .set('idempotency-key', `${h.runId}-buy`)
        .send({
          assetId,
          side: 'BUY',
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '10',
          limitPriceMinor: '125',
        });
    const buy = await buyRequest();
    expect(buy.status).toBe(201);
    expect(buy.body).toMatchObject({
      status: 'FILLED',
      filledUnits: '10',
      limitPriceMinor: '125',
    });
    expect(JSON.stringify(buy.body)).not.toMatch(
      /reservation|accountId|counterparty/i,
    );
    await expect(buyRequest()).resolves.toMatchObject({
      status: 201,
      body: expect.objectContaining({ id: buy.body.id }),
    });
    expect(await h.db.tradingExecution.count({ where: { assetId } })).toBe(1);
    const sellSecond = await request(h.app.getHttpServer())
      .post('/api/v1/trading/orders')
      .set('authorization', seller.auth)
      .set('x-forwarded-for', seller.clientIp)
      .set('idempotency-key', `${h.runId}-sell-second`)
      .send({
        assetId,
        side: 'SELL',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '125',
      });
    expect(sellSecond.status).toBe(201);
    const buySecond = await request(h.app.getHttpServer())
      .post('/api/v1/trading/orders')
      .set('authorization', buyer.auth)
      .set('x-forwarded-for', buyer.clientIp)
      .set('idempotency-key', `${h.runId}-buy-second`)
      .send({
        assetId,
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        units: '1',
        limitPriceMinor: '125',
      });
    expect(buySecond.status).toBe(201);
    const buyerExecutions = await request(h.app.getHttpServer())
      .get('/api/v1/trading/executions?limit=1')
      .set('authorization', buyer.auth);
    const sellerExecutions = await request(h.app.getHttpServer())
      .get('/api/v1/trading/executions?limit=1')
      .set('authorization', seller.auth);
    expect(buyerExecutions.status).toBe(200);
    expect(buyerExecutions.body.items[0]).toMatchObject({
      side: 'BUY',
      priceMinor: '125',
      assetSlug: `${h.runId}-asset`,
    });
    expect(sellerExecutions.body.items[0]).toMatchObject({ side: 'SELL' });
    expect(buyerExecutions.body.nextCursor).toEqual(expect.any(String));
    const continuation = await request(h.app.getHttpServer())
      .get(
        `/api/v1/trading/executions?limit=1&cursor=${encodeURIComponent(buyerExecutions.body.nextCursor)}`,
      )
      .set('authorization', buyer.auth);
    expect(continuation.status).toBe(200);
    expect(continuation.body.items).toHaveLength(1);
    expect(continuation.body.items[0].executionId).not.toBe(
      buyerExecutions.body.items[0].executionId,
    );
    expect(JSON.stringify(buyerExecutions.body)).not.toMatch(
      /userId|accountId|counterparty|reservation|journal/i,
    );
    expect(
      (await request(h.app.getHttpServer()).get('/api/v1/trading/executions'))
        .status,
    ).toBe(401);
    expect(
      (
        await request(h.app.getHttpServer())
          .get('/api/v1/trading/executions?cursor=bad')
          .set('authorization', buyer.auth)
      ).status,
    ).toBe(400);
  });
});
