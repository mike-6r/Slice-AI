import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Reports and, only with --execute, marks explicitly seeded STG-* records as
 * retired from the customer-facing Beta projection. Nothing is deleted.
 */
const db = new PrismaClient();
const execute = process.argv.includes('--execute');
const dryRun = process.argv.includes('--dry-run') || !execute;

function fixtureSubmission(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const value = metadata as Record<string, unknown>;
  return (
    value.betaFixtureRetired === true ||
    (typeof value.certificationNumber === 'string' && value.certificationNumber.startsWith('STG-'))
  );
}

async function main() {
  const assets = await db.asset.findMany({
    where: { slug: { startsWith: 'slice-demo-' } },
    select: { id: true, slug: true },
  });
  const assetIds = assets.map((asset) => asset.id);
  const submissions = await db.assetSubmission.findMany({
    select: { id: true, declaredMetadata: true, assetId: true },
  });
  const fixtureSubmissions = submissions.filter(
    (submission) => assetIds.includes(submission.assetId ?? '') || fixtureSubmission(submission.declaredMetadata),
  );
  const [listings, orders, holdings, executions] = await Promise.all([
    db.assetPublication.count({ where: { assetId: { in: assetIds } } }),
    db.tradingOrder.count({ where: { assetId: { in: assetIds } } }),
    db.portfolioLot.count({ where: { assetId: { in: assetIds } } }),
    db.tradingExecution.count({ where: { assetId: { in: assetIds } } }),
  ]);
  const report = {
    mode: dryRun ? 'DRY_RUN' : 'EXECUTE',
    fixtureMarketAssets: assets.length,
    fixtureSubmissions: fixtureSubmissions.length,
    fixtureListings: listings,
    fixtureOrders: orders,
    fixtureHoldings: holdings,
    fixtureActivity: executions,
    realSubmissionsAffected: 0,
  };
  if (execute) {
    for (const submission of fixtureSubmissions) {
      const metadata =
        submission.declaredMetadata && typeof submission.declaredMetadata === 'object' && !Array.isArray(submission.declaredMetadata)
          ? submission.declaredMetadata
          : {};
      await db.assetSubmission.update({
        where: { id: submission.id },
        data: { declaredMetadata: { ...(metadata as Record<string, unknown>), betaFixtureRetired: true } },
      });
    }
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
