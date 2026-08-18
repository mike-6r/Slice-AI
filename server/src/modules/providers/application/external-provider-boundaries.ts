import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ProviderCode } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { Actor } from '../../identity/auth/auth.service';
import type { IdentityVerificationProvider } from '../domain/provider.types';

export type ActiveProviderCode = Extract<ProviderCode, 'LOCAL_TEST' | 'STRIPE_SANDBOX' | 'STRIPE_LIVE'>;

/**
 * Future Stripe integrations enter through this boundary. Phase 4A deliberately
 * has no Stripe SDK or outbound request path, so external modes fail closed.
 */
@Injectable()
export class UnavailableExternalIdentityProvider implements IdentityVerificationProvider {
  constructor(private readonly code: ActiveProviderCode) {}

  async createSession(_input: { userId: string; requestId: string }): Promise<never> {
    void _input;
    throw providerUnavailable(this.code, 'Identity verification is not available yet.');
  }

  async getIdentityVerification(_verificationId: string): Promise<never> {
    void _verificationId;
    throw providerUnavailable(this.code, 'Identity verification is not available yet.');
  }
}

@Injectable()
export class BankConnectionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createLinkToken(_actor: Actor) {
    void _actor;
    throw providerUnavailable(this.provider(), 'Bank connection setup is not available yet.');
  }

  async exchangePublicToken(
    _actor: Actor,
    _publicToken: string,
    _requestId: string,
    _idempotencyKey: string,
  ): Promise<never> {
    void _actor;
    void _publicToken;
    void _requestId;
    void _idempotencyKey;
    throw providerUnavailable(this.provider(), 'Bank connection setup is not available yet.');
  }

  async list(_userId: string) {
    void _userId;
    return { items: [] };
  }

  private provider(): ActiveProviderCode {
    return providerCode(this.config.providerMode);
  }
}

export function providerCode(mode: AppConfig['providerMode']): ActiveProviderCode {
  if (mode === 'local') return 'LOCAL_TEST';
  return mode === 'stripe_live' ? 'STRIPE_LIVE' : 'STRIPE_SANDBOX';
}

export function providerUnavailable(code: ActiveProviderCode, message: string) {
  return new ServiceUnavailableException({
    code: code === 'LOCAL_TEST' ? 'PROVIDER_NOT_CONFIGURED' : 'EXTERNAL_PROVIDER_NOT_IMPLEMENTED',
    provider: code,
    message,
  });
}
