import {
  calculateWithdrawalVelocity,
  requiresDestinationScreening,
  WalletMovementService,
} from './wallet-movement.service';

describe('wallet movement risk controls', () => {
  it('calculates configured withdrawal windows without inventing a risk score', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    const totals = calculateWithdrawalVelocity(
      [
        { amountMinor: 100n, createdAt: new Date('2026-08-18T10:00:00.000Z') },
        { amountMinor: 250n, createdAt: new Date('2026-08-17T11:59:59.000Z') },
        { amountMinor: 900n, createdAt: new Date('2026-08-10T12:00:00.000Z') },
      ],
      50n,
      now,
    );

    expect(totals.total24h).toBe(150n);
    expect(totals.total7d).toBe(400n);
  });

  it('does not send Stripe Connect bank payouts through blockchain destination screening', () => {
    expect(requiresDestinationScreening('local')).toBe(true);
    expect(requiresDestinationScreening('stripe_sandbox')).toBe(false);
    expect(requiresDestinationScreening('stripe_live')).toBe(false);
  });

  it('refreshes Connect readiness before the withdrawal capability gate', async () => {
    const events: string[] = [];
    const recentAuth = {
      require: () => {
        events.push('recent-auth');
        throw new Error('stop before financial work');
      },
    };
    const service = new WalletMovementService(
      undefined as never,
      undefined as never,
      undefined as never,
      recentAuth as never,
      undefined as never,
      { providerMode: 'stripe_sandbox' } as never,
      undefined as never,
      {
        require: () => {
          events.push('capability');
        },
      } as never,
      undefined as never,
      {
        status: async () => {
          events.push('connect-status');
          return undefined;
        },
      } as never,
    );

    await expect(
      service.createWithdrawal(
        { userId: 'user-1', sessionId: 'session-1' } as never,
        '1000',
        'request-1',
        'idempotency-1',
      ),
    ).rejects.toThrow('stop before financial work');
    expect(events).toEqual(['connect-status', 'capability', 'recent-auth']);
  });
});
