import { BankConnectionService, UnavailableExternalIdentityProvider, providerCode } from './external-provider-boundaries';

describe('Phase 4A external provider boundaries', () => {
  it('maps explicit modes without making an outbound request', async () => {
    expect(providerCode('local')).toBe('LOCAL_TEST');
    expect(providerCode('stripe_sandbox')).toBe('STRIPE_SANDBOX');
    expect(providerCode('stripe_live')).toBe('STRIPE_LIVE');

    const identity = new UnavailableExternalIdentityProvider('STRIPE_SANDBOX');
    await expect(identity.createSession({ userId: 'user-1', requestId: 'request-1' })).rejects.toMatchObject({
      response: {
        code: 'EXTERNAL_PROVIDER_NOT_IMPLEMENTED',
        provider: 'STRIPE_SANDBOX',
      },
    });
  });

  it('keeps bank connection setup fail-closed and returns no fabricated accounts', async () => {
    const service = new BankConnectionService({ providerMode: 'stripe_sandbox' } as never);
    await expect(service.createLinkToken({ userId: 'user-1' } as never)).rejects.toMatchObject({
      response: { code: 'EXTERNAL_PROVIDER_NOT_IMPLEMENTED' },
    });
    await expect(service.list('user-1')).resolves.toEqual({ items: [] });
  });
});
