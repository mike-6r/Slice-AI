import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Slice product policy: a standard platform template proposes a sensible
 * fractional supply, but every asset still requires an explicit Admin
 * proposal and approval before the immutable ownership ledger can be issued.
 */
export const STANDARD_OWNERSHIP_POLICY = {
  code: 'STANDARD_COLLECTIBLE_V1',
  label: 'Standard collectible',
  minimumUnits: 100n,
  maximumUnits: 100_000n,
  defaultUnits: 1_000n,
  candidates: [100n, 1_000n, 10_000n],
  rounding: 'FLOOR_RETAIN_REMAINDER' as const,
};

export function validatePolicyUnits(units: bigint) {
  if (
    units < STANDARD_OWNERSHIP_POLICY.minimumUnits ||
    units > STANDARD_OWNERSHIP_POLICY.maximumUnits
  ) {
    throw new UnprocessableEntityException({
      code: 'SUPPLY_POLICY_RANGE_INVALID',
      message: `Supply must be between ${STANDARD_OWNERSHIP_POLICY.minimumUnits} and ${STANDARD_OWNERSHIP_POLICY.maximumUnits} units.`,
    });
  }
}

export function previewPolicyPrice(valueMinor: bigint, units: bigint) {
  validatePolicyUnits(units);
  if (valueMinor < 0n) {
    throw new UnprocessableEntityException({
      code: 'SUPPLY_POLICY_VALUATION_INVALID',
      message: 'A non-negative authoritative valuation is required.',
    });
  }
  const pricePerUnitMinor = valueMinor / units;
  const remainderMinor = valueMinor % units;
  return {
    pricePerUnitMinor,
    remainderMinor,
    impliedWholeValueMinor: pricePerUnitMinor * units,
  };
}

export function policyPreview(valueMinor: bigint | null, units: bigint) {
  validatePolicyUnits(units);
  if (valueMinor === null) return null;
  const preview = previewPolicyPrice(valueMinor, units);
  return {
    units: units.toString(),
    pricePerUnitMinor: preview.pricePerUnitMinor.toString(),
    remainderMinor: preview.remainderMinor.toString(),
    impliedWholeValueMinor: preview.impliedWholeValueMinor.toString(),
  };
}
