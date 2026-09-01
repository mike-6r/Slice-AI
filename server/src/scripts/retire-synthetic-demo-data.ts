import { Prisma, PrismaClient } from '@prisma/client';
import { demoAccounts } from './staging-demo-safety';

const db = new PrismaClient();

export const PRESERVED_OWNER_DEMO = Object.freeze({
  submissionId: '07dbf13f-f712-4d4a-adcf-96c45c7e641b',
  assetId: '8403a76f-c92c-4206-a7e7-7546b2098919',
  certificationNumber: '107760843',
});

const CONFIRMATION = 'RETIRE_SYNTHETIC_DEMO_RECORDS';
const RETIREMENT_REASON = 'REPOSITORY_SYNTHETIC_FIXTURE_REMOVAL_2026_09_01';

type RetirementSelection = Awaited<ReturnType<typeof selectRetirementScope>>;

function objectMetadata(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function alreadyRetired(metadata: Prisma.JsonValue | null) {
  return objectMetadata(metadata).betaFixtureRetired === true;
}

function demoEmails() {
  return Object.values(demoAccounts).map((account) => account.email);
}

async function selectRetirementScope() {
  const submissions = await db.assetSubmission.findMany({
    where: {
      id: { not: PRESERVED_OWNER_DEMO.submissionId },
      OR: [
        { owner: { normalizedEmail: { in: demoEmails() } } },
        {
          declaredMetadata: {
            path: ['certificationNumber'],
            string_starts_with: 'STG-',
          },
        },
        { declaredMetadata: { path: ['betaFixtureRetired'], equals: true } },
        { controlledBetaBypass: { isNot: null } },
        {
          asset: {
            is: {
              OR: [
                { slug: { startsWith: 'slice-demo-' } },
                { slug: { startsWith: 'qa-test-' } },
                { publicId: { startsWith: 'stg_collector_' } },
              ],
            },
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      assetId: true,
      declaredMetadata: true,
      owner: { select: { email: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const submissionIds = submissions.map((submission) => submission.id);
  const assets = await db.asset.findMany({
    where: {
      id: { not: PRESERVED_OWNER_DEMO.assetId },
      OR: [
        { slug: { startsWith: 'slice-demo-' } },
        { slug: { startsWith: 'qa-test-' } },
        { publicId: { startsWith: 'stg_collector_' } },
        { submissions: { some: { id: { in: submissionIds } } } },
      ],
    },
    select: {
      id: true,
      publicId: true,
      slug: true,
      title: true,
      status: true,
      publication: { select: { status: true } },
      tradingMarket: { select: { status: true, tradingEnabled: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return { submissions, assets };
}

function report(
  selection: RetirementSelection,
  changed?: Record<string, number>,
) {
  return {
    mode: changed ? 'EXECUTED' : 'DRY_RUN',
    boundary: {
      preservedSubmissionId: PRESERVED_OWNER_DEMO.submissionId,
      preservedAssetId: PRESERVED_OWNER_DEMO.assetId,
      preservedCertificationNumber: PRESERVED_OWNER_DEMO.certificationNumber,
      selection:
        'Dedicated demo-account records except the preserved owner-created Pikachu, STG-* certifications, slice-demo/qa-test slugs, and stg_collector public IDs.',
    },
    matched: {
      submissions: selection.submissions.length,
      activeSubmissions: selection.submissions.filter(
        (submission) => submission.status !== 'CANCELLED',
      ).length,
      assets: selection.assets.length,
      activeAssets: selection.assets.filter(
        (asset) => asset.status !== 'ARCHIVED',
      ).length,
      publishedAssets: selection.assets.filter(
        (asset) => asset.publication?.status === 'PUBLISHED',
      ).length,
      openMarkets: selection.assets.filter(
        (asset) =>
          asset.tradingMarket?.status === 'OPEN' ||
          asset.tradingMarket?.tradingEnabled === true,
      ).length,
    },
    changed: changed ?? null,
    assets: selection.assets.map((asset) => ({
      id: asset.id,
      publicId: asset.publicId,
      slug: asset.slug,
      title: asset.title,
      status: asset.status,
    })),
  };
}

async function assertPreservedOwnerDemo() {
  const submission = await db.assetSubmission.findUnique({
    where: { id: PRESERVED_OWNER_DEMO.submissionId },
    select: {
      assetId: true,
      normalizedCertificationNumber: true,
      declaredMetadata: true,
    },
  });
  const certification =
    submission?.normalizedCertificationNumber ??
    (objectMetadata(submission?.declaredMetadata ?? null)
      .certificationNumber as string | undefined);
  if (
    !submission ||
    submission.assetId !== PRESERVED_OWNER_DEMO.assetId ||
    certification !== PRESERVED_OWNER_DEMO.certificationNumber
  )
    throw new Error(
      'Refusing retirement: the preserved owner-created Pikachu boundary does not match staging authority.',
    );
}

async function executeRetirement(selection: RetirementSelection) {
  const now = new Date();
  const changedSubmissionIds = selection.submissions
    .filter(
      (submission) =>
        submission.status !== 'CANCELLED' ||
        !alreadyRetired(submission.declaredMetadata),
    )
    .map((submission) => submission.id);
  const changedAssetIds = selection.assets
    .filter(
      (asset) =>
        asset.status !== 'ARCHIVED' ||
        (asset.publication && asset.publication.status !== 'UNPUBLISHED') ||
        (asset.tradingMarket &&
          (asset.tradingMarket.status !== 'HALTED' ||
            asset.tradingMarket.tradingEnabled)),
    )
    .map((asset) => asset.id);
  const assetIds = selection.assets.map((asset) => asset.id);
  const changed = {
    submissionsRetired: 0,
    assetsArchived: 0,
    publicationsUnpublished: 0,
    marketsHalted: 0,
    auditEvents: 0,
  };

  await db.$transaction(async (transaction) => {
    for (const submission of selection.submissions) {
      if (
        submission.status === 'CANCELLED' &&
        alreadyRetired(submission.declaredMetadata)
      )
        continue;
      await transaction.assetSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          version: { increment: 1 },
          declaredMetadata: {
            ...objectMetadata(submission.declaredMetadata),
            betaFixtureRetired: true,
            fixtureRetirementReason: RETIREMENT_REASON,
            fixtureRetiredAt: now.toISOString(),
          } as Prisma.InputJsonObject,
        },
      });
      changed.submissionsRetired += 1;
    }

    const publications = await transaction.assetPublication.updateMany({
      where: { assetId: { in: assetIds }, status: { not: 'UNPUBLISHED' } },
      data: {
        status: 'UNPUBLISHED',
        unpublishedAt: now,
        version: { increment: 1 },
      },
    });
    changed.publicationsUnpublished = publications.count;

    const markets = await transaction.tradingMarket.updateMany({
      where: {
        assetId: { in: assetIds },
        OR: [{ status: { not: 'HALTED' } }, { tradingEnabled: true }],
      },
      data: {
        status: 'HALTED',
        tradingEnabled: false,
        version: { increment: 1 },
      },
    });
    changed.marketsHalted = markets.count;

    const assets = await transaction.asset.updateMany({
      where: { id: { in: assetIds }, status: { not: 'ARCHIVED' } },
      data: { status: 'ARCHIVED' },
    });
    changed.assetsArchived = assets.count;

    const auditRows = [
      ...changedSubmissionIds.map((resourceId) => ({
        actorType: 'SYSTEM' as const,
        action: 'SYNTHETIC_FIXTURE_RETIRED',
        resourceType: 'submission',
        resourceId,
        requestId: RETIREMENT_REASON,
        result: 'SUCCESS' as const,
        metadata: {
          reason: RETIREMENT_REASON,
          preservedSubmissionId: PRESERVED_OWNER_DEMO.submissionId,
        },
      })),
      ...changedAssetIds.map((resourceId) => ({
        actorType: 'SYSTEM' as const,
        action: 'SYNTHETIC_FIXTURE_RETIRED',
        resourceType: 'asset',
        resourceId,
        requestId: RETIREMENT_REASON,
        result: 'SUCCESS' as const,
        metadata: {
          reason: RETIREMENT_REASON,
          preservedAssetId: PRESERVED_OWNER_DEMO.assetId,
        },
      })),
    ];
    if (auditRows.length) {
      const audit = await transaction.auditEvent.createMany({
        data: auditRows,
      });
      changed.auditEvents = audit.count;
    }
  });
  return changed;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const confirmation = process.argv.find((argument) =>
    argument.startsWith('--confirm='),
  );
  if (execute) {
    if (process.env.SLICE_ENV !== 'staging')
      throw new Error(
        'Refusing retirement: SLICE_ENV must be exactly "staging".',
      );
    if (process.env.ALLOW_SYNTHETIC_DEMO_RETIREMENT !== 'true')
      throw new Error(
        'Refusing retirement: ALLOW_SYNTHETIC_DEMO_RETIREMENT=true is required.',
      );
    if (confirmation !== `--confirm=${CONFIRMATION}`)
      throw new Error(
        `Refusing retirement: --confirm=${CONFIRMATION} is required.`,
      );
    await assertPreservedOwnerDemo();
  }

  const selection = await selectRetirementScope();
  if (
    selection.submissions.some(
      (submission) => submission.id === PRESERVED_OWNER_DEMO.submissionId,
    ) ||
    selection.assets.some((asset) => asset.id === PRESERVED_OWNER_DEMO.assetId)
  )
    throw new Error(
      'Refusing retirement: preserved owner-demo data entered the selection.',
    );

  const changed = execute ? await executeRetirement(selection) : undefined;
  process.stdout.write(
    `${JSON.stringify(report(selection, changed), null, 2)}\n`,
  );
}

if (require.main === module)
  void main()
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Synthetic fixture retirement failed.'}\n`,
      );
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
