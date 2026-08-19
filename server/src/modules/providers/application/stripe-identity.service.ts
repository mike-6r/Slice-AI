import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { IdentityVerificationProvider, IdentityVerificationState, NormalizedComplianceStatus } from '../domain/provider.types';
import { providerCode, providerUnavailable } from './external-provider-boundaries';
import { StripeClientFactory } from './stripe-provider.client';

/** Stripe Identity boundary. Provider-sensitive identity data never leaves this adapter. */
@Injectable()
export class StripeIdentityVerificationService implements IdentityVerificationProvider {
  constructor(
    private readonly db: PrismaService,
    private readonly stripeFactory: StripeClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createSession(input: { userId: string; requestId: string; idempotencyKey?: string }) {
    void input.requestId;
    const stripe = this.stripeFactory.get();
    const user = await this.db.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true } });
    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      client_reference_id: input.userId,
      provided_details: { email: user.email },
      options: { document: { require_live_capture: true, require_matching_selfie: true } },
      metadata: { slice_user_id: input.userId, slice_environment: this.stripeFactory.environment() },
    }, { idempotencyKey: input.idempotencyKey ?? `slice-identity-session:${this.stripeFactory.environment()}:${input.userId}:${input.requestId}` });
    this.assertMode(session.livemode);
    return {
      providerReference: session.id,
      sessionUrl: session.url,
      status: mapIdentityStatus(session.status).complianceStatus,
      identityState: mapIdentityStatus(session.status).identityState,
    };
  }

  async getIdentityVerification(verificationId: string) {
    const session = await this.stripeFactory.get().identity.verificationSessions.retrieve(verificationId);
    this.assertMode(session.livemode);
    const mapped = mapIdentityStatus(session.status);
    return { status: mapped.complianceStatus, identityState: mapped.identityState, sessionUrl: session.url, safeFailureCode: safeFailureCode(session.last_error?.code) };
  }

  private assertMode(livemode: boolean) {
    if (livemode !== (this.config.providerMode === 'stripe_live')) throw providerUnavailable(providerCode(this.config.providerMode), 'Stripe Identity session belongs to another environment.');
  }
}

export function mapIdentityStatus(status: string): { complianceStatus: NormalizedComplianceStatus; identityState: IdentityVerificationState } {
  if (status === 'verified') return { complianceStatus: 'APPROVED', identityState: 'VERIFIED' };
  if (status === 'processing') return { complianceStatus: 'REVIEW', identityState: 'PROCESSING' };
  if (status === 'canceled') return { complianceStatus: 'EXPIRED', identityState: 'CANCELED' };
  if (status === 'requires_input') return { complianceStatus: 'PENDING', identityState: 'REQUIRES_INPUT' };
  return { complianceStatus: 'REJECTED', identityState: 'FAILED' };
}

export function safeFailureCode(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[a-z0-9_]{1,80}$/i.test(value)) return null;
  return value.toUpperCase();
}
