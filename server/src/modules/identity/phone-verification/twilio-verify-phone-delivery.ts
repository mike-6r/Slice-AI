import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as twilio from 'twilio';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { PhoneVerificationDelivery } from './phone-verification.service';

/** Twilio Verify v2 adapter. It starts/checks external proofs; Slice sets account state. */
@Injectable()
export class TwilioVerifyPhoneDelivery implements PhoneVerificationDelivery {
  readonly managesVerification = true;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async deliver(input: {
    userId: string;
    phoneE164: string;
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN';
  }): Promise<void> {
    void input.userId;
    void input.purpose;
    try {
      const client = this.createClient();
      const result = await client.verify.v2
        .services(this.config.twilioVerifyServiceSid!)
        .verifications.create({ to: input.phoneE164, channel: 'sms' });
      if (result.status !== 'pending') throw this.unavailable();
    } catch (error) {
      throw this.mapProviderError(error);
    }
  }

  async verify(input: {
    userId: string;
    phoneE164: string;
    code: string;
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN';
  }): Promise<boolean> {
    void input.userId;
    void input.purpose;
    try {
      const client = this.createClient();
      const result = await client.verify.v2
        .services(this.config.twilioVerifyServiceSid!)
        .verificationChecks.create({ to: input.phoneE164, code: input.code });
      return result.status === 'approved';
    } catch (error) {
      // Verify uses provider errors for expired/incorrect checks. Those are a
      // normal failed attempt, not a provider outage.
      if ([60202, 60203, 60212].includes(providerCode(error))) return false;
      throw this.mapProviderError(error);
    }
  }

  /** Kept as a narrow seam for deterministic adapter tests. */
  protected createClient() {
    if (
      !this.config.twilioAccountSid ||
      !this.config.twilioApiKey ||
      !this.config.twilioApiSecret ||
      !this.config.twilioVerifyServiceSid
    )
      throw this.unavailable();
    return twilio(this.config.twilioApiKey, this.config.twilioApiSecret, {
      accountSid: this.config.twilioAccountSid,
    });
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: 'PHONE_DELIVERY_UNAVAILABLE',
      message: 'Phone verification delivery is unavailable.',
    });
  }

  private mapProviderError(error: unknown) {
    if (providerCode(error) === 60200)
      return new ServiceUnavailableException({
        code: 'PHONE_UNSUPPORTED',
        message: 'This phone number cannot receive SMS verification.',
      });
    return this.unavailable();
  }
}

function providerCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : NaN;
}
