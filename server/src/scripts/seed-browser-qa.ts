import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { assertTestDatabaseUrl } from '../config/app-config';
import { Argon2idPasswordHasher } from '../modules/identity/security/argon2id-password-hasher';

/**
 * Local/test-only browser QA fixture. The one ownership/custody/proposal slice
 * below exists solely to exercise the authenticated D15 discovery and voting UI;
 * it does not create finance, trading, ledger, or provider state.
 */
export const BROWSER_QA = {
  email: 'qa-browser@slice.test',
  password: 'BrowserQA!2026-valid-password',
  userId: 'qa-browser-user',
  staffEmail: 'qa-browser-staff@slice.test',
  staffPassword: 'BrowserQA!2026-valid-password',
  staffUserId: 'qa-browser-staff-user',
  supportEmail: 'qa-browser-support@slice.test',
  supportPassword: 'BrowserQA!2026-valid-password',
  supportUserId: 'qa-browser-support-user',
  collectorEmail: 'qa-browser-collector@slice.test',
  collectorPassword: 'BrowserQA!2026-valid-password',
  collectorUserId: 'qa-browser-collector-user',
  categoryId: 'qa-browser-category',
  setId: 'qa-browser-set',
  gradingCompanyId: 'qa-browser-grading-company',
  gradeId: 'qa-browser-grade-10',
  assetIds: ['qa-browser-asset-1', 'qa-browser-asset-2', 'qa-browser-asset-3'],
  assetPublicIds: ['ast_qa_browser_1', 'ast_qa_browser_2', 'ast_qa_browser_3'],
  assetSlugs: [
    'qa-browser-charizard',
    'qa-browser-lugia',
    'qa-browser-pikachu',
  ],
  ownershipAccountId: 'qa-browser-ownership-account',
  governanceProposalId: 'qa-browser-governance-proposal',
} as const;

const QA_PREFIX = 'qa-browser-';
const qaUserIds = [
  BROWSER_QA.userId,
  BROWSER_QA.staffUserId,
  BROWSER_QA.supportUserId,
  BROWSER_QA.collectorUserId,
];
const QA_AS_OF = new Date('2026-08-06T12:00:00.000Z');
const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const operations = [
  'signup',
  'login',
  'refresh',
  'logout-all',
  'profile',
] as const;

