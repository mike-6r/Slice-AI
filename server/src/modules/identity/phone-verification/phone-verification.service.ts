import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { randomInt, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { AuthAbuseService } from '../auth/auth-abuse.service';
import { RecentAuthService } from '../access/recent-auth.service';
import type { Actor } from '../auth/auth.service';

/** Twilio Verify is the OTP authority outside the local test adapter. */
export type PhoneVerificationDelivery = {
  readonly managesVerification: true;
  deliver(input: {
    userId: string;
    phoneE164: string;
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN';
  }): Promise<void>;
  verify(input: {
    userId: string;
    phoneE164: string;
    code: string;
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN';
  }): Promise<boolean>;
};
export const PHONE_VERIFICATION_DELIVERY = Symbol(
  'PHONE_VERIFICATION_DELIVERY',
);

/** Local-only provider seam for isolated automated tests. */
@Injectable()
export class LocalTestPhoneDelivery implements PhoneVerificationDelivery {
  readonly managesVerification = true;
  private readonly codes = new Map<string, string>();

  async deliver(input: {
    userId: string;
    phoneE164: string;
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN';
  }) {
    this.codes.set(
      this.key(input),
      randomInt(0, 1_000_000).toString().padStart(6, '0'),
    );
  }

  async verify(input: {
    userId: string;
    phoneE164: string;
    code: string;
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN';
  }) {
    return this.codes.get(this.key(input)) === input.code;
  }

  /** Test-only seam; never exposed by HTTP and never wired in production. */
  codeForTest(
    userId: string,
    phoneE164: string,
    purpose: 'PHONE' | 'MFA_ENROLLMENT' | 'MFA_LOGIN' = 'PHONE',
  ) {
    return this.codes.get(this.key({ userId, phoneE164, purpose }));
  }

  private key(input: { userId: string; phoneE164: string; purpose: string }) {
    return `${input.userId}:${input.purpose}:${input.phoneE164}`;
  }
}

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly abuse: AuthAbuseService,
    @Inject(PHONE_VERIFICATION_DELIVERY)
    private readonly delivery: PhoneVerificationDelivery,
    private readonly recentAuth?: RecentAuthService,
  ) {}

  async status(actor: Actor) {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { phoneE164: true, phoneVerifiedAt: true },
    });
    const active = await this.db.phoneVerificationChallenge.findFirst({
      where: {
        userId: actor.userId,
        consumedAt: null,
        supersededAt: null,
        deliveryStatus: 'SENT',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { phoneE164: true, createdAt: true },
    });
    const resendAvailableAt = active
      ? new Date(
          active.createdAt.getTime() +
            this.config.phoneVerificationResendSeconds * 1000,
        )
      : null;
    return {
      phone: user.phoneE164 ? maskPhone(user.phoneE164) : null,
      pendingPhone: active ? maskPhone(active.phoneE164) : null,
      phonePresent: Boolean(user.phoneE164),
      verified: Boolean(user.phoneVerifiedAt),
      verifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
      canResend: !resendAvailableAt || resendAvailableAt <= new Date(),
      resendAvailableAt: resendAvailableAt?.toISOString() ?? null,
    };
  }

  async send(actor: Actor, rawPhone: string, ip: string, requestId: string) {
    this.requireEnabled();
    const phoneE164 = normalizePhone(rawPhone);
    await this.abuse.enforce('phone-send', ip, actor.userId, phoneE164);
    const now = new Date();
    const outcome = await this.db.withTransaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: {
          accountStatus: true,
          phoneE164: true,
          phoneVerifiedAt: true,
          smsTwoFactor: { select: { enabledAt: true } },
        },
      });
      this.assertMutable(user.accountStatus);
      if (user.phoneE164 === phoneE164 && user.phoneVerifiedAt)
        return { kind: 'verified' as const };
      if (user.smsTwoFactor?.enabledAt && user.phoneE164 !== phoneE164)
        throw new ConflictException({
          code: 'PHONE_REQUIRED_FOR_SMS_MFA',
          message: 'Disable SMS two-factor authentication before changing this phone number.',
        });
      const latest = await tx.phoneVerificationChallenge.findFirst({
        where: {
          userId: actor.userId,
          phoneE164,
          consumedAt: null,
          supersededAt: null,
          deliveryStatus: 'SENT',
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latest) {
        const resendAt = new Date(
          latest.createdAt.getTime() +
            this.config.phoneVerificationResendSeconds * 1000,
        );
        if (resendAt > now) return { kind: 'cooldown' as const, resendAt };
      }
      await tx.phoneVerificationChallenge.updateMany({
        where: { userId: actor.userId, consumedAt: null, supersededAt: null },
        data: { supersededAt: now },
      });
      const challenge = await tx.phoneVerificationChallenge.create({
        data: {
          userId: actor.userId,
          phoneE164,
          // Twilio Verify owns OTP generation and validation.
          codeHash: null,
          deliveryStatus: 'PENDING',
          expiresAt: new Date(
            now.getTime() + this.config.phoneVerificationTtlSeconds * 1000,
          ),
        },
        select: { id: true },
      });
      await this.audit(
        tx,
        actor,
        latest ? 'PHONE_VERIFICATION_RESENT' : 'PHONE_VERIFICATION_SENT',
        requestId,
        now,
        { phoneLastFour: lastFour(phoneE164) },
      );
      return { kind: 'created' as const, challengeId: challenge.id };
    });
    if (outcome.kind === 'verified')
      return { alreadyVerified: true, resendAvailableAt: null };
    if (outcome.kind === 'cooldown')
      throw new ConflictException({
        code: 'PHONE_VERIFICATION_RESEND_COOLDOWN',
        message: 'A verification code was recently sent.',
        details: { resendAvailableAt: outcome.resendAt.toISOString() },
      });
    try {
      await this.delivery.deliver({
        userId: actor.userId,
        phoneE164,
        purpose: 'PHONE',
      });
      await this.db.phoneVerificationChallenge.updateMany({
        where: { id: outcome.challengeId, deliveryStatus: 'PENDING' },
        data: { deliveryStatus: 'SENT', deliveredAt: new Date() },
      });
    } catch (error) {
      const failedAt = new Date();
      await this.db.phoneVerificationChallenge.updateMany({
        where: { id: outcome.challengeId, deliveryStatus: 'PENDING' },
        data: {
          deliveryStatus: 'FAILED',
          deliveryFailedAt: failedAt,
          supersededAt: failedAt,
        },
      });
      throw error;
    }
    return {
      alreadyVerified: false,
      resendAvailableAt: new Date(
        now.getTime() + this.config.phoneVerificationResendSeconds * 1000,
      ).toISOString(),
    };
  }

  /** The phone is resolved from Slice's pending challenge; the client sends
   * only the code and cannot switch the verification target during checking. */
  async confirm(actor: Actor, code: string, ip: string, requestId: string) {
    this.requireEnabled();
    const pending = await this.db.phoneVerificationChallenge.findFirst({
      where: {
        userId: actor.userId,
        consumedAt: null,
        supersededAt: null,
        deliveryStatus: 'SENT',
        expiresAt: { gt: new Date() },
        attemptCount: { lt: this.config.phoneVerificationMaxAttempts },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, phoneE164: true },
    });
    if (!pending) throw this.invalid();
    await this.abuse.enforce('phone-confirm', ip, actor.userId, pending.phoneE164);
    const providerApproved = await this.delivery.verify({
      userId: actor.userId,
      phoneE164: pending.phoneE164,
      code,
      purpose: 'PHONE',
    });
    const now = new Date();
    try {
      return await this.db.withTransaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({
          where: { id: actor.userId },
          select: {
            accountStatus: true,
            phoneE164: true,
            smsTwoFactor: { select: { enabledAt: true } },
          },
        });
        this.assertMutable(user.accountStatus);
        const challenge = await tx.phoneVerificationChallenge.findUnique({
          where: { id: pending.id },
        });
        if (
          !challenge ||
          challenge.phoneE164 !== pending.phoneE164 ||
          challenge.deliveryStatus !== 'SENT' ||
          challenge.consumedAt ||
          challenge.supersededAt ||
          challenge.expiresAt <= now ||
          challenge.attemptCount >= this.config.phoneVerificationMaxAttempts
        )
          throw this.invalid();
        if (user.smsTwoFactor?.enabledAt && user.phoneE164 !== pending.phoneE164)
          throw new ConflictException({
            code: 'PHONE_REQUIRED_FOR_SMS_MFA',
            message: 'Disable SMS two-factor authentication before changing this phone number.',
          });
        if (!providerApproved) {
          const exhausted =
            challenge.attemptCount + 1 >=
            this.config.phoneVerificationMaxAttempts;
          await tx.phoneVerificationChallenge.update({
            where: { id: challenge.id },
            data: {
              attemptCount: { increment: 1 },
              supersededAt: exhausted ? now : undefined,
            },
          });
          throw this.invalid();
        }
        const consumed = await tx.phoneVerificationChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            supersededAt: null,
            deliveryStatus: 'SENT',
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw this.invalid();
        const changed = Boolean(user.phoneE164 && user.phoneE164 !== pending.phoneE164);
        await tx.user.update({
          where: { id: actor.userId },
          data: { phoneE164: pending.phoneE164, phoneVerifiedAt: now },
        });
        await tx.phoneVerificationChallenge.updateMany({
          where: {
            userId: actor.userId,
            id: { not: challenge.id },
            consumedAt: null,
            supersededAt: null,
          },
          data: { supersededAt: now },
        });
        await this.audit(
          tx,
          actor,
          changed ? 'PHONE_CHANGED' : 'PHONE_VERIFIED',
          requestId,
          now,
          { phoneLastFour: lastFour(pending.phoneE164) },
        );
        return {
          verified: true,
          verifiedAt: now.toISOString(),
          phone: maskPhone(pending.phoneE164),
        };
      });
    } catch (error) {
      if (isPrismaUnique(error))
        throw new ConflictException({
          code: 'PHONE_ALREADY_IN_USE',
          message: 'This phone number cannot be verified for this account.',
        });
      throw error;
    }
  }

  async remove(actor: Actor, ip: string, requestId: string) {
    this.requireEnabled();
    if (!this.recentAuth)
      throw new ServiceUnavailableException({
        code: 'RECENT_AUTH_UNAVAILABLE',
        message: 'Recent authentication is required for this action.',
      });
    this.recentAuth.require(actor);
    await this.abuse.enforce('phone-remove', ip, actor.userId);
    const now = new Date();
    const removed = await this.db.withTransaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: {
          phoneE164: true,
          phoneVerifiedAt: true,
          smsTwoFactor: { select: { enabledAt: true } },
        },
      });
      if (user.smsTwoFactor?.enabledAt)
        throw new ConflictException({
          code: 'PHONE_REQUIRED_FOR_SMS_MFA',
          message: 'Disable SMS two-factor authentication before removing this phone.',
        });
      if (!user.phoneE164) return false;
      await tx.user.update({
        where: { id: actor.userId },
        data: { phoneE164: null, phoneVerifiedAt: null },
      });
      await tx.phoneVerificationChallenge.updateMany({
        where: { userId: actor.userId, consumedAt: null, supersededAt: null },
        data: { supersededAt: now },
      });
      await tx.userSmsTwoFactor.deleteMany({
        where: { userId: actor.userId, enabledAt: null },
      });
      await this.audit(tx, actor, 'PHONE_REMOVED', requestId, now, {
        phoneLastFour: lastFour(user.phoneE164),
      });
      return Boolean(user.phoneVerifiedAt);
    });
    return { removed };
  }

  private requireEnabled() {
    if (!this.config.phoneVerificationEnabled)
      throw new ServiceUnavailableException({
        code: 'PHONE_DELIVERY_UNAVAILABLE',
        message: 'SMS verification is currently unavailable.',
      });
    if (
      this.config.phoneDeliveryMode === 'local_test' &&
      this.config.environment === 'production'
    )
      throw new ServiceUnavailableException({
        code: 'PHONE_DELIVERY_UNAVAILABLE',
        message: 'SMS verification is currently unavailable.',
      });
  }

  private assertMutable(status: string) {
    if (['DEACTIVATED', 'CLOSED'].includes(status))
      throw new ConflictException({
        code: 'ACCOUNT_CONTACT_UPDATE_UNAVAILABLE',
        message: 'Phone verification is unavailable for this account.',
      });
  }

  private invalid() {
    return new UnauthorizedException({
      code: 'PHONE_VERIFICATION_INVALID',
      message: 'This verification code is invalid or has expired.',
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    requestId: string,
    now: Date,
    metadata: Record<string, string>,
  ) {
    return tx.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action,
        resourceType: 'user',
        resourceId: actor.userId,
        requestId,
        sessionId: actor.sessionId,
        result: 'SUCCESS',
        metadata,
        createdAt: now,
      },
    });
  }
}

export function normalizePhone(value: string) {
  const parsed = parsePhoneNumberFromString(value.trim());
  if (!parsed || !parsed.isValid() || !parsed.number.startsWith('+'))
    throw new ConflictException({
      code: 'PHONE_INVALID',
      message: 'Enter a valid international phone number.',
    });
  return parsed.number;
}

export function maskPhone(phone: string) {
  return `${phone.slice(0, Math.min(3, phone.length - 4))}${'•'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-4)}`;
}

function lastFour(phone: string) {
  return phone.slice(-4);
}

function isPrismaUnique(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
