import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const id = `submission-i-${Date.now()}`;

describe('Document 010 PostgreSQL submission invariants', () => {
  const ownerId = `${id}-owner`;
  const reviewerId = `${id}-reviewer`;
  const categoryId = `${id}-category`;

  beforeAll(async () => {
    await db.$connect();
    await db.category.create({
      data: { id: categoryId, slug: categoryId, name: 'Submission category' },
    });
    await db.user.createMany({
      data: [
        {
          id: ownerId,
          email: `${ownerId}@example.test`,
          normalizedEmail: `${ownerId}@example.test`,
          passwordHash: 'test-only',
        },
        {
          id: reviewerId,
          email: `${reviewerId}@example.test`,
          normalizedEmail: `${reviewerId}@example.test`,
          passwordHash: 'test-only',
        },
      ],
    });
  });
  afterAll(async () => {
    await db.verificationReview.deleteMany({
      where: { submissionId: { startsWith: id } },
    });
    await db.submissionMedia.deleteMany({
      where: { submissionId: { startsWith: id } },
    });
    await db.assetSubmission.deleteMany({ where: { id: { startsWith: id } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, reviewerId] } } });
    await db.category.delete({ where: { id: categoryId } });
    await db.$disconnect();
  });

  it('keeps primary media replacement in the service and allows optional media multiplicity', async () => {
    const submission = await db.assetSubmission.create({
      data: { id: `${id}-draft`, ownerUserId: ownerId, categoryId },
    });
    await db.submissionMedia.create({
      data: {
        id: `${id}-front`,
        submissionId: submission.id,
        slot: 'front',
        objectKey: `${id}/front`,
        originalFilename: 'front.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        status: 'SAFE',
      },
    });
    await db.submissionMedia.create({
      data: {
        id: `${id}-additional-one`,
        submissionId: submission.id,
        slot: 'additional-image',
        objectKey: `${id}/additional-one`,
        originalFilename: 'additional-one.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
      },
    });
    await db.submissionMedia.create({
      data: {
        id: `${id}-additional-two`,
        submissionId: submission.id,
        slot: 'additional-image',
        objectKey: `${id}/additional-two`,
        originalFilename: 'additional-two.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
      },
    });
    await db.verificationReview.createMany({
      data: [
        {
          id: `${id}-claim`,
          submissionId: submission.id,
          reviewerId,
          status: 'CLAIMED',
        },
        {
          id: `${id}-decision`,
          submissionId: submission.id,
          reviewerId,
          status: 'COMPLETED',
          decision: 'CHANGES_REQUESTED',
          reasonCode: 'EVIDENCE_REQUIRED',
          completedAt: new Date(),
        },
      ],
    });
    expect(
      await db.verificationReview.count({
        where: { submissionId: submission.id },
      }),
    ).toBe(2);
  });
});
