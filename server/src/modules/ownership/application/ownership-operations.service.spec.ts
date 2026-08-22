import { NotFoundException } from '@nestjs/common';
import { OwnershipOperationsService } from './ownership-operations.service';

describe('OwnershipOperationsService market position reads', () => {
  function createService() {
    const db = {
      asset: { findFirst: jest.fn() },
      ownershipAccount: { findUnique: jest.fn() },
      ownershipPosition: { findUnique: jest.fn() },
    };
    return {
      db,
      service: new OwnershipOperationsService(db as never, {} as never),
    };
  }

  const actor = { userId: 'user_123' } as never;

  it('returns an empty projection when the account has no ownership position', async () => {
    const { db, service } = createService();
    db.asset.findFirst.mockResolvedValue({ id: 'asset_123' });
    db.ownershipAccount.findUnique.mockResolvedValue(null);

    await expect(service.ownMarketPosition(actor, 'asset-slug')).resolves.toBeNull();
  });

  it('returns the position projection when ownership exists', async () => {
    const { db, service } = createService();
    db.asset.findFirst.mockResolvedValue({ id: 'asset_123' });
    db.ownershipAccount.findUnique.mockResolvedValue({ id: 'account_123' });
    db.ownershipPosition.findUnique.mockResolvedValue({
      settledUnits: 100n,
      reservedUnits: 25n,
    });

    await expect(service.ownMarketPosition(actor, 'asset-slug')).resolves.toEqual({
      assetId: 'asset_123',
      settledUnits: '100',
      reservedUnits: '25',
      availableUnits: '75',
    });
  });

  it('keeps an unknown published slug as a 404', async () => {
    const { db, service } = createService();
    db.asset.findFirst.mockResolvedValue(null);

    await expect(service.ownMarketPosition(actor, 'missing-slug')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
