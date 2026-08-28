import { reviewQueuePriority } from './submission.service';

describe('reviewQueuePriority', () => {
  const ready = {
    accountActive: true,
    certificationResolved: true,
    ageHours: 4,
    missingRequired: 0,
    researchStatus: 'COMPLETED',
    reviewState: 'SUBMITTED',
  };

  it('keeps decision-ready recent submissions low priority', () => {
    expect(reviewQueuePriority(ready)).toBe('LOW');
  });

  it('raises active review work and missing evidence to medium priority', () => {
    expect(reviewQueuePriority({ ...ready, missingRequired: 1 })).toBe(
      'MEDIUM',
    );
    expect(reviewQueuePriority({ ...ready, reviewState: 'IN_REVIEW' })).toBe(
      'MEDIUM',
    );
  });

  it('raises blocked and aged submissions to high priority', () => {
    expect(
      reviewQueuePriority({ ...ready, certificationResolved: false }),
    ).toBe('HIGH');
    expect(reviewQueuePriority({ ...ready, ageHours: 48 })).toBe('HIGH');
  });
});
