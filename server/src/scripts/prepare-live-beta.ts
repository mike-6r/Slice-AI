import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { BETA_FIXTURE_SLUG_PREFIX } from '../config/beta-policy';
import { demoAccounts } from './staging-demo-safety';

/**
 * Read-only inventory for the controlled Beta transition.  There is
 * intentionally no apply mode: cleanup must be reviewed against this
 * explicitly-owned inventory before a separately authorised operation can
 * archive anything.
 */
async function main() {
  if (process.env.APP_ENV !== 'beta') {
    throw new Error(
      'Refusing Beta preparation: APP_ENV must be exactly "beta".',
    );
  }
  if (process.env.BETA_PREPARE_DRY_RUN !== 'true') {
    throw new Error(
      'Refusing Beta preparation: BETA_PREPARE_DRY_RUN=true is required.',
    );
  }
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService);
    const slugs = await db.asset.findMany({
      where: { slug: { startsWith: BETA_FIXTURE_SLUG_PREFIX } },
      select: { id: true, slug: true },
      orderBy: { slug: 'asc' },
    });
    const assetIds = slugs.map((asset) => asset.id);
    const emails = [
      ...Object.values(demoAccounts).map((account) => account.email),
      ...(process.env.BETA_ADMIN_EMAIL
        ? [process.env.BETA_ADMIN_EMAIL.trim().toLowerCase()]
        : []),
    ];
    const users = await db.user.findMany({
      where: { normalizedEmail: { in: emails } },
      select: { id: true, email: true, accountStatus: true },
      orderBy: { email: 'asc' },
    });
    const userIds = users.map((user) => user.id);
    const [
      snapshots,
      valuationPoints,
      observations,
      mappings,
      evidence,
      submissions,
      lots,
      portfolioSnapshots,
      orders,
      executions,
      supplies,
      positions,
      reservations,
      ownershipLedger,
      journalTransactions,
    ] = await Promise.all([
      db.assetMarketSnapshot.count({ where: { assetId: { in: assetIds } } }),
      db.assetValuationPoint.count({ where: { assetId: { in: assetIds } } }),
      db.marketObservation.count({ where: { assetId: { in: assetIds } } }),
      db.marketProviderMapping.count({ where: { assetId: { in: assetIds } } }),
      db.valuationEvidence.count({ where: { assetId: { in: assetIds } } }),
      db.assetSubmission.count({
        where: {
          OR: [{ assetId: { in: assetIds } }, { ownerUserId: { in: userIds } }],
        },
      }),
      db.portfolioLot.count({
        where: {
          OR: [{ assetId: { in: assetIds } }, { userId: { in: userIds } }],
        },
      }),
      db.portfolioSnapshot.count({ where: { userId: { in: userIds } } }),
      db.tradingOrder.count({
        where: {
          OR: [{ assetId: { in: assetIds } }, { userId: { in: userIds } }],
        },
      }),
      db.tradingExecution.count({ where: { assetId: { in: assetIds } } }),
      db.ownershipAssetSupply.count({ where: { assetId: { in: assetIds } } }),
      db.ownershipPosition.count({
        where: {
          OR: [
            { assetId: { in: assetIds } },
            { account: { userId: { in: userIds } } },
          ],
        },
      }),
      db.ownershipReservation.count({ where: { assetId: { in: assetIds } } }),
      db.ownershipLedgerEntry.count({ where: { assetId: { in: assetIds } } }),
      db.journalTransaction.count({
        where: {
          OR: [
            { correlationId: { startsWith: 'staging-demo-' } },
            { correlationId: { startsWith: 'demo-' } },
          ],
        },
      }),
    ]);
    process.stdout.write(
      JSON.stringify(
        {
          mode: 'beta',
          dryRun: true,
          destructiveAction: 'NONE',
          fixtureMarker: {
            assetSlugPrefix: BETA_FIXTURE_SLUG_PREFIX,
            accountEmails: emails,
          },
          assets: slugs.map((asset) => asset.slug),
          accounts: users,
          counts: {
            assets: slugs.length,
            snapshots,
            valuationPoints,
            observations,
            mappings,
            evidence,
            submissions,
            lots,
            portfolioSnapshots,
            orders,
            executions,
            supplies,
            positions,
            reservations,
            ownershipLedger,
            journalTransactions,
          },
          nextStep:
            'Review this inventory and authorise a separate, fixture-scoped archive operation. No records were changed.',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Beta preparation failed.'}\n`,
  );
  process.exitCode = 1;
});
