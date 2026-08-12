import {
  assertEditableStatus,
  assertMediaProperties,
  assertSubmissionDetails,
  assertRequiredSafeMedia,
  assertSubmissionTerms,
  assertVerifiedMediaContent,
} from './submission.policy';

describe('submission policy', () => {
  it('requires safe front and back evidence before submission', () => {
    expect(() =>
      assertRequiredSafeMedia([{ slot: 'front', status: 'SAFE' }]),
    ).toThrow('Required submission evidence is incomplete.');
    expect(() =>
      assertRequiredSafeMedia([
        { slot: 'front', status: 'SAFE' },
        { slot: 'back', status: 'SAFE' },
      ]),
    ).not.toThrow();
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
    expect(() => assertSubmissionTerms({ termsAcknowledged: true })).not.toThrow();
  });

  it('requires an asset title before a submission can be sent for review', () => {
    expect(() => assertSubmissionDetails({ termsAcknowledged: true })).toThrow(
      'Add an asset title before sending this asset for review.',
    );
    expect(() => assertSubmissionDetails({ name: 'Example card' })).not.toThrow();
  });
});
