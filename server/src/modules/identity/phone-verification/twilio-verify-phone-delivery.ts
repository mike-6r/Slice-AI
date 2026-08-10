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
    code: string;
  }): Promise<void> {
    void input.userId;
    void input.code;
    try {
      const client = this.createClient();
      const result = await client.verify.v2
        .services(this.config.twilioVerifyServiceSid!)
        .verifications.create({ to: input.phoneE164, channel: 'sms' });
      if (result.status !== 'pending') throw this.unavailable();
    } catch {
      throw this.unavailable();
    }
  }

  async verify(input: { phoneE164: string; code: string }): Promise<boolean> {
    try {
      const client = this.createClient();
      const result = await client.verify.v2
        .services(this.config.twilioVerifyServiceSid!)
        .verificationChecks.create({ to: input.phoneE164, code: input.code });
      return result.status === 'approved';
    } catch {
      throw this.unavailable();
    }
  }

  /** Kept as a narrow seam for deterministic adapter tests. */
  protected createClient() {
    if (
      !this.config.twilioAccountSid ||
      !this.config.twilioAuthToken ||
      !this.config.twilioVerifyServiceSid
    )
      throw this.unavailable();
    return twilio(this.config.twilioAccountSid, this.config.twilioAuthToken);
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: 'PHONE_DELIVERY_UNAVAILABLE',
      message: 'Phone verification delivery is unavailable.',
    });
  }
}
