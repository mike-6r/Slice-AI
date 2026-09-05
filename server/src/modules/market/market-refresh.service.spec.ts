import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketRefreshService } from './market-refresh.service';

function createService(asset: { slug: string } | null, isBeta = false) {
  const db = {
    asset: {
      findUnique: jest.fn().mockResolvedValue(asset),
      findMany: jest.fn().mockResolvedValue([]),
    },
    marketProviderMapping: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as never;
  const config = { isBeta, marketRefreshBatchSize: 10 } as never;
  return new MarketRefreshService(db, {} as never, config);
}

describe('MarketRefreshService manual refresh eligibility', () => {
  it('allows an existing pre-publication asset to run a manual reference check', async () => {
    const service = createService({ slug: 'shohei-ohtani-aa-b38be808' });

    await expect(service.refreshAsset('asset-id')).resolves.toMatchObject({
      assetId: 'asset-id',
      queued: 0,
    });
  });

  it('returns a typed not-found error for an unknown asset', async () => {
    const service = createService(null);

    await expect(service.refreshAsset('missing-asset')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('keeps beta fixture assets excluded', async () => {
    const service = createService({ slug: 'slice-demo-shohei' }, true);

    await expect(service.refreshAsset('fixture-asset')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
