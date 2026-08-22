import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import {
  passwordResetEmail,
  securityNotificationEmail,
  verificationEmail,
} from './transactional-email.templates';

export const TRANSACTIONAL_EMAIL_PROVIDER = Symbol('TRANSACTIONAL_EMAIL_PROVIDER');

export type TransactionalEmailProvider = {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string }>;
};

export type TransactionalEmailType =
  | 'EMAIL_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'SECURITY_NOTIFICATION';

@Injectable()
export class LocalTestTransactionalEmailProvider implements TransactionalEmailProvider {
  private readonly messages = new Map<string, { to: string; subject: string; text: string }>();

  async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }) {
    this.messages.set(input.idempotencyKey, {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { providerMessageId: `local_${input.idempotencyKey}` };
  }

  messageForTest(idempotencyKey: string) {
    return this.messages.get(idempotencyKey);
  }
}

@Injectable()
export class ResendTransactionalEmailProvider implements TransactionalEmailProvider {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }) {
    if (!this.config.resendApiKey || !this.config.resendFromEmail)
      throw unavailable();
    const from = this.config.resendFromName
      ? `${this.config.resendFromName} <${this.config.resendFromEmail}>`
      : this.config.resendFromEmail;
    const recipient = this.config.resendTestRecipientOverride ?? input.to;
    try {
      const result = await new Resend(this.config.resendApiKey).emails.send(
        {
          from,
          to: [recipient],
          ...(this.config.resendReplyToEmail
            ? { replyTo: this.config.resendReplyToEmail }
            : {}),
          subject: input.subject,
          html: input.html,
          text: input.text,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (result.error || !result.data?.id) throw unavailable();
      return { providerMessageId: result.data.id };
    } catch {
      throw unavailable();
    }
  }
}

@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);

  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TRANSACTIONAL_EMAIL_PROVIDER)
    private readonly provider: TransactionalEmailProvider,
  ) {}

  async send(input: {
    userId?: string;
    to: string;
    type: TransactionalEmailType;
    subject: string;
    html: string;
    text: string;
    idempotencyKey: string;
  }) {
    this.requireEnabled();
    const existing = await this.db.transactionalEmailDelivery.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { status: true, providerMessageId: true },
    });
    if (existing?.status === 'SENT' && existing.providerMessageId)
      return { providerMessageId: existing.providerMessageId };
    await this.db.transactionalEmailDelivery.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        userId: input.userId,
        recipientHash: hashRecipient(input.to),
        emailType: input.type,
        provider: this.config.emailDeliveryMode,
        idempotencyKey: input.idempotencyKey,
        status: 'PENDING',
      },
      update: { status: 'PENDING', failedAt: null, failureCode: null },
    });
    try {
      const result = await this.provider.send(input);
      await this.db.transactionalEmailDelivery.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { status: 'SENT', sentAt: new Date(), providerMessageId: result.providerMessageId },
      });
      return result;
    } catch (error) {
      await this.db.transactionalEmailDelivery.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { status: 'FAILED', failedAt: new Date(), failureCode: 'PROVIDER_UNAVAILABLE' },
      }).catch(() => undefined);
      throw error;
    }
  }

  async sendVerification(input: { userId: string; to: string; token: string }) {
    const url = new URL('/verify-email', this.config.appPublicUrl);
    url.searchParams.set('token', input.token);
    const template = verificationEmail({
      url: url.toString(),
      expiresIn: `${Math.round(this.config.emailVerificationTtlSeconds / 60)} minutes`,
    });
    return this.send({
      userId: input.userId,
      to: input.to,
      type: 'EMAIL_VERIFICATION',
      ...template,
      idempotencyKey: `email-verification:${hashRecipient(input.token)}`,
    });
  }

  async sendPasswordReset(input: { userId: string; to: string; token: string }) {
    const url = new URL('/reset-password', this.config.appPublicUrl);
    url.searchParams.set('token', input.token);
    const template = passwordResetEmail({
      url: url.toString(),
      expiresIn: `${Math.round(this.config.passwordResetTtlSeconds / 60)} minutes`,
    });
    return this.send({
      userId: input.userId,
      to: input.to,
      type: 'PASSWORD_RESET',
      ...template,
      idempotencyKey: `password-reset:${hashRecipient(input.token)}`,
    });
  }

  async sendSecurityNotification(input: {
    userId: string;
    event: 'PASSWORD_CHANGED' | 'EMAIL_VERIFIED' | 'PHONE_CHANGED' | 'PHONE_REMOVED' | 'MFA_ENABLED' | 'MFA_DISABLED';
    idempotencyKey: string;
  }) {
    const user = await this.db.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (!user) return false;
    const copy: Record<typeof input.event, { subject: string; detail: string }> = {
      PASSWORD_CHANGED: { subject: 'Your Slice password was changed', detail: 'Your Slice password was changed successfully.' },
      EMAIL_VERIFIED: { subject: 'Your Slice email was verified', detail: 'Your Slice email address was verified successfully.' },
      PHONE_CHANGED: { subject: 'Your Slice phone number was changed', detail: 'Your verified phone number was changed.' },
      PHONE_REMOVED: { subject: 'Your Slice phone number was removed', detail: 'Your verified phone number was removed.' },
      MFA_ENABLED: { subject: 'Slice two-factor authentication enabled', detail: 'Two-factor authentication was enabled for your Slice account.' },
      MFA_DISABLED: { subject: 'Slice two-factor authentication disabled', detail: 'Two-factor authentication was disabled for your Slice account.' },
    };
    const template = securityNotificationEmail({
      title: copy[input.event].subject,
      detail: copy[input.event].detail,
    });
    await this.send({ userId: input.userId, to: user.email, type: input.event === 'PASSWORD_CHANGED' ? 'PASSWORD_CHANGED' : 'SECURITY_NOTIFICATION', ...template, idempotencyKey: input.idempotencyKey });
    return true;
  }

  async safeSecurityNotification(input: Parameters<TransactionalEmailService['sendSecurityNotification']>[0]) {
    try {
      return await this.sendSecurityNotification(input);
    } catch (error) {
      this.logger.warn(`Transactional security email failed for ${input.event}: ${safeErrorCode(error)}`);
      return false;
    }
  }

  private requireEnabled() {
    if (!this.config.emailEnabled || (this.config.emailDeliveryMode === 'local_test' && this.config.environment === 'production'))
      throw unavailable();
  }
}

function hashRecipient(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeErrorCode(error: unknown) {
  return error instanceof ServiceUnavailableException ? 'EMAIL_DELIVERY_UNAVAILABLE' : 'EMAIL_DELIVERY_FAILED';
}

function unavailable() {
  return new ServiceUnavailableException({ code: 'EMAIL_DELIVERY_UNAVAILABLE', message: 'Transactional email delivery is temporarily unavailable.' });
}
