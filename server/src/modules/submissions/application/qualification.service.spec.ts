import { qualificationResponse } from './qualification.service';

describe('qualificationResponse', () => {
  it('always returns the owner response contract with completedAt', () => {
    const completedAt = new Date('2026-09-05T18:00:00.000Z');

    expect(
      qualificationResponse(
        {
          outcome: 'HUMAN_REVIEW_REQUIRED',
          customerStatus: 'NEEDS_STAFF_REVIEW',
          reasons: ['Automated review is disabled.'],
          actions: [],
          checks: [],
        },
        completedAt,
      ),
    ).toEqual(
      expect.objectContaining({ completedAt: '2026-09-05T18:00:00.000Z' }),
    );
    expect(
      qualificationResponse({ outcome: 'HUMAN_REVIEW_REQUIRED' }, null),
    ).toEqual(expect.objectContaining({ completedAt: null }));
  });
});
