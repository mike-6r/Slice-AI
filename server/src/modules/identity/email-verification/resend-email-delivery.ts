import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Resend } from 'resend';
import { Inject } from '@nestjs/common';
import { type AppConfig } from '../../../config/app-config';
import type { EmailVerificationDelivery } from './email-verification.service';
import { TransactionalEmailService } from '../email-delivery/transactional-email.service';

/** Resend transport only. Slice remains authoritative for verification state. */
@Injectable()
export class ResendEmailDelivery implements EmailVerificationDelivery {
  constructor(
    @Inject(TransactionalEmailService)
    private readonly emailOrConfig: TransactionalEmailService | AppConfig,
  ) {}

  async deliver(input: {
    userId: string;
    email: string;
    token: string;
  }): Promise<{ providerMessageId?: string }> {
    // The config branch is retained only for the historical unit-test seam.
    // Nest production wiring injects TransactionalEmailService below.
    if (isAppConfig(this.emailOrConfig))
      return this.legacyTestDelivery(input, this.emailOrConfig);
    const result = await (this.emailOrConfig as TransactionalEmailService).sendVerification({
      userId: input.userId,
      to: input.email,
      token: input.token,
    });
    return { providerMessageId: result.providerMessageId };
  }

  protected createClient() {
    const config = this.emailOrConfig as AppConfig;
    return new Resend(config.resendApiKey!);
  }

  private async legacyTestDelivery(
    input: { userId: string; email: string; token: string },
    config: AppConfig,
  ) {
    void input.userId;
    if (!config.resendApiKey || !config.resendFromEmail) throw unavailable();
    const recipient = config.resendTestRecipientOverride ?? input.email;
    const url = new URL('/verify-email', config.appPublicUrl);
    url.searchParams.set('token', input.token);
    const from = config.resendFromName
      ? `${config.resendFromName} <${config.resendFromEmail}>`
      : config.resendFromEmail;
    try {
      const result = await this.createClient().emails.send({
        from,
        to: [recipient],
        subject: 'Verify your Slice email',
        html: `<p><strong>Slice</strong></p><h1>Verify your email</h1><p><a href="${escapeHtml(url.toString())}">Verify email</a></p>`,
        text: `Slice\n\nVerify your email: ${url.toString()}`,
      });
      if (result.error || !result.data?.id) throw unavailable();
      return { providerMessageId: result.data.id };
    } catch {
      throw unavailable();
    }
  }
}

function isAppConfig(value: TransactionalEmailService | AppConfig): value is AppConfig {
  return 'resendApiKey' in value;
}

function unavailable() {
  return new ServiceUnavailableException({
    code: 'EMAIL_DELIVERY_UNAVAILABLE',
    message: 'Email verification delivery is unavailable.',
  });
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
