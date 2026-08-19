import { mapIdentityStatus, safeFailureCode, StripeIdentityVerificationService } from './stripe-identity.service';

describe('StripeIdentityVerificationService', () => {
  it.each([
    ['requires_input', 'REQUIRES_INPUT', 'PENDING'],
    ['processing', 'PROCESSING', 'REVIEW'],
    ['verified', 'VERIFIED', 'APPROVED'],
    ['canceled', 'CANCELED', 'EXPIRED'],
    ['failed', 'FAILED', 'REJECTED'],
  ])('maps Stripe %s without exposing provider vocabulary as authority', (providerStatus, identityState, complianceStatus) => {
    expect(mapIdentityStatus(providerStatus)).toEqual({ identityState, complianceStatus });
  });

  it('keeps failure values to safe machine-readable categories', () => {
    expect(safeFailureCode('selfie_face_mismatch')).toBe('SELFIE_FACE_MISMATCH');
    expect(safeFailureCode('contains sensitive details')).toBeNull();
    expect(safeFailureCode(null)).toBeNull();
  });

  it('fails closed without Stripe credentials and makes no provider call', async () => {
    const service = new StripeIdentityVerificationService(
      {} as never,
      { get: () => { throw new Error('Stripe sandbox credentials are not configured.'); } } as never,
      { providerMode: 'stripe_sandbox' } as never,
    );
    await expect(service.createSession({ userId: 'user-1', requestId: 'request-1' })).rejects.toThrow('Stripe sandbox credentials are not configured.');
  });
});
