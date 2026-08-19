import { StripeClientFactory, STRIPE_API_VERSION } from './stripe-provider.client';

describe('StripeClientFactory', () => {
  it('pins the SDK API version and rejects missing sandbox credentials without I/O', () => {
    const factory = new StripeClientFactory({ providerMode: 'stripe_sandbox' } as never);
    expect(STRIPE_API_VERSION).toBe('2026-07-29.dahlia');
    expect(() => factory.get()).toThrow('Stripe sandbox credentials are not configured.');
  });

  it('rejects live keys in sandbox mode', () => {
    const factory = new StripeClientFactory({ providerMode: 'stripe_sandbox', stripeSecretKey: 'sk_live_' + 'x'.repeat(24) } as never);
    expect(() => factory.get()).toThrow('Stripe sandbox requires a test-mode secret key.');
  });

  it('keeps live mode fail-closed unless explicitly enabled with a live key', () => {
    const factory = new StripeClientFactory({ providerMode: 'stripe_live', stripeLiveEnabled: false, stripeSecretKey: 'sk_live_' + 'x'.repeat(24) } as never);
    expect(() => factory.get()).toThrow('Stripe live mode is fail-closed.');
  });
});
