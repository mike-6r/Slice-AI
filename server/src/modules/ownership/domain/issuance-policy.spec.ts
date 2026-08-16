import {
  policyPreview,
  previewPolicyPrice,
  STANDARD_OWNERSHIP_POLICY,
  validatePolicyUnits,
} from './issuance-policy';

describe('standard ownership issuance policy', () => {
  it('uses integer floor division and retains the remainder', () => {
    expect(previewPolicyPrice(2_225n, 1_000n)).toEqual({
      pricePerUnitMinor: 2n,
      remainderMinor: 225n,
      impliedWholeValueMinor: 2_000n,
    });
  });

  it('exposes the configured candidate supply previews', () => {
    expect(STANDARD_OWNERSHIP_POLICY.candidates).toEqual([100n, 1_000n, 10_000n]);
    expect(policyPreview(100_000n, 10_000n)).toMatchObject({
      units: '10000',
      pricePerUnitMinor: '10',
      remainderMinor: '0',
    });
  });

  it('rejects quantities outside the explicit policy range', () => {
    expect(() => validatePolicyUnits(99n)).toThrow();
    expect(() => validatePolicyUnits(100_001n)).toThrow();
  });
});
