import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { Argon2idPasswordHasher } from '../modules/identity/security/argon2id-password-hasher';
import { PREVIEW_DROP_FIXTURE_CLASSIFICATION } from '../modules/drops/domain/drop-fixture';

const CREATOR_ID = 'preview-drops-creator';
const OPERATOR_ID = 'preview-drops-operator';
const CREATOR_EMAIL = 'drops.creator@preview.slice.invalid';
const FIXTURE_KEY = 'SLICE_DROPS_FOUNDATION_V1';

/**
 * Creates a small, explicit PREVIEW_QA fixture set in the isolated preview DB.
 * It never creates valuations, provider evidence, payments, orders, or draws.
 */
export async function setupPreviewDrops(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService);
    const config = app.get<AppConfig>(APP_CONFIG);
    assertPreviewSafety(config);
    const password = process.env.PREVIEW_DROPS_CREATOR_PASSWORD;
    if (!password || password.length < 12)
      throw new Error(
        'PREVIEW_DROPS_CREATOR_PASSWORD must contain at least 12 characters.',
      );
    const hasher = new Argon2idPasswordHasher();
    const [creatorHash, operatorHash] = await Promise.all([
      hasher.hash(password),
      hasher.hash(`disabled-${crypto.randomUUID()}-${crypto.randomUUID()}`),
    ]);
    const now = new Date();

    await db.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { normalizedEmail: CREATOR_EMAIL },
        create: {
          id: CREATOR_ID,
          email: CREATOR_EMAIL,
          normalizedEmail: CREATOR_EMAIL,
          passwordHash: creatorHash,
          accountStatus: 'ACTIVE',
          financialDataClass: 'QA',
          emailVerifiedAt: now,
        },
        update: {
          passwordHash: creatorHash,
          accountStatus: 'ACTIVE',
          financialDataClass: 'QA',
          emailVerifiedAt: now,
        },
      });
      await tx.userProfile.upsert({
        where: { userId: CREATOR_ID },
        create: {
          userId: CREATOR_ID,
          displayName: 'Preview Drops Creator',
          publicUsername: 'preview-drops-creator',
        },
        update: {
          displayName: 'Preview Drops Creator',
          publicUsername: 'preview-drops-creator',
        },
      });
      await tx.roleAssignment.deleteMany({ where: { userId: CREATOR_ID } });
      await tx.roleAssignment.createMany({
        data: ['USER', 'COLLECTOR'].map((role) => ({
          id: `preview-drops-creator-${role.toLowerCase()}`,
          userId: CREATOR_ID,
          role: role as 'USER' | 'COLLECTOR',
          scopeType: 'GLOBAL',
          scopeId: '*',
        })),
      });

      await tx.user.upsert({
        where: { normalizedEmail: 'drops.operator@preview.slice.invalid' },
        create: {
          id: OPERATOR_ID,
          email: 'drops.operator@preview.slice.invalid',
          normalizedEmail: 'drops.operator@preview.slice.invalid',
          passwordHash: operatorHash,
          accountStatus: 'ACTIVE',
          financialDataClass: 'QA',
          emailVerifiedAt: now,
        },
        update: {
          accountStatus: 'ACTIVE',
          financialDataClass: 'QA',
          emailVerifiedAt: now,
        },
      });
      await tx.userProfile.upsert({
        where: { userId: OPERATOR_ID },
        create: { userId: OPERATOR_ID, displayName: 'Preview QA Operator' },
        update: { displayName: 'Preview QA Operator' },
      });
      await tx.roleAssignment.deleteMany({ where: { userId: OPERATOR_ID } });
      await tx.roleAssignment.createMany({
        data: ['ADMIN', 'ASSET_REVIEWER', 'VAULT_OPERATOR'].map((role) => ({
          id: `preview-drops-operator-${role.toLowerCase()}`,
          userId: OPERATOR_ID,
          role: role as 'ADMIN' | 'ASSET_REVIEWER' | 'VAULT_OPERATOR',
          scopeType: 'GLOBAL',
          scopeId: '*',
        })),
      });

      const category = await tx.category.upsert({
        where: { slug: 'preview-qa-cards' },
        create: {
          id: 'preview-drops-category',
          slug: 'preview-qa-cards',
          name: 'Preview QA Cards',
          description:
            'PREVIEW_QA records for Slice Drops workflow testing only.',
        },
        update: { name: 'Preview QA Cards' },
      });
      const creatorAccount = await tx.ownershipAccount.upsert({
        where: { userId: CREATOR_ID },
        create: {
          id: 'preview-drops-creator-ownership',
          type: 'USER',
          userId: CREATOR_ID,
          status: 'ACTIVE',
        },
        update: { type: 'USER', status: 'ACTIVE' },
      });
      const treasury = await tx.ownershipAccount.upsert({
        where: { id: 'preview-drops-qa-treasury' },
        create: {
          id: 'preview-drops-qa-treasury',
          type: 'TREASURY',
          status: 'ACTIVE',
        },
        update: { status: 'ACTIVE' },
      });
      const fixture = await tx.previewDropFixture.upsert({
        where: { fixtureKey: FIXTURE_KEY },
        create: {
          fixtureKey: FIXTURE_KEY,
          creatorUserId: CREATOR_ID,
          classification: PREVIEW_DROP_FIXTURE_CLASSIFICATION,
        },
        update: {
          creatorUserId: CREATOR_ID,
          classification: PREVIEW_DROP_FIXTURE_CLASSIFICATION,
        },
      });

      for (let index = 0; index < 8; index += 1) {
        const ordinal = index + 1;
        const assetId = `preview-drops-asset-${ordinal}`;
        const eligible = index < 6;
        const fractional = index === 6;
        await tx.asset.upsert({
          where: { id: assetId },
          create: {
            id: assetId,
            publicId: `PREVIEW-QA-DROP-${String(ordinal).padStart(2, '0')}`,
            slug: `preview-qa-drop-card-${ordinal}`,
            categoryId: category.id,
            title: `Preview QA Vault Card ${ordinal}`,
            shortName: `QA Card ${ordinal}`,
            description:
              'Controlled PREVIEW_QA canonical collectible. Not operational inventory.',
            status: 'VERIFIED',
          },
          update: { categoryId: category.id, status: 'VERIFIED' },
        });
        await tx.assetSubmission.upsert({
          where: { id: `${assetId}-submission` },
          create: {
            id: `${assetId}-submission`,
            ownerUserId: CREATOR_ID,
            assetId,
            categoryId: category.id,
            status: 'APPROVED',
            version: 1,
            currentStep: 4,
            submittedAt: now,
            reviewedAt: now,
            reviewerId: OPERATOR_ID,
            decisionCode: 'PREVIEW_QA_APPROVED',
            decisionNote:
              'Controlled preview fixture; no provider claim is implied.',
          },
          update: {
            status: 'APPROVED',
            reviewedAt: now,
            reviewerId: OPERATOR_ID,
          },
        });
        await tx.verificationReview.upsert({
          where: { id: `${assetId}-review` },
          create: {
            id: `${assetId}-review`,
            submissionId: `${assetId}-submission`,
            reviewerId: OPERATOR_ID,
            status: 'COMPLETED',
            decision: 'APPROVE',
            reasonCode: 'PREVIEW_QA_MANUAL_VERIFICATION',
            note: 'Controlled preview fixture; not external grading or provider evidence.',
            completedAt: now,
          },
          update: {
            status: 'COMPLETED',
            decision: 'APPROVE',
            completedAt: now,
          },
        });
        await tx.vaultCustodyRecord.upsert({
          where: { assetId },
          create: {
            id: `${assetId}-custody`,
            assetId,
            providerCode: 'PREVIEW_QA_MANUAL',
            facilityCode: 'PREVIEW_QA_VAULT',
            status: index === 7 ? 'EXPECTED' : 'SECURED',
            receivedAt: index === 7 ? null : now,
            securedAt: index === 7 ? null : now,
          },
          update: {
            status: index === 7 ? 'EXPECTED' : 'SECURED',
            receivedAt: index === 7 ? null : now,
            securedAt: index === 7 ? null : now,
          },
        });
        const totalUnits = fractional ? 100n : 1n;
        await tx.ownershipAssetSupply.upsert({
          where: { assetId },
          create: {
            assetId,
            totalUnits,
            issuedUnits: totalUnits,
            status: 'ACTIVE',
            issuedAt: now,
          },
          update: {
            totalUnits,
            issuedUnits: totalUnits,
            status: 'ACTIVE',
            issuedAt: now,
          },
        });
        await tx.ownershipPosition.upsert({
          where: {
            assetId_accountId: { assetId, accountId: creatorAccount.id },
          },
          create: {
            id: `${assetId}-creator-position`,
            assetId,
            accountId: creatorAccount.id,
            settledUnits: fractional ? 50n : 1n,
            reservedUnits: 0n,
          },
          update: { settledUnits: fractional ? 50n : 1n, reservedUnits: 0n },
        });
        if (fractional)
          await tx.ownershipPosition.upsert({
            where: { assetId_accountId: { assetId, accountId: treasury.id } },
            create: {
              id: `${assetId}-treasury-position`,
              assetId,
              accountId: treasury.id,
              settledUnits: 50n,
              reservedUnits: 0n,
            },
            update: { settledUnits: 50n, reservedUnits: 0n },
          });
        await tx.previewDropFixtureAsset.upsert({
          where: { assetId },
          create: {
            fixtureId: fixture.id,
            assetId,
            scenario: eligible
              ? 'ELIGIBLE_WHOLE_OWNED_SECURED'
              : fractional
                ? 'INELIGIBLE_FRACTIONAL_OWNERSHIP'
                : 'INELIGIBLE_NOT_SECURED',
          },
          update: {
            fixtureId: fixture.id,
            scenario: eligible
              ? 'ELIGIBLE_WHOLE_OWNED_SECURED'
              : fractional
                ? 'INELIGIBLE_FRACTIONAL_OWNERSHIP'
                : 'INELIGIBLE_NOT_SECURED',
          },
        });
      }
    });

    process.stdout.write(
      `Preview Drops fixtures ready: ${CREATOR_EMAIL} (6 eligible, 2 intentionally ineligible).\n`,
    );
  } finally {
    await app.close();
  }
}

function assertPreviewSafety(config: AppConfig): void {
  if (
    config.deploymentChannel !== 'preview' ||
    config.publicBasePath !== '/preview'
  )
    throw new Error(
      'Refusing to create Drops fixtures outside the isolated /preview deployment.',
    );
  if (config.providerMode !== 'local' || config.stripeLiveEnabled)
    throw new Error(
      'Refusing to create Drops fixtures while external financial providers are enabled.',
    );
}

if (require.main === module) {
  void setupPreviewDrops().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
