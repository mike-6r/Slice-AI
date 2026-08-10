import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as twilio from 'twilio';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { PhoneVerificationDelivery } from './phone-verification.service';

/**
 * Twilio Programmable Messaging transport. Slice, rather than Twilio, owns
 * OTP generation, hashing, expiry, attempts, consumption, and phone approval.
 */
@Injectable()
export class TwilioSmsPhoneDelivery implements PhoneVerificationDelivery {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async deliver(input: {
    userId: string;
    phoneE164: string;
    code: string;
  }): Promise<void> {
    void input.userId;
    try {
      await this.createClient().messages.create({
        to: input.phoneE164,
        from: this.config.twilioFromNumber!,
        body: this.messageBody(input.code),
      });
    } catch {
      throw this.unavailable();
    }
  }

  /** Kept as a narrow seam for deterministic adapter tests. */
  protected createClient() {
    if (
      !this.config.twilioAccountSid ||
      !this.config.twilioAuthToken ||
      !this.config.twilioFromNumber
    )
      throw this.unavailable();
    return twilio(this.config.twilioAccountSid, this.config.twilioAuthToken);
  }

  private messageBody(code: string) {
    const minutes = Math.ceil(this.config.phoneVerificationTtlSeconds / 60);
    return `Your Slice verification code is ${code}. It expires in ${minutes} minutes.`;
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: 'PHONE_DELIVERY_UNAVAILABLE',
      message: 'Phone verification delivery is unavailable.',
    });
  }
}
