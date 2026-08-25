import { bacsReleaseAt, isBacsReleaseEligible } from './financial-ledger.service';
import { evaluateDepositLimits } from '../../providers/application/wallet-movement.service';

describe('approved initial financial launch policy boundaries', () => {
  it('releases Bacs funds exactly at providerAvailableOn plus seven days', () => {
    const availableOn = new Date('2026-08-01T12:00:00.000Z');
    const releaseAt = bacsReleaseAt(availableOn, 7);
    expect(releaseAt.toISOString()).toBe('2026-08-08T12:00:00.000Z');
    expect(isBacsReleaseEligible(availableOn, 7, new Date('2026-08-08T11:59:59.999Z'))).toBe(false);
    expect(isBacsReleaseEligible(availableOn, 7, releaseAt)).toBe(true);
  });

  it('allows the £5,000 per-deposit boundary and blocks one penny above it', () => {
    const policy = { maxMinor: 500_000, dailyLimitMinor: 500_000, rolling7dLimitMinor: 1_000_000, dailyCountLimit: 2, rapidCountLimit: 1 };
    const empty = { dailyTotal: 0n, rolling7dTotal: 0n, dailyCount: 0, rapidCount: 0 };
    expect(evaluateDepositLimits(500_000n, empty, policy)).toBeNull();
    expect(evaluateDepositLimits(500_001n, empty, policy)).toBe('DEPOSIT_LIMIT_EXCEEDED');
  });

  it('enforces daily, rolling, count, and rapid boundaries without a hidden score', () => {
    expect(evaluateDepositLimits(1n, { dailyTotal: 499_999n, rolling7dTotal: 0n, dailyCount: 0, rapidCount: 0 }, { dailyLimitMinor: 500_000 })).toBeNull();
    expect(evaluateDepositLimits(2n, { dailyTotal: 499_999n, rolling7dTotal: 0n, dailyCount: 0, rapidCount: 0 }, { dailyLimitMinor: 500_000 })).toBe('DEPOSIT_DAILY_LIMIT_EXCEEDED');
    expect(evaluateDepositLimits(1n, { dailyTotal: 0n, rolling7dTotal: 999_999n, dailyCount: 0, rapidCount: 0 }, { rolling7dLimitMinor: 1_000_000 })).toBeNull();
    expect(evaluateDepositLimits(2n, { dailyTotal: 0n, rolling7dTotal: 999_999n, dailyCount: 0, rapidCount: 0 }, { rolling7dLimitMinor: 1_000_000 })).toBe('DEPOSIT_ROLLING_LIMIT_EXCEEDED');
    expect(evaluateDepositLimits(1n, { dailyTotal: 0n, rolling7dTotal: 0n, dailyCount: 1, rapidCount: 0 }, { dailyCountLimit: 2 })).toBeNull();
    expect(evaluateDepositLimits(1n, { dailyTotal: 0n, rolling7dTotal: 0n, dailyCount: 2, rapidCount: 0 }, { dailyCountLimit: 2 })).toBe('DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED');
    expect(evaluateDepositLimits(1n, { dailyTotal: 0n, rolling7dTotal: 0n, dailyCount: 0, rapidCount: 0 }, { rapidCountLimit: 1 })).toBeNull();
    expect(evaluateDepositLimits(1n, { dailyTotal: 0n, rolling7dTotal: 0n, dailyCount: 0, rapidCount: 1 }, { rapidCountLimit: 1 })).toBe('DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED');
  });
});
