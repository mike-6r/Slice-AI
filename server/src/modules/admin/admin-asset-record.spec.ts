import { AdminService } from './admin.service';

describe('admin authoritative asset record resolver', () => {
  const actor = { userId: 'admin-1', sessionId: null } as never;

  function serviceFor(value: unknown) {
    const authorize = jest.fn().mockResolvedValue(undefined);
    const db = {
      assetSubmission: { findFirst: jest.fn().mockResolvedValue(value) },
    };
    return {
      authorize,
      db,
      service: new AdminService(
        db as never,
        { authorize } as never,
        { evaluate: jest.fn() } as never,
        { isBeta: true } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    };
  }

  it('resolves submission, canonical asset, public id, and slug through one lineage query', async () => {
    const fixture = {
      id: 'submission-1',
      status: 'APPROVED',
      declaredMetadata: { name: 'Collector title' },
      asset: {
        id: 'asset-1',
        publicId: 'SLICE-0001',
        slug: 'pikachu-ex',
        title: 'Pikachu Ex',
        status: 'VERIFIED',
      },
    };
    const { service, authorize, db } = serviceFor(fixture);

    await expect(
      service.resolveAssetRecord(actor, 'SLICE-0001'),
    ).resolves.toEqual({
      recordId: 'asset-1',
      authority: 'ASSET',
      assetId: 'asset-1',
      submissionId: 'submission-1',
      title: 'Pikachu Ex',
      lifecycleStatus: 'VERIFIED',
      intakeAvailable: true,
    });
    expect(authorize).toHaveBeenCalledWith(actor, 'admin.console.read');
    expect(db.assetSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            { id: 'SLICE-0001' },
            { assetId: 'SLICE-0001' },
            { asset: { is: { publicId: 'SLICE-0001' } } },
            { asset: { is: { slug: 'SLICE-0001' } } },
          ]),
        },
      }),
    );
  });

  it('keeps a pre-canonical submission as the authoritative record until an asset exists', async () => {
    const { service } = serviceFor({
      id: 'submission-2',
      status: 'UNDER_REVIEW',
      declaredMetadata: { name: 'Pikachu With Grey Felt Hat' },
      asset: null,
    });
    await expect(
      service.resolveAssetRecord(actor, 'submission-2'),
    ).resolves.toMatchObject({
      recordId: 'submission-2',
      authority: 'SUBMISSION',
      assetId: null,
      submissionId: 'submission-2',
      title: 'Pikachu With Grey Felt Hat',
      intakeAvailable: false,
    });
  });
  it('keeps existing intake available across submission status changes', async () => {
    const { service } = serviceFor({
      id: 'submission-3',
      status: 'CHANGES_REQUESTED',
      asset: null,
      declaredMetadata: {},
      intake: { id: 'intake-3' },
    });
    await expect(
      service.resolveAssetRecord(actor, 'submission-3'),
    ).resolves.toMatchObject({ intakeAvailable: true });
  });
  it('does not expose retired fixture intake as an operational stage', async () => {
    const { service } = serviceFor({
      id: 'retired',
      status: 'APPROVED',
      asset: null,
      declaredMetadata: { betaFixtureRetired: true },
      intake: { id: 'retired-intake' },
    });
    await expect(
      service.resolveAssetRecord(actor, 'retired'),
    ).resolves.toMatchObject({ intakeAvailable: false });
  });
});
