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

  it('includes the Slice return URL in the hosted verification session', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'vs_test_123',
      url: 'https://verify.stripe.test/vs_test_123',
      status: 'requires_input',
      livemode: false,
    });
    const service = new StripeIdentityVerificationService(
      { user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'test@example.com' }) } } as never,
      { get: () => ({ identity: { verificationSessions: { create } } }), environment: () => 'SANDBOX' } as never,
      { providerMode: 'stripe_sandbox', appPublicUrl: 'https://staging.slicecollectable.com/' } as never,
    );

    await service.createSession({ userId: 'user-1', requestId: 'request-1' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ return_url: 'https://staging.slicecollectable.com/account?verification=complete' }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('slice-identity-session') }),
    );
  });
});
