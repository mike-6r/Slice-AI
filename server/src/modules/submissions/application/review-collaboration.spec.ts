import { SubmissionService } from './submission.service';

const primaryReviewerId = 'reviewer-primary';
const contributorId = 'reviewer-contributor';

const contributor = {
  userId: contributorId,
  sessionId: 'session-contributor',
  roles: ['ADMIN'],
} as never;

function reviewService(db: Record<string, unknown>) {
  const service = new SubmissionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    {} as never,
  );
  (
    service as unknown as { mutate: (...args: Array<unknown>) => unknown }
  ).mutate = async (...args) => {
    const work = args[7] as (
      transaction: Record<string, unknown>,
      audit: (...auditArgs: Array<unknown>) => Promise<void>,
    ) => Promise<unknown>;
    return work(db, async () => undefined);
  };
  return service;
}

describe('submission review collaboration', () => {
  it('records a contributor-owned assessment without requiring the primary assignment', async () => {
    const now = new Date();
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          ownerUserId: 'collector-1',
          reviewerId: primaryReviewerId,
          status: 'IN_REVIEW',
          version: 1,
        }),
      },
      verificationReview: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'contribution-1' }),
        update: jest.fn().mockResolvedValue({
          id: 'contribution-1',
          staffCondition: 'Near Mint',
          staffConditionNote: 'Clean surfaces',
          updatedAt: now,
        }),
      },
    };

    await expect(
      reviewService(db).saveStaffCondition(
        contributor,
        'submission-1',
        { version: 1, condition: 'Near Mint', note: 'Clean surfaces' },
        'request-1',
        'key-1',
      ),
    ).resolves.toMatchObject({
      submissionId: 'submission-1',
      staffCondition: 'Near Mint',
    });

    expect(db.verificationReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submissionId: 'submission-1',
          reviewerId: contributorId,
          status: 'CLAIMED',
        }),
      }),
    );
    expect(db.verificationReview.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contribution-1' } }),
    );
  });

  it('clears the primary assignment without returning the submission to the queue', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          ownerUserId: 'collector-1',
          reviewerId: primaryReviewerId,
          status: 'IN_REVIEW',
          version: 4,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'submission-1',
          reviewerId: null,
          status: 'IN_REVIEW',
          version: 4,
        }),
      },
    };

    await expect(
      reviewService(db).releaseClaim(
        contributor,
        'submission-1',
        { version: 4 },
        'request-2',
        'key-2',
      ),
    ).resolves.toEqual({
      submissionId: 'submission-1',
      status: 'IN_REVIEW',
      version: 4,
    });

    expect(db.assetSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerId: null }),
      }),
    );
    expect(db.assetSubmission.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('allows a contributor to decide without replacing the primary reviewer', async () => {
    const now = new Date();
    const updated = {
      id: 'submission-1',
      status: 'REJECTED',
      version: 2,
      currentStep: 4,
      categoryId: 'category-1',
      setId: null,
      gradeScaleEntryId: null,
      declaredMetadata: { name: 'Collaboration decision card' },
      preferredIntakeLocationId: null,
      preferredDeliveryMethod: null,
      submittedAt: now,
      reviewedAt: now,
      decisionCode: 'NOT_ELIGIBLE',
      createdAt: now,
      updatedAt: now,
      media: [],
    };
    const db = {
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          ownerUserId: 'collector-1',
          status: 'IN_REVIEW',
          version: 1,
          reviewerId: primaryReviewerId,
          declaredMetadata: updated.declaredMetadata,
          gradeScaleEntryId: null,
          normalizedCertificationNumber: null,
          media: [],
          certificationVerifications: [],
          asset: null,
          owner: { accountStatus: 'ACTIVE' },
          preferredIntakeLocation: null,
        }),
        update: jest.fn().mockResolvedValue(updated),
      },
      gradingCertificationClaim: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      verificationReview: { create: jest.fn().mockResolvedValue({ id: 'decision-1' }) },
    };

    await expect(
      reviewService(db).decide(
        contributor,
        'submission-1',
        'REJECTED',
        { version: 1, reasonCode: 'NOT_ELIGIBLE' },
        'request-3',
        'key-3',
      ),
    ).resolves.toMatchObject({ id: 'submission-1', status: 'REJECTED' });

    expect(db.assetSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerId: primaryReviewerId }),
      }),
    );
    expect(db.verificationReview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewerId: contributorId, status: 'COMPLETED' }),
      }),
    );
  });

  it('persists a reviewed identity separately from the collector submission', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          ownerUserId: 'collector-1',
          status: 'IN_REVIEW',
          version: 4,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ reviewMetadata: null }),
        update: jest.fn().mockResolvedValue({
          id: 'submission-1',
          version: 5,
          reviewMetadata: {
            name: 'Reviewed Pikachu ex',
            cardNumber: '238',
            reviewIdentityNote: 'Matched evidence and source reference.',
          },
        }),
      },
      verificationReview: {
        findFirst: jest.fn().mockResolvedValue({ id: 'contribution-1' }),
      },
    };

    await expect(
      reviewService(db).saveReviewIdentity(
        contributor,
        'submission-1',
        {
          version: 4,
          name: 'Reviewed Pikachu ex',
          cardNumber: '238',
          note: 'Matched evidence and source reference.',
        },
        'request-4',
        'key-4',
      ),
    ).resolves.toMatchObject({ submissionId: 'submission-1', version: 5 });

    expect(db.assetSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: { increment: 1 },
          reviewMetadata: expect.objectContaining({ name: 'Reviewed Pikachu ex' }),
        }),
      }),
    );
  });

  it('attributes a finding and advances the review revision', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          ownerUserId: 'collector-1',
          status: 'IN_REVIEW',
          version: 6,
        }),
        update: jest.fn().mockResolvedValue({ id: 'submission-1', version: 7 }),
      },
      verificationReview: {
        findFirst: jest.fn().mockResolvedValue({ id: 'contribution-1' }),
      },
      submissionReviewFinding: {
        create: jest.fn().mockResolvedValue({
          id: 'finding-1',
          section: 'evidence',
          severity: 'BLOCKING',
          customerAction: true,
        }),
      },
    };

    await expect(
      reviewService(db).createReviewFinding(
        contributor,
        'submission-1',
        {
          version: 6,
          section: 'evidence',
          title: 'Front image is unreadable',
          severity: 'BLOCKING',
          customerAction: true,
        },
        'request-5',
        'key-5',
      ),
    ).resolves.toMatchObject({ findingId: 'finding-1', version: 7 });

    expect(db.submissionReviewFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submissionId: 'submission-1',
          createdByUserId: contributorId,
          severity: 'BLOCKING',
        }),
      }),
    );
  });
});
