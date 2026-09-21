import { PrismaClient } from '@prisma/client';
import {
  assertTestDatabaseUrl,
  type AppConfig,
} from '../src/config/app-config';
import { DropsService } from '../src/modules/drops/application/drops.service';
import { PREVIEW_DROP_FIXTURE_CLASSIFICATION } from '../src/modules/drops/domain/drop-fixture';
import type { Actor } from '../src/modules/identity/auth/auth.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('TEST_DATABASE_URL is required for Drops integration tests.');
assertTestDatabaseUrl(databaseUrl);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `drops-int-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userId = `${runId}-creator`;
const actor: Actor = {
  userId: userId as never,
  sessionId: `${runId}-session`,
  status: 'ACTIVE',
  roles: ['COLLECTOR'],
  sessionRevokedAt: null,
  sessionRevocationReason: null,
  authenticatedAt: new Date(),
};
// The runner and assertion above own the disposable *_test database boundary.
// Drops still receives the Preview route classification it enforces, without
// pretending this test-only database is the deployed *_preview database.
const config = {
  environment: 'test',
  deploymentChannel: 'preview',
  publicBasePath: '/preview',
  databaseUrl,
  testDatabaseUrl: databaseUrl,
} as AppConfig;

jest.setTimeout(120_000);

describe('Slice Drops PostgreSQL invariants', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${runId}@slice.test`,
        normalizedEmail: `${runId}@slice.test`,
        passwordHash: 'integration-test-not-a-login-secret',
        accountStatus: 'ACTIVE',
        financialDataClass: 'QA',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-collector-role`,
        userId,
        role: 'COLLECTOR',
        scopeType: 'GLOBAL',
        scopeId: '*',
      },
    });
  });

  afterAll(async () => {
    await prisma.dropAssetLock.deleteMany({
      where: { drop: { creatorUserId: userId } },
    });
    await prisma.dropInventoryItem.deleteMany({
      where: { drop: { creatorUserId: userId } },
    });
    await prisma.dropHistoryEvent.deleteMany({
      where: { drop: { creatorUserId: userId } },
    });
    await prisma.drop.deleteMany({ where: { creatorUserId: userId } });
    await prisma.idempotencyRecord.deleteMany({
      where: { actorScope: userId },
    });
    await prisma.previewDropFixtureAsset.deleteMany({
      where: { fixture: { creatorUserId: userId } },
    });
    await prisma.previewDropFixture.deleteMany({
      where: { creatorUserId: userId },
    });
    await prisma.ownershipPosition.deleteMany({
      where: { account: { userId } },
    });
    await prisma.ownershipAssetSupply.deleteMany({
      where: { asset: { slug: { startsWith: runId } } },
    });
    await prisma.ownershipAccount.deleteMany({ where: { userId } });
    await prisma.verificationReview.deleteMany({
      where: { submission: { ownerUserId: userId } },
    });
    await prisma.assetSubmission.deleteMany({ where: { ownerUserId: userId } });
    await prisma.vaultCustodyRecord.deleteMany({
      where: { asset: { slug: { startsWith: runId } } },
    });
    await prisma.asset.deleteMany({ where: { slug: { startsWith: runId } } });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: runId } },
    });
    await prisma.roleAssignment.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('replays an idempotent create and blocks readiness without inventory', async () => {
    const service = new DropsService(prisma as never, config);
    const input = {
      name: 'Integration Vault Release',
      description:
        'A controlled preview integration Drop with no financial execution.',
    };
    const first = await service.createDraft(actor, input, `${runId}-create`);
    const replay = await service.createDraft(actor, input, `${runId}-create`);
    expect(replay.id).toBe(first.id);
    expect(await prisma.drop.count({ where: { id: first.id } })).toBe(1);
    await expect(
      service.submitForReview(
        actor,
        first.id,
        { version: first.version },
        `${runId}-submit`,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'DROP_NOT_READY' }),
    });
  });

  it('prevents duplicate membership, releases the lock on removal, and persists after reconnect', async () => {
    const category = await prisma.category.create({
      data: {
        id: `${runId}-category`,
        slug: `${runId}-category`,
        name: 'Drops integration',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        id: `${runId}-asset`,
        publicId: `${runId}-public`,
        slug: `${runId}-asset`,
        categoryId: category.id,
        title: 'Persistent lock asset',
        status: 'VERIFIED',
      },
    });
    const service = new DropsService(prisma as never, config);
    const first = await service.createDraft(
      actor,
      {
        name: 'First lock target',
        description: 'First controlled Drop used to verify exclusive locking.',
      },
      `${runId}-first`,
    );
    const second = await service.createDraft(
      actor,
      {
        name: 'Second lock target',
        description: 'Second controlled Drop used to verify exclusive locking.',
      },
      `${runId}-second`,
    );
    const firstItem = await prisma.dropInventoryItem.create({
      data: { dropId: first.id, assetId: asset.id },
    });
    await prisma.dropAssetLock.create({
      data: {
        dropId: first.id,
        assetId: asset.id,
        inventoryItemId: firstItem.id,
      },
    });
    const secondItem = await prisma.dropInventoryItem.create({
      data: { dropId: second.id, assetId: asset.id },
    });
    await expect(
      prisma.dropAssetLock.create({
        data: {
          dropId: second.id,
          assetId: asset.id,
          inventoryItemId: secondItem.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.dropAssetLock.delete({ where: { assetId: asset.id } });
    await prisma.dropInventoryItem.delete({ where: { id: firstItem.id } });
    await prisma.dropAssetLock.create({
      data: {
        dropId: second.id,
        assetId: asset.id,
        inventoryItemId: secondItem.id,
      },
    });
    await prisma.$disconnect();
    await prisma.$connect();
    expect(
      await prisma.dropAssetLock.findUnique({ where: { assetId: asset.id } }),
    ).toMatchObject({ dropId: second.id });
  });

  it('persists the complete eligible inventory workflow across application contexts', async () => {
    const now = new Date();
    const category = await prisma.category.create({
      data: {
        id: `${runId}-eligible-category`,
        slug: `${runId}-eligible-category`,
        name: 'Drops eligible integration inventory',
      },
    });
    const asset = await prisma.asset.create({
      data: {
        id: `${runId}-eligible-asset`,
        publicId: `${runId}-eligible-public`,
        slug: `${runId}-eligible-asset`,
        categoryId: category.id,
        title: 'Eligible vaulted persistence asset',
        status: 'VERIFIED',
      },
    });
    const submission = await prisma.assetSubmission.create({
      data: {
        id: `${runId}-eligible-submission`,
        ownerUserId: userId,
        assetId: asset.id,
        categoryId: category.id,
        status: 'APPROVED',
        version: 1,
        currentStep: 4,
        submittedAt: now,
        reviewedAt: now,
        reviewerId: userId,
        decisionCode: 'PREVIEW_QA_APPROVED',
        decisionNote: 'Isolated persistence integration fixture.',
      },
    });
    await prisma.verificationReview.create({
      data: {
        id: `${runId}-eligible-review`,
        submissionId: submission.id,
        reviewerId: userId,
        status: 'COMPLETED',
        decision: 'APPROVE',
        reasonCode: 'PREVIEW_QA_MANUAL_VERIFICATION',
        note: 'Isolated persistence integration fixture.',
        completedAt: now,
      },
    });
    await prisma.vaultCustodyRecord.create({
      data: {
        id: `${runId}-eligible-custody`,
        assetId: asset.id,
        providerCode: 'PREVIEW_QA_MANUAL',
        facilityCode: 'PREVIEW_QA_VAULT',
        status: 'SECURED',
        receivedAt: now,
        securedAt: now,
      },
    });
    const ownershipAccount = await prisma.ownershipAccount.create({
      data: {
        id: `${runId}-ownership-account`,
        type: 'USER',
        userId,
        status: 'ACTIVE',
      },
    });
    await prisma.ownershipAssetSupply.create({
      data: {
        assetId: asset.id,
        totalUnits: 1n,
        issuedUnits: 1n,
        status: 'ACTIVE',
        issuedAt: now,
      },
    });
    await prisma.ownershipPosition.create({
      data: {
        id: `${runId}-ownership-position`,
        assetId: asset.id,
        accountId: ownershipAccount.id,
        settledUnits: 1n,
        reservedUnits: 0n,
      },
    });
    const fixture = await prisma.previewDropFixture.create({
      data: {
        fixtureKey: `${runId}-fixture`,
        creatorUserId: userId,
        classification: PREVIEW_DROP_FIXTURE_CLASSIFICATION,
      },
    });
    await prisma.previewDropFixtureAsset.create({
      data: {
        fixtureId: fixture.id,
        assetId: asset.id,
        scenario: 'ELIGIBLE_WHOLE_OWNED_SECURED',
      },
    });

    let service = new DropsService(prisma as never, config);
    const eligibleBefore = await service.eligibleAssets(actor);
    expect(eligibleBefore.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: asset.id,
          eligibility: { eligible: true, reasons: [] },
          fixture: {
            classification: PREVIEW_DROP_FIXTURE_CLASSIFICATION,
            scenario: 'ELIGIBLE_WHOLE_OWNED_SECURED',
          },
        }),
      ]),
    );

    const first = await service.createDraft(
      actor,
      {
        name: 'Authoritative persistence Drop',
        description:
          'Verifies eligible vaulted inventory, readiness, and lock persistence.',
      },
      `${runId}-workflow-first`,
    );
    const firstReplay = await service.createDraft(
      actor,
      {
        name: 'Authoritative persistence Drop',
        description:
          'Verifies eligible vaulted inventory, readiness, and lock persistence.',
      },
      `${runId}-workflow-first`,
    );
    expect(firstReplay.id).toBe(first.id);

    const second = await service.createDraft(
      actor,
      {
        name: 'Incompatible active Drop',
        description:
          'Must not accept inventory already locked to another active Drop.',
      },
      `${runId}-workflow-second`,
    );
    const added = await service.addInventory(
      actor,
      first.id,
      { version: first.version, assetId: asset.id },
      `${runId}-workflow-add`,
    );
    const addReplay = await service.addInventory(
      actor,
      first.id,
      { version: first.version, assetId: asset.id },
      `${runId}-workflow-add`,
    );
    expect(addReplay.id).toBe(added.id);
    expect(added.readiness.ready).toBe(true);
    expect(
      await prisma.dropInventoryItem.count({ where: { assetId: asset.id } }),
    ).toBe(1);
    expect(
      await prisma.dropAssetLock.count({ where: { assetId: asset.id } }),
    ).toBe(1);

    await prisma.$disconnect();
    await prisma.$connect();
    service = new DropsService(prisma as never, config);
    const afterReload = await service.creatorDrop(actor, first.id);
    expect(afterReload).toMatchObject({
      id: first.id,
      state: 'DRAFT',
      inventoryCount: 1,
      readiness: { ready: true },
    });
    expect(afterReload.inventory[0]?.vaultLock.active).toBe(true);
    expect(await prisma.drop.findUnique({ where: { id: first.id } })).not.toBeNull();

    await expect(
      service.addInventory(
        actor,
        second.id,
        { version: second.version, assetId: asset.id },
        `${runId}-workflow-incompatible-add`,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'DROP_ASSET_INELIGIBLE',
        reasons: expect.arrayContaining([
          expect.objectContaining({ code: 'ALREADY_LOCKED' }),
        ]),
      }),
    });

    const removed = await service.removeInventory(
      actor,
      first.id,
      asset.id,
      { version: afterReload.version },
      `${runId}-workflow-remove`,
    );
    const removeReplay = await service.removeInventory(
      actor,
      first.id,
      asset.id,
      { version: afterReload.version },
      `${runId}-workflow-remove`,
    );
    expect(removeReplay.id).toBe(removed.id);
    expect(removed.readiness.ready).toBe(false);
    expect(
      await prisma.dropInventoryItem.count({ where: { assetId: asset.id } }),
    ).toBe(0);
    expect(
      await prisma.dropAssetLock.count({ where: { assetId: asset.id } }),
    ).toBe(0);
    expect(
      (await service.eligibleAssets(actor)).items.find(
        (item) => item.id === asset.id,
      )?.eligibility,
    ).toEqual({ eligible: true, reasons: [] });

    const addedToSecond = await service.addInventory(
      actor,
      second.id,
      { version: second.version, assetId: asset.id },
      `${runId}-workflow-add-second`,
    );
    expect(addedToSecond.readiness.ready).toBe(true);

    await prisma.$disconnect();
    await prisma.$connect();
    service = new DropsService(prisma as never, config);
    const secondAfterReload = await service.creatorDrop(actor, second.id);
    expect(secondAfterReload).toMatchObject({
      state: 'DRAFT',
      inventoryCount: 1,
      readiness: { ready: true },
    });
    const submitted = await service.submitForReview(
      actor,
      second.id,
      { version: secondAfterReload.version },
      `${runId}-workflow-submit-second`,
    );
    const submitReplay = await service.submitForReview(
      actor,
      second.id,
      { version: secondAfterReload.version },
      `${runId}-workflow-submit-second`,
    );
    expect(submitReplay.id).toBe(submitted.id);
    expect(submitted.state).toBe('READY_FOR_REVIEW');

    await prisma.$disconnect();
    await prisma.$connect();
    service = new DropsService(prisma as never, config);
    expect(await service.creatorDrop(actor, second.id)).toMatchObject({
      state: 'READY_FOR_REVIEW',
      readiness: { ready: true },
      inventoryCount: 1,
    });
    const [databaseIdentity] = await prisma.$queryRaw<
      Array<{ database_name: string }>
    >`SELECT current_database() AS database_name`;
    expect(databaseIdentity?.database_name).toBe('slice_test');
    expect(
      await prisma.previewDropFixture.findUnique({
        where: { id: fixture.id },
        select: { classification: true },
      }),
    ).toEqual({ classification: PREVIEW_DROP_FIXTURE_CLASSIFICATION });
    expect(
      await prisma.user.findUnique({
        where: { id: userId },
        select: { financialDataClass: true },
      }),
    ).toEqual({ financialDataClass: 'QA' });
  });
});
