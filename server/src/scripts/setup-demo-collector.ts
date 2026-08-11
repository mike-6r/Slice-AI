import { createHash, randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { CatalogueService } from '../modules/catalogue/application/catalogue.service';
import { AccessControlService } from '../modules/identity/access/access-control.service';
import { AuthService, type Actor } from '../modules/identity/auth/auth.service';
import {
  EmailVerificationService,
  LocalTestEmailDelivery,
} from '../modules/identity/email-verification/email-verification.service';
import { LifecycleService } from '../modules/lifecycle/application/lifecycle.service';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { PortfolioLotService } from '../modules/finance/application/portfolio-lot.service';
import { OwnershipOperationsService } from '../modules/ownership/application/ownership-operations.service';
import { OwnershipService } from '../modules/ownership/application/ownership.service';
import { ComplianceService } from '../modules/providers/application/compliance.service';
import { SubmissionService } from '../modules/submissions/application/submission.service';
import { LocalSubmissionStorage } from '../modules/submissions/infrastructure/local-submission-storage';
import { TradingService } from '../modules/trading/application/trading.service';
import { tradingPolicy } from '../modules/trading/domain/trading-policy';
import {
  ensureDemoAccount,
  ensureDemoFunding,
  runStagingDemoSetup,
} from './setup-staging-demo';
import {
  assertStagingDemoSafety,
  demoAccounts,
  requiredSecret,
} from './staging-demo-safety';

type DemoAsset = Readonly<{
  key: string;
  owner?: 'PRIMARY' | 'SECONDARY';
  title: string;
  category: string;
  set: string;
  year: number;
  valueMinor: bigint;
  historyProfile: 'UPWARD' | 'DOWNWARD' | 'VOLATILE' | 'STABLE';
  state: 'DRAFT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'CUSTODY' | 'PUBLISHED';
}>;

const assets: readonly DemoAsset[] = [
  {
    key: 'charizard',
    title: '1999 Pokémon Base Set Charizard Holo',
    category: 'Pokémon',
    set: 'Base Set',
    year: 1999,
    valueMinor: 2458000n,
    historyProfile: 'UPWARD',
    state: 'PUBLISHED',
  },
  {
    key: 'pikachu',
    title: '2020 Pokémon Pikachu Illustrator',
    category: 'Pokémon',
    set: 'Promo Collection',
    year: 2020,
    valueMinor: 615000n,
    historyProfile: 'VOLATILE',
    state: 'PUBLISHED',
  },
  {
    key: 'blastoise',
    title: '1999 Pokémon Base Set Blastoise Holo',
    category: 'Pokémon',
    set: 'Base Set',
    year: 1999,
    valueMinor: 465000n,
    historyProfile: 'STABLE',
    state: 'PUBLISHED',
  },
  {
    key: 'jordan',
    title: '1986 Fleer Michael Jordan Rookie',
    category: 'Sports Cards',
    set: 'Fleer Basketball',
    year: 1986,
    valueMinor: 682000n,
    historyProfile: 'UPWARD',
    state: 'PUBLISHED',
  },
  {
    key: 'mantle',
    title: '1952 Topps Mickey Mantle',
    category: 'Sports Cards',
    set: 'Topps Baseball',
    year: 1952,
    valueMinor: 1285000n,
    historyProfile: 'DOWNWARD',
    state: 'PUBLISHED',
  },
  {
    key: 'dark-magician',
    title: '2002 Yu-Gi-Oh! Dark Magician',
    category: 'Yu-Gi-Oh!',
    set: 'Legend of Blue Eyes',
    year: 2002,
    valueMinor: 68000n,
    historyProfile: 'VOLATILE',
    state: 'CUSTODY',
  },
  {
    key: 'black-lotus',
    title: '1993 Magic: The Gathering Black Lotus',
    category: 'Magic: The Gathering',
    set: 'Unlimited Edition',
    year: 1993,
    valueMinor: 9200000n,
    historyProfile: 'VOLATILE',
    state: 'CHANGES_REQUESTED',
  },
  {
    key: 'one-piece',
    title: '2023 One Piece Manga Rare Shanks',
    category: 'One Piece',
    set: 'Romance Dawn',
    year: 2023,
    valueMinor: 365000n,
    historyProfile: 'UPWARD',
    state: 'SUBMITTED',
  },
  {
    key: 'luka',
    title: '2018 Panini Prizm Luka Dončić Rookie',
    category: 'Sports Cards',
    set: 'Panini Prizm',
    year: 2018,
    valueMinor: 285000n,
    historyProfile: 'STABLE',
    state: 'DRAFT',
  },
  {
    key: 'rayquaza',
    title: '2005 Pokémon Gold Star Rayquaza',
    category: 'Pokémon',
    set: 'EX Deoxys',
    year: 2005,
    valueMinor: 875000n,
    historyProfile: 'UPWARD',
    state: 'DRAFT',
  },
  {
    key: 'specialist-dark-magician',
    owner: 'SECONDARY',
    title: '2002 Yu-Gi-Oh! Dark Magician',
    category: 'Yu-Gi-Oh!',
    set: 'Legend of Blue Eyes',
    year: 2002,
    valueMinor: 68000n,
    historyProfile: 'VOLATILE',
    state: 'PUBLISHED',
  },
  {
    key: 'specialist-black-lotus',
    owner: 'SECONDARY',
    title: '1993 Magic: The Gathering Black Lotus',
    category: 'Magic: The Gathering',
    set: 'Unlimited Edition',
    year: 1993,
    valueMinor: 9200000n,
    historyProfile: 'VOLATILE',
    state: 'PUBLISHED',
  },
  {
    key: 'specialist-one-piece',
    owner: 'SECONDARY',
    title: '2023 One Piece Manga Rare Shanks',
    category: 'One Piece',
    set: 'Romance Dawn',
    year: 2023,
    valueMinor: 365000n,
    historyProfile: 'UPWARD',
    state: 'PUBLISHED',
  },
];

/**
 * Stable identifiers for the explicitly named staging catalogue.  The market
 * health check imports these rather than duplicating the fixture definition,
 * which keeps its assertions aligned with the lifecycle fixture.
 */
export const stagingDemoAssetSlugs = assets.map(
  (asset) => `slice-demo-${asset.key}`,
);

export const publishedStagingDemoAssetSlugs = assets
  .filter((asset) => asset.state === 'PUBLISHED')
  .map((asset) => `slice-demo-${asset.key}`);

const fixturePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const fixtureHash = createHash('sha256').update(fixturePng).digest('hex');

/**
 * Staging-only fixture that deliberately uses D10/D11/D12 authority. It never
 * alters balances, creates provider state, or writes lifecycle fields directly.
 * Asset market history is a clearly-labelled staging market-data fixture.
 */
export async function runCollectorDemoSetup() {
  assertStagingDemoSafety();
  await runStagingDemoSetup();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService);
    const auth = app.get(AuthService);
    const access = app.get(AccessControlService);
    const catalogue = app.get(CatalogueService);
    const submissions = app.get(SubmissionService);
    const storage = app.get(LocalSubmissionStorage);
    const lifecycle = app.get(LifecycleService);
    const ownership = app.get(OwnershipService);
    const ownershipOps = app.get(OwnershipOperationsService);
    const ledger = app.get(FinancialLedgerService);
    const lots = app.get(PortfolioLotService);
    const compliance = app.get(ComplianceService);
    const trading = app.get(TradingService);
    const emailVerification = app.get(EmailVerificationService);
    const emailDelivery = app.get(LocalTestEmailDelivery, { strict: false });
    const config = app.get<AppConfig>(APP_CONFIG);
    const admin = await loginAdmin(auth);
    const investor = await loginActor(auth, demoAccounts.investor);
    const collector = await loginActor(auth, demoAccounts.collector);
    const collectorB = await ensureCollectorB(auth, access, db, admin, config);

    await ensureLocalEmailVerification(
      config,
      emailVerification,
      emailDelivery,
      collector,
    );
    await ensureLocalEmailVerification(
      config,
      emailVerification,
      emailDelivery,
      collectorB,
    );
    await ensureReviewerRole(access, db, admin, collector.userId);
    const collectorReviewer = await loginActor(auth, demoAccounts.collector);

    await db.publicCollectorProfile.upsert({
      where: { userId: collector.userId },
      create: {
        userId: collector.userId,
        slug: 'slice-demo-collector',
        headline:
          'Specialist collector of authenticated Pokémon, sports cards, Yu-Gi-Oh!, Magic: The Gathering and One Piece cards.',
        specialism:
          'Pokémon · Sports Cards · Yu-Gi-Oh! · Magic: The Gathering · One Piece',
        isPublic: true,
        publishedAt: new Date(),
      },
      update: {
        headline:
          'Specialist collector of authenticated Pokémon, sports cards, Yu-Gi-Oh!, Magic: The Gathering and One Piece cards.',
        specialism:
          'Pokémon · Sports Cards · Yu-Gi-Oh! · Magic: The Gathering · One Piece',
        isPublic: true,
        publishedAt: new Date(),
      },
    });
    await db.publicCollectorProfile.upsert({
      where: { userId: collectorB.userId },
      create: {
        userId: collectorB.userId,
        slug: 'slice-demo-specialist',
        headline:
          'Independent public collector focused on authenticated Yu-Gi-Oh!, Magic: The Gathering and One Piece cards.',
        specialism: 'Yu-Gi-Oh! · Magic: The Gathering · One Piece',
        isPublic: true,
        publishedAt: new Date(),
      },
      update: {
        headline:
          'Independent public collector focused on authenticated Yu-Gi-Oh!, Magic: The Gathering and One Piece cards.',
        specialism: 'Yu-Gi-Oh! · Magic: The Gathering · One Piece',
        isPublic: true,
        publishedAt: new Date(),
      },
    });

    const categoryIds = new Map<string, string>();
    for (const category of new Set(assets.map((asset) => asset.category))) {
      categoryIds.set(
        category,
        await ensureCategory(db, catalogue, admin, category),
      );
    }
    for (const spec of assets) {
      const owner = spec.owner === 'SECONDARY' ? collectorB : collector;
      const asset = await ensureAsset(
        db,
        catalogue,
        admin,
        spec,
        categoryIds.get(spec.category)!,
      );
      const submission = await ensureSubmission(
        db,
        submissions,
        storage,
        owner,
        admin,
        spec,
        asset.id,
        categoryIds.get(spec.category)!,
      );
      if (spec.state === 'PUBLISHED' || spec.state === 'CUSTODY') {
        await ensureAssetLifecycle(
          db,
          lifecycle,
          ownership,
          ownershipOps,
          admin,
          owner.userId,
          asset.id,
          spec,
          spec.state === 'PUBLISHED',
        );
        await ensureMarketHistory(db, asset.id, spec);
      }
      void submission;
    }
    await ensureWorkspaceQueue(
      db,
      submissions,
      storage,
      collectorB,
      collectorReviewer,
      categoryIds.get('Pokémon')!,
    );
    await ensureDemoWatchlists(db, investor.userId, collector.userId);
    const tradingFixture = await ensureTradingDemonstration({
      config,
      db,
      auth,
      access,
      admin,
      investor,
      collector,
      emailVerification,
      emailDelivery,
      ownershipOps,
      lots,
      ledger,
      compliance,
      trading,
    });
    const published = await db.asset.count({
      where: {
        submissions: { some: { ownerUserId: collector.userId } },
        status: 'PUBLISHED',
      },
    });
    const secondaryPublished = await db.asset.count({
      where: {
        submissions: { some: { ownerUserId: collectorB.userId } },
        status: 'PUBLISHED',
      },
    });
    const publicProfiles = await db.publicCollectorProfile.count({
      where: {
        isPublic: true,
        slug: { in: ['slice-demo-collector', 'slice-demo-specialist'] },
      },
    });
    const queue = await db.assetSubmission.count({
      where: { reviewerId: collectorReviewer.userId, status: 'IN_REVIEW' },
    });
    process.stdout.write(
      JSON.stringify({
        result: 'STAGING_COLLECTOR_DEMO_READY',
        collector: demoAccounts.collector.email,
        publicProfile: 'slice-demo-collector',
        publishedListings: published,
        secondaryCollector: {
          profile: 'slice-demo-specialist',
          publishedListings: secondaryPublished,
        },
        publicProfiles,
        reviewerAssignments: queue,
        assetCount: assets.length,
        trading: tradingFixture,
        media:
          'D10 evidence records are real; local object storage remains process-local and is not a durable public-thumbnail provider.',
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

async function loginAdmin(auth: AuthService) {
  const email = process.env.DEMO_SETUP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_SETUP_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      'DEMO_SETUP_ADMIN_EMAIL and DEMO_SETUP_ADMIN_PASSWORD are required.',
    );
  const session = await auth.login(
    { email, password },
    `collector-demo-admin-${randomUUID()}`,
    { userAgent: 'slice-staging-collector-demo' },
  );
  const actor = await auth.actor(session.accessToken);
  if (!actor.roles.includes('ADMIN'))
    throw new Error(
      'The configured demo setup account must be an active ADMIN.',
    );
  return actor;
}

async function loginActor(
  auth: AuthService,
  demo: (typeof demoAccounts)[keyof typeof demoAccounts],
) {
  const session = await auth.login(
    { email: demo.email, password: requiredSecret(demo.passwordEnv) },
    `collector-demo-login-${randomUUID()}`,
    { userAgent: 'slice-staging-collector-demo' },
  );
  return auth.actor(session.accessToken);
}

async function ensureCollectorB(
  auth: AuthService,
  access: AccessControlService,
  db: PrismaService,
  admin: Actor,
  config: AppConfig,
) {
  const demo = demoAccounts.collectorB;
  let user = await db.user.findUnique({
    where: { normalizedEmail: demo.email },
    select: { accountStatus: true },
  });
  if (!user) {
    await auth.signup(
      {
        email: demo.email,
        password: requiredSecret(demo.passwordEnv),
        displayName: demo.displayName,
        consent: config.signupConsent.required
          ? {
              termsAccepted: true,
              privacyAccepted: true,
              termsVersion: config.signupConsent.termsVersion!,
              privacyVersion: config.signupConsent.privacyVersion!,
            }
          : undefined,
      },
      `collector-b-signup-${randomUUID()}`,
      `collector-b-signup:${demo.email}`,
      { userAgent: 'slice-staging-collector-demo' },
    );
    user = { accountStatus: 'PENDING_REVIEW' };
  }
  let actor = await loginActor(auth, demo);
  if (user.accountStatus === 'PENDING_REVIEW') {
    await access.transitionStatus(
      admin,
      actor.userId,
      { toStatus: 'ACTIVE', reasonCode: 'STAGING_DEMO_COLLECTOR_B_ACTIVATION' },
      `collector-b-active-${randomUUID()}`,
      'collector-b-active',
    );
    actor = await loginActor(auth, demo);
  }
  return actor;
}

async function ensureLocalEmailVerification(
  config: AppConfig,
  service: EmailVerificationService,
  delivery: LocalTestEmailDelivery | undefined,
  actor: Actor,
) {
  const user = await (
    service as unknown as {
      status(actor: Actor): Promise<{ verified: boolean }>;
    }
  ).status(actor);
  if (user.verified) return;
  if (
    config.environment === 'production' ||
    config.emailDeliveryMode !== 'local_test' ||
    !delivery
  )
    throw new Error(
      'Collector fixture requires the configured local-test email delivery authority; it will not forge provider verification.',
    );
  await service.send(actor, '127.0.0.1', `collector-email-${randomUUID()}`);
  const token = delivery.tokenForTest(actor.userId);
  if (!token)
    throw new Error(
      'Local email verification delivery did not produce a token.',
    );
  await service.confirm(
    token,
    '127.0.0.1',
    `collector-email-confirm-${randomUUID()}`,
  );
}

async function ensureReviewerRole(
  access: AccessControlService,
  db: PrismaService,
  admin: Actor,
  userId: string,
) {
  const current = await db.roleAssignment.findFirst({
    where: { userId, role: 'ASSET_REVIEWER', revokedAt: null },
  });
  if (!current)
    await access.grantRole(
      admin,
      userId as never,
      {
        role: 'ASSET_REVIEWER',
        scopeType: 'STAGING_DEMO',
        scopeId: 'collector-workspace',
      },
      `collector-role-${randomUUID()}`,
      'staging-demo-collector-reviewer',
    );
}

async function ensureCategory(
  db: PrismaService,
  catalogue: CatalogueService,
  admin: Actor,
  name: string,
) {
  const existing = await db.category.findFirst({
    where: { name, status: 'ACTIVE' },
  });
  if (existing) return existing.id;
  return (
    await catalogue.createCategory(
      admin,
      {
        name,
        slug: slug(name),
        description: `Staging showcase category for ${name}.`,
        status: 'ACTIVE',
      },
      `collector-category-${randomUUID()}`,
      `collector-category:${slug(name)}`,
    )
  ).id;
}

async function ensureAsset(
  db: PrismaService,
  catalogue: CatalogueService,
  admin: Actor,
  spec: DemoAsset,
  categoryId: string,
) {
  const publicId = `stg_collector_${spec.key}`;
  const existing = await db.asset.findUnique({ where: { publicId } });
  if (existing) return existing;
  const set =
    (await db.collectibleSet.findFirst({
      where: { categoryId, name: spec.set, status: 'ACTIVE' },
    })) ??
    (await catalogue.createSet(
      admin,
      {
        categoryId,
        name: spec.set,
        slug: `${slug(spec.category)}-${slug(spec.set)}`,
        manufacturer: spec.category,
        releaseYear: spec.year,
        status: 'ACTIVE',
      },
      `collector-set-${randomUUID()}`,
      `collector-set:${spec.category}:${spec.set}`,
    ));
  const created = await catalogue.createAsset(
    admin,
    {
      publicId,
      slug: `slice-demo-${spec.key}`,
      categoryId,
      setId: set.id,
      title: spec.title,
      shortName: spec.title,
      year: spec.year,
      manufacturer: spec.category,
      edition: spec.set,
      description: `Staging showcase collectible: ${spec.title}.`,
      certificationNumber: `STG-${spec.key.toUpperCase()}`,
    },
    `collector-asset-${randomUUID()}`,
    `collector-asset:${spec.key}`,
  );
  return db.asset.findUniqueOrThrow({ where: { id: created.id } });
}

async function ensureSubmission(
  db: PrismaService,
  service: SubmissionService,
  storage: LocalSubmissionStorage,
  owner: Actor,
  admin: Actor,
  spec: DemoAsset,
  assetId: string,
  categoryId: string,
) {
  const certificationNumber = `STG-${spec.key.toUpperCase()}`;
  let submission = await db.assetSubmission.findFirst({
    where: { assetId, ownerUserId: owner.userId },
  });
  // Draft, submitted and changes-requested records are intentionally not
  // linked to a catalogue asset yet. Locate those fixtures by their stable,
  // explicit certification identifier so refresh remains idempotent.
  if (!submission) {
    const ownerSubmissions = await db.assetSubmission.findMany({
      where: { ownerUserId: owner.userId },
      orderBy: { createdAt: 'asc' },
    });
    submission =
      ownerSubmissions.find(
        (row) =>
          (row.declaredMetadata as { certificationNumber?: string } | null)
            ?.certificationNumber === certificationNumber,
      ) ?? null;
  }
  if (!submission) {
    const draft = await service.create(
      owner,
      {
        categoryId,
        declaredMetadata: {
          name: spec.title,
          manufacturer: spec.category,
          year: String(spec.year),
          certificationNumber,
          details: 'Staging collector showcase submission.',
        },
      },
      `collector-submission-${randomUUID()}`,
      `collector-submission:${spec.key}`,
    );
    submission = await db.assetSubmission.findUniqueOrThrow({
      where: { id: draft.id },
    });
    if (spec.state !== 'DRAFT') {
      for (const slot of ['front', 'back']) {
        const intent = await service.uploadIntent(
          owner,
          submission.id,
          {
            slot,
            mimeType: 'image/png',
            sizeBytes: fixturePng.length,
            originalFilename: `${spec.key}-${slot}.png`,
          },
          `collector-media-${randomUUID()}`,
          `collector-media:${spec.key}:${slot}`,
        );
        storage.putForTest({
          key: intent.upload.objectKey,
          mimeType: 'image/png',
          sizeBytes: fixturePng.length,
          sha256: fixtureHash,
          magicMimeType: 'image/png',
          width: 1,
          height: 1,
        });
        const latest = await db.assetSubmission.findUniqueOrThrow({
          where: { id: submission.id },
        });
        await service.completeMedia(
          owner,
          submission.id,
          intent.media.id,
          { sha256: fixtureHash, version: latest.version },
          `collector-media-complete-${randomUUID()}`,
          `collector-media-complete:${spec.key}:${slot}`,
        );
      }
      const latest = await db.assetSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      await service.submit(
        owner,
        submission.id,
        latest.version,
        `collector-submit-${randomUUID()}`,
        `collector-submit:${spec.key}`,
      );
    }
  }
  submission = await db.assetSubmission.findUniqueOrThrow({
    where: { id: submission.id },
  });
  if (spec.state === 'CHANGES_REQUESTED' && submission.status === 'SUBMITTED') {
    await service.claim(
      admin,
      submission.id,
      `collector-claim-${randomUUID()}`,
      `collector-claim:${spec.key}`,
    );
    await service.decide(
      admin,
      submission.id,
      'CHANGES_REQUESTED',
      {
        reasonCode: 'EVIDENCE_REVIEW_REQUIRED',
        note: 'Staging fixture: evidence follow-up required.',
      },
      `collector-changes-${randomUUID()}`,
      `collector-changes:${spec.key}`,
    );
  }
  if (
    (spec.state === 'CUSTODY' || spec.state === 'PUBLISHED') &&
    submission.status === 'SUBMITTED'
  ) {
    await service.claim(
      admin,
      submission.id,
      `collector-claim-${randomUUID()}`,
      `collector-claim:${spec.key}`,
    );
    await service.decide(
      admin,
      submission.id,
      'APPROVED',
      {
        reasonCode: 'STAGING_DEMO_APPROVED',
        note: 'Staging fixture approved through D10 review.',
      },
      `collector-approve-${randomUUID()}`,
      `collector-approve:${spec.key}`,
    );
    await service.linkApprovedAsset(
      admin,
      submission.id,
      assetId,
      `collector-link-${randomUUID()}`,
      `collector-link:${spec.key}`,
    );
  }
  return submission;
}

async function ensureAssetLifecycle(
  db: PrismaService,
  lifecycle: LifecycleService,
  ownership: OwnershipService,
  operations: OwnershipOperationsService,
  admin: Actor,
  collectorUserId: string,
  assetId: string,
  spec: DemoAsset,
  publish: boolean,
) {
  let custody = await db.vaultCustodyRecord.findUnique({ where: { assetId } });
  if (!custody)
    await lifecycle.handoff(
      admin,
      assetId,
      `collector-handoff-${randomUUID()}`,
      `collector-handoff:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({
    where: { assetId },
  });
  if (custody.status === 'EXPECTED')
    await lifecycle.custody(
      admin,
      assetId,
      'RECEIVED',
      `collector-custody-${randomUUID()}`,
      `collector-custody-received:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({
    where: { assetId },
  });
  if (custody.status === 'RECEIVED')
    await lifecycle.custody(
      admin,
      assetId,
      'INSPECTED',
      `collector-custody-${randomUUID()}`,
      `collector-custody-inspected:${spec.key}`,
    );
  custody = await db.vaultCustodyRecord.findUniqueOrThrow({
    where: { assetId },
  });
  if (custody.status === 'INSPECTED')
    await lifecycle.custody(
      admin,
      assetId,
      'SECURED',
      `collector-custody-${randomUUID()}`,
      `collector-custody-secured:${spec.key}`,
    );
  if (!publish) return;
  const valuation = await db.valuationDecision.findFirst({
    where: { assetId, status: 'ACTIVE' },
  });
  if (!valuation)
    await lifecycle.valuation(
      admin,
      assetId,
      {
        valueMinor: spec.valueMinor,
        currency: 'GBP',
        confidence: 92,
        methodologyCode: 'STAGING_DEMO_MARKET_REFERENCE',
        sourceType: 'STAGING_DEMO',
      },
      `collector-valuation-${randomUUID()}`,
      `collector-valuation:${spec.key}`,
    );
  const coverage = await db.insuranceCoverage.findFirst({
    where: { assetId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
  });
  if (!coverage)
    await lifecycle.coverage(
      admin,
      assetId,
      {
        insuredValueMinor: spec.valueMinor,
        currency: 'GBP',
        effectiveAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 365 * 86400000),
        status: 'ACTIVE',
      },
      `collector-coverage-${randomUUID()}`,
      `collector-coverage:${spec.key}`,
    );
  const asset = await db.asset.findUniqueOrThrow({
    where: { id: assetId },
    include: { publication: true, ownershipSupply: true },
  });
  if (asset.status !== 'PUBLISHED' || asset.publication?.status !== 'PUBLISHED')
    await lifecycle.publish(
      admin,
      assetId,
      `collector-publish-${randomUUID()}`,
      `collector-publish:${spec.key}`,
    );
  if (!asset.ownershipSupply)
    await ownership.issue(
      admin,
      assetId,
      '1000',
      `collector-issue-${randomUUID()}`,
      `collector-issue:${spec.key}`,
    );
  const account = await db.ownershipAccount.findFirst({
    where: { userId: collectorUserId, type: 'USER', status: 'ACTIVE' },
  });
  const position = account
    ? await db.ownershipPosition.findUnique({
        where: { assetId_accountId: { assetId, accountId: account.id } },
      })
    : null;
  const owned = position?.settledUnits ?? 0n;
  if (owned < 300n)
    await operations.transfer(
      admin,
      assetId,
      { toUserId: collectorUserId, units: (300n - owned).toString() },
      `collector-ownership-${randomUUID()}`,
      `collector-ownership:${spec.key}:${owned}`,
    );
}

async function ensureMarketHistory(
  db: PrismaService,
  assetId: string,
  spec: DemoAsset,
) {
  const now = new Date();
  for (let day = 0; day < 90; day += 1) {
    const observedAt = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (89 - day),
        12,
      ),
    );
    const amount =
      spec.valueMinor +
      (spec.valueMinor *
        demoMarketHistoryAdjustmentBps(spec.historyProfile, day)) /
        10_000n;
    await db.assetValuationPoint.upsert({
      where: {
        assetId_source_observedAt: {
          assetId,
          source: 'STAGING_DEMO_MARKET',
          observedAt,
        },
      },
      create: {
        assetId,
        observedAt,
        source: 'STAGING_DEMO_MARKET',
        estimatedMarketValueMinor: amount,
        currency: 'GBP',
        status: 'DEMO',
      },
      update: { estimatedMarketValueMinor: amount, status: 'DEMO' },
    });
  }
  const asOf = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
  );
  await db.assetMarketSnapshot.upsert({
    where: {
      assetId_source_asOf: { assetId, source: 'STAGING_DEMO_MARKET', asOf },
    },
    create: {
      assetId,
      asOf,
      source: 'STAGING_DEMO_MARKET',
      estimatedMarketValueMinor: spec.valueMinor,
      currency: 'GBP',
      change24hBps: spec.key.length % 2 ? 1243 : -321,
      availableBps: 7000,
      ownersCount: 24,
      watchersCount: 86,
      confidence: 92,
      status: 'DEMO',
    },
    update: {
      estimatedMarketValueMinor: spec.valueMinor,
      change24hBps: spec.key.length % 2 ? 1243 : -321,
      availableBps: 7000,
      ownersCount: 24,
      watchersCount: 86,
      confidence: 92,
      status: 'DEMO',
    },
  });
}

/**
 * A deterministic, persisted valuation profile for the specifically named
 * staging catalogue. These values populate real market-history rows only;
 * no chart data is assembled in the frontend.
 */
export function demoMarketHistoryAdjustmentBps(
  profile: DemoAsset['historyProfile'],
  day: number,
) {
  switch (profile) {
    case 'UPWARD':
      return BigInt(-500 + day * 19);
    case 'DOWNWARD':
      return BigInt(650 - day * 14);
    case 'VOLATILE':
      return BigInt(-320 + day * 8 + (((day * 37) % 11) - 5) * 115);
    case 'STABLE':
      return BigInt((((day * 17) % 7) - 3) * 24);
  }
}

/**
 * Watchlist persistence is a first-class read-model table in the current
 * architecture (its HTTP owner uses the same idempotent upsert). These are
 * deliberately only the two permanent, explicitly named staging demo users.
 */
async function ensureDemoWatchlists(
  db: PrismaService,
  investorUserId: string,
  collectorUserId: string,
) {
  const published = await db.asset.findMany({
    where: {
      slug: {
        in: assets
          .filter((item) => item.state === 'PUBLISHED')
          .map((item) => `slice-demo-${item.key}`),
      },
    },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(published.map((item) => [item.slug, item.id]));
  const investorSlugs = [
    'slice-demo-charizard',
    'slice-demo-pikachu',
    'slice-demo-jordan',
  ];
  const collectorSlugs = [
    'slice-demo-charizard',
    'slice-demo-blastoise',
    'slice-demo-mantle',
  ];
  for (const [userId, slugs] of [
    [investorUserId, investorSlugs],
    [collectorUserId, collectorSlugs],
  ] as const) {
    for (const slug of slugs) {
      const assetId = bySlug.get(slug);
      if (assetId) {
        await db.watchlistItem.upsert({
          where: { userId_assetId: { userId, assetId } },
          create: { userId, assetId },
          update: {},
        });
      }
    }
  }
}

/**
 * Optional D14 showcase data. This remains fail-closed: it only writes an
 * order book when the running staging application expressly enables trading
 * and uses the existing LOCAL_TEST compliance adapter. It never enables those
 * controls, touches external providers, or changes a production environment.
 */
async function ensureTradingDemonstration(input: {
  config: AppConfig;
  db: PrismaService;
  auth: AuthService;
  access: AccessControlService;
  admin: Actor;
  investor: Actor;
  collector: Actor;
  emailVerification: EmailVerificationService;
  emailDelivery: LocalTestEmailDelivery | undefined;
  ownershipOps: OwnershipOperationsService;
  lots: PortfolioLotService;
  ledger: FinancialLedgerService;
  compliance: ComplianceService;
  trading: TradingService;
}) {
  if (!input.config.operationalFeatures.trading) {
    return {
      enabled: false,
      reason:
        'OPERATIONAL_TRADING_ENABLED is false; no D14 orders were created.',
    };
  }
  if (input.config.providerMode !== 'local') {
    return {
      enabled: false,
      reason:
        'Trading fixture requires PROVIDER_MODE=local so its existing LOCAL_TEST compliance authority can be exercised.',
    };
  }

  const marketMaker = await ensureDemoAccount(
    input.auth,
    input.access,
    input.db,
    input.config,
    input.admin,
    demoAccounts.marketMaker,
    'slice-demo-market-maker',
  );
  for (const actor of [input.investor, input.collector, marketMaker.actor]) {
    await ensureLocalEmailVerification(
      input.config,
      input.emailVerification,
      input.emailDelivery,
      actor,
    );
    await ensureLocalDemoCompliance(input.compliance, input.admin, actor);
  }
  await ensureDemoFunding(input.db, input.ledger, marketMaker.actor, {
    accountId: marketMaker.userId,
    label: 'market-maker',
    amountMinor: '30000000',
  });

  const published = await input.db.asset.findMany({
    where: {
      slug: {
        in: assets
          .filter((item) => item.state === 'PUBLISHED')
          .map((item) => `slice-demo-${item.key}`),
      },
      status: 'PUBLISHED',
    },
    select: { id: true, publicId: true, slug: true },
    orderBy: { slug: 'asc' },
  });
  for (const asset of published) {
    const spec = assets.find(
      (item) => `slice-demo-${item.key}` === asset.slug,
    )!;
    await input.db.tradingMarket.upsert({
      where: { assetId: asset.id },
      create: {
        assetId: asset.id,
        status: 'OPEN',
        tickSizeMinor: tradingPolicy.defaultTickSizeMinor,
        lotSizeUnits: tradingPolicy.defaultLotSizeUnits,
        minimumNotionalMinor: tradingPolicy.defaultMinimumNotionalMinor,
        makerFeeBps: tradingPolicy.fee.makerBps,
        takerFeeBps: tradingPolicy.fee.takerBps,
        selfTradePrevention: tradingPolicy.selfTradePrevention,
        tradingEnabled: true,
        feeScheduleVersion: 'STAGING_DEMO_POLICY_V1',
      },
      update: { status: 'OPEN', tradingEnabled: true },
    });
    await ensureMarketMakerInventory(input, marketMaker.actor, asset.id, spec);
  }

  for (const asset of published.slice(0, 2)) {
    const spec = assets.find(
      (item) => `slice-demo-${item.key}` === asset.slug,
    )!;
    await ensureDemoExecution(
      input,
      marketMaker.actor,
      input.investor,
      asset,
      spec,
    );
  }
  for (const asset of published.slice(0, 3)) {
    const spec = assets.find(
      (item) => `slice-demo-${item.key}` === asset.slug,
    )!;
    await ensureDemoOrderBook(
      input,
      marketMaker.actor,
      input.collector,
      asset,
      spec,
    );
  }
  await ensureCancelledDemoOrder(input, input.investor, published[0]);

  const [orders, executions, notifications] = await Promise.all([
    input.db.tradingOrder.count({
      where: {
        userId: {
          in: [
            input.investor.userId,
            input.collector.userId,
            marketMaker.userId,
          ],
        },
      },
    }),
    input.db.tradingExecution.count({
      where: { assetId: { in: published.map((item) => item.id) } },
    }),
    input.db.notification.count({
      where: {
        userId: { in: [input.investor.userId, input.collector.userId] },
      },
    }),
  ]);
  return {
    enabled: true,
    marketMaker: demoAccounts.marketMaker.email,
    markets: published.length,
    orders,
    executions,
    notifications,
  };
}

async function ensureLocalDemoCompliance(
  compliance: ComplianceService,
  admin: Actor,
  actor: Actor,
) {
  const current = await compliance.self(actor.userId);
  if (current.status === 'APPROVED') return;
  await compliance.start(
    actor,
    `staging-demo-compliance-start:${actor.userId}`,
  );
  await compliance.ingestDecision(
    admin,
    actor.userId,
    'APPROVED',
    'STAGING_DEMO_LOCAL_COMPLIANCE_APPROVED',
    `staging-demo-local-compliance:${actor.userId}`,
    `staging-demo-compliance-decision:${actor.userId}`,
  );
}

async function ensureMarketMakerInventory(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  marketMaker: Actor,
  assetId: string,
  spec: DemoAsset,
) {
  const account = await input.db.ownershipAccount.findUnique({
    where: { userId: marketMaker.userId },
  });
  const position = account
    ? await input.db.ownershipPosition.findUnique({
        where: { assetId_accountId: { assetId, accountId: account.id } },
      })
    : null;
  const owned = position?.settledUnits ?? 0n;
  if (owned < 350n) {
    await input.ownershipOps.transfer(
      input.admin,
      assetId,
      { toUserId: marketMaker.userId, units: (350n - owned).toString() },
      `staging-demo-market-maker-allocation:${spec.key}`,
      `staging-demo-market-maker-allocation:${spec.key}`,
    );
  }
  const sourceReference = `staging-demo-market-maker-lot:${spec.key}`;
  const lot = await input.db.portfolioLot.findUnique({
    where: { sourceReference },
  });
  if (!lot) {
    const unitPrice = spec.valueMinor / 1000n;
    await input.lots.recordAcquisition(
      marketMaker,
      {
        userId: marketMaker.userId,
        assetId,
        units: '350',
        totalCostMinor: (unitPrice * 350n).toString(),
        sourceReference,
      },
      `staging-demo-market-maker-lot:${spec.key}`,
      `staging-demo-market-maker-lot:${spec.key}`,
    );
  }
}

async function ensureDemoExecution(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  seller: Actor,
  buyer: Actor,
  asset: { id: string; publicId: string; slug: string },
  spec: DemoAsset,
) {
  const prior = await input.db.tradingExecution.findFirst({
    where: {
      assetId: asset.id,
      OR: [
        { buyOrder: { userId: buyer.userId } },
        { sellOrder: { userId: seller.userId } },
      ],
    },
    select: { id: true },
  });
  if (prior) return;
  const price = spec.valueMinor / 1000n;
  await input.trading.place(
    seller,
    {
      assetId: asset.publicId,
      side: 'SELL',
      type: 'LIMIT',
      timeInForce: 'GTC',
      units: '20',
      limitPriceMinor: price.toString(),
    },
    `staging-demo-execution-sell:${spec.key}`,
    `staging-demo-execution-sell:${spec.key}`,
  );
  await input.trading.place(
    buyer,
    {
      assetId: asset.publicId,
      side: 'BUY',
      type: 'LIMIT',
      timeInForce: 'IOC',
      units: '20',
      limitPriceMinor: price.toString(),
    },
    `staging-demo-execution-buy:${spec.key}`,
    `staging-demo-execution-buy:${spec.key}`,
  );
}

async function ensureDemoOrderBook(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  seller: Actor,
  buyer: Actor,
  asset: { id: string; publicId: string; slug: string },
  spec: DemoAsset,
) {
  const price = spec.valueMinor / 1000n;
  const levels = [
    { actor: seller, side: 'SELL' as const, price: price + 50n, key: 'ask' },
    { actor: buyer, side: 'BUY' as const, price: price - 50n, key: 'bid' },
  ];
  for (const level of levels) {
    const existing = await input.db.tradingOrder.findFirst({
      where: {
        userId: level.actor.userId,
        assetId: asset.id,
        side: level.side,
        limitPriceMinor: level.price,
        status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
      },
      select: { id: true },
    });
    if (!existing) {
      await input.trading.place(
        level.actor,
        {
          assetId: asset.publicId,
          side: level.side,
          type: 'LIMIT',
          timeInForce: 'GTC',
          units: '50',
          limitPriceMinor: level.price.toString(),
        },
        `staging-demo-book-${level.key}:${spec.key}`,
        `staging-demo-book-${level.key}:${spec.key}`,
      );
    }
  }
}

async function ensureCancelledDemoOrder(
  input: Parameters<typeof ensureTradingDemonstration>[0],
  investor: Actor,
  asset: { id: string; publicId: string; slug: string } | undefined,
) {
  if (!asset) return;
  const existing = await input.db.tradingOrder.findFirst({
    where: { userId: investor.userId, assetId: asset.id, status: 'CANCELLED' },
    select: { id: true },
  });
  if (existing) return;
  const spec = assets.find((item) => `slice-demo-${item.key}` === asset.slug)!;
  const order = await input.trading.place(
    investor,
    {
      assetId: asset.publicId,
      side: 'BUY',
      type: 'LIMIT',
      timeInForce: 'GTC',
      units: '5',
      limitPriceMinor: (spec.valueMinor / 2000n).toString(),
    },
    `staging-demo-cancel-open:${spec.key}`,
    `staging-demo-cancel-open:${spec.key}`,
  );
  await input.trading.cancel(
    investor,
    order.id,
    `staging-demo-cancel:${spec.key}`,
    `staging-demo-cancel:${spec.key}`,
  );
}

async function ensureWorkspaceQueue(
  db: PrismaService,
  submissions: SubmissionService,
  storage: LocalSubmissionStorage,
  owner: Actor,
  reviewer: Actor,
  categoryId: string,
) {
  for (let index = 1; index <= 5; index += 1) {
    const certificate = `STG-B-${index}`;
    let submission = (
      await db.assetSubmission.findMany({
        where: { ownerUserId: owner.userId },
        orderBy: { createdAt: 'asc' },
      })
    ).find(
      (row) =>
        (row.declaredMetadata as { certificationNumber?: string } | null)
          ?.certificationNumber === certificate,
    );
    if (!submission) {
      const draft = await submissions.create(
        owner,
        {
          categoryId,
          declaredMetadata: {
            name: `Collector B Evidence Review ${index}`,
            manufacturer: 'Pokémon',
            year: '2024',
            certificationNumber: certificate,
            details: 'Private staging workspace assignment.',
          },
        },
        `collector-b-submission-${randomUUID()}`,
        `collector-b-submission:${index}`,
      );
      submission = await db.assetSubmission.findUniqueOrThrow({
        where: { id: draft.id },
      });
      for (const slot of ['front', 'back']) {
        const intent = await submissions.uploadIntent(
          owner,
          submission.id,
          {
            slot,
            mimeType: 'image/png',
            sizeBytes: fixturePng.length,
            originalFilename: `collector-b-${index}-${slot}.png`,
          },
          `collector-b-media-${randomUUID()}`,
          `collector-b-media:${index}:${slot}`,
        );
        storage.putForTest({
          key: intent.upload.objectKey,
          mimeType: 'image/png',
          sizeBytes: fixturePng.length,
          sha256: fixtureHash,
          magicMimeType: 'image/png',
          width: 1,
          height: 1,
        });
        const latest = await db.assetSubmission.findUniqueOrThrow({
          where: { id: submission!.id },
        });
        await submissions.completeMedia(
          owner,
          submission!.id,
          intent.media.id,
          { sha256: fixtureHash, version: latest.version },
          `collector-b-media-complete-${randomUUID()}`,
          `collector-b-media-complete:${index}:${slot}`,
        );
      }
      const latest = await db.assetSubmission.findUniqueOrThrow({
        where: { id: submission.id },
      });
      await submissions.submit(
        owner,
        submission.id,
        latest.version,
        `collector-b-submit-${randomUUID()}`,
        `collector-b-submit:${index}`,
      );
    }
    if (index <= 3 && submission.status === 'SUBMITTED')
      await submissions.claim(
        reviewer,
        submission.id,
        `collector-b-claim-${randomUUID()}`,
        `collector-b-claim:${index}`,
      );
  }
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

if (require.main === module)
  void runCollectorDemoSetup().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Collector demo fixture failed.'}\n`,
    );
    process.exitCode = 1;
  });
