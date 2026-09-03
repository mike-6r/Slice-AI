import {
  calculateProvisionalTerms,
  evaluateQualification,
  qualificationCustomerStatus,
} from './qualification.policy';

const policy = {
  version: 'TEST', enabled: true, enabledCategories: [], enabledGraders: ['PSA'],
  qaSamplingBps: 0, autoPreSaleLaunch: true, defaultPreSaleSupply: 1000n, emergencyDisabled: false,
};
const base = {
  category: 'sports', grader: 'PSA', policy, accountStatus: 'ACTIVE',
  identity: { name: 'Card', year: '2026', set: 'Set', cardNumber: '1', grade: '10' },
  certification: { status: 'CLEAR', verifiedGrade: '10' }, certificationClaimedByOther: false,
  media: ['front', 'back', 'grading-label'].map((slot) => ({ slot, status: 'SAFE', deletedAt: null, sizeBytes: 10 })),
  possession: true, intakeValid: true, terms: calculateProvisionalTerms({ collectorExpectedValueMinor: '100000', offerIntentPercent: '50' }, 1000n), marketState: 'FOUND',
};

describe('automated qualification policy', () => {
  it('auto-qualifies a clean supported graded card', () => {
    const result = evaluateQualification(base);
    expect(result.outcome).toBe('AUTO_QUALIFIED');
    expect(qualificationCustomerStatus(result.outcome)).toBe('PRE_SALE_QUALIFIED');
  });
  it('routes raw cards to staff without exposing a trust score', () => {
    const result = evaluateQualification({ ...base, grader: 'Ungraded', certification: null, media: base.media.slice(0, 2) });
    expect(result.outcome).toBe('HUMAN_REVIEW_REQUIRED');
  });
  it('routes fixable listing data to the collector', () => {
    const result = evaluateQualification({ ...base, possession: false, intakeValid: false });
    expect(result.outcome).toBe('COLLECTOR_ACTION_REQUIRED');
  });
  it('blocks a certification conflict', () => {
    const result = evaluateQualification({ ...base, certificationClaimedByOther: true });
    expect(result.outcome).toBe('BLOCKED');
  });
  it('calculates integer provisional supply terms', () => {
    const terms = calculateProvisionalTerms({ collectorExpectedValueMinor: '100000', offerIntentPercent: '62.5' }, 1000n);
    expect(terms?.offeredUnits).toBe(625n);
    expect(terms?.pricePerUnitMinor).toBe(100n);
  });
});
