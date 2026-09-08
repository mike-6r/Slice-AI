import {
  calculateProvisionalTerms,
  defaultQualificationPolicyForEnvironment,
  evaluateQualification,
  normalizeGrade,
  qualificationCustomerStatus,
  qualificationPolicyKey,
} from './qualification.policy';

const policy = {
  version: 'TEST',
  enabled: true,
  enabledCategories: [],
  enabledGraders: ['PSA'],
  qaSamplingBps: 0,
  autoPreSaleLaunch: true,
  defaultPreSaleSupply: 1000n,
  emergencyDisabled: false,
};
const base = {
  category: 'sports',
  grader: 'PSA',
  policy,
  accountStatus: 'ACTIVE',
  identity: {
    name: 'Card',
    year: '2026',
    set: 'Set',
    cardNumber: '1',
    grade: '10',
  },
  certification: {
    duplicateStatus: 'CLEAR',
    providerStatus: 'VERIFIED',
    verifiedGrade: '10',
  },
  certificationClaimedByOther: false,
  media: ['front', 'back', 'grading-label'].map((slot) => ({
    slot,
    status: 'SAFE',
    deletedAt: null,
    sizeBytes: 10,
  })),
  possession: true,
  intakeValid: true,
  terms: calculateProvisionalTerms(
    { collectorExpectedValueMinor: '100000', offerIntentPercent: '50' },
    1000n,
  ),
  marketState: 'FOUND',
};

describe('automated qualification policy', () => {
  it('enables fresh test and beta policies while production defaults fail safe', () => {
    expect(defaultQualificationPolicyForEnvironment('test').enabled).toBe(true);
    expect(defaultQualificationPolicyForEnvironment('beta').enabled).toBe(true);
    expect(defaultQualificationPolicyForEnvironment('production').enabled).toBe(
      false,
    );
    expect(qualificationPolicyKey('beta')).toBe('environment:beta');
    expect(qualificationPolicyKey('production')).toBe('environment:production');
  });

  it('auto-qualifies a clean supported graded card', () => {
    const result = evaluateQualification(base);
    expect(result.outcome).toBe('AUTO_QUALIFIED');
    expect(qualificationCustomerStatus(result.outcome)).toBe(
      'PRE_SALE_QUALIFIED',
    );
  });
  it('routes raw cards to staff without exposing a trust score', () => {
    const result = evaluateQualification({
      ...base,
      grader: 'Ungraded',
      certification: null,
      media: base.media.slice(0, 2),
    });
    expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
  });
  it('routes fixable listing data to the collector', () => {
    const result = evaluateQualification({
      ...base,
      possession: false,
      intakeValid: false,
    });
    expect(result.outcome).toBe('COLLECTOR_ACTION_REQUIRED');
  });
  it('blocks a certification conflict', () => {
    const result = evaluateQualification({
      ...base,
      certificationClaimedByOther: true,
    });
    expect(result.outcome).toBe('BLOCKED');
  });
  it('does not auto-qualify a Slice-clear certificate without provider grade evidence', () => {
    const result = evaluateQualification({
      ...base,
      certification: {
        duplicateStatus: 'CLEAR',
        providerStatus: null,
        verifiedGrade: null,
      },
    });
    expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        code: 'CERTIFICATION_PROVIDER',
        result: 'UNCERTAIN',
      }),
    );
  });
  it('routes a provider grade mismatch away from auto qualification', () => {
    const result = evaluateQualification({
      ...base,
      certification: {
        duplicateStatus: 'CLEAR',
        providerStatus: 'MISMATCH',
        verifiedGrade: '9.00',
      },
    });
    expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
    expect(result.reasons.join(' ')).toContain('10');
    expect(result.reasons.join(' ')).toContain('9.00');
  });
  it.each(['CERT_NOT_FOUND', 'TEMPORARILY_UNAVAILABLE', 'UNSUPPORTED'])(
    'routes provider state %s to staff review without inventing a grade',
    (providerStatus) => {
      const result = evaluateQualification({
        ...base,
        certification: {
          duplicateStatus: 'CLEAR',
          providerStatus,
          verifiedGrade: null,
        },
      });
      expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
    },
  );
  it('calculates integer provisional supply terms', () => {
    const terms = calculateProvisionalTerms(
      { collectorExpectedValueMinor: '100000', offerIntentPercent: '62.5' },
      1000n,
    );
    expect(terms?.offeredUnits).toBe(625n);
    expect(terms?.pricePerUnitMinor).toBe(100n);
  });
  it('compares equivalent grade representations consistently', () => {
    expect(normalizeGrade('10')).toBe('10.00');
    expect(normalizeGrade('10.00')).toBe('10.00');
  });
});
