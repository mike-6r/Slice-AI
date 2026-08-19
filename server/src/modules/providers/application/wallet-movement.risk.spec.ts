import { calculateWithdrawalVelocity } from './wallet-movement.service';

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
});
