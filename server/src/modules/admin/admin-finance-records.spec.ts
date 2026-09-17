import { AdminService } from './admin.service';

const actor = { userId: 'admin-1', sessionId: 'session-1' } as never;
const timestamp = new Date('2026-09-17T12:00:00.000Z');

function account(input: {
  id: string;
  ownerId: string;
  displayName: string;
  email: string;
  code: string;
  postedCreditMinor: bigint;
  reservedMinor?: bigint;
}) {
  return {
    id: input.id,
    ownerUserId: input.ownerId,
    ownerType: 'USER',
    accountType: 'LIABILITY',
    code: input.code,
    currency: 'GBP',
    normalSide: 'CREDIT',
    status: 'ACTIVE',
    financialDataClass: 'OPERATIONAL',
    createdAt: timestamp,
    updatedAt: timestamp,
    balance: {
      postedDebitMinor: 0n,
      postedCreditMinor: input.postedCreditMinor,
      reservedMinor: input.reservedMinor ?? 0n,
      updatedAt: timestamp,
    },
    owner: {
      id: input.ownerId,
      email: input.email,
      profile: { displayName: input.displayName, publicUsername: null },
    },
  };
}

describe('admin finance wallet projection', () => {
  it('presents a single wallet per customer while retaining an auditable account breakdown', async () => {
    const accounts = [
      account({
        id: 'cash-alice',
        ownerId: 'alice',
        displayName: 'Alice Collector',
        email: 'alice@example.test',
        code: 'CASH_AVAILABLE',
        postedCreditMinor: 116_321n,
        reservedMinor: 840n,
      }),
      account({
        id: 'hold-alice',
        ownerId: 'alice',
        displayName: 'Alice Collector',
        email: 'alice@example.test',
        code: 'BACS_RISK_HOLD',
        postedCreditMinor: 0n,
      }),
      account({
        id: 'cash-ben',
        ownerId: 'ben',
        displayName: 'Ben Collector',
        email: 'ben@example.test',
        code: 'CASH_AVAILABLE',
        postedCreditMinor: 5_000n,
      }),
    ];
    const db = {
      financialAccount: { findMany: jest.fn().mockResolvedValue(accounts) },
    };
    const authorize = jest.fn().mockResolvedValue(undefined);
    const service = new AdminService(
      db as never,
      { authorize } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.financeRecords(actor, {
      tab: 'wallets',
      dataClass: 'OPERATIONAL',
      page: 1,
      pageSize: 10,
    });

    expect(authorize).toHaveBeenCalledWith(actor, 'finance.read');
    expect(result.pagination).toMatchObject({ total: 2, totalPages: 1 });
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'wallet:alice:GBP',
          walletBalanceMinor: '116321',
          reservedMinor: '840',
          availableMinor: '115481',
          accountCount: 2,
          accountBreakdown: expect.arrayContaining([
            expect.objectContaining({
              id: 'cash-alice',
              code: 'CASH_AVAILABLE',
            }),
            expect.objectContaining({
              id: 'hold-alice',
              code: 'BACS_RISK_HOLD',
            }),
          ]),
        }),
        expect.objectContaining({ id: 'wallet:ben:GBP', accountCount: 1 }),
      ]),
    );
  });
});
