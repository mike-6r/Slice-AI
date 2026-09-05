import { MarketService } from './market.service';

const currentAsset = {
  id: 'current-asset',
  categoryId: 'pokemon',
  setId: 'set-a',
};

function createService(
  row: Record<string, unknown>,
  executions: unknown[] = [],
  baseline: unknown[] = [],
) {
  const db = {
    asset: {
      findFirst: jest.fn().mockResolvedValue(currentAsset),
      findMany: jest.fn().mockResolvedValue([row]),
    },
    tradingExecution: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(executions)
        .mockResolvedValueOnce(baseline),
    },
  };
  const storage = {
    createPrivateDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://cdn.example/thumb.jpg'),
  };
  const service = new MarketService(
    db as never,
    {} as never,
    { all: () => [] } as never,
    { isBeta: false } as never,
    storage as never,
  );
  return { service, db };
}

describe('MarketService public media delivery', () => {
  it('reads approved media server-side for a stable same-origin public image route', async () => {
    const storage = {
      head: jest.fn().mockResolvedValue({
        mimeType: 'application/octet-stream',
        magicMimeType: 'image/png',
      }),
      read: jest.fn().mockResolvedValue(Buffer.from('png-bytes')),
    };
    const db = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          ...currentAsset,
          submissions: [
            {
              media: [{ slot: 'front', objectKey: 'submissions/card/front' }],
            },
          ],
        }),
      },
    };
    const service = new MarketService(
      db as never,
      {} as never,
      { all: () => [] } as never,
      { isBeta: false } as never,
      storage as never,
    );

    await expect(
      service.media('shohei-ohtani-aa-b38be808', 'FRONT'),
    ).resolves.toEqual({
      body: Buffer.from('png-bytes'),
      mimeType: 'image/png',
    });
    expect(storage.read).toHaveBeenCalledWith('submissions/card/front');
  });
});

const baseRow = {
  id: 'similar-asset',
  publicId: 'similar-public-id',
  slug: 'similar-card',
  title: 'Similar Card',
  cardNumber: '1/10',
  category: { slug: 'pokemon' },
  collectibleSet: { name: 'Test Set' },
  initialOffering: null,
  tradingMarket: { status: 'OPEN', tradingEnabled: true },
  valuationDecisions: [],
  submissions: [{ media: [{ slot: 'FRONT', objectKey: 'public/thumb.jpg' }] }],
};

describe('MarketService similar-assets projection', () => {
  it('excludes the current asset and returns a real settled sale plus 24h movement', async () => {
    const latestAt = new Date(Date.now() - 60 * 60 * 1000);
    const baselineAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const { service, db } = createService(
      baseRow,
      [{ assetId: 'similar-asset', priceMinor: 150n, executedAt: latestAt }],
      [{ assetId: 'similar-asset', priceMinor: 100n, executedAt: baselineAt }],
    );

    await expect(service.similar('current-card', 1)).resolves.toMatchObject({
      items: [
        {
          assetId: 'similar-public-id',
          displayPrice: {
            type: 'LAST_EXECUTION',
            amount: { minor: '150', currency: 'GBP' },
          },
          movement24hBps: 5000,
          marketState: 'LIVE_MARKET',
          thumbnail: { url: 'https://cdn.example/thumb.jpg' },
        },
      ],
    });
    expect(db.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'current-asset' } }),
        take: 1,
      }),
    );
  });

  it('labels an open initial offering as a per-Slice price instead of using valuation fallback', async () => {
    const { service } = createService({
      ...baseRow,
      initialOffering: {
        status: 'OPEN',
        pricePerUnitMinor: 164n,
        currency: 'GBP',
        updatedAt: new Date('2026-08-23T12:00:00.000Z'),
      },
      valuationDecisions: [
        {
          id: 'valuation',
          valueMinor: 222500n,
          currency: 'GBP',
          confidence: 90,
          methodologyCode: 'MANUAL',
          decidedAt: new Date('2026-08-23T11:00:00.000Z'),
          status: 'ACTIVE',
        },
      ],
    });

    await expect(service.similar('current-card', 1)).resolves.toMatchObject({
      items: [
        {
          displayPrice: {
            type: 'INITIAL_OFFERING',
            amount: { minor: '164', currency: 'GBP' },
          },
        },
      ],
    });
  });
});

describe('MarketService persisted PriceCharting history', () => {
  it('uses the current mapping and real observations without valuation fallback', async () => {
    const observations = [
      {
        id: 'current-2',
        assetId: 'current-asset',
        providerCode: 'PRICECHARTING',
        providerExternalId: 'current-product-id',
        observationType: 'PRICE_GUIDE',
        priceMinor: 1_200n,
        currency: 'USD',
        grader: null,
        grade: null,
        included: true,
        matchQuality: 'EXACT',
        observedAt: new Date('2026-08-24T12:00:00.000Z'),
      },
      {
        id: 'current-1',
        assetId: 'current-asset',
        providerCode: 'PRICECHARTING',
        providerExternalId: 'current-product-id',
        observationType: 'PRICE_GUIDE',
        priceMinor: 1_000n,
        currency: 'USD',
        grader: null,
        grade: null,
        included: true,
        matchQuality: 'EXACT',
        observedAt: new Date('2026-08-20T12:00:00.000Z'),
      },
      {
        id: 'old-product',
        assetId: 'current-asset',
        providerCode: 'PRICECHARTING',
        providerExternalId: 'old-product-id',
        observationType: 'PRICE_GUIDE',
        priceMinor: 900n,
        currency: 'USD',
        grader: null,
        grade: null,
        included: true,
        matchQuality: 'EXACT',
        observedAt: new Date('2026-08-24T12:00:00.000Z'),
      },
    ];
    const db = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          ...currentAsset,
          slug: 'current-card',
          gradeScaleEntry: null,
          marketProviderMappings: [
            {
              providerExternalId: 'current-product-id',
              lastSuccessAt: new Date('2026-08-24T12:01:00.000Z'),
            },
          ],
        }),
      },
      marketObservation: { findMany: jest.fn().mockResolvedValue(observations) },
    };
    const service = new MarketService(
      db as never,
      {} as never,
      { all: () => [] } as never,
      { isBeta: false } as never,
      { createPrivateDownloadUrl: jest.fn() } as never,
    );

    await expect(service.history('current-card', 'ALL')).resolves.toMatchObject({
      source: 'PRICECHARTING',
      series: 'UNGRADED',
      availableSeries: ['UNGRADED'],
      historyPointCount: 2,
      latestValue: { minor: '1200', currency: 'USD' },
      movementAvailability: 'AVAILABLE',
    });
    expect(db.marketObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ providerExternalId: 'current-product-id' }),
      }),
    );
  });
});
