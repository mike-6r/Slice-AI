import { ConflictException } from '@nestjs/common';
import { CatalogueService } from '../../catalogue/application/catalogue.service';
import { SubmissionService } from './submission.service';

const reviewer = {
  userId: 'reviewer-1',
  sessionId: 'session-1',
  roles: ['ADMIN'],
} as never;

function submissionService(
  db: Record<string, unknown>,
  outbox: Record<string, unknown> = {},
) {
  const service = new SubmissionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    outbox as never,
  );
  (service as unknown as { mutate: (...args: Array<unknown>) => unknown }).mutate =
    async (...args) => {
      const work = args[7] as (
        transaction: Record<string, unknown>,
        audit: (...auditArgs: Array<unknown>) => Promise<void>,
      ) => Promise<unknown>;
      return work(db, async () => undefined);
    };
  return service;
}

describe('canonicalization authority', () => {
  it('approves once without touching Asset authority and rejects a second decision', async () => {
    let status = 'IN_REVIEW';
    const now = new Date();
    const outbox = { append: jest.fn().mockResolvedValue(undefined) };
    const updated = {
      id: 'submission-1',
      status: 'APPROVED',
      version: 2,
      currentStep: 4,
      categoryId: 'category-1',
      setId: null,
      gradeScaleEntryId: null,
      declaredMetadata: { name: 'Approval boundary card' },
      submittedAt: now,
      reviewedAt: now,
      decisionCode: 'READY',
      createdAt: now,
      updatedAt: now,
      media: [
        { id: 'front', slot: 'front', mimeType: 'image/jpeg', sizeBytes: 1, status: 'SAFE', scanResultCode: null, deletedAt: null, createdAt: now, updatedAt: now },
        { id: 'back', slot: 'back', mimeType: 'image/jpeg', sizeBytes: 1, status: 'SAFE', scanResultCode: null, deletedAt: null, createdAt: now, updatedAt: now },
      ],
    };
    const db = {
      assetSubmission: {
        findUnique: jest.fn().mockImplementation(async () => ({
          ownerUserId: 'collector-1',
          status,
          reviewerId: 'reviewer-1',
          declaredMetadata: { name: 'Approval boundary card' },
          gradeScaleEntryId: null,
          normalizedCertificationNumber: null,
          media: updated.media,
          certificationVerifications: [],
          asset: null,
          owner: { accountStatus: 'ACTIVE' },
        })),
        update: jest.fn().mockImplementation(async () => {
          status = 'APPROVED';
          return updated;
        }),
      },
      gradingCertificationClaim: { updateMany: jest.fn() },
      verificationReview: { create: jest.fn().mockResolvedValue({ id: 'review-1' }) },
    };
    const service = submissionService(db, outbox);

    await expect(
      service.decide(
        reviewer,
        'submission-1',
        'APPROVED',
        { reasonCode: 'READY' },
        'request-1',
        'key-1',
      ),
    ).resolves.toMatchObject({ id: 'submission-1', status: 'APPROVED' });
    await expect(
      service.decide(
        reviewer,
        'submission-1',
        'APPROVED',
        { reasonCode: 'READY' },
        'request-2',
        'key-2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(db.assetSubmission.update).toHaveBeenCalledTimes(1);
    expect(outbox.append).toHaveBeenCalledTimes(1);
  });

  it('rejects a link for a submission that has not been approved', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          status: 'IN_REVIEW',
          assetId: null,
          ownerUserId: 'collector-1',
          normalizedCertificationNumber: null,
        }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      asset: { findUnique: jest.fn() },
    };

    await expect(
      submissionService(db).linkApprovedAsset(
        reviewer,
        'submission-1',
        'asset-1',
        'request-1',
        'key-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(db.asset.findUnique).not.toHaveBeenCalled();
    expect(db.assetSubmission.update).not.toHaveBeenCalled();
  });

  it('keeps a replayed approved link on the same Asset and creates no downstream authority', async () => {
    let linkedAssetId: string | null = null;
    const audit = jest.fn().mockResolvedValue(undefined);
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: 'submission-1',
          status: 'APPROVED',
          assetId: linkedAssetId,
          ownerUserId: 'collector-1',
          normalizedCertificationNumber: null,
        })),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ data }) => {
          linkedAssetId = data.assetId;
          return {
            id: 'submission-1',
            assetId: linkedAssetId,
            ownerUserId: 'collector-1',
          };
        }),
      },
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-1',
          certificationNumber: null,
          normalizedCertificationNumber: null,
          gradeScaleEntry: null,
        }),
        create: jest.fn(),
      },
      ownershipAssetSupply: { create: jest.fn() },
      assetPublication: { create: jest.fn() },
      vaultCustodyRecord: { create: jest.fn() },
    };
    const service = submissionService(db);
    (service as unknown as { mutate: (...args: Array<unknown>) => unknown }).mutate =
      async (...args) => {
        const work = args[7] as (
          transaction: typeof db,
          writeAudit: typeof audit,
        ) => Promise<unknown>;
        return work(db, audit);
      };

    await expect(
      service.linkApprovedAsset(reviewer, 'submission-1', 'asset-1', 'request-1', 'key-1'),
    ).resolves.toEqual({ submissionId: 'submission-1', assetId: 'asset-1' });
    await expect(
      service.linkApprovedAsset(reviewer, 'submission-1', 'asset-1', 'request-2', 'key-2'),
    ).resolves.toEqual({ submissionId: 'submission-1', assetId: 'asset-1' });

    expect(db.assetSubmission.update).toHaveBeenCalledTimes(2);
    expect(db.asset.create).not.toHaveBeenCalled();
    expect(db.ownershipAssetSupply.create).not.toHaveBeenCalled();
    expect(db.assetPublication.create).not.toHaveBeenCalled();
    expect(db.vaultCustodyRecord.create).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      'SUBMISSION_APPROVED_ASSET_LINKED',
      'submission',
      'submission-1',
      expect.objectContaining({ assetId: 'asset-1' }),
    );
  });

  it('rejects a conflicting second submission for the same Asset', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      assetSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          status: 'APPROVED',
          assetId: null,
          ownerUserId: 'collector-1',
          normalizedCertificationNumber: null,
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'submission-2' }),
        update: jest.fn(),
      },
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-1',
          certificationNumber: null,
          normalizedCertificationNumber: null,
          gradeScaleEntry: null,
        }),
      },
    };

    await expect(
      submissionService(db).linkApprovedAsset(
        reviewer,
        'submission-1',
        'asset-1',
        'request-1',
        'key-1',
      ),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ASSET_SUBMISSION_CONFLICT' }) });

    expect(db.assetSubmission.update).not.toHaveBeenCalled();
  });

  it('blocks an active duplicate graded certification claim', async () => {
    const db = {
      gradingCertificationClaim: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'claim-1',
          status: 'ACTIVE',
          submissionId: 'another-submission',
          assetId: 'another-asset',
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    await expect(
      (submissionService(db) as unknown as {
        claimCertification: (...args: Array<unknown>) => Promise<unknown>;
      }).claimCertification(db, 'PSA', '00012345', 'submission-1', 'asset-1'),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CERT_DUPLICATE_BLOCKED' }) });

    expect(db.gradingCertificationClaim.create).not.toHaveBeenCalled();
    expect(db.gradingCertificationClaim.update).not.toHaveBeenCalled();
  });

  it('creates a draft Asset without ownership, publication, or custody fields', async () => {
    const category = {
      id: 'category-1',
      slug: 'cards',
      name: 'Cards',
      iconKey: null,
      description: null,
      status: 'ACTIVE',
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never;
    const repository = {
      findCategoryById: jest.fn().mockResolvedValue(category),
      findSetById: jest.fn(),
      findGradeById: jest.fn(),
      findCompanyById: jest.fn(),
      createAsset: jest.fn().mockImplementation(async (input) => input),
    };
    const service = new CatalogueService({} as never, repository as never);
    (service as unknown as { mutate: (...args: Array<unknown>) => unknown }).mutate =
      async (...args) => {
        const work = args[7] as (
          repo: typeof repository,
          audit: () => Promise<void>,
        ) => Promise<unknown>;
        return work(repository, async () => undefined);
      };

    await service.createAsset(
      reviewer,
      { categoryId: 'category-1', title: 'Canonical boundary card' },
      'request-1',
      'key-1',
    );

    expect(repository.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DRAFT',
        publishedAt: null,
        title: 'Canonical boundary card',
      }),
    );
    expect(Object.keys(repository.createAsset.mock.calls[0][0])).not.toEqual(
      expect.arrayContaining([
        'ownershipSupply',
        'publication',
        'custodyRecord',
        'valuationDecision',
      ]),
    );
  });
});
