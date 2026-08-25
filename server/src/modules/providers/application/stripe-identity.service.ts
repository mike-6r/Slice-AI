import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { IdentityVerificationProvider, IdentityVerificationState, NormalizedComplianceStatus, VerifiedIdentityDetails } from '../domain/provider.types';
import { providerCode, providerUnavailable } from './external-provider-boundaries';
import { StripeClientFactory } from './stripe-provider.client';

type StripeClient = ReturnType<StripeClientFactory['get']>;
type VerificationSession = Awaited<ReturnType<StripeClient['identity']['verificationSessions']['retrieve']>>;
type VerifiedDateOfBirth = NonNullable<NonNullable<VerificationSession['verified_outputs']>['dob']>;

/** Stripe Identity boundary. Raw provider-sensitive identity data never leaves this adapter. */
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
    let session: Awaited<ReturnType<typeof stripe.identity.verificationSessions.create>>;
    try {
      session = await stripe.identity.verificationSessions.create({
        type: 'document',
        client_reference_id: input.userId,
        provided_details: { email: user.email },
        options: { document: { require_live_capture: true, require_matching_selfie: true } },
        return_url: `${this.config.appPublicUrl.replace(/\/$/, '')}/account?verification=complete`,
        metadata: { slice_user_id: input.userId, slice_environment: this.stripeFactory.environment() },
      }, { idempotencyKey: input.idempotencyKey ?? `slice-identity-session:${this.stripeFactory.environment()}:${input.userId}:${input.requestId}` });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw identityProviderUnavailable(error);
    }
    this.assertMode(session.livemode);
    return {
      providerReference: session.id,
      sessionUrl: session.url,
      status: mapIdentityStatus(session.status).complianceStatus,
      identityState: mapIdentityStatus(session.status).identityState,
    };
  }

  async getIdentityVerification(verificationId: string) {
    let session: VerificationSession;
    try {
      session = await this.stripeFactory.get().identity.verificationSessions.retrieve(verificationId);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw identityProviderUnavailable(error);
    }
    this.assertMode(session.livemode);
    const mapped = mapIdentityStatus(session.status);
    return {
      status: mapped.complianceStatus,
      identityState: mapped.identityState,
      sessionUrl: session.url,
      safeFailureCode: safeFailureCode(session.last_error?.code),
      verifiedDetails: session.status === 'verified' ? safeVerifiedDetails(session.verified_outputs) : null,
    };
  }

  private assertMode(livemode: boolean) {
    if (livemode !== (this.config.providerMode === 'stripe_live')) throw providerUnavailable(providerCode(this.config.providerMode), 'Stripe Identity session belongs to another environment.');
  }
}

function identityProviderUnavailable(error: unknown): ServiceUnavailableException {
  void error;
  return new ServiceUnavailableException({
    code: 'IDENTITY_PROVIDER_UNAVAILABLE',
    message: 'Identity verification is temporarily unavailable. Please try again shortly.',
  });
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

function safeVerifiedDetails(
  outputs: VerificationSession['verified_outputs'],
): VerifiedIdentityDetails | null {
  if (!outputs) return null;
  const firstName = safeProviderText(outputs.first_name, 100);
  const lastName = safeProviderText(outputs.last_name, 100);
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const address = outputs.address
    ? {
        line1: safeProviderText(outputs.address.line1, 200),
        line2: safeProviderText(outputs.address.line2, 200),
        city: safeProviderText(outputs.address.city, 100),
        region: safeProviderText(outputs.address.state, 100),
        postalCode: safeProviderText(outputs.address.postal_code, 32),
        countryCode: safeCountryCode(outputs.address.country),
      }
    : null;
  const details = {
    fullName,
    email: safeProviderText(outputs.email, 320),
    phone: safeProviderText(outputs.phone, 64),
    dateOfBirth: safeDateOfBirth(outputs.dob),
    address,
  } satisfies VerifiedIdentityDetails;
  return details.fullName || details.email || details.phone || details.dateOfBirth || details.address
    ? details
    : null;
}

function safeProviderText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function safeCountryCode(value: unknown): string | null {
  const country = safeProviderText(value, 2)?.toUpperCase() ?? null;
  return country && /^[A-Z]{2}$/.test(country) ? country : null;
}

function safeDateOfBirth(value: VerifiedDateOfBirth | null | undefined): string | null {
  if (!value || typeof value !== 'object') return null;
  const dob = value as { day?: unknown; month?: unknown; year?: unknown };
  const day = Number(dob.day);
  const month = Number(dob.month);
  const year = Number(dob.year);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || year > new Date().getUTCFullYear() || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
