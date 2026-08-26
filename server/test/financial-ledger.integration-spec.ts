import { PrismaClient } from '@prisma/client';
import { FinancialLedgerService } from '../src/modules/finance/application/financial-ledger.service';
import { FinancialReconciliationService } from '../src/modules/finance/application/financial-reconciliation.service';
import { PortfolioLotService } from '../src/modules/finance/application/portfolio-lot.service';
import { setFinanceTestFailureHook } from '../src/modules/finance/application/finance-test-failure-injection';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { AppConfig } from '../src/config/app-config';
import type { Actor } from '../src/modules/identity/auth/auth.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `finance-i-${Date.now()}`;

type FinanceActor = Actor;

describe('Document 013 PostgreSQL finance authority', () => {
  const userId = `${run}-user`;
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const cashAccountId = `${run}-cash`;
  const clearingAccountId = `${run}-clearing`;
  const actor: FinanceActor = {
    userId: userId as never,
    sessionId: `${run}-session`,
    status: 'ACTIVE',
    roles: ['ADMIN'],
    sessionRevokedAt: null,
    sessionRevocationReason: null,
    authenticatedAt: new Date(),
  };
  const recentAuth = new RecentAuthService({
    recentAuthWindowSeconds: 300,
  } as AppConfig);
  const ledger = new FinancialLedgerService(db as never, recentAuth);
  const lots = new PortfolioLotService(db as never, recentAuth);
  const reconciliation = new FinancialReconciliationService(
    db as never,
    recentAuth,
  );

  beforeAll(async () => {
    await db.$connect();
    await cleanupFinanceFixtures();
    await db.user.create({
      data: {
        id: userId,
        email: `${run}@example.test`,
        normalizedEmail: `${run}@example.test`,
        passwordHash: 'test-only',
      },
    });
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Finance category' },
    });
    await db.asset.create({
      data: {
        id: assetId,
        publicId: `ast_${run.replace(/[^a-zA-Z0-9]/g, '').slice(-18)}`,
        slug: assetId,
        title: 'Finance asset',
        categoryId,
      },
    });
    await db.financialAccount.createMany({
      data: [
        {
          id: cashAccountId,
          ownerType: 'USER',
          ownerUserId: userId,
          accountType: 'LIABILITY',
          code: 'CASH_AVAILABLE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
        {
          id: clearingAccountId,
          ownerType: 'PLATFORM',
          accountType: 'ASSET',
          code: `${run}-CLEARING`,
          currency: 'GBP',
          normalSide: 'DEBIT',
        },
      ],
    });
  });

  afterAll(async () => {
    setFinanceTestFailureHook(undefined);
    await cleanupFinanceFixtures();
    await db.$disconnect();
  });

  async function cleanupFinanceFixtures() {
    const accountIds = [cashAccountId, clearingAccountId];
    const staleAccounts = await db.financialAccount.findMany({
      where: {
        OR: [
          { id: { startsWith: 'finance-i-' } },
          { id: { startsWith: 'submission-finance-integration-' } },
        ],
      },
      select: { id: true },
    });
    const allAccountIds = [
      ...new Set([
        ...accountIds,
        ...staleAccounts.map((account) => account.id),
      ]),
    ];
    const journalIds = (
      await db.journalEntry.findMany({
        where: { accountId: { in: allAccountIds } },
        select: { transactionId: true },
      })
    ).map((entry) => entry.transactionId);
    await db.auditEvent.deleteMany({ where: { actorUserId: userId } });
    await db.auditEvent.deleteMany({
      where: { actorUserId: { startsWith: 'finance-i-' } },
    });
    await db.idempotencyRecord.deleteMany({
      where: { actorScope: { startsWith: 'user:finance-i-' } },
    });
    await db.lotDisposal.deleteMany({
      where: { lot: { userId: { startsWith: 'finance-i-' } } },
    });
    await db.portfolioLot.deleteMany({
      where: { userId: { startsWith: 'finance-i-' } },
    });
    await db.cashReservation.deleteMany({
      where: { accountId: { in: allAccountIds } },
    });
    await db.journalEntry.deleteMany({
      where: { accountId: { in: allAccountIds } },
    });
    await db.journalTransaction.deleteMany({
      where: { reversalOfId: { in: journalIds } },
    });
    await db.journalTransaction.deleteMany({
      where: { id: { in: journalIds } },
    });
    await db.accountBalance.deleteMany({
      where: { accountId: { in: allAccountIds } },
    });
    await db.financialAccount.deleteMany({
      where: { id: { in: allAccountIds } },
    });
    await db.financialReconciliationRun.deleteMany({
      where: { actorUserId: { startsWith: 'finance-i-' } },
    });
    await db.asset.deleteMany({ where: { id: { startsWith: 'finance-i-' } } });
    await db.category.deleteMany({
      where: { id: { startsWith: 'finance-i-' } },
    });
    await db.user.deleteMany({ where: { id: { startsWith: 'finance-i-' } } });
  }

  it('posts a balanced journal and updates its replayable balance projection', async () => {
    const result = await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId: `${run}-funding`,
        descriptionCode: 'TEST_FUNDING',
        lines: [
          { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '10000' },
          { accountId: cashAccountId, side: 'CREDIT', amountMinor: '10000' },
        ],
      },
      `${run}-request`,
      `${run}-post`,
    );
    expect(
      await db.journalEntry.count({
        where: { transactionId: result.transactionId },
      }),
    ).toBe(2);
    expect(await ledger.walletForUser(userId)).toEqual({
      currency: 'GBP',
      accounts: [
        {
          code: 'CASH_AVAILABLE',
          totalMinor: '10000',
          reservedMinor: '0',
          availableMinor: '10000',
        },
      ],
      collectorProceedsMinor: '0',
      collectorProceedsReservedMinor: '0',
      orderReservedMinor: '0',
      pendingDepositCount: 0,
      pendingMinor: '0',
      pendingWithdrawalCount: 0,
      pendingWithdrawalMinor: '0',
      availableMinor: '10000',
      reservedMinor: '0',
      riskHeldDepositCount: 0,
      riskHeldDeposits: [],
      riskHeldMinor: '0',
      totalMinor: '10000',
      tradeAvailableMinor: '10000',
      withdrawableMinor: '10000',
      withdrawableSources: [
        {
          code: 'CASH_AVAILABLE',
          availableMinor: '10000',
        },
      ],
      withdrawalReservedMinor: '0',
    });
  });

  it('replays an exact post, rejects a fingerprint conflict, and leaves unbalanced rows absent', async () => {
    const input = {
      type: 'DEMO_FUNDING' as const,
      correlationId: `${run}-replay`,
      descriptionCode: 'TEST_REPLAY',
      lines: [
        {
          accountId: clearingAccountId,
          side: 'DEBIT' as const,
          amountMinor: '1000',
        },
        {
          accountId: cashAccountId,
          side: 'CREDIT' as const,
          amountMinor: '1000',
        },
      ],
    };
    const first = await ledger.post(
      actor,
      input,
      `${run}-replay-request`,
      `${run}-replay-key`,
    );
    await expect(
      ledger.post(actor, input, `${run}-replay-request`, `${run}-replay-key`),
    ).resolves.toEqual(first);
    await expect(
      ledger.post(
        actor,
        { ...input, descriptionCode: 'CHANGED' },
        `${run}-replay-request`,
        `${run}-replay-key`,
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_CONFLICT' } });
    await expect(
      ledger.post(
        actor,
        {
          ...input,
          correlationId: `${run}-unbalanced`,
          lines: [
            { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '10' },
            { accountId: cashAccountId, side: 'CREDIT', amountMinor: '9' },
          ],
        },
        `${run}-unbalanced-request`,
        `${run}-unbalanced-key`,
      ),
    ).rejects.toMatchObject({ response: { code: 'UNBALANCED_JOURNAL' } });
    expect(
      await db.journalTransaction.count({
        where: { correlationId: `${run}-unbalanced` },
      }),
    ).toBe(0);
  });

  it('serializes concurrent cash reservations without overspending and releases committed cash', async () => {
    const requests = ['a', 'b'].map((suffix) =>
      ledger.reserveCash(
        actor,
        {
          accountId: cashAccountId,
          purposeType: 'TEST',
          purposeId: `${run}-reserve-${suffix}`,
          amountMinor: '6000',
        },
        `${run}-reserve-${suffix}`,
        `${run}-reserve-key-${suffix}`,
      ),
    );
    const results = await Promise.allSettled(requests);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const balance = (await ledger.walletForUser(userId)).accounts[0];
    expect(balance).toMatchObject({
      totalMinor: '11000',
      reservedMinor: '6000',
      availableMinor: '5000',
    });
    const winner = results.find((result) => result.status === 'fulfilled');
    if (!winner || winner.status !== 'fulfilled')
      throw new Error('Expected one reservation to commit.');
    await ledger.releaseCash(
      actor,
      winner.value.reservationId,
      `${run}-release`,
      `${run}-release-key`,
    );
    expect((await ledger.walletForUser(userId)).accounts[0]).toMatchObject({
      reservedMinor: '0',
      availableMinor: '11000',
    });
  });

  it('consumes FIFO lots append-only, then reverses a journal without changing its original entries', async () => {
    await lots.recordAcquisition(
      actor,
      {
        userId,
        assetId,
        units: '3',
        totalCostMinor: '100',
        sourceReference: `${run}-lot`,
      },
      `${run}-lot-request`,
      `${run}-lot-key`,
    );
    const partial = await lots.recordDisposal(
      actor,
      {
        userId,
        assetId,
        units: '1',
        grossProceedsMinor: '40',
        sourceReference: `${run}-lot-disposal-1`,
      },
      `${run}-lot-disposal-1-request`,
      `${run}-lot-disposal-1-key`,
    );
    const full = await lots.recordDisposal(
      actor,
      {
        userId,
        assetId,
        units: '2',
        grossProceedsMinor: '60',
        sourceReference: `${run}-lot-disposal-2`,
      },
      `${run}-lot-disposal-2-request`,
      `${run}-lot-disposal-2-key`,
    );
    expect([partial.costBasisMinor, full.costBasisMinor]).toEqual(['33', '67']);
    expect(
      await db.lotDisposal.count({
        where: { lot: { sourceReference: `${run}-lot` } },
      }),
    ).toBe(2);
    expect(
      (
        await db.portfolioLot.findUniqueOrThrow({
          where: { sourceReference: `${run}-lot` },
        })
      ).remainingUnits,
    ).toBe(0n);
    const journal = await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId: `${run}-to-reverse`,
        descriptionCode: 'TEST_REVERSAL',
        lines: [
          { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '2000' },
          { accountId: cashAccountId, side: 'CREDIT', amountMinor: '2000' },
        ],
      },
      `${run}-reverse-source-request`,
      `${run}-reverse-source-key`,
    );
    const before = await db.journalEntry.findMany({
      where: { transactionId: journal.transactionId },
      orderBy: { sequence: 'asc' },
    });
    const reversal = await ledger.reverse(
      actor,
      journal.transactionId,
      'TEST_REVERSAL',
      `${run}-reverse-request`,
      `${run}-reverse-key`,
    );
    expect(
      await db.journalEntry.findMany({
        where: { transactionId: journal.transactionId },
        orderBy: { sequence: 'asc' },
      }),
    ).toEqual(before);
    expect(
      await db.journalEntry.count({
        where: { transactionId: reversal.reversalId },
      }),
    ).toBe(2);
    expect(
      await reconciliation.run(
        actor,
        `${run}-reconcile-request`,
        `${run}-reconcile-key`,
      ),
    ).toMatchObject({ reconciled: true, mismatchCodes: [] });
  });

  it('rolls back injected journal, cash, FIFO, reversal and reconciliation failures', async () => {
    const fail = (stage: string) =>
      setFinanceTestFailureHook((actual) => {
        if (actual === stage) throw new Error(`injected:${stage}`);
      });
    try {
      const failedCorrelation = `${run}-rollback-journal`;
      const failedRequest = `${run}-rollback-journal-request`;
      const failedKey = `${run}-rollback-journal-key`;
      fail('journal.after-transaction');
      await expect(
        ledger.post(
          actor,
          {
            type: 'DEMO_FUNDING',
            correlationId: failedCorrelation,
            descriptionCode: 'TEST_ROLLBACK',
            lines: [
              {
                accountId: clearingAccountId,
                side: 'DEBIT',
                amountMinor: '10',
              },
              { accountId: cashAccountId, side: 'CREDIT', amountMinor: '10' },
            ],
          },
          failedRequest,
          failedKey,
        ),
      ).rejects.toThrow('injected:journal.after-transaction');
      expect(
        await db.journalTransaction.count({
          where: { correlationId: failedCorrelation },
        }),
      ).toBe(0);
      expect(
        await db.idempotencyRecord.count({ where: { key: failedKey } }),
      ).toBe(0);
      expect(
        await db.auditEvent.count({ where: { requestId: failedRequest } }),
      ).toBe(0);
      setFinanceTestFailureHook(undefined);
      await expect(
        ledger.post(
          actor,
          {
            type: 'DEMO_FUNDING',
            correlationId: failedCorrelation,
            descriptionCode: 'TEST_ROLLBACK',
            lines: [
              {
                accountId: clearingAccountId,
                side: 'DEBIT',
                amountMinor: '10',
              },
              { accountId: cashAccountId, side: 'CREDIT', amountMinor: '10' },
            ],
          },
          failedRequest,
          failedKey,
        ),
      ).resolves.toMatchObject({ correlationId: failedCorrelation });

      const reservationBefore = await db.cashReservation.count({
        where: { accountId: cashAccountId },
      });
      fail('cash.reserve.after-create');
      await expect(
        ledger.reserveCash(
          actor,
          {
            accountId: cashAccountId,
            purposeType: 'TEST',
            purposeId: `${run}-rollback-reserve`,
            amountMinor: '1',
          },
          `${run}-rollback-reserve-request`,
          `${run}-rollback-reserve-key`,
        ),
      ).rejects.toThrow('injected:cash.reserve.after-create');
      expect(
        await db.cashReservation.count({ where: { accountId: cashAccountId } }),
      ).toBe(reservationBefore);
      setFinanceTestFailureHook(undefined);
      const active = await ledger.reserveCash(
        actor,
        {
          accountId: cashAccountId,
          purposeType: 'TEST',
          purposeId: `${run}-rollback-release`,
          amountMinor: '1',
        },
        `${run}-rollback-release-request`,
        `${run}-rollback-release-key`,
      );
      fail('cash.release.after-update');
      await expect(
        ledger.releaseCash(
          actor,
          active.reservationId,
          `${run}-rollback-release-fail-request`,
          `${run}-rollback-release-fail-key`,
        ),
      ).rejects.toThrow('injected:cash.release.after-update');
      expect(
        (
          await db.cashReservation.findUniqueOrThrow({
            where: { id: active.reservationId },
          })
        ).status,
      ).toBe('ACTIVE');

      setFinanceTestFailureHook(undefined);
      const lot = await lots.recordAcquisition(
        actor,
        {
          userId,
          assetId,
          units: '1',
          totalCostMinor: '10',
          sourceReference: `${run}-rollback-lot`,
        },
        `${run}-rollback-lot-request`,
        `${run}-rollback-lot-key`,
      );
      fail('lot.disposal.after-lock');
      await expect(
        lots.recordDisposal(
          actor,
          {
            userId,
            assetId,
            units: '1',
            grossProceedsMinor: '11',
            sourceReference: `${run}-rollback-disposal`,
          },
          `${run}-rollback-disposal-request`,
          `${run}-rollback-disposal-key`,
        ),
      ).rejects.toThrow('injected:lot.disposal.after-lock');
      expect(
        (await db.portfolioLot.findUniqueOrThrow({ where: { id: lot.lotId } }))
          .remainingUnits,
      ).toBe(1n);
      expect(
        await db.lotDisposal.count({
          where: {
            sourceReference: { startsWith: `${run}-rollback-disposal` },
          },
        }),
      ).toBe(0);

      setFinanceTestFailureHook(undefined);
      const source = await ledger.post(
        actor,
        {
          type: 'DEMO_FUNDING',
          correlationId: `${run}-rollback-reversal`,
          descriptionCode: 'TEST_ROLLBACK',
          lines: [
            { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '20' },
            { accountId: cashAccountId, side: 'CREDIT', amountMinor: '20' },
          ],
        },
        `${run}-rollback-reversal-source-request`,
        `${run}-rollback-reversal-source-key`,
      );
      fail('reversal.after-transaction');
      await expect(
        ledger.reverse(
          actor,
          source.transactionId,
          'TEST_ROLLBACK',
          `${run}-rollback-reversal-request`,
          `${run}-rollback-reversal-key`,
        ),
      ).rejects.toThrow('injected:reversal.after-transaction');
      expect(
        await db.journalTransaction.count({
          where: { reversalOfId: source.transactionId },
        }),
      ).toBe(0);
      expect(
        (
          await db.journalTransaction.findUniqueOrThrow({
            where: { id: source.transactionId },
          })
        ).status,
      ).toBe('POSTED');

      setFinanceTestFailureHook(undefined);
      const runsBefore = await db.financialReconciliationRun.count({
        where: { actorUserId: userId },
      });
      fail('reconciliation.after-run');
      await expect(
        reconciliation.run(
          actor,
          `${run}-rollback-reconcile-request`,
          `${run}-rollback-reconcile-key`,
        ),
      ).rejects.toThrow('injected:reconciliation.after-run');
      expect(
        await db.financialReconciliationRun.count({
          where: { actorUserId: userId },
        }),
      ).toBe(runsBefore);
      expect(
        await db.idempotencyRecord.count({
          where: { key: `${run}-rollback-reconcile-key` },
        }),
      ).toBe(0);
    } finally {
      setFinanceTestFailureHook(undefined);
    }
  });

  it('serializes financial races and leaves projections equal to committed journal authority', async () => {
    const journalCorrelation = `${run}-race-journal`;
    const journalInput = {
      type: 'DEMO_FUNDING' as const,
      correlationId: journalCorrelation,
      descriptionCode: 'TEST_RACE',
      lines: [
        {
          accountId: clearingAccountId,
          side: 'DEBIT' as const,
          amountMinor: '30',
        },
        {
          accountId: cashAccountId,
          side: 'CREDIT' as const,
          amountMinor: '30',
        },
      ],
    };
    const journalRace = await Promise.allSettled([
      ledger.post(
        actor,
        journalInput,
        `${run}-race-journal-a`,
        `${run}-race-journal-key-a`,
      ),
      ledger.post(
        actor,
        journalInput,
        `${run}-race-journal-b`,
        `${run}-race-journal-key-b`,
      ),
    ]);
    expect(
      journalRace.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await db.journalTransaction.count({
        where: { correlationId: journalCorrelation },
      }),
    ).toBe(1);
    const canonicalJournal = await db.journalTransaction.findUniqueOrThrow({
      where: { correlationId: journalCorrelation },
    });
    expect(
      await db.journalEntry.count({
        where: { transactionId: canonicalJournal.id },
      }),
    ).toBe(2);

    const reserveRace = await Promise.allSettled(
      ['a', 'b'].map((suffix) =>
        ledger.reserveCash(
          actor,
          {
            accountId: cashAccountId,
            purposeType: 'TEST_RACE',
            purposeId: `${run}-race-reserve-${suffix}`,
            amountMinor: '7000',
          },
          `${run}-race-reserve-${suffix}`,
          `${run}-race-reserve-key-${suffix}`,
        ),
      ),
    );
    expect(
      reserveRace.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const reserveWinner = reserveRace.find(
      (result) => result.status === 'fulfilled',
    );
    if (!reserveWinner || reserveWinner.status !== 'fulfilled')
      throw new Error('Expected reserve winner.');
    const releaseAndReserve = await Promise.allSettled([
      ledger.releaseCash(
        actor,
        reserveWinner.value.reservationId,
        `${run}-race-release`,
        `${run}-race-release-key`,
      ),
      ledger.reserveCash(
        actor,
        {
          accountId: cashAccountId,
          purposeType: 'TEST_RACE',
          purposeId: `${run}-race-reserve-replacement`,
          amountMinor: '50',
        },
        `${run}-race-reserve-replacement`,
        `${run}-race-reserve-replacement-key`,
      ),
    ]);
    expect(
      releaseAndReserve.every((result) => result.status === 'fulfilled'),
    ).toBe(true);
    const cashBalance = await db.accountBalance.findUniqueOrThrow({
      where: { accountId: cashAccountId },
    });
    const activeReservations = await db.cashReservation.aggregate({
      where: { accountId: cashAccountId, status: 'ACTIVE' },
      _sum: { amountMinor: true },
    });
    expect(cashBalance.reservedMinor).toBe(
      activeReservations._sum.amountMinor ?? 0n,
    );
    expect(cashBalance.reservedMinor).toBeGreaterThanOrEqual(0n);
    const totalCash =
      cashBalance.postedCreditMinor - cashBalance.postedDebitMinor;
    expect(totalCash - cashBalance.reservedMinor).toBeGreaterThanOrEqual(0n);

    const raceAssetId = `${run}-race-asset`;
    await db.asset.create({
      data: {
        id: raceAssetId,
        publicId: `ast_${run.replace(/[^a-zA-Z0-9]/g, '').slice(-14)}race`,
        slug: raceAssetId,
        title: 'Finance race asset',
        categoryId,
      },
    });
    const raceLot = await lots.recordAcquisition(
      actor,
      {
        userId,
        assetId: raceAssetId,
        units: '2',
        totalCostMinor: '20',
        sourceReference: `${run}-race-lot`,
      },
      `${run}-race-lot-request`,
      `${run}-race-lot-key`,
    );
    const disposalRace = await Promise.allSettled(
      ['a', 'b'].map((suffix) =>
        lots.recordDisposal(
          actor,
          {
            userId,
            assetId: raceAssetId,
            units: '2',
            grossProceedsMinor: '20',
            sourceReference: `${run}-race-disposal-${suffix}`,
          },
          `${run}-race-disposal-${suffix}-request`,
          `${run}-race-disposal-${suffix}-key`,
        ),
      ),
    );
    expect(
      disposalRace.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      (
        await db.portfolioLot.findUniqueOrThrow({
          where: { id: raceLot.lotId },
        })
      ).remainingUnits,
    ).toBe(0n);
    expect(
      await db.lotDisposal.count({ where: { lotId: raceLot.lotId } }),
    ).toBe(1);

    const reversalSource = await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId: `${run}-race-reversal-source`,
        descriptionCode: 'TEST_RACE',
        lines: [
          { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '40' },
          { accountId: cashAccountId, side: 'CREDIT', amountMinor: '40' },
        ],
      },
      `${run}-race-reversal-source-request`,
      `${run}-race-reversal-source-key`,
    );
    const reversalRace = await Promise.allSettled(
      ['a', 'b'].map((suffix) =>
        ledger.reverse(
          actor,
          reversalSource.transactionId,
          'TEST_RACE_REVERSAL',
          `${run}-race-reversal-${suffix}-request`,
          `${run}-race-reversal-${suffix}-key`,
        ),
      ),
    );
    expect(
      reversalRace.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await db.journalTransaction.count({
        where: { reversalOfId: reversalSource.transactionId },
      }),
    ).toBe(1);
    expect(
      (
        await db.journalTransaction.findUniqueOrThrow({
          where: { id: reversalSource.transactionId },
        })
      ).status,
    ).toBe('REVERSED');

    const totals = await db.journalEntry.groupBy({
      by: ['accountId', 'side'],
      where: { accountId: { in: [cashAccountId, clearingAccountId] } },
      _sum: { amountMinor: true },
    });
    const expected = new Map<string, { debit: bigint; credit: bigint }>();
    for (const row of totals) {
      const current = expected.get(row.accountId) ?? { debit: 0n, credit: 0n };
      current[row.side === 'DEBIT' ? 'debit' : 'credit'] =
        row._sum.amountMinor ?? 0n;
      expected.set(row.accountId, current);
    }
    const projections = await db.accountBalance.findMany({
      where: { accountId: { in: [cashAccountId, clearingAccountId] } },
    });
    for (const projection of projections) {
      const journalTotal = expected.get(projection.accountId) ?? {
        debit: 0n,
        credit: 0n,
      };
      expect(projection.postedDebitMinor).toBe(journalTotal.debit);
      expect(projection.postedCreditMinor).toBe(journalTotal.credit);
    }
  });
});
