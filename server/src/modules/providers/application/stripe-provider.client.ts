/* eslint-disable @typescript-eslint/no-require-imports -- Stripe v22 is CommonJS in the Nest CommonJS build. */
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
// Stripe v22 exposes a CommonJS export. Use the assignment import so the
// production CommonJS build instantiates the SDK correctly as well as the
// TypeScript test runtime.
import Stripe = require('stripe');
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';

/** Pin the SDK/API pair so a deployment does not silently change provider semantics. */
export const STRIPE_API_VERSION = '2026-07-29.dahlia' as const;

@Injectable()
export class StripeClientFactory {
  private client?: Stripe;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get(): Stripe {
    if (this.config.providerMode === 'local') {
      throw unavailable('LOCAL_TEST does not make Stripe calls.');
    }
    if (!this.config.stripeSecretKey) {
      throw unavailable('Stripe sandbox credentials are not configured.');
    }
    if (this.config.providerMode === 'stripe_sandbox' && !this.config.stripeSecretKey.startsWith('sk_test_')) {
      throw unavailable('Stripe sandbox requires a test-mode secret key.');
    }
    if (this.config.providerMode === 'stripe_live' && (!this.config.stripeLiveEnabled || !this.config.stripeSecretKey.startsWith('sk_live_'))) {
      throw unavailable('Stripe live mode is fail-closed.');
    }
    return (this.client ??= new Stripe(this.config.stripeSecretKey, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      timeout: 10_000,
      appInfo: { name: 'Slice', version: this.config.serviceVersion },
    }));
  }

  environment(): 'SANDBOX' | 'LIVE' {
    return this.config.providerMode === 'stripe_live' ? 'LIVE' : 'SANDBOX';
  }

  provider(): 'STRIPE_SANDBOX' | 'STRIPE_LIVE' {
    return this.config.providerMode === 'stripe_live' ? 'STRIPE_LIVE' : 'STRIPE_SANDBOX';
  }

  publishableKey() {
    if (!this.config.stripePublishableKey) throw unavailable('Stripe publishable key is not configured.');
    if (this.config.providerMode === 'stripe_sandbox' && !this.config.stripePublishableKey.startsWith('pk_test_')) {
      throw unavailable('Stripe sandbox requires a test-mode publishable key.');
    }
    if (this.config.providerMode === 'stripe_live' && (!this.config.stripeLiveEnabled || !this.config.stripePublishableKey.startsWith('pk_live_'))) {
      throw unavailable('Stripe live mode is fail-closed.');
    }
    return this.config.stripePublishableKey;
  }
}

export function unavailable(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: 'STRIPE_NOT_CONFIGURED',
    message,
  });
}
