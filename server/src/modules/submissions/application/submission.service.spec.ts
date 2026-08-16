import { collectorConditionValue } from './submission.service';

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
