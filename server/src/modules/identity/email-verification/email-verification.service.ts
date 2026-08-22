import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { AuthAbuseService } from '../auth/auth-abuse.service';
import type { Actor } from '../auth/auth.service';
import { TransactionalEmailService } from '../email-delivery/transactional-email.service';

export type EmailVerificationDelivery = {
  deliver(input: {
    userId: string;
    email: string;
    token: string;
  }): Promise<{ providerMessageId?: string } | void>;
};

export const EMAIL_VERIFICATION_DELIVERY = Symbol(
  'EMAIL_VERIFICATION_DELIVERY',
);

@Injectable()
export class LocalTestEmailDelivery implements EmailVerificationDelivery {
  private readonly tokens = new Map<string, string>();

  async deliver(input: { userId: string; email: string; token: string }) {
    // email is intentionally accepted so future providers share this contract.
    void input.email;
    this.tokens.set(input.userId, input.token);
  }

  /** Test-only seam; never exposed by an HTTP route. */
  tokenForTest(userId: string) {
    return this.tokens.get(userId);
  }
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly abuse: AuthAbuseService,
    @Inject(EMAIL_VERIFICATION_DELIVERY)
    private readonly delivery: EmailVerificationDelivery,
    @Optional() private readonly transactional?: TransactionalEmailService,
  ) {}

  async status(actor: Actor) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { emailVerifiedAt: true },
    });
    const latest = user.emailVerifiedAt
      ? null
      : await this.db.emailVerificationToken.findFirst({
          where: {
            userId: actor.userId,
            consumedAt: null,
            deliveryStatus: 'SENT',
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
    return {
      verified: Boolean(user.emailVerifiedAt),
      verifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      resendAvailableAt: latest
        ? new Date(
            latest.createdAt.getTime() +
              this.config.emailVerificationResendSeconds * 1000,
          ).toISOString()
        : null,
    };
  }

  async send(actor: Actor, ip: string, requestId: string) {
    await this.abuse.enforce('email-send', ip, actor.userId);
    this.requireDelivery();
    const now = new Date();
    const token = generateVerificationToken();
    const outcome = await this.db.withTransaction(async (tx) => {
      // A user row lock serializes resend requests so no pair of concurrent
      // requests can produce two live proof tokens.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { email: true, emailVerifiedAt: true },
      });
      if (user.emailVerifiedAt) return { kind: 'verified' as const };
      const recent = await tx.emailVerificationToken.findFirst({
        where: {
          userId: actor.userId,
          consumedAt: null,
          deliveryStatus: 'SENT',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const resendAvailableAt = recent
        ? new Date(
            recent.createdAt.getTime() +
              this.config.emailVerificationResendSeconds * 1000,
          )
        : null;
      if (resendAvailableAt && resendAvailableAt > now) {
        return { kind: 'cooldown' as const, resendAvailableAt };
      }
      await tx.emailVerificationToken.updateMany({
        where: { userId: actor.userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: actor.userId,
          tokenHash: hashVerificationToken(token),
          expiresAt: new Date(
            now.getTime() + this.config.emailVerificationTtlSeconds * 1000,
          ),
        },
      });
      return {
        kind: 'created' as const,
        email: user.email,
        action: recent ? 'EMAIL_VERIFICATION_RESENT' : 'EMAIL_VERIFICATION_SENT',
      };
    });
    if (outcome.kind === 'verified')
      return { alreadyVerified: true, resendAvailableAt: null };
    if (outcome.kind === 'cooldown') {
      return {
        alreadyVerified: false,
        resendAvailableAt: outcome.resendAvailableAt.toISOString(),
      };
    }
    try {
      const delivery = await this.delivery.deliver({
        userId: actor.userId,
        email: outcome.email,
        token,
      });
      await this.db.emailVerificationToken.update({
        where: { tokenHash: hashVerificationToken(token) },
        data: {
          deliveryStatus: 'SENT',
          deliveredAt: new Date(),
          providerMessageId: delivery?.providerMessageId,
        },
      });
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: outcome.action,
          resourceType: 'user',
          resourceId: actor.userId,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: Prisma.DbNull,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      await this.db.emailVerificationToken.updateMany({
        where: { tokenHash: hashVerificationToken(token), deliveryStatus: 'PENDING' },
        data: { deliveryStatus: 'FAILED', deliveryFailedAt: new Date() },
      });
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'EMAIL_VERIFICATION_DELIVERY_FAILED',
          resourceType: 'user',
          resourceId: actor.userId,
          requestId,
          sessionId: actor.sessionId,
          result: 'FAILURE',
          metadata: Prisma.DbNull,
          createdAt: new Date(),
        },
      }).catch(() => undefined);
      throw error;
    }
    return {
      alreadyVerified: false,
      resendAvailableAt: new Date(
        now.getTime() + this.config.emailVerificationResendSeconds * 1000,
      ).toISOString(),
    };
  }

  /** Called after signup commits. Delivery failure must not roll back signup. */
  async sendForNewAccount(input: {
    userId: string;
    email: string;
    requestId: string;
  }) {
    if (!this.isDeliveryAvailable()) return false;
    const now = new Date();
    const token = generateVerificationToken();
    await this.db.emailVerificationToken.updateMany({
      where: { userId: input.userId, consumedAt: null },
      data: { consumedAt: now },
    });
    await this.db.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: hashVerificationToken(token),
        expiresAt: new Date(now.getTime() + this.config.emailVerificationTtlSeconds * 1000),
      },
    });
    try {
      const delivery = await this.delivery.deliver({
        userId: input.userId,
        email: input.email,
        token,
      });
      await this.db.emailVerificationToken.update({
        where: { tokenHash: hashVerificationToken(token) },
        data: { deliveryStatus: 'SENT', deliveredAt: new Date(), providerMessageId: delivery?.providerMessageId },
      });
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: input.userId,
          actorType: 'USER',
          action: 'EMAIL_VERIFICATION_SENT',
          resourceType: 'user',
          resourceId: input.userId,
          requestId: input.requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: Prisma.DbNull,
          createdAt: new Date(),
        },
      });
      return true;
    } catch (error) {
      await this.db.emailVerificationToken.updateMany({
        where: { tokenHash: hashVerificationToken(token), deliveryStatus: 'PENDING' },
        data: { deliveryStatus: 'FAILED', deliveryFailedAt: new Date() },
      });
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: input.userId,
          actorType: 'USER',
          action: 'EMAIL_VERIFICATION_DELIVERY_FAILED',
          resourceType: 'user',
          resourceId: input.userId,
          requestId: input.requestId,
          sessionId: null,
          result: 'FAILURE',
          metadata: Prisma.DbNull,
          createdAt: new Date(),
        },
      }).catch(() => undefined);
      this.logger.warn(`Signup verification email failed: ${safeErrorCode(error)}`);
      return false;
    }
  }

  async confirm(rawToken: string, ip: string, requestId: string) {
    await this.abuse.enforce(
      'email-confirm',
      ip,
      hashVerificationToken(rawToken),
    );
    const now = new Date();
    const result = await this.db.withTransaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({
        where: { tokenHash: hashVerificationToken(rawToken) },
      });
      if (
        !record ||
        record.consumedAt ||
        record.deliveryStatus !== 'SENT' ||
        record.expiresAt <= now
      )
        return null;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: record.userId },
        select: { emailVerifiedAt: true },
      });
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      if (!user.emailVerifiedAt)
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: now },
        });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: record.userId,
          actorType: 'USER',
          action: 'EMAIL_VERIFIED',
          resourceType: 'user',
          resourceId: record.userId,
          requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: Prisma.DbNull,
          createdAt: now,
        },
      });
      return {
        userId: record.userId,
        value: {
          verified: true,
          verifiedAt: (user.emailVerifiedAt ?? now).toISOString(),
        },
      };
    });
    if (!result)
      throw new UnauthorizedException({
        code: 'EMAIL_VERIFICATION_INVALID',
        message: 'This verification link is invalid or has expired.',
      });
    if (result && this.transactional)
      void this.transactional.safeSecurityNotification({
        userId: result.userId,
        event: 'EMAIL_VERIFIED',
        idempotencyKey: `security-email-verified:${hashVerificationToken(rawToken)}`,
      });
    return result.value;
  }

  private requireDelivery() {
    if (this.isDeliveryAvailable()) return;
    if (
      this.config.emailDeliveryMode === 'local_test' &&
      this.config.environment !== 'production'
    )
      return;
    throw new ServiceUnavailableException({
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message: 'Email verification delivery is unavailable.',
    });
  }

  private isDeliveryAvailable() {
    return (
      this.config.emailEnabled &&
      (this.config.emailDeliveryMode === 'resend' ||
        (this.config.emailDeliveryMode === 'local_test' &&
          this.config.environment !== 'production'))
    );
  }
}

function safeErrorCode(error: unknown) {
  return error instanceof ServiceUnavailableException
    ? 'EMAIL_DELIVERY_UNAVAILABLE'
    : 'EMAIL_DELIVERY_FAILED';
}

export function generateVerificationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashVerificationToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
