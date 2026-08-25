import { WithdrawalPreflightService } from './withdrawal-preflight.service';

const now = new Date('2026-08-25T12:00:00.000Z');

function service(options?: {
  availableMinor?: number;
  pendingMinor?: number;
  walletAvailableMinor?: string;
  walletWithdrawableMinor?: string;
  activeReservationMinor?: bigint;
  maturityMinor?: bigint;
  maturityAt?: Date;
}) {
  const optionsWithDefaults = {
    availableMinor: 100_000,
    pendingMinor: 0,
    walletAvailableMinor: '10000',
    walletWithdrawableMinor: '10000',
    activeReservationMinor: 0n,
    maturityMinor: 0n,
    maturityAt: new Date('2026-09-01T00:00:00.000Z'),
    ...options,
  };
  const db = {
    moneyMovement: {
      aggregate: jest
        .fn()
        .mockResolvedValue({
          _sum: { amountMinor: optionsWithDefaults.maturityMinor },
        }),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          providerAvailableOn: optionsWithDefaults.maturityAt,
        }),
    },
    providerLiquidityReservation: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amountMinor: optionsWithDefaults.activeReservationMinor },
      }),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'reservation-1', status: 'ACTIVE' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback({
        $executeRaw: jest.fn(),
        providerLiquidityReservation: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amountMinor: optionsWithDefaults.activeReservationMinor },
          }),
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest
            .fn()
            .mockResolvedValue({ id: 'reservation-1', status: 'ACTIVE' }),
        },
      }),
    ),
  };
  const ledger = {
    walletForUser: jest.fn().mockResolvedValue({
      availableMinor: optionsWithDefaults.walletAvailableMinor,
      withdrawableMinor: optionsWithDefaults.walletWithdrawableMinor,
      reservedMinor: '0',
    }),
  };
  const stripe = {
    balance: {
      retrieve: jest.fn().mockResolvedValue({
        available: [
          { amount: optionsWithDefaults.availableMinor, currency: 'gbp' },
        ],
        pending: [
          { amount: optionsWithDefaults.pendingMinor, currency: 'gbp' },
        ],
      }),
    },
    balanceTransactions: {
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
  };
  const stripeFactory = {
    get: jest.fn().mockReturnValue(stripe),
    provider: jest.fn().mockReturnValue('STRIPE_SANDBOX'),
    environment: jest.fn().mockReturnValue('SANDBOX'),
  };
  const config = { providerMode: 'stripe_sandbox' };
  return {
    service: new WithdrawalPreflightService(
      db as never,
      ledger as never,
      stripeFactory as never,
      config as never,
    ),
    db,
    stripe,
  };
}

describe('WithdrawalPreflightService', () => {
  it('does not count pending provider funds as withdrawable liquidity', async () => {
    const { service: preflight } = service({
      availableMinor: -250,
      pendingMinor: 19_800,
      walletAvailableMinor: '19171',
      walletWithdrawableMinor: '19171',
    });

    const projection = await preflight.forUser('user-1', '5000', false, now);

    expect(projection.withdrawableMinor).toBe('0');
    expect(projection.providerLiquidityStatus).toBe('INSUFFICIENT');
    expect(projection.walletAvailableMinor).toBe('19171');
    expect(projection.tradeAvailableMinor).toBe('19171');
    expect(projection.maturityStatus).toBe('MATURED');
    expect(projection.settlingMinor).toBe('0');
  });

  it('surfaces provider maturity separately from internal available cash', async () => {
    const { service: preflight } = service({
      availableMinor: 100_000,
      walletAvailableMinor: '10000',
      walletWithdrawableMinor: '10000',
      maturityMinor: 10_000n,
    });

    const projection = await preflight.forUser('user-1', '1000', false, now);

    expect(projection.walletAvailableMinor).toBe('10000');
    expect(projection.withdrawableMinor).toBe('0');
    expect(projection.settlingMinor).toBe('10000');
    expect(projection.tradeAvailableMinor).toBe('10000');
    expect(projection.maturityStatus).toBe('SETTLING');
    expect(projection.customerEligibilityStatus).toBe('MATURITY_PENDING');
    expect(projection.nextAvailabilityAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('allows only a provider-funded amount and keeps the customer fee separate', async () => {
    const { service: preflight } = service({
      availableMinor: 4_875,
      walletAvailableMinor: '10000',
      walletWithdrawableMinor: '10000',
    });

    const projection = await preflight.forUser('user-1', '5000', false, now);

    expect(projection.providerLiquidityStatus).toBe('AVAILABLE');
    expect(projection.grossMinor).toBe('5000');
    expect(projection.feeMinor).toBe('125');
    expect(projection.netPayoutMinor).toBe('4875');
    expect(projection.withdrawableMinor).toBe('5000');
    expect(projection.customerEligibleMinor).toBe('10000');
  });

  it('blocks a non-zero withdrawal when provider available GBP is exactly zero', async () => {
    const { service: preflight } = service({ availableMinor: 0 });

    const projection = await preflight.forUser('user-1', '1', false, now);

    expect(projection.providerLiquidityStatus).toBe('INSUFFICIENT');
    expect(projection.withdrawableMinor).toBe('0');
  });

  it('refreshes provider liquidity when the balance changes', async () => {
    const { service: preflight, stripe } = service({ availableMinor: 100_000 });

    await preflight.forUser('user-1', '5000', false, now);
    stripe.balance.retrieve.mockResolvedValue({
      available: [{ amount: 0, currency: 'gbp' }],
      pending: [{ amount: 100_000, currency: 'gbp' }],
    });

    const projection = await preflight.forUser('user-1', '5000', true, now);

    expect(projection.providerLiquidityStatus).toBe('INSUFFICIENT');
    expect(projection.withdrawableMinor).toBe('0');
  });

  it('subtracts existing provider-liquidity reservations before allowing a payout', async () => {
    const { service: preflight } = service({
      availableMinor: 10_000,
      activeReservationMinor: 6_000n,
    });

    const projection = await preflight.forUser('user-1', '5000', false, now);

    expect(projection.providerLiquidityStatus).toBe('INSUFFICIENT');
    expect(projection.withdrawableMinor).toBe('4102');
  });

  it('does not report a negative provider balance as available for an overview check', async () => {
    const { service: preflight } = service({
      availableMinor: -1,
      walletAvailableMinor: '0',
      walletWithdrawableMinor: '0',
    });

    const projection = await preflight.forUser('user-1', '0', false, now);

    expect(projection.providerLiquidityStatus).toBe('INSUFFICIENT');
    expect(projection.maturityStatus).toBe('NOT_AVAILABLE');
  });

  it('rejects a provider reservation when available balance is insufficient', async () => {
    const { service: preflight } = service({ availableMinor: 4_874 });

    await expect(
      preflight.reserveProviderLiquidity('movement-1', '4875'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROVIDER_LIQUIDITY_UNAVAILABLE',
      }),
    });
  });
});
