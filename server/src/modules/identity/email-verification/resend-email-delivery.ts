import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';
import type { EmailVerificationDelivery } from './email-verification.service';

/** Resend transport only. Slice remains authoritative for verification state. */
@Injectable()
export class ResendEmailDelivery implements EmailVerificationDelivery {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async deliver(input: {
    userId: string;
    email: string;
    token: string;
  }): Promise<void> {
    void input.userId;
    if (!this.config.resendApiKey || !this.config.resendFromEmail)
      throw this.unavailable();
    const recipient = this.config.resendTestRecipientOverride ?? input.email;
    const url = new URL('/verify-email', this.config.appPublicUrl);
    url.searchParams.set('token', input.token);
    const from = this.config.resendFromName
      ? `${this.config.resendFromName} <${this.config.resendFromEmail}>`
      : this.config.resendFromEmail;
    try {
      const result = await this.createClient().emails.send({
        from,
        to: [recipient],
        subject: 'Verify your Slice email',
        html: `<p><strong>Slice</strong></p><h1>Verify your email</h1><p>Confirm your email to continue setting up your Slice account.</p><p><a href="${escapeHtml(url.toString())}">Verify email</a></p><p>This link expires soon. If you did not request this, you can ignore this email.</p>`,
        text: `Slice\n\nVerify your email: ${url.toString()}\n\nThis link expires soon. If you did not request this, you can ignore this email.`,
      });
      if (result.error || !result.data?.id) throw this.unavailable();
    } catch {
      throw this.unavailable();
    }
  }

  /** Kept as a narrow seam for deterministic adapter tests. */
  protected createClient() {
    return new Resend(this.config.resendApiKey!);
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message: 'Email verification delivery is unavailable.',
    });
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}
