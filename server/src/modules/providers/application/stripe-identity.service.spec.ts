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

  it('normalizes Stripe create failures instead of leaking a generic 500', async () => {
    const service = new StripeIdentityVerificationService(
      { user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ email: 'test@example.com' }) } } as never,
      {
        get: () => ({
          identity: {
            verificationSessions: {
              create: jest.fn().mockRejectedValue(new Error('provider request failed')),
            },
          },
        }),
        environment: () => 'SANDBOX',
      } as never,
      { providerMode: 'stripe_sandbox', appPublicUrl: 'https://staging.slicecollectable.com' } as never,
    );

    await expect(service.createSession({ userId: 'user-1', requestId: 'request-1' })).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
        message: 'Identity verification is temporarily unavailable. Please try again shortly.',
      },
    });
  });

  it('projects verified contact and address fields without exposing document data', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      id: 'vs_test_verified',
      status: 'verified',
      livemode: false,
      url: null,
      verified_outputs: {
        first_name: 'Michael',
        last_name: 'Fultz',
        email: 'povnu@example.com',
        phone: '+441234567890',
        dob: { day: 12, month: 6, year: 1988 },
        id_number: 'MUST_NOT_LEAVE_ADAPTER',
        address: {
          line1: '1 Slice Street',
          line2: 'Flat 2',
          city: 'London',
          state: 'England',
          postal_code: 'SW1A 1AA',
          country: 'gb',
        },
      },
    });
    const service = new StripeIdentityVerificationService(
      {} as never,
      { get: () => ({ identity: { verificationSessions: { retrieve } } }) } as never,
      { providerMode: 'stripe_sandbox' } as never,
    );

    await expect(service.getIdentityVerification('vs_test_verified')).resolves.toEqual({
      status: 'APPROVED',
      identityState: 'VERIFIED',
      sessionUrl: null,
      safeFailureCode: null,
      verifiedDetails: {
        fullName: 'Michael Fultz',
        email: 'povnu@example.com',
        phone: '+441234567890',
        dateOfBirth: '1988-06-12',
        address: {
          line1: '1 Slice Street',
          line2: 'Flat 2',
          city: 'London',
          region: 'England',
          postalCode: 'SW1A 1AA',
          countryCode: 'GB',
        },
      },
    });
    expect(JSON.stringify(retrieve.mock.results[0]?.value)).not.toContain('MUST_NOT_LEAVE_ADAPTER');
  });
});
