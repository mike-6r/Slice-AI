import * as request from 'supertest';
import {
  bootSubmissionHarness,
  closeSubmissionHarness,
  createCategory,
  signup,
  type SubmissionHarness,
} from './submissions.e2e-helper';

describe('Document 013 financial self-read HTTP contracts', () => {
  let h: SubmissionHarness;
  let categoryId: string;
  let user: { id: string; auth: string; clientIp: string };
  let assetId: string;
  let cashAccountId: string;
  let clearingAccountId: string;
  let ownershipAccountId: string;

  beforeAll(async () => {
    h = await bootSubmissionHarness('financial-reads');
    categoryId = await createCategory(h);
    user = await signup(h, 'financial-user', 811);
    assetId = `${h.runId}-asset`;
    cashAccountId = `${h.runId}-cash`;
    clearingAccountId = `${h.runId}-clearing`;
    ownershipAccountId = `${h.runId}-ownership`;
    await h.db.asset.create({
      data: {
        id: assetId,
        publicId: `ast_${h.runId.replace(/[^a-zA-Z0-9]/g, '').slice(-18)}`,
        slug: `${h.runId}-asset`,
        title: 'Finance read fixture',
        categoryId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await h.db.ownershipAccount.create({
      data: {
        id: ownershipAccountId,
        type: 'USER',
        userId: user.id,
        status: 'ACTIVE',
      },
    });
    await h.db.ownershipAssetSupply.create({
      data: {
        assetId,
        totalUnits: 100n,
        issuedUnits: 100n,
        nextSequence: 1n,
        status: 'ACTIVE',
      },
    });
    await h.db.ownershipPosition.create({
      data: {
        id: `${h.runId}-position`,
        assetId,
        accountId: ownershipAccountId,
        settledUnits: 20n,
        reservedUnits: 5n,
      },
    });
    await h.db.portfolioLot.create({
      data: {
        id: `${h.runId}-lot`,
        userId: user.id,
        assetId,
        acquiredUnits: 20n,
        remainingUnits: 20n,
        totalCostMinor: 500n,
        currency: 'GBP',
        sourceReference: `${h.runId}-lot`,
      },
    });
    await h.db.financialAccount.createMany({
      data: [
        {
          id: cashAccountId,
          ownerType: 'USER',
          ownerUserId: user.id,
          accountType: 'LIABILITY',
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
        {
          id: clearingAccountId,
          ownerType: 'PLATFORM',
          accountType: 'ASSET',
          code: `${h.runId}-CLEARING`,
          currency: 'GBP',
          normalSide: 'DEBIT',
        },
      ],
    });
    await h.db.journalTransaction.create({
      data: {
        id: `${h.runId}-journal`,
        type: 'DEMO_FUNDING',
        currency: 'GBP',
        correlationId: `${h.runId}-journal`,
        descriptionCode: 'TEST_FUNDING',
        createdByUserId: user.id,
      },
    });
    await h.db.journalEntry.createMany({
      data: [
        {
          id: `${h.runId}-journal-1`,
          transactionId: `${h.runId}-journal`,
          sequence: 1,
          accountId: clearingAccountId,
          side: 'DEBIT',
          amountMinor: 1000n,
          currency: 'GBP',
        },
        {
          id: `${h.runId}-journal-2`,
          transactionId: `${h.runId}-journal`,
          sequence: 2,
          accountId: cashAccountId,
          side: 'CREDIT',
          amountMinor: 1000n,
          currency: 'GBP',
        },
      ],
    });
    await h.db.accountBalance.create({
      data: { accountId: cashAccountId, postedCreditMinor: 1000n },
    });
    await h.db.accountBalance.create({
      data: { accountId: clearingAccountId, postedDebitMinor: 1000n },
    });
  });

  afterAll(async () => {
    const accountIds = [cashAccountId, clearingAccountId];
    await h.db.auditEvent.deleteMany({ where: { actorUserId: user.id } });
    await h.db.idempotencyRecord.deleteMany({
      where: { key: { startsWith: h.runId } },
    });
    await h.db.lotDisposal.deleteMany({ where: { lotId: `${h.runId}-lot` } });
    await h.db.portfolioLot.deleteMany({ where: { id: `${h.runId}-lot` } });
    await h.db.journalEntry.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await h.db.journalTransaction.deleteMany({
      where: { id: `${h.runId}-journal` },
    });
    await h.db.accountBalance.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await h.db.financialAccount.deleteMany({
      where: { id: { in: accountIds } },
    });
    await h.db.ownershipPosition.deleteMany({ where: { assetId } });
    await h.db.ownershipAssetSupply.deleteMany({ where: { assetId } });
    await h.db.ownershipAccount.deleteMany({
      where: { id: ownershipAccountId },
    });
    await h.db.asset.deleteMany({ where: { id: assetId } });
    await closeSubmissionHarness(h, [user.id], categoryId);
  });

  it('returns only the authenticated user’s safe financial projections', async () => {
    const server = h.app.getHttpServer();
    const headers = {
      authorization: user.auth,
      'x-forwarded-for': user.clientIp,
    };
    const [wallet, portfolio, holdings, lots, history] = await Promise.all([
      request(server).get('/api/v1/me/wallet/balances').set(headers),
      request(server).get('/api/v1/me/portfolio').set(headers),
      request(server).get('/api/v1/me/portfolio/assets').set(headers),
      request(server).get('/api/v1/me/portfolio/lots').set(headers),
      request(server)
        .get('/api/v1/me/wallet/transactions?limit=1')
        .set(headers),
    ]);
    for (const response of [wallet, portfolio, holdings, lots, history])
      expect(response.status).toBe(200);
    expect(wallet.body).toEqual({
      currency: 'GBP',
      pendingDepositCount: 0,
      pendingMinor: '0',
      pendingWithdrawalCount: 0,
      pendingWithdrawalMinor: '0',
      orderReservedMinor: '0',
      withdrawalReservedMinor: '0',
      collectorProceedsMinor: '0',
      collectorProceedsReservedMinor: '0',
      accounts: [
        {
          code: 'CASH_AVAILABLE',
          totalMinor: '1000',
          reservedMinor: '0',
          availableMinor: '1000',
        },
      ],
    });
    expect(portfolio.body).toMatchObject({
      currency: 'GBP',
      valuationStatus: 'PARTIAL',
    });
    expect(holdings.body[0]).toMatchObject({
      ownedUnits: '20',
      reservedUnits: '5',
      availableUnits: '15',
      estimatedValueMinor: null,
    });
    expect(lots.body[0]).toMatchObject({
      acquiredUnits: '20',
      remainingUnits: '20',
      totalCostMinor: '500',
    });
    expect(history.body.items[0]).toMatchObject({
      type: 'DEMO_FUNDING',
      amountMinor: '1000',
    });
    expect(
      JSON.stringify({
        wallet: wallet.body,
        portfolio: portfolio.body,
        holdings: holdings.body,
        lots: lots.body,
        history: history.body,
      }),
    ).not.toContain(cashAccountId);
  });

  it('requires authentication for every financial self read', async () => {
    const response = await request(h.app.getHttpServer()).get(
      '/api/v1/me/portfolio',
    );
    expect(response.status).toBe(401);
  });
});
