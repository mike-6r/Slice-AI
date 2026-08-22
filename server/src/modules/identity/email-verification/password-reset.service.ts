import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { AuthAbuseService } from '../auth/auth-abuse.service';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/security.ports';
import { TransactionalEmailService } from '../email-delivery/transactional-email.service';
import {
  generateVerificationToken,
  hashVerificationToken,
} from './email-verification.service';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly abuse: AuthAbuseService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly email: TransactionalEmailService,
  ) {}

  async request(emailAddress: string, ip: string, requestId: string) {
    const email = emailAddress.trim().toLowerCase();
    await this.abuse.enforce('password-reset-request', ip, email);
    const user = await this.db.user.findUnique({
      where: { normalizedEmail: email },
      select: { id: true, email: true, accountStatus: true },
    });
    if (!user || ['CLOSED', 'DEACTIVATED'].includes(user.accountStatus))
      return accepted();

    const now = new Date();
    const token = generateVerificationToken();
    const tokenHash = hashVerificationToken(token);
    const created = await this.db.withTransaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const recent = await tx.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          consumedAt: null,
          deliveryStatus: 'SENT',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (
        recent &&
        recent.createdAt.getTime() + this.config.emailVerificationResendSeconds * 1000 > now.getTime()
      )
        return false;
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + this.config.passwordResetTtlSeconds * 1000),
        },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: user.id,
          actorType: 'USER',
          action: 'PASSWORD_RESET_REQUESTED',
          resourceType: 'user',
          resourceId: user.id,
          requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: Prisma.DbNull,
          createdAt: now,
        },
      });
      return true;
    });
    if (!created) return accepted();

    try {
      const delivery = await this.email.sendPasswordReset({
        userId: user.id,
        to: user.email,
        token,
      });
      await this.db.passwordResetToken.update({
        where: { tokenHash },
        data: {
          deliveryStatus: 'SENT',
          deliveredAt: new Date(),
          providerMessageId: delivery.providerMessageId,
        },
      });
    } catch (error) {
      await this.db.passwordResetToken.updateMany({
        where: { tokenHash, deliveryStatus: 'PENDING' },
        data: { deliveryStatus: 'FAILED', deliveryFailedAt: new Date() },
      });
      this.logger.warn(`Password reset email failed: ${safeErrorCode(error)}`);
    }
    return accepted();
  }

  async confirm(
    token: string,
    newPassword: string,
    ip: string,
    requestId: string,
  ) {
    const tokenHash = hashVerificationToken(token);
    await this.abuse.enforce('password-reset-confirm', ip, tokenHash);
    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();
    const result = await this.db.withTransaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, consumedAt: true, deliveryStatus: true },
      });
      if (
        !record ||
        record.consumedAt ||
        record.deliveryStatus !== 'SENT' ||
        record.expiresAt <= now
      )
        return null;
      const user = await tx.user.findUnique({
        where: { id: record.userId },
        select: { email: true },
      });
      if (!user) return null;
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, consumedAt: null, deliveryStatus: 'SENT', expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.twoFactorLoginChallenge.deleteMany({ where: { userId: record.userId } });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_RESET' },
      });
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: record.userId,
          actorType: 'USER',
          action: 'PASSWORD_RESET_COMPLETED',
          resourceType: 'user',
          resourceId: record.userId,
          requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: Prisma.DbNull,
          createdAt: now,
        },
      });
      return { userId: record.userId, email: user.email };
    });
    if (!result)
      throw new UnauthorizedException({
        code: 'PASSWORD_RESET_INVALID',
        message: 'This password reset link is invalid or has expired.',
      });
    await this.email.safeSecurityNotification({
      userId: result.userId,
      event: 'PASSWORD_CHANGED',
      idempotencyKey: `security-password-reset:${tokenHash}`,
    });
    return { reset: true, changedAt: now.toISOString() };
  }
}

function accepted() {
  return {
    accepted: true,
    message: 'If an eligible Slice account exists, we will send reset instructions shortly.',
  };
}

function safeErrorCode(error: unknown) {
  return error instanceof Error ? error.name : 'EMAIL_DELIVERY_FAILED';
}
