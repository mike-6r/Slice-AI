import { PrismaClient } from '@prisma/client';
import { demoAccounts } from './staging-demo-safety';

const execute = process.argv.includes('--execute');
const localEnvironments = new Set(['local', 'test', 'development']);

function assertLocalOnly() {
  const environment = process.env.SLICE_ENV ?? process.env.NODE_ENV;
  if (!environment || !localEnvironments.has(environment)) {
    throw new Error(
      'Refusing finance sanitation outside an explicit local/test/development environment.',
    );
  }
  if (execute) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const host = new URL(databaseUrl).hostname.toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      throw new Error(
        'Refusing to mutate a non-local database. Run only against localhost.',
      );
    }
  }
}

const demoEmails = Object.values(demoAccounts).map((account) => account.email);

function classForFixtureEmail(email: string) {
  return (demoEmails as readonly string[]).includes(email) ||
    email.startsWith('demo-disposable-')
    ? 'DEMO'
    : 'QA';
}

async function groupedWalletBalances(db: PrismaClient) {
  const accounts = await db.financialAccount.findMany({
    where: { ownerType: 'USER', currency: 'GBP' },
    include: { balance: true },
  });
  const totals = new Map<string, bigint>();
  for (const account of accounts) {
    const balance = account.balance;
    const gross = balance
      ? account.normalSide === 'DEBIT'
        ? balance.postedDebitMinor - balance.postedCreditMinor
        : balance.postedCreditMinor - balance.postedDebitMinor
      : 0n;
    totals.set(
      account.financialDataClass,
      (totals.get(account.financialDataClass) ?? 0n) +
        (gross > 0n ? gross : 0n),
    );
  }
  return Object.fromEntries(
    [...totals.entries()].map(([classification, amountMinor]) => [
      classification,
      amountMinor.toString(),
    ]),
  );
}

async function main() {
  assertLocalOnly();
  const db = new PrismaClient();
  try {
    const fixtureUsers = await db.user.findMany({
      where: {
        OR: [
          { normalizedEmail: { in: demoEmails } },
          { normalizedEmail: { startsWith: 'demo-disposable-' } },
          { normalizedEmail: { endsWith: '@slice.test' } },
          { normalizedEmail: { endsWith: '@example.test' } },
        ],
      },
      select: { id: true, normalizedEmail: true },
    });
    const demoUserIds = fixtureUsers
      .filter((user) => classForFixtureEmail(user.normalizedEmail) === 'DEMO')
      .map((user) => user.id);
    const qaUserIds = fixtureUsers
      .filter((user) => classForFixtureEmail(user.normalizedEmail) === 'QA')
      .map((user) => user.id);
    const syntheticJournals = await db.journalTransaction.findMany({
      where: {
        OR: [
          { type: 'DEMO_FUNDING' },
          { correlationId: { startsWith: 'staging-demo-' } },
          { descriptionCode: { startsWith: 'STAGING_DEMO_' } },
          { descriptionCode: { startsWith: 'MANUAL_' } },
          { descriptionCode: { startsWith: 'LOCAL_QA_' } },
        ],
      },
      select: { id: true },
    });
    const before = await groupedWalletBalances(db);
    const candidateSummary = {
      demoUsers: demoUserIds.length,
      qaUsers: qaUserIds.length,
      syntheticJournals: syntheticJournals.length,
    };

    if (execute) {
      await db.$transaction(async (tx) => {
        const updateFixtureUserData = async (
          userIds: string[],
          financialDataClass: 'DEMO' | 'QA',
        ) => {
          if (!userIds.length) return;
          await tx.user.updateMany({
            where: { id: { in: userIds } },
            data: { financialDataClass },
          });
          await tx.financialAccount.updateMany({
            where: { ownerUserId: { in: userIds } },
            data: { financialDataClass },
          });
          await tx.cashReservation.updateMany({
            where: { account: { ownerUserId: { in: userIds } } },
            data: { financialDataClass },
          });
          await tx.financialDeficit.updateMany({
            where: { userId: { in: userIds } },
            data: { financialDataClass },
          });
          await tx.financialAdjustmentRequest.updateMany({
            where: { userId: { in: userIds } },
            data: { financialDataClass },
          });
          await tx.portfolioLot.updateMany({
            where: { userId: { in: userIds } },
            data: { financialDataClass },
          });
          await tx.tradingOrder.updateMany({
            where: { userId: { in: userIds } },
            data: { financialDataClass },
          });
          await tx.tradingExecution.updateMany({
            where: {
              OR: [
                { buyOrder: { userId: { in: userIds } } },
                { sellOrder: { userId: { in: userIds } } },
              ],
            },
            data: { financialDataClass },
          });
          // A Stripe-backed record is retained as SANDBOX_REAL for traceability.
          await tx.moneyMovement.updateMany({
            where: {
              userId: { in: userIds },
              provider: 'STRIPE_SANDBOX',
              OR: [
                { providerReferenceHash: { not: null } },
                { providerBalanceTransactionIdHash: { not: null } },
              ],
            },
            data: { financialDataClass: 'SANDBOX_REAL' },
          });
          await tx.moneyMovement.updateMany({
            where: {
              userId: { in: userIds },
              NOT: {
                provider: 'STRIPE_SANDBOX',
                OR: [
                  { providerReferenceHash: { not: null } },
                  { providerBalanceTransactionIdHash: { not: null } },
                ],
              },
            },
            data: { financialDataClass },
          });
          await tx.journalTransaction.updateMany({
            where: {
              entries: { some: { account: { ownerUserId: { in: userIds } } } },
            },
            data: { financialDataClass },
          });
        };

        await updateFixtureUserData(qaUserIds, 'QA');
        await updateFixtureUserData(demoUserIds, 'DEMO');
        await tx.journalTransaction.updateMany({
          where: { id: { in: syntheticJournals.map((journal) => journal.id) } },
          data: { financialDataClass: 'DEMO' },
        });
        await tx.financialAccount.updateMany({
          where: { code: { startsWith: 'STAGING_DEMO_' } },
          data: { financialDataClass: 'DEMO' },
        });
      });
    }

    const after = execute ? await groupedWalletBalances(db) : before;
    process.stdout.write(
      `${JSON.stringify({
        mode: execute ? 'EXECUTED_LOCAL_ONLY' : 'DRY_RUN',
        candidateSummary,
        walletLiabilityByClassBeforeMinor: before,
        walletLiabilityByClassAfterMinor: after,
        preservedStripeSandboxEvidence: true,
      })}\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Finance fixture sanitation failed.'}\n`,
  );
  process.exitCode = 1;
});
