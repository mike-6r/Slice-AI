import { formatOwnershipPercent } from './trading.service';

describe('formatOwnershipPercent', () => {
  it('converts ownership units to customer-facing percentages exactly once', () => {
    expect(formatOwnershipPercent(50n, 1_000n)).toBe('5');
    expect(formatOwnershipPercent(300n, 1_000n)).toBe('30');
    expect(formatOwnershipPercent(5n, 1_000n)).toBe('0.5');
  });

  it('returns zero when no issuance denominator exists', () => {
    expect(formatOwnershipPercent(50n, 0n)).toBe('0');
  });
});