export async function seedBrowserQa(prisma: PrismaClient, redis: Redis) {
  await assertLocalOrTestEnvironment();
  const passwordHash = await new Argon2idPasswordHasher().hash(
    BROWSER_QA.password,
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { normalizedEmail: BROWSER_QA.email },
      update: {
        email: BROWSER_QA.email,
        passwordHash,
        accountStatus: 'ACTIVE',
        emailVerifiedAt: now,
      },
      create: {
        id: BROWSER_QA.userId,
        email: BROWSER_QA.email,
        normalizedEmail: BROWSER_QA.email,
        passwordHash,
        accountStatus: 'ACTIVE',
        emailVerifiedAt: now,
      },
    });
    await tx.userProfile.upsert({
      where: { userId: BROWSER_QA.userId },
      update: {
        displayName: 'Browser QA User',
        publicUsername: 'qa-browser-user',
      },
      create: {
        userId: BROWSER_QA.userId,
        displayName: 'Browser QA User',
        publicUsername: 'qa-browser-user',
      },
    });
    const staffPasswordHash = await new Argon2idPasswordHasher().hash(
      BROWSER_QA.staffPassword,
    );
    await tx.user.upsert({
      where: { normalizedEmail: BROWSER_QA.staffEmail },
      update: {
        email: BROWSER_QA.staffEmail,
        passwordHash: staffPasswordHash,
        accountStatus: 'ACTIVE',
        emailVerifiedAt: now,
      },
      create: {
        id: BROWSER_QA.staffUserId,
        email: BROWSER_QA.staffEmail,
        normalizedEmail: BROWSER_QA.staffEmail,
        passwordHash: staffPasswordHash,
        accountStatus: 'ACTIVE',
        emailVerifiedAt: now,
      },
    });
    await tx.userProfile.upsert({
      where: { userId: BROWSER_QA.staffUserId },
      update: { displayName: 'Browser QA Staff', publicUsername: 'qa-browser-staff' },
      create: {
        userId: BROWSER_QA.staffUserId,
        displayName: 'Browser QA Staff',
        publicUsername: 'qa-browser-staff',
      },
    });
    await tx.roleAssignment.deleteMany({
      where: { userId: BROWSER_QA.staffUserId },
    });
    await tx.roleAssignment.createMany({
      data: [
        {
          id: 'qa-browser-staff-admin-role',
          userId: BROWSER_QA.staffUserId,
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: null,
        },
        {
          id: 'qa-browser-staff-reviewer-role',
          userId: BROWSER_QA.staffUserId,
          role: 'ASSET_REVIEWER',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: null,
        },
      ],
    });
    await upsertWorkspaceUser(tx, {
      id: BROWSER_QA.supportUserId,
      email: BROWSER_QA.supportEmail,
      password: BROWSER_QA.supportPassword,
      displayName: 'Browser QA Support',
      publicUsername: 'qa-browser-support',
      roles: ['SUPPORT'],
      now,
    });
    await upsertWorkspaceUser(tx, {
      id: BROWSER_QA.collectorUserId,
      email: BROWSER_QA.collectorEmail,
      password: BROWSER_QA.collectorPassword,
      displayName: 'Browser QA Collector',
      publicUsername: 'qa-browser-collector',
      roles: ['ASSET_REVIEWER'],
      now,
    });

    await tx.category.upsert({
      where: { slug: 'qa-browser-cards' },
      update: { name: 'Browser QA Cards', status: 'ACTIVE', sortOrder: 999 },
      create: {
        id: BROWSER_QA.categoryId,
        slug: 'qa-browser-cards',
        name: 'Browser QA Cards',
        status: 'ACTIVE',
        sortOrder: 999,
      },
    });
    await tx.collectibleSet.upsert({
      where: { slug: 'qa-browser-base-set' },
      update: { categoryId: BROWSER_QA.categoryId, status: 'ACTIVE' },
      create: {
        id: BROWSER_QA.setId,
        categoryId: BROWSER_QA.categoryId,
        slug: 'qa-browser-base-set',
        name: 'Browser QA Base Set',
        status: 'ACTIVE',
      },
    });
    await tx.gradingCompany.upsert({
      where: { code: 'QAB' },
      update: { name: 'Browser QA Grading', status: 'ACTIVE' },
      create: {
        id: BROWSER_QA.gradingCompanyId,
        code: 'QAB',
        name: 'Browser QA Grading',
        status: 'ACTIVE',
      },
    });
    const existingGrade = await tx.gradeScaleEntry.findFirst({
      where: { companyId: BROWSER_QA.gradingCompanyId, grade: '10.00', designation: '' },
    });
    if (existingGrade) {
      await tx.gradeScaleEntry.update({
        where: { id: existingGrade.id },
        data: { label: 'QA Gem Mint', active: true, sortOrder: 10 },
      });
    } else {
      await tx.gradeScaleEntry.create({
        data: {
          id: BROWSER_QA.gradeId,
          companyId: BROWSER_QA.gradingCompanyId,
          grade: '10.00',
          label: 'QA Gem Mint',
          sortOrder: 10,
          designation: '',
        },
      });
    }

    for (const [index, title] of [
      'QA Charizard Display Card',
      'QA Lugia Display Card',
      'QA Pikachu Display Card',
    ].entries()) {
      const assetId = BROWSER_QA.assetIds[index]!;
      await tx.asset.upsert({
        where: { publicId: BROWSER_QA.assetPublicIds[index]! },
        update: {
          slug: BROWSER_QA.assetSlugs[index]!,
          title,
          categoryId: BROWSER_QA.categoryId,
          setId: BROWSER_QA.setId,
          gradeScaleEntryId: BROWSER_QA.gradeId,
          status: 'PUBLISHED',
          publishedAt: now,
        },
        create: {
          id: assetId,
          publicId: BROWSER_QA.assetPublicIds[index]!,
          slug: BROWSER_QA.assetSlugs[index]!,
          title,
          categoryId: BROWSER_QA.categoryId,
          setId: BROWSER_QA.setId,
          gradeScaleEntryId: BROWSER_QA.gradeId,
          status: 'PUBLISHED',
          publishedAt: now,
        },
      });
      await tx.assetMarketSnapshot.upsert({
        where: {
          assetId_source_asOf: {
            assetId,
            source: 'LOCAL_QA_FIXTURE',
            asOf: QA_AS_OF,
          },
        },
        update: {
          estimatedMarketValueMinor: BigInt(150000 + index * 25000),
          confidence: 90 - index,
          status: 'DEMO',
        },
        create: {
          id: `qa-browser-snapshot-${index + 1}`,
          assetId,
          asOf: QA_AS_OF,
          estimatedMarketValueMinor: BigInt(150000 + index * 25000),
          currency: 'GBP',
          change24hBps: 125,
          confidence: 90 - index,
          source: 'LOCAL_QA_FIXTURE',
          status: 'DEMO',
        },
      });
    }

    // A real, scoped D12/D15 fixture so the browser can discover an OPEN
    // governance proposal and exercise the authoritative vote/replacement path.
    const governanceAssetId = BROWSER_QA.assetIds[0];
    await tx.vaultCustodyRecord.upsert({
      where: { assetId: governanceAssetId },
      update: {
        providerCode: 'LOCAL_QA_FIXTURE',
        facilityCode: 'LOCAL_QA',
        status: 'SECURED',
        securedAt: now,
      },
      create: {
        id: 'qa-browser-governance-custody',
        assetId: governanceAssetId,
        providerCode: 'LOCAL_QA_FIXTURE',
        facilityCode: 'LOCAL_QA',
        status: 'SECURED',
        securedAt: now,
      },
    });
    await tx.ownershipAssetSupply.upsert({
      where: { assetId: governanceAssetId },
      update: {
        totalUnits: 100n,
        issuedUnits: 100n,
        nextSequence: 1n,
        status: 'ACTIVE',
      },
      create: {
        assetId: governanceAssetId,
        totalUnits: 100n,
        issuedUnits: 100n,
        nextSequence: 1n,
        status: 'ACTIVE',
      },
    });
    await tx.ownershipAccount.upsert({
      where: { userId: BROWSER_QA.userId },
      update: { type: 'USER', status: 'ACTIVE' },
      create: {
        id: BROWSER_QA.ownershipAccountId,
        type: 'USER',
        userId: BROWSER_QA.userId,
        status: 'ACTIVE',
      },
    });
    await tx.ownershipPosition.upsert({
      where: {
        assetId_accountId: {
          assetId: governanceAssetId,
          accountId: BROWSER_QA.ownershipAccountId,
        },
      },
      update: { settledUnits: 100n, reservedUnits: 0n },
      create: {
        id: 'qa-browser-governance-position',
        assetId: governanceAssetId,
        accountId: BROWSER_QA.ownershipAccountId,
        settledUnits: 100n,
        reservedUnits: 0n,
      },
    });
    await tx.proposalVote.deleteMany({
      where: { proposalId: BROWSER_QA.governanceProposalId },
    });
    await tx.proposalEligibility.deleteMany({
      where: { proposalId: BROWSER_QA.governanceProposalId },
    });
    await tx.saleProposal.deleteMany({
      where: { id: BROWSER_QA.governanceProposalId },
    });
    await tx.saleProposal.create({
      data: {
        id: BROWSER_QA.governanceProposalId,
        assetId: governanceAssetId,
        proposerId: BROWSER_QA.userId,
        status: 'OPEN',
        offerMinor: 10_000n,
        currency: 'GBP',
        policyVersion: 'browser-qa-governance-v1',
        opensAt: now,
        closesAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        snapshotSequence: 0n,
        eligibleUnits: 100n,
        quorumBps: 5_000,
        approvalBps: 5_000,
        votingEnabled: true,
      },
    });
    await tx.proposalEligibility.create({
      data: {
        id: 'qa-browser-governance-eligibility',
        proposalId: BROWSER_QA.governanceProposalId,
        accountId: BROWSER_QA.ownershipAccountId,
        userId: BROWSER_QA.userId,
        units: 100n,
      },
    });

    await upsertCollector(tx, 'qa-browser-public-collector', true, now);
    await upsertCollector(tx, 'qa-browser-private-collector', false, now);

    for (const [index, assetId] of BROWSER_QA.assetIds.entries()) {
      await tx.vaultPublicEvent.upsert({
        where: { id: `qa-browser-event-${index + 1}` },
        update: {
          assetId,
          type: 'VERIFIED',
          occurredAt: new Date(QA_AS_OF.getTime() - index * 60_000),
          publicSummary: `QA public verification event ${index + 1}`,
          status: 'PUBLISHED',
          sourceRef: null,
        },
        create: {
          id: `qa-browser-event-${index + 1}`,
          assetId,
          type: 'VERIFIED',
          occurredAt: new Date(QA_AS_OF.getTime() - index * 60_000),
          publicSummary: `QA public verification event ${index + 1}`,
          status: 'PUBLISHED',
        },
      });
    }
    await tx.notification.deleteMany({ where: { userId: BROWSER_QA.userId } });
    await tx.notification.createMany({
      data: [
        [
          'qa-browser-notification-1',
          'QA fixture ready',
          'Your QA watchlist can be tested.',
          null,
        ],
        [
          'qa-browser-notification-2',
          'QA market update',
          'A public test valuation is available.',
          null,
        ],
        [
          'qa-browser-notification-3',
          'QA archive notice',
          'A read notification for QA coverage.',
          now,
        ],
      ].map(([id, title, body, readAt], index) => ({
        id: id as string,
        userId: BROWSER_QA.userId,
        type: 'QA_FIXTURE',
        title: title as string,
        body: body as string,
        createdAt: new Date(QA_AS_OF.getTime() - index * 60_000),
        readAt: readAt as Date | null,
      })),
    });
    await tx.watchlistItem.deleteMany({ where: { userId: BROWSER_QA.userId } });
    await tx.session.deleteMany({ where: { userId: BROWSER_QA.userId } });
    await tx.idempotencyRecord.deleteMany({
      where: { actorScope: `user:${BROWSER_QA.userId}` },
    });
    await tx.auditEvent.deleteMany({
      where: { actorUserId: BROWSER_QA.userId },
    });
  });
  await clearQaRateLimits(redis);
}

