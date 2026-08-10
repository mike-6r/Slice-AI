import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { assertTestDatabaseUrl } from '../config/app-config';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { FinancialReconciliationService } from '../modules/finance/application/financial-reconciliation.service';
import { PortfolioLotService } from '../modules/finance/application/portfolio-lot.service';
import { PortfolioQueryService } from '../modules/finance/application/portfolio-query.service';
import { RecentAuthService } from '../modules/identity/access/recent-auth.service';
import type { Actor } from '../modules/identity/auth/auth.service';
import type { AppConfig } from '../config/app-config';

const run = `manual-finance-${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Manual finance QA failed: ${message}`);
}

function canonical(value: unknown) {
  return JSON.stringify(value, (_key, current: unknown) =>
    typeof current === 'bigint' ? current.toString() : current,
  );
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
  throw new Error(`Manual finance QA failed: expected ${code}.`);
}

async function main() {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl)
    throw new Error(
      'TEST_DATABASE_URL (or DATABASE_URL) and REDIS_URL are required.',
    );
  assertTestDatabaseUrl(databaseUrl);

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redis = new Redis(redisUrl, { lazyConnect: true });
  const userId = `${run}-user`;
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const raceAssetId = `${run}-race-asset`;
  const ownershipAccountId = `${run}-ownership`;
  const cashAccountId = `${run}-cash`;
  const clearingAccountId = `${run}-clearing`;
  const actor: Actor = {
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
  const portfolio = new PortfolioQueryService(db as never, ledger);

  try {
    await db.$connect();
    await redis.connect();
    assert((await redis.ping()) === 'PONG', 'Redis PING did not return PONG.');

    await db.user.create({
      data: {
        id: userId,
        email: `${run}@slice.test`,
        normalizedEmail: `${run}@slice.test`,
        passwordHash: 'manual-qa-not-a-login-password',
      },
    });
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Manual finance QA' },
    });
    for (const [id, title] of [
      [assetId, 'Manual finance asset'],
      [raceAssetId, 'Manual finance race asset'],
    ] as const) {
      await db.asset.create({
        data: {
          id,
          publicId: `ast_${id.replace(/[^A-Za-z0-9]/g, '').slice(-20)}`,
          slug: id,
          title,
          categoryId,
        },
      });
    }
    await db.ownershipAccount.create({
      data: { id: ownershipAccountId, type: 'USER', userId },
    });
    await db.ownershipAssetSupply.create({
      data: {
        assetId,
        totalUnits: 100n,
        issuedUnits: 100n,
        status: 'ACTIVE',
      },
    });
    await db.ownershipPosition.create({
      data: {
        id: `${run}-position`,
        assetId,
        accountId: ownershipAccountId,
        settledUnits: 3n,
      },
    });
    await db.assetMarketSnapshot.create({
      data: {
        id: `${run}-mark`,
        assetId,
        asOf: new Date(),
        estimatedMarketValueMinor: 1_000n,
        currency: 'GBP',
        change24hBps: 0,
        source: 'LOCAL_MANUAL_QA',
        status: 'DEMO',
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

    const funding = {
      type: 'DEMO_FUNDING' as const,
      correlationId: `${run}-funding`,
      descriptionCode: 'MANUAL_QA_FUNDING',
      lines: [
        {
          accountId: clearingAccountId,
          side: 'DEBIT' as const,
          amountMinor: '10000',
        },
        {
          accountId: cashAccountId,
          side: 'CREDIT' as const,
          amountMinor: '10000',
        },
      ],
    };
    const posted = await ledger.post(
      actor,
      funding,
      `${run}-funding-request`,
      `${run}-funding-key`,
    );
    const replay = await ledger.post(
      actor,
      funding,
      `${run}-funding-request`,
      `${run}-funding-key`,
    );
    assert(
      posted.transactionId === replay.transactionId,
      'journal replay was not stable.',
    );
    assert(
      (await db.journalEntry.count({
        where: { transactionId: posted.transactionId },
      })) === 2,
      'funding journal was duplicated.',
    );
    assert(
      (await ledger.walletForUser(userId)).accounts[0]?.availableMinor ===
        '10000',
      'funding did not produce available cash.',
    );

    const reservation = await ledger.reserveCash(
      actor,
      {
        accountId: cashAccountId,
        purposeType: 'MANUAL_QA',
        purposeId: `${run}-reserve`,
        amountMinor: '2500',
      },
      `${run}-reserve-request`,
      `${run}-reserve-key`,
    );
    assert(
      (await ledger.walletForUser(userId)).accounts[0]?.availableMinor ===
        '7500',
      'reserve did not reduce availability.',
    );
    await expectCode(
      () =>
        ledger.reserveCash(
          actor,
          {
            accountId: cashAccountId,
            purposeType: 'MANUAL_QA',
            purposeId: `${run}-over-reserve`,
            amountMinor: '8000',
          },
          `${run}-over-reserve-request`,
          `${run}-over-reserve-key`,
        ),
      'INSUFFICIENT_AVAILABLE_FUNDS',
    );
    await ledger.releaseCash(
      actor,
      reservation.reservationId,
      `${run}-release-request`,
      `${run}-release-key`,
    );
    assert(
      (await ledger.walletForUser(userId)).accounts[0]?.reservedMinor === '0',
      'release did not restore reserved cash.',
    );

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
        sourceReference: `${run}-partial`,
      },
      `${run}-partial-request`,
      `${run}-partial-key`,
    );
    const full = await lots.recordDisposal(
      actor,
      {
        userId,
        assetId,
        units: '2',
        grossProceedsMinor: '60',
        sourceReference: `${run}-full`,
      },
      `${run}-full-request`,
      `${run}-full-key`,
    );
    assert(
      partial.costBasisMinor === '33' && full.costBasisMinor === '67',
      'FIFO cost basis did not conserve 100 minor units.',
    );

    await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId: `${run}-history`,
        descriptionCode: 'MANUAL_QA_HISTORY',
        lines: [
          {
            accountId: clearingAccountId,
            side: 'DEBIT',
            amountMinor: '1',
          },
          {
            accountId: cashAccountId,
            side: 'CREDIT',
            amountMinor: '1',
          },
        ],
      },
      `${run}-history-request`,
      `${run}-history-key`,
    );

    const safePortfolio = await portfolio.portfolioForUser(userId);
    const safeHoldings = await portfolio.holdingsForUser(userId);
    const safeLots = await portfolio.lotsForUser(userId);
    const safeHistory = await ledger.transactionsForUser(userId, undefined, 1);
    assert(
      safePortfolio.valuationStatus === 'AVAILABLE',
      'portfolio valuation was not available for marked asset.',
    );
    assert(
      safeHoldings[0]?.availableUnits === '3',
      'holding projection is incorrect.',
    );
    assert(
      safeLots[0]?.remainingUnits === '0',
      'lot projection did not show full disposal.',
    );
    assert(
      safeHistory.items.length === 1 && safeHistory.nextCursor !== null,
      'transaction history cursor was not produced.',
    );
    assert(
      !JSON.stringify({
        safePortfolio,
        safeHoldings,
        safeLots,
        safeHistory,
      }).includes(cashAccountId),
      'safe portfolio projection leaked an account ID.',
    );

    const reversible = await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId: `${run}-reversible`,
        descriptionCode: 'MANUAL_QA_REVERSAL',
        lines: [
          { accountId: clearingAccountId, side: 'DEBIT', amountMinor: '20' },
          { accountId: cashAccountId, side: 'CREDIT', amountMinor: '20' },
        ],
      },
      `${run}-reversible-request`,
      `${run}-reversible-key`,
    );
    const originalEntries = await db.journalEntry.findMany({
      where: { transactionId: reversible.transactionId },
      orderBy: { sequence: 'asc' },
    });
    const reversal = await ledger.reverse(
      actor,
      reversible.transactionId,
      'MANUAL_QA_CORRECTION',
      `${run}-reverse-request`,
      `${run}-reverse-key`,
    );
    const reversalReplay = await ledger.reverse(
      actor,
      reversible.transactionId,
      'MANUAL_QA_CORRECTION',
      `${run}-reverse-request`,
      `${run}-reverse-key`,
    );
    assert(
      reversal.reversalId === reversalReplay.reversalId,
      'reversal replay was not stable.',
    );
    assert(
      canonical(
        await db.journalEntry.findMany({
          where: { transactionId: reversible.transactionId },
          orderBy: { sequence: 'asc' },
        }),
      ) === canonical(originalEntries),
      'reversal mutated original entries.',
    );
    assert(
      (await db.journalTransaction.count({
        where: { reversalOfId: reversible.transactionId },
      })) === 1,
      'reversal was duplicated.',
    );

    const clean = await reconciliation.run(
      actor,
      `${run}-clean-reconcile-request`,
      `${run}-clean-reconcile-key`,
    );
    assert(
      clean.reconciled,
      `clean reconciliation reported ${clean.mismatchCodes.join(',')}`,
    );
    const balanceBeforeMismatch = await db.accountBalance.findUniqueOrThrow({
      where: { accountId: cashAccountId },
    });
    await db.accountBalance.update({
      where: { accountId: cashAccountId },
      data: { postedCreditMinor: { increment: 1n } },
    });
    const mismatch = await reconciliation.run(
      actor,
      `${run}-mismatch-reconcile-request`,
      `${run}-mismatch-reconcile-key`,
    );
    assert(
      mismatch.mismatchCodes.includes('BALANCE_PROJECTION_MISMATCH'),
      'controlled mismatch was not deterministic.',
    );
    assert(
      (
        await db.accountBalance.findUniqueOrThrow({
          where: { accountId: cashAccountId },
        })
      ).postedCreditMinor ===
        balanceBeforeMismatch.postedCreditMinor + 1n,
      'reconciliation silently repaired a mismatch.',
    );
    await db.accountBalance.update({
      where: { accountId: cashAccountId },
      data: { postedCreditMinor: balanceBeforeMismatch.postedCreditMinor },
    });

    await expectCode(
      () =>
        ledger.post(
          actor,
          { ...funding, descriptionCode: 'CHANGED' },
          `${run}-funding-request`,
          `${run}-funding-key`,
        ),
      'IDEMPOTENCY_KEY_CONFLICT',
    );
    const journalRaceCorrelation = `${run}-journal-race`;
    const journalRaceInput = {
      ...funding,
      correlationId: journalRaceCorrelation,
    };
    const journalRace = await Promise.allSettled([
      ledger.post(
        actor,
        journalRaceInput,
        `${run}-journal-race-a`,
        `${run}-journal-race-key-a`,
      ),
      ledger.post(
        actor,
        journalRaceInput,
        `${run}-journal-race-b`,
        `${run}-journal-race-key-b`,
      ),
    ]);
    assert(
      journalRace.filter((result) => result.status === 'fulfilled').length ===
        1,
      'journal race posted more than once.',
    );
    const reserveRace = await Promise.allSettled(
      ['a', 'b'].map((suffix) =>
        ledger.reserveCash(
          actor,
          {
            accountId: cashAccountId,
            purposeType: 'MANUAL_RACE',
            purposeId: `${run}-reserve-race-${suffix}`,
            amountMinor: '15000',
          },
          `${run}-reserve-race-${suffix}`,
          `${run}-reserve-race-key-${suffix}`,
        ),
      ),
    );
    assert(
      reserveRace.filter((result) => result.status === 'fulfilled').length ===
        1,
      'cash race overspent.',
    );
    const reserveWinner = reserveRace.find(
      (result) => result.status === 'fulfilled',
    );
    if (reserveWinner?.status === 'fulfilled')
      await ledger.releaseCash(
        actor,
        reserveWinner.value.reservationId,
        `${run}-reserve-race-release`,
        `${run}-reserve-race-release-key`,
      );
    await lots.recordAcquisition(
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
    assert(
      disposalRace.filter((result) => result.status === 'fulfilled').length ===
        1,
      'FIFO race consumed units twice.',
    );

    process.stdout.write(
      JSON.stringify({
        run,
        result: 'PASS',
        wallet: await ledger.walletForUser(userId),
        cleanup: 'pending',
      }) + '\n',
    );
  } finally {
    const accountIds = [cashAccountId, clearingAccountId];
    const cleanup = {
      disposals: await db.lotDisposal.deleteMany({
        where: { lot: { userId } },
      }),
      lots: await db.portfolioLot.deleteMany({ where: { userId } }),
      reservations: await db.cashReservation.deleteMany({
        where: { accountId: { in: accountIds } },
      }),
      entries: await db.journalEntry.deleteMany({
        where: { accountId: { in: accountIds } },
      }),
      journals: await db.journalTransaction.deleteMany({
        where: { createdByUserId: userId },
      }),
      balances: await db.accountBalance.deleteMany({
        where: { accountId: { in: accountIds } },
      }),
      accounts: await db.financialAccount.deleteMany({
        where: { id: { in: accountIds } },
      }),
      reconciliationRuns: await db.financialReconciliationRun.deleteMany({
        where: { actorUserId: userId },
      }),
      audits: await db.auditEvent.deleteMany({
        where: { actorUserId: userId },
      }),
      idempotency: await db.idempotencyRecord.deleteMany({
        where: { actorScope: `user:${userId}` },
      }),
      positions: await db.ownershipPosition.deleteMany({
        where: { accountId: ownershipAccountId },
      }),
      supplies: await db.ownershipAssetSupply.deleteMany({
        where: { assetId: { in: [assetId, raceAssetId] } },
      }),
      ownershipAccounts: await db.ownershipAccount.deleteMany({
        where: { id: ownershipAccountId },
      }),
      marks: await db.assetMarketSnapshot.deleteMany({
        where: { assetId: { in: [assetId, raceAssetId] } },
      }),
      assets: await db.asset.deleteMany({
        where: { id: { in: [assetId, raceAssetId] } },
      }),
      categories: await db.category.deleteMany({ where: { id: categoryId } }),
      users: await db.user.deleteMany({ where: { id: userId } }),
    };
    const residual = await Promise.all([
      db.financialAccount.count({ where: { id: { in: accountIds } } }),
      db.journalTransaction.count({ where: { createdByUserId: userId } }),
      db.portfolioLot.count({ where: { userId } }),
      db.user.count({ where: { id: userId } }),
    ]);
    process.stdout.write(
      JSON.stringify({
        run,
        cleanup: Object.fromEntries(
          Object.entries(cleanup).map(([key, value]) => [key, value.count]),
        ),
        residual,
      }) + '\n',
    );
    await redis.quit();
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
