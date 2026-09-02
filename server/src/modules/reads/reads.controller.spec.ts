import { ReadsController } from './reads.controller';

describe('ReadsController public collectors', () => {
  const publicRow = {
    id: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    profile: {
      displayName: 'Public Collector',
      publicUsername: 'public-collector',
      avatarReference: null,
    },
    publicCollectorProfile: {
      slug: 'public-collector',
      headline: 'Cards',
      specialism: 'TCG',
      isFeatured: false,
      featurePriority: 0,
      featuredCaption: null,
      featuredAt: null,
      publishedAt: new Date('2026-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    _count: { submissions: 1 },
    submissions: [
      {
        media: [],
        asset: {
          publicId: 'asset-1',
          slug: 'asset-1',
          title: 'Pikachu',
          shortName: null,
          collectibleSet: null,
          publishedAt: new Date('2026-01-03T00:00:00.000Z'),
          gradeScaleEntry: null,
          category: { name: 'Pokémon' },
          marketSnapshots: [],
        },
      },
    ],
  };

  function controller() {
    const user = {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([publicRow]),
      findFirst: jest.fn(),
    };
    const assetSubmission = { count: jest.fn().mockResolvedValue(1) };
    const publicCollectorProfile = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    const asset = { findMany: jest.fn().mockResolvedValue([]) };
    const db = {
      user,
      assetSubmission,
      publicCollectorProfile,
      asset,
    } as never;
    const storage = {
      createPrivateDownloadUrl: jest.fn().mockResolvedValue(null),
    } as never;
    return {
      instance: new ReadsController(
        db,
        {} as never,
        { isBeta: false } as never,
        storage,
      ),
      user,
      assetSubmission,
    };
  }

  it('requires public visibility and a published asset in the authoritative query', async () => {
    const { instance, user } = controller();

    const result = await instance.collectors(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '1',
      '12',
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      username: 'public-collector',
      publishedListingCount: 1,
    });
    expect(user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        accountStatus: 'ACTIVE',
        publicCollectorProfile: { is: { isPublic: true } },
        submissions: {
          some: { status: 'APPROVED', asset: { is: { status: 'PUBLISHED' } } },
        },
      }),
    });
  });

  it('searches published asset title and category through the backend query', async () => {
    const { instance, user } = controller();

    await instance.collectors(
      undefined,
      undefined,
      'Pokémon',
      undefined,
      undefined,
      '1',
      '12',
    );

    const where = user.count.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          submissions: expect.objectContaining({
            some: expect.objectContaining({
              asset: expect.objectContaining({
                is: expect.objectContaining({
                  OR: expect.arrayContaining([
                    { title: { contains: 'Pokémon', mode: 'insensitive' } },
                  ]),
                }),
              }),
            }),
          }),
        }),
      ]),
    );
  });
});