export async function cleanupBrowserQa(prisma: PrismaClient, redis: Redis) {
  await assertLocalOrTestEnvironment();
  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.deleteMany({
      where: {
        OR: [
          {
            actorUserId: {
              in: qaUserIds,
            },
          },
          { resourceId: { startsWith: QA_PREFIX } },
        ],
      },
    });
    await tx.idempotencyRecord.deleteMany({
      where: {
        actorScope: {
          in: [
            ...qaUserIds.map((userId) => `user:${userId}`),
          ],
        },
      },
    });
    await tx.notification.deleteMany({
      where: { userId: { in: qaUserIds } },
    });
    await tx.watchlistItem.deleteMany({
      where: { userId: { in: qaUserIds } },
    });
    await tx.session.deleteMany({
      where: { userId: { in: qaUserIds } },
    });
    await tx.roleAssignment.deleteMany({
      where: { userId: { in: qaUserIds } },
    });
    const proposalIds = (
      await tx.saleProposal.findMany({
        where: { assetId: { startsWith: QA_PREFIX } },
        select: { id: true },
      })
    ).map((proposal) => proposal.id);
    await tx.distributionReconciliationRun.deleteMany({
      where: { distribution: { proposalId: { in: proposalIds } } },
    });
    await tx.distributionLine.deleteMany({
      where: { distribution: { proposalId: { in: proposalIds } } },
    });
    await tx.distribution.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await tx.externalSaleVerificationApproval.deleteMany({
      where: { saleVerification: { proposalId: { in: proposalIds } } },
    });
    await tx.externalSaleVerification.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await tx.proposalVote.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await tx.proposalEligibility.deleteMany({
      where: { proposalId: { in: proposalIds } },
    });
    await tx.saleProposal.deleteMany({ where: { id: { in: proposalIds } } });
    await tx.externalFinancialAccount.deleteMany({
      where: { userId: BROWSER_QA.userId },
    });
    await tx.vaultPublicEvent.deleteMany({
      where: { id: { startsWith: QA_PREFIX } },
    });
    await tx.assetMarketSnapshot.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.assetValuationPoint.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.ownershipLedgerEntry.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.ownershipReservation.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.ownershipPosition.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.ownershipAccount.deleteMany({
      where: { userId: BROWSER_QA.userId },
    });
    await tx.ownershipAssetSupply.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.custodyEvent.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.vaultCustodyRecord.deleteMany({
      where: { assetId: { startsWith: QA_PREFIX } },
    });
    await tx.asset.deleteMany({ where: { id: { startsWith: QA_PREFIX } } });
    await tx.publicCollectorProfile.deleteMany({
      where: { slug: { startsWith: QA_PREFIX } },
    });
    await tx.userProfile.deleteMany({
      where: { userId: { startsWith: QA_PREFIX } },
    });
    await tx.user.deleteMany({ where: { id: { startsWith: QA_PREFIX } } });
    await tx.gradeScaleEntry.deleteMany({ where: { id: BROWSER_QA.gradeId } });
    await tx.gradingCompany.deleteMany({
      where: { id: BROWSER_QA.gradingCompanyId },
    });
    await tx.collectibleSet.deleteMany({ where: { id: BROWSER_QA.setId } });
    await tx.category.deleteMany({ where: { id: BROWSER_QA.categoryId } });
  });
  await clearQaRateLimits(redis);
}

