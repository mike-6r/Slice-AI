import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { AuthAbuseService } from '../auth/auth-abuse.service';
import type { Actor } from '../auth/auth.service';

export type EmailVerificationDelivery = {
  deliver(input: {
    userId: string;
    email: string;
    token: string;
  }): Promise<void>;
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
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly abuse: AuthAbuseService,
    @Inject(EMAIL_VERIFICATION_DELIVERY)
    private readonly delivery: EmailVerificationDelivery,
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
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
    return {
      verified: Boolean(user.emailVerifiedAt),
      verifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      resendAvailableAt: latest
        ? new Date(latest.createdAt.getTime() + 60_000).toISOString()
        : null,
    };
  }

  async send(actor: Actor, ip: string, requestId: string) {
    if (this.config.isBeta)
      throw new ServiceUnavailableException({
        code: 'BETA_DISABLED',
        message:
          'Email verification delivery is not enabled during the current Beta.',
      });
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
        where: { userId: actor.userId, consumedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const resendAvailableAt = recent
        ? new Date(recent.createdAt.getTime() + 60_000)
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
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: recent
            ? 'EMAIL_VERIFICATION_RESENT'
            : 'EMAIL_VERIFICATION_SENT',
          resourceType: 'user',
          resourceId: actor.userId,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: Prisma.DbNull,
          createdAt: now,
        },
      });
      return { kind: 'created' as const, email: user.email };
    });
    if (outcome.kind === 'verified')
      return { alreadyVerified: true, resendAvailableAt: null };
    if (outcome.kind === 'cooldown') {
      return {
        alreadyVerified: false,
        resendAvailableAt: outcome.resendAvailableAt.toISOString(),
      };
    }
    await this.delivery.deliver({
      userId: actor.userId,
      email: outcome.email,
      token,
    });
    return {
      alreadyVerified: false,
      resendAvailableAt: new Date(now.getTime() + 60_000).toISOString(),
    };
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
      if (!record || record.consumedAt || record.expiresAt <= now) return null;
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
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
      return { verified: true, verifiedAt: now.toISOString() };
    });
    if (!result)
      throw new UnauthorizedException({
        code: 'EMAIL_VERIFICATION_INVALID',
        message: 'This verification link is invalid or has expired.',
      });
    return result;
  }

  private requireDelivery() {
    if (this.config.emailDeliveryMode === 'resend') return;
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
}

export function generateVerificationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashVerificationToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
