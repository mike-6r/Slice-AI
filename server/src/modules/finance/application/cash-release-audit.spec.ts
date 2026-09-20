import { FinancialLedgerService } from './financial-ledger.service';

describe('system cash-release audit contract', () => {
  // Keep the real ledger method, identity adapter and metadata sanitizer.
  // Only persistence is stubbed; these tests do not move any real funds.
  function setup() {
    let status = 'ACTIVE';
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      cashReservation: {
        findUnique: jest.fn().mockImplementation(async () => ({
          id: 'reservation-1',
          accountId: 'account-1',
          amountMinor: 12500n,
          status,
        })),
        update: jest.fn().mockImplementation(async () => {
          status = 'RELEASED';
        }),
      },
      accountBalance: {
        findUnique: jest.fn().mockResolvedValue({ reservedMinor: 12500n }),
        update: jest.fn().mockResolvedValue({}),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const ledger = new FinancialLedgerService(db as never, {} as never);
    return { db, ledger };
  }

  it('persists the expiry reason and only releases an active reservation once', async () => {
    const { db, ledger } = setup();
    const release = () =>
      ledger.releaseCashReservationInTransaction(
        db as never,
        'reservation-1',
        'expiry-request',
        'Physical intake deadline expired.',
      );
    await expect(release()).resolves.toBe(true);
    expect(db.accountBalance.update).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      data: { reservedMinor: { decrement: 12500n }, version: { increment: 1 } },
    });
    expect(db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'SYSTEM',
        actorUserId: null,
        action: 'FINANCE_CASH_RELEASED',
        resourceId: 'reservation-1',
        requestId: 'expiry-request',
        metadata: {
          amountMinor: '12500',
          reason: 'Physical intake deadline expired.',
        },
      }),
    });
    await expect(release()).resolves.toBe(false);
    expect(db.accountBalance.update).toHaveBeenCalledTimes(1);
    expect(db.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('propagates audit persistence failures to the surrounding transaction', async () => {
    const { db, ledger } = setup();
    db.auditEvent.create.mockRejectedValueOnce(
      new Error('AUDIT_STORAGE_UNAVAILABLE'),
    );
    await expect(
      ledger.releaseCashReservationInTransaction(
        db as never,
        'reservation-1',
        'expiry-request',
      ),
    ).rejects.toThrow('AUDIT_STORAGE_UNAVAILABLE');
  });
});