async function upsertCollector(
  tx: Prisma.TransactionClient,
  id: string,
  isPublic: boolean,
  now: Date,
) {
  const email = `${id}@slice.test`;
  await tx.user.upsert({
    where: { normalizedEmail: email },
    update: { accountStatus: 'ACTIVE' },
    create: {
      id,
      email,
      normalizedEmail: email,
      passwordHash: 'local-qa-collector-password-not-usable',
      accountStatus: 'ACTIVE',
    },
  });
  await tx.userProfile.upsert({
    where: { userId: id },
    update: {
      displayName: isPublic ? 'QA Public Collector' : 'QA Private Collector',
    },
    create: {
      userId: id,
      displayName: isPublic ? 'QA Public Collector' : 'QA Private Collector',
    },
  });
  await tx.publicCollectorProfile.upsert({
    where: { userId: id },
    update: {
      slug: id,
      headline: isPublic ? 'Public QA profile' : 'Private QA profile',
      specialism: 'QA fixtures',
      isPublic,
      publishedAt: isPublic ? now : null,
    },
    create: {
      userId: id,
      slug: id,
      headline: isPublic ? 'Public QA profile' : 'Private QA profile',
      specialism: 'QA fixtures',
      isPublic,
      publishedAt: isPublic ? now : null,
    },
  });
}

