import { ConflictException } from '@nestjs/common';
import {
  assertInitialOfferingTransition,
  calculateInitialOfferingSettlement,
  validateOfferingTerms,
} from './initial-offering';

function codeOf(error: unknown) {
  return (error as ConflictException).getResponse() as { code?: string };
}

describe('initial offering economic authority', () => {
  it('supports a 60% offer with 40% retained ownership', () => {
    expect(validateOfferingTerms({ totalUnits: 1_000n, offeredUnits: 600n, pricePerUnitMinor: 164n, currency: 'GBP', approvedCurrency: 'GBP' })).toEqual({ retainedUnits: 400n, grossOfferingMinor: 98_400n });
  });

  it('supports a 100% offer with no retained units', () => {
    expect(validateOfferingTerms({ totalUnits: 1_000n, offeredUnits: 1_000n, pricePerUnitMinor: 100n, currency: 'GBP', approvedCurrency: 'GBP' }).retainedUnits).toBe(0n);
  });

  it.each([
    ['zero offered', 0n, 'OFFERED_UNITS_INVALID'],
    ['offered over supply', 1_001n, 'OFFERED_UNITS_EXCEEDS_SUPPLY'],
    ['negative price', -1n, 'PRICE_INVALID'],
  ])('rejects %s', (_label, offeredOrPrice, expected) => {
    expect(() => validateOfferingTerms({ totalUnits: 1_000n, offeredUnits: _label === 'negative price' ? 600n : offeredOrPrice, pricePerUnitMinor: _label === 'negative price' ? offeredOrPrice : 100n, currency: 'GBP', approvedCurrency: 'GBP' })).toThrow(ConflictException);
    try { validateOfferingTerms({ totalUnits: 1_000n, offeredUnits: _label === 'negative price' ? 600n : offeredOrPrice, pricePerUnitMinor: _label === 'negative price' ? offeredOrPrice : 100n, currency: 'GBP', approvedCurrency: 'GBP' }); } catch (error) { expect(codeOf(error).code).toBe(expected); }
  });

  it('preserves the money invariant for zero and explicit fees', () => {
    expect(calculateInitialOfferingSettlement(10_000n, 0)).toEqual({ grossMinor: 10_000n, feeMinor: 0n, collectorNetMinor: 10_000n });
    expect(calculateInitialOfferingSettlement(10_000n, 500)).toEqual({ grossMinor: 10_000n, feeMinor: 500n, collectorNetMinor: 9_500n });
  });

  it('does not allow an offering to bypass approval state', () => {
    expect(() => assertInitialOfferingTransition('AWAITING_APPROVAL', 'OPEN')).toThrow(ConflictException);
    expect(() => assertInitialOfferingTransition('APPROVED', 'OPEN')).not.toThrow();
  });
});
