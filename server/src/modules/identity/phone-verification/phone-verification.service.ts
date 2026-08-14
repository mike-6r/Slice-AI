import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { randomInt, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { AuthAbuseService } from '../auth/auth-abuse.service';
import type { Actor } from '../auth/auth.service';

export type PhoneVerificationDelivery = {
  readonly managesVerification?: boolean;
  deliver(input: {
    userId: string;
    phoneE164: string;
    code: string;
  }): Promise<void>;
  verify?(input: { phoneE164: string; code: string }): Promise<boolean>;
};
export const PHONE_VERIFICATION_DELIVERY = Symbol(
  'PHONE_VERIFICATION_DELIVERY',
);

@Injectable()
export class LocalTestPhoneDelivery implements PhoneVerificationDelivery {
  private readonly codes = new Map<string, string>();
  async deliver(input: { userId: string; phoneE164: string; code: string }) {
    this.codes.set(`${input.userId}:${input.phoneE164}`, input.code);
  }
  /** Test-only seam; never exposed by HTTP and not wired in production. */
  codeForTest(userId: string, phoneE164: string) {
    return this.codes.get(`${userId}:${phoneE164}`);
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
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return {
      phonePresent: Boolean(user.phoneE164),
      phone: user.phoneE164 ? maskPhone(user.phoneE164) : null,
      verified: Boolean(user.phoneVerifiedAt),
      verifiedAt: user.phoneVerifiedAt?.toISOString() ?? null,
      canResend:
        !active ||
        active.createdAt.getTime() +
          this.config.phoneVerificationResendSeconds * 1000 <=
          Date.now(),
      resendAvailableAt: active
        ? new Date(
            active.createdAt.getTime() +
              this.config.phoneVerificationResendSeconds * 1000,
          ).toISOString()
        : null,
    };
  }

  async send(actor: Actor, rawPhone: string, ip: string, requestId: string) {
    if (this.config.isBeta)
      throw new ServiceUnavailableException({
        code: 'BETA_DISABLED',
        message: 'Phone verification is not enabled during the current Beta.',
      });
    const phoneE164 = normalizePhone(rawPhone);
    await this.abuse.enforce('phone-send', ip, `${actor.userId}:${phoneE164}`);
    this.requireDelivery();
    const now = new Date();
    const code = generateOtp();
    const codeHash = await argon2.hash(code, { type: argon2.argon2id });
    const outcome = await this.db.withTransaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { accountStatus: true, phoneE164: true, phoneVerifiedAt: true },
      });
      this.assertMutable(user.accountStatus);
      if (user.phoneE164 === phoneE164 && user.phoneVerifiedAt)
        return { kind: 'verified' as const };
      const latest = await tx.phoneVerificationChallenge.findFirst({
        where: {
          userId: actor.userId,
          phoneE164,
          consumedAt: null,
          supersededAt: null,
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
      await tx.phoneVerificationChallenge.create({
        data: {
          userId: actor.userId,
          phoneE164,
          codeHash,
          expiresAt: new Date(
            now.getTime() + this.config.phoneVerificationTtlSeconds * 1000,
          ),
        },
      });
      await this.audit(
        tx,
        actor,
        latest ? 'PHONE_VERIFICATION_RESENT' : 'PHONE_VERIFICATION_SENT',
        requestId,
        now,
        { phoneLastFour: lastFour(phoneE164) },
      );
      return { kind: 'created' as const };
    });
    if (outcome.kind === 'verified')
      return { alreadyVerified: true, resendAvailableAt: null };
    if (outcome.kind === 'cooldown')
      throw new ConflictException({
        code: 'PHONE_VERIFICATION_RESEND_COOLDOWN',
        message: 'A verification code was recently sent.',
        details: { resendAvailableAt: outcome.resendAt.toISOString() },
      });
    await this.delivery.deliver({ userId: actor.userId, phoneE164, code });
    return {
      alreadyVerified: false,
      resendAvailableAt: new Date(
        now.getTime() + this.config.phoneVerificationResendSeconds * 1000,
      ).toISOString(),
    };
  }

  async confirm(
    actor: Actor,
    rawPhone: string,
    code: string,
    ip: string,
    requestId: string,
  ) {
    const phoneE164 = normalizePhone(rawPhone);
    await this.abuse.enforce('phone-confirm', ip, actor.userId);
    const now = new Date();
    try {
      const providerApproved = this.delivery.managesVerification
        ? await this.delivery.verify?.({ phoneE164, code })
        : undefined;
      if (this.delivery.managesVerification && providerApproved !== true)
        throw this.invalid();
      const result = await this.db.withTransaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
        const user = await tx.user.findUniqueOrThrow({
          where: { id: actor.userId },
          select: { accountStatus: true, phoneE164: true },
        });
        this.assertMutable(user.accountStatus);
        const challenge = await tx.phoneVerificationChallenge.findFirst({
          where: {
            userId: actor.userId,
            phoneE164,
            consumedAt: null,
            supersededAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (
          !challenge ||
          challenge.expiresAt <= now ||
          challenge.attemptCount >= this.config.phoneVerificationMaxAttempts
        )
          throw this.invalid();
        // Twilio Verify is the one OTP authority in managed-provider mode.
        const valid = this.delivery.managesVerification
          ? providerApproved === true
          : await argon2.verify(challenge.codeHash, code);
        if (!valid) {
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
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw this.invalid();
        const changed = Boolean(user.phoneE164 && user.phoneE164 !== phoneE164);
        await tx.user.update({
          where: { id: actor.userId },
          data: { phoneE164, phoneVerifiedAt: now },
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
          { phoneLastFour: lastFour(phoneE164) },
        );
        return {
          verified: true,
          verifiedAt: now.toISOString(),
          phone: maskPhone(phoneE164),
        };
      });
      return result;
    } catch (error) {
      if (isPrismaUnique(error))
        throw new ConflictException({
          code: 'PHONE_ALREADY_IN_USE',
          message: 'This phone number cannot be verified for this account.',
        });
      throw error;
    }
  }

  private assertMutable(status: string) {
    if (
      !this.config.phoneVerificationEnabled ||
      ['DEACTIVATED', 'CLOSED'].includes(status)
    )
      throw new ConflictException({
        code: 'ACCOUNT_CONTACT_UPDATE_UNAVAILABLE',
        message: 'Phone verification is unavailable for this account.',
      });
  }
  private requireDelivery() {
    if (
      this.config.phoneDeliveryMode === 'twilio_verify' ||
      this.config.phoneDeliveryMode === 'twilio_sms'
    )
      return;
    if (
      this.config.phoneDeliveryMode === 'local_test' &&
      this.config.environment !== 'production'
    )
      return;
    throw new ServiceUnavailableException({
      code: 'PHONE_DELIVERY_UNAVAILABLE',
      message: 'Phone verification delivery is unavailable.',
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
export function generateOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
function maskPhone(phone: string) {
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
