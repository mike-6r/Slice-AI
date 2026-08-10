import { PrismaClient } from '@prisma/client';
import { evaluateReadiness } from '../src/modules/lifecycle/domain/publication.policy';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `lifecycle-i-${Date.now()}`;

describe('Document 011 PostgreSQL lifecycle invariants', () => {
  const ownerId = `${run}-owner`;
  const categoryId = `${run}-category`;
  const assetId = `${run}-asset`;
  const submissionId = `${run}-submission`;
  let custodyId: string;

  beforeAll(async () => {
    await db.$connect();
    await db.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.test`,
        normalizedEmail: `${ownerId}@example.test`,
        passwordHash: 'test-only',
      },
    });
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Lifecycle category' },
    });
    await db.asset.create({
      data: {
        id: assetId,
        publicId: `${run}-public`,
        slug: `${run}-asset`,
        title: 'Lifecycle asset',
        categoryId,
      },
    });
    await db.assetSubmission.create({
      data: {
        id: submissionId,
        ownerUserId: ownerId,
        assetId,
        categoryId,
        status: 'APPROVED',
      },
    });
    const custody = await db.vaultCustodyRecord.create({
      data: {
        id: `${run}-custody`,
        assetId,
        providerCode: 'MANUAL_UNVERIFIED',
        status: 'EXPECTED',
      },
    });
    custodyId = custody.id;
  });
  afterAll(async () => {
    await db.custodyEvent.deleteMany({ where: { assetId } });
    await db.assetPublication.deleteMany({ where: { assetId } });
    await db.insuranceCoverage.deleteMany({ where: { assetId } });
    await db.valuationEvidence.deleteMany({ where: { assetId } });
    await db.valuationDecision.deleteMany({ where: { assetId } });
    await db.vaultCustodyRecord.deleteMany({ where: { assetId } });
    await db.assetSubmission.deleteMany({ where: { id: submissionId } });
    await db.asset.deleteMany({ where: { id: assetId } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.$disconnect();
  });

  it('keeps custody history append-only and evaluates blockers from durable state', async () => {
    const at = new Date();
    await db.$transaction(async (tx) => {
      await tx.vaultCustodyRecord.update({
        where: { id: custodyId },
        data: { status: 'RECEIVED', receivedAt: at },
      });
      await tx.custodyEvent.create({
        data: {
          id: `${run}-received`,
          assetId,
          custodyRecordId: custodyId,
          fromStatus: 'EXPECTED',
          toStatus: 'RECEIVED',
          occurredAt: at,
        },
      });
    });
    await db.$transaction(async (tx) => {
      await tx.vaultCustodyRecord.update({
        where: { id: custodyId },
        data: { status: 'SECURED', securedAt: at },
      });
      await tx.custodyEvent.create({
        data: {
          id: `${run}-secured`,
          assetId,
          custodyRecordId: custodyId,
          fromStatus: 'RECEIVED',
          toStatus: 'SECURED',
          occurredAt: at,
        },
      });
    });
    expect(await db.custodyEvent.count({ where: { assetId } })).toBe(2);
    expect(
      evaluateReadiness({
        cataloguePublished: true,
        verificationApproved: true,
        activeDecision: false,
        custodySecured: true,
        activeCoverage: false,
        hasException: false,
      }).blockingCodes,
    ).toEqual(['VALUATION_REQUIRED', 'ACTIVE_COVERAGE_REQUIRED']);
  });

  it('persists valuation supersession and current active GBP coverage', async () => {
    await db.valuationDecision.create({
      data: {
        id: `${run}-valuation-old`,
        assetId,
        valueMinor: 100n,
        currency: 'GBP',
        confidence: 60,
        methodologyCode: 'MANUAL',
        decidedByUserId: ownerId,
        decidedAt: new Date(),
        status: 'SUPERSEDED',
      },
    });
    await db.valuationDecision.create({
      data: {
        id: `${run}-valuation-active`,
        assetId,
        valueMinor: 120n,
        currency: 'GBP',
        confidence: 70,
        methodologyCode: 'MANUAL',
        decidedByUserId: ownerId,
        decidedAt: new Date(),
        status: 'ACTIVE',
      },
    });
    await db.insuranceCoverage.create({
      data: {
        id: `${run}-coverage`,
        assetId,
        providerCode: 'MANUAL_UNVERIFIED',
        insuredValueMinor: 120n,
        currency: 'GBP',
        status: 'ACTIVE',
        effectiveAt: new Date(Date.now() - 1_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect(
      await db.valuationDecision.count({
        where: { assetId, status: 'ACTIVE' },
      }),
    ).toBe(1);
    expect(
      await db.insuranceCoverage.count({
        where: { assetId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      }),
    ).toBe(1);
  });
});
