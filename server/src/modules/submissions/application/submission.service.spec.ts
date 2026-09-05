import {
  certificationVerificationResolved,
  collectorConditionValue,
} from './submission.service';

describe('certification verification resolution', () => {
  it('uses the same resolved statuses for readiness and approval', () => {
    expect(certificationVerificationResolved('CLEAR')).toBe(true);
    expect(certificationVerificationResolved('VERIFIED')).toBe(true);
    expect(certificationVerificationResolved('MANUAL_REVIEW')).toBe(true);
    expect(certificationVerificationResolved('PENDING')).toBe(false);
    expect(certificationVerificationResolved(null)).toBe(false);
  });
});

describe('collector condition projection', () => {
  it('uses the submitted raw-card condition before any official-grade field', () => {
    expect(
      collectorConditionValue({ condition: 'Mint', grade: 'PSA 10' }),
    ).toBe('Mint');
  });

  it('does not invent a condition when neither field is present', () => {
    expect(collectorConditionValue({ name: 'Umbreon VMAX' })).toBeNull();
  });
});
