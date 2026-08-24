import {
  assertEditableStatus,
  assertMediaSlot,
  assertMediaProperties,
  assertSubmissionDetails,
  assertSubmissionReady,
  assertRequiredSafeMedia,
  assertSubmissionMediaReady,
  assertSubmissionTerms,
  assertVerifiedMediaContent,
  REQUIRED_MEDIA_SLOTS,
} from './submission.policy';

describe('submission policy', () => {
  it('requires safe evidence for every required view before submission', () => {
    expect(() =>
      assertRequiredSafeMedia([{ slot: 'front', status: 'SAFE' }]),
    ).toThrow('Required submission evidence is incomplete.');
    expect(() =>
      assertRequiredSafeMedia(
        REQUIRED_MEDIA_SLOTS.map((slot) => ({ slot, status: 'SAFE' })),
      ),
    ).not.toThrow();
    expect(() =>
      assertRequiredSafeMedia(
        REQUIRED_MEDIA_SLOTS.map((slot) => ({
          slot,
          status: 'SAFE',
          deletedAt: new Date(),
        })),
      ),
    ).toThrow('Required submission evidence is incomplete.');
  });

  it('does not allow active optional evidence to remain processing at submit', () => {
    expect(() =>
      assertSubmissionMediaReady([
        { status: 'SAFE', deletedAt: null },
        { status: 'SCANNING', deletedAt: null },
      ]),
    ).toThrow('One uploaded photo is still processing or needs attention.');
    expect(() =>
      assertSubmissionMediaReady([
        { status: 'SAFE', deletedAt: null },
        { status: 'DELETED', deletedAt: new Date() },
      ]),
    ).not.toThrow();
  });

  it('accepts declared optional roles while rejecting unsupported evidence roles', () => {
    expect(() => assertMediaSlot('additional-image')).not.toThrow();
    expect(() => assertMediaSlot('grading-label')).not.toThrow();
    expect(() => assertMediaSlot('top-edge')).not.toThrow();
    expect(() => assertMediaSlot('unknown-role')).toThrow(
      'That evidence role is not supported.',
    );
  });

  it('allows only editable lifecycle states and safe image metadata', () => {
    expect(() => assertEditableStatus('SUBMITTED')).toThrow(
      'This submission can no longer be edited.',
    );
    expect(() =>
      assertMediaProperties({ mimeType: 'image/svg+xml', sizeBytes: 10 }),
    ).toThrow('That media type is not supported.');
  });

  it('requires inspected image content to match declared type and safe dimensions', () => {
    expect(() =>
      assertVerifiedMediaContent({
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        magicMimeType: 'image/png',
        width: 2,
        height: 2,
      }),
    ).toThrow('does not match its declared type');
    expect(() =>
      assertVerifiedMediaContent({
        mimeType: 'image/jpeg',
        sizeBytes: 10,
        magicMimeType: 'image/jpeg',
        width: 100_000,
        height: 100_000,
      }),
    ).toThrow('dimensions are not supported');
  });

  it('requires a saved acknowledgement before a submission can be sent for review', () => {
    expect(() => assertSubmissionTerms({ name: 'Example card' })).toThrow(
      'Confirm the submission terms before sending this asset for review.',
    );
    expect(() =>
      assertSubmissionTerms({ termsAcknowledged: true }),
    ).not.toThrow();
  });

  it('requires an asset title before a submission can be sent for review', () => {
    expect(() => assertSubmissionDetails({ termsAcknowledged: true })).toThrow(
      'Add an asset title before sending this asset for review.',
    );
    expect(() =>
      assertSubmissionDetails({ name: 'Example card' }),
    ).not.toThrow();
  });

  it('requires final market, offer, and raw-card review state before submit', () => {
    const ready = {
      name: 'Example card',
      year: '2021',
      set: 'Example set',
      cardNumber: '1/10',
      marketCheckStatus: 'NO_MATCHES',
      marketCheckAcknowledged: true,
      offerIntentPercent: '62.5',
      aiReviewStatus: 'AI_REVIEW_SKIPPED',
      termsAcknowledged: true,
    };
    expect(() => assertSubmissionReady(ready, null)).not.toThrow();
    expect(() =>
      assertSubmissionReady({ ...ready, offerIntentPercent: '0' }, null),
    ).toThrow('Choose a valid offer percentage before sending it for review.');
    expect(() =>
      assertSubmissionReady({ ...ready, aiReviewStatus: undefined }, null),
    ).toThrow(
      'Complete the optional AI review or choose to continue without it.',
    );
    expect(() =>
      assertSubmissionReady({ ...ready, marketCheckAcknowledged: false }, null),
    ).toThrow(
      'Complete the market step or acknowledge the manual-review fallback.',
    );
    expect(() =>
      assertSubmissionReady({ ...ready, grader: 'PSA', grade: '' }, null),
    ).toThrow(
      'Add the assigned grade before sending this collectible for review.',
    );
  });
});