async function upsertWorkspaceUser(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    email: string;
    password: string;
    displayName: string;
    publicUsername: string;
    roles: readonly ('SUPPORT' | 'ASSET_REVIEWER')[];
    now: Date;
  },
) {
  const passwordHash = await new Argon2idPasswordHasher().hash(input.password);
  await tx.user.upsert({
    where: { normalizedEmail: input.email },
    update: {
      email: input.email,
      passwordHash,
      accountStatus: 'ACTIVE',
      emailVerifiedAt: input.now,
    },
    create: {
      id: input.id,
      email: input.email,
      normalizedEmail: input.email,
      passwordHash,
      accountStatus: 'ACTIVE',
      emailVerifiedAt: input.now,
    },
  });
  await tx.userProfile.upsert({
    where: { userId: input.id },
    update: {
      displayName: input.displayName,
      publicUsername: input.publicUsername,
    },
    create: {
      userId: input.id,
      displayName: input.displayName,
      publicUsername: input.publicUsername,
    },
  });
  await tx.roleAssignment.deleteMany({ where: { userId: input.id } });
  await tx.roleAssignment.createMany({
    data: input.roles.map((role) => ({
      id: `${input.id}-${role.toLowerCase()}-role`,
      userId: input.id,
      role,
      scopeType: 'GLOBAL',
      scopeId: '*',
      assignedByUserId: null,
    })),
  });
}

async function clearQaRateLimits(redis: Redis) {
  const environment = process.env.NODE_ENV ?? 'development';
  const accountEmails = [
    BROWSER_QA.email,
    BROWSER_QA.staffEmail,
    BROWSER_QA.supportEmail,
    BROWSER_QA.collectorEmail,
  ];
  const keys = operations.flatMap((operation) => [
    ...localIps.map((ip) => `slice:${environment}:auth-${operation}-ip:${hash(ip)}`),
    ...accountEmails.map(
      (email) => `slice:${environment}:auth-${operation}-account:${hash(email)}`,
    ),
  ]);
  await redis.del(...keys);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function assertLocalOrTestEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Browser QA fixtures are not permitted in production.');
  }
  // Prisma loads .env while initialising its client. Prefer the explicitly
  // test-scoped URL so this disposable fixture can never select the local
  // development database merely because DATABASE_URL is also present.
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or TEST_DATABASE_URL is required.');
  assertTestDatabaseUrl(url);
}

async function main() {
  await assertLocalOrTestEnvironment();
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error('REDIS_URL is required.');
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const redis = new Redis(redisUrl, { lazyConnect: true });
  try {
    await redis.connect();
    if (process.argv.includes('--cleanup')) {
      await cleanupBrowserQa(prisma, redis);
      process.stdout.write('Local browser QA fixture removed.\n');
    } else {
      await seedBrowserQa(prisma, redis);
      process.stdout.write('Local browser QA fixture applied.\n');
    }
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'QA fixture failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
