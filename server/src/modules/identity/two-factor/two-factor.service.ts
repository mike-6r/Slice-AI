import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authenticator } from 'otplib';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { RecentAuthService } from '../access/recent-auth.service';
import { AuthAbuseService } from '../auth/auth-abuse.service';
import type { Actor } from '../auth/auth.service';
import {
  PHONE_VERIFICATION_DELIVERY,
  type PhoneVerificationDelivery,
  maskPhone,
} from '../phone-verification/phone-verification.service';
import { TwoFactorCryptoService } from './two-factor-crypto.service';
import { TransactionalEmailService } from '../email-delivery/transactional-email.service';

const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_BYTES = 10;
type TwoFactorMethod = 'TOTP' | 'SMS';
export type SensitiveAction = { kind: 'BANK_DISCONNECT' | 'BANK_DEFAULT_CHANGE'; resourceId: string };

export type TwoFactorLoginChallenge = {
  requiresTwoFactor: true;
  challenge: string;
  method: TwoFactorMethod;
  phone: string | null;
  expiresAt: string;
  resendAvailableAt: string | null;
};

export type TotpEnrollment = {
  issuer: string;
  accountLabel: string;
  manualEntryKey: string;
  otpauthUri: string;
  expiresAt: string;
};

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly crypto: TwoFactorCryptoService,
    private readonly abuse: AuthAbuseService,
    private readonly recentAuth: RecentAuthService,
    @Inject(PHONE_VERIFICATION_DELIVERY)
    private readonly delivery: PhoneVerificationDelivery,
    private readonly transactionalEmail?: TransactionalEmailService,
  ) {}

  async status(actor: Actor) {
    const [totp, sms, user] = await Promise.all([
      this.db.userTwoFactor.findUnique({
        where: { userId: actor.userId },
        select: { enabledAt: true },
      }),
      this.db.userSmsTwoFactor.findUnique({
        where: { userId: actor.userId },
        select: { enabledAt: true },
      }),
      this.db.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { phoneE164: true, phoneVerifiedAt: true },
      }),
    ]);
    const methods = [
      ...(totp?.enabledAt ? (['TOTP'] as const) : []),
      ...(sms?.enabledAt ? (['SMS'] as const) : []),
    ];
    const method = methods[0] ?? null;
    const enabledAt = method === 'TOTP' ? totp?.enabledAt : sms?.enabledAt;
    return {
      enabled: methods.length > 0,
      method,
      methods,
      enabledAt: enabledAt?.toISOString() ?? null,
      phoneVerified: Boolean(user.phoneVerifiedAt),
      phone: user.phoneE164 ? maskPhone(user.phoneE164) : null,
    };
  }

  async beginEnrollment(actor: Actor, ip: string, requestId: string): Promise<TotpEnrollment> {
    this.recentAuth.require(actor);
    await this.abuse.enforce('two-factor-enroll', ip, actor.userId);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { email: true },
    });
    const secret = authenticator.generateSecret(20);
    const now = new Date();
    const existing = await this.db.userTwoFactor.findUnique({
      where: { userId: actor.userId },
      select: { enabledAt: true },
    });
    if (existing?.enabledAt) {
      throw new ConflictException({
        code: 'TWO_FACTOR_ALREADY_ENABLED',
        message: 'Authenticator-app two-factor authentication is already enabled.',
      });
    }
    await this.db.withTransaction(async (tx) => {
      await tx.userTwoFactor.upsert({
        where: { userId: actor.userId },
        create: {
          userId: actor.userId,
          secretCiphertext: this.crypto.encrypt(secret, actor.userId),
          enabledAt: null,
          enrollmentStartedAt: now,
        },
        update: {
          secretCiphertext: this.crypto.encrypt(secret, actor.userId),
          enabledAt: null,
          enrollmentStartedAt: now,
        },
      });
      await tx.twoFactorLoginChallenge.deleteMany({
        where: { userId: actor.userId },
      });
      await this.audit(tx, 'TWO_FACTOR_ENROLLMENT_STARTED', actor.userId, actor.sessionId, requestId, now);
    });
    return {
      issuer: this.config.twoFactorIssuer,
      accountLabel: user.email,
      manualEntryKey: secret,
      otpauthUri: authenticator.keyuri(user.email, this.config.twoFactorIssuer, secret),
      expiresAt: new Date(
        now.getTime() + this.config.twoFactorChallengeTtlSeconds * 1000,
      ).toISOString(),
    };
  }

  async confirmEnrollment(actor: Actor, code: string, ip: string, requestId: string) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('two-factor-confirm', ip, actor.userId);
    const now = new Date();
    const result = await this.db.withTransaction(async (tx) => {
      const enrollment = await tx.userTwoFactor.findUnique({
        where: { userId: actor.userId },
      });
      if (
        !enrollment ||
        enrollment.enabledAt ||
        enrollment.enrollmentStartedAt.getTime() +
          this.config.twoFactorChallengeTtlSeconds * 1000 <=
          now.getTime()
      )
        return null;
      const valid = await this.isValidCode(
        this.crypto.decrypt(enrollment.secretCiphertext, actor.userId),
        code,
      );
      if (!valid) return null;
      const enabled = await tx.userTwoFactor.updateMany({
        where: { userId: actor.userId, enabledAt: null },
        data: { enabledAt: now },
      });
      if (enabled.count !== 1) return null;
      const recoveryCodes = await this.ensureRecoveryCodes(tx, actor.userId);
      await this.audit(tx, 'TWO_FACTOR_ENABLED', actor.userId, actor.sessionId, requestId, now);
      return recoveryCodes;
    });
    if (!result) throw invalidCode();
    void this.transactionalEmail?.safeSecurityNotification({
      userId: actor.userId,
      event: 'MFA_ENABLED',
      idempotencyKey: `security-totp-enabled:${actor.userId}:${now.toISOString()}`,
    });
    return { recoveryCodes: result };
  }

  async beginSmsEnrollment(actor: Actor, ip: string, requestId: string) {
    this.requireSmsEnabled();
    this.recentAuth.require(actor);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        phoneE164: true,
        phoneVerifiedAt: true,
        smsTwoFactor: { select: { enabledAt: true, enrollmentStartedAt: true } },
      },
    });
    if (!user.phoneE164 || !user.phoneVerifiedAt)
      throw new ConflictException({
        code: 'PHONE_VERIFICATION_REQUIRED',
        message: 'Verify a phone number before enabling SMS two-factor authentication.',
      });
    if (user.smsTwoFactor?.enabledAt)
      throw new ConflictException({
        code: 'TWO_FACTOR_ALREADY_ENABLED',
        message: 'SMS two-factor authentication is already enabled.',
      });
    await this.abuse.enforce('two-factor-sms-enroll', ip, actor.userId, user.phoneE164);
    if (
      user.smsTwoFactor &&
      user.smsTwoFactor.enrollmentStartedAt.getTime() +
        this.config.phoneVerificationResendSeconds * 1000 >
        Date.now()
    )
      throw new ConflictException({
        code: 'PHONE_VERIFICATION_RESEND_COOLDOWN',
        message: 'A verification code was recently sent.',
        details: {
          resendAvailableAt: new Date(
            user.smsTwoFactor.enrollmentStartedAt.getTime() +
              this.config.phoneVerificationResendSeconds * 1000,
          ).toISOString(),
        },
      });
    const now = new Date();
    await this.db.userSmsTwoFactor.upsert({
      where: { userId: actor.userId },
      create: { userId: actor.userId, phoneE164: user.phoneE164, enrollmentStartedAt: now },
      update: { phoneE164: user.phoneE164, enabledAt: null, enrollmentStartedAt: now },
    });
    try {
      await this.delivery.deliver({
        userId: actor.userId,
        phoneE164: user.phoneE164,
        purpose: 'MFA_ENROLLMENT',
      });
    } catch (error) {
      await this.db.userSmsTwoFactor.deleteMany({
        where: { userId: actor.userId, enabledAt: null, enrollmentStartedAt: now },
      });
      throw error;
    }
    await this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'TWO_FACTOR_SMS_ENROLLMENT_STARTED',
        resourceType: 'user',
        resourceId: actor.userId,
        requestId,
        sessionId: actor.sessionId,
        result: 'SUCCESS',
        metadata: { phoneLastFour: user.phoneE164.slice(-4) },
        createdAt: now,
      },
    });
    return {
      phone: maskPhone(user.phoneE164),
      resendAvailableAt: new Date(
        now.getTime() + this.config.phoneVerificationResendSeconds * 1000,
      ).toISOString(),
    };
  }

  async confirmSmsEnrollment(actor: Actor, code: string, ip: string, requestId: string) {
    this.requireSmsEnabled();
    this.recentAuth.require(actor);
    const pending = await this.db.userSmsTwoFactor.findUnique({
      where: { userId: actor.userId },
      select: { phoneE164: true, enabledAt: true, enrollmentStartedAt: true },
    });
    if (
      !pending ||
      pending.enabledAt ||
      pending.enrollmentStartedAt.getTime() + this.config.phoneVerificationTtlSeconds * 1000 <= Date.now()
    )
      throw invalidCode();
    await this.abuse.enforce('two-factor-sms-confirm', ip, actor.userId, pending.phoneE164);
    const approved = await this.delivery.verify({
      userId: actor.userId,
      phoneE164: pending.phoneE164,
      code,
      purpose: 'MFA_ENROLLMENT',
    });
    const now = new Date();
    const result = await this.db.withTransaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { phoneE164: true, phoneVerifiedAt: true },
      });
      const row = await tx.userSmsTwoFactor.findUnique({
        where: { userId: actor.userId },
      });
      if (
        !approved ||
        !row ||
        row.enabledAt ||
        row.phoneE164 !== user.phoneE164 ||
        !user.phoneVerifiedAt ||
        row.enrollmentStartedAt.getTime() + this.config.phoneVerificationTtlSeconds * 1000 <= now.getTime()
      )
        return null;
      const updated = await tx.userSmsTwoFactor.updateMany({
        where: { userId: actor.userId, enabledAt: null },
        data: { enabledAt: now },
      });
      if (updated.count !== 1) return null;
      const recoveryCodes = await this.ensureRecoveryCodes(tx, actor.userId);
      await this.audit(
        tx,
        'TWO_FACTOR_SMS_ENABLED',
        actor.userId,
        actor.sessionId,
        requestId,
        now,
        { phoneLastFour: row.phoneE164.slice(-4) },
      );
      return recoveryCodes;
    });
    if (!result) throw invalidCode();
    void this.transactionalEmail?.safeSecurityNotification({
      userId: actor.userId,
      event: 'MFA_ENABLED',
      idempotencyKey: `security-sms-enabled:${actor.userId}:${now.toISOString()}`,
    });
    return { recoveryCodes: result };
  }

  async regenerateRecoveryCodes(actor: Actor, ip: string, requestId: string) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('two-factor-recovery-regenerate', ip, actor.userId);
    const active = await this.hasEnabledMethod(actor.userId);
    if (!active) throw twoFactorDisabled();
    const now = new Date();
    const recoveryCodes = generateRecoveryCodes();
    await this.db.withTransaction(async (tx) => {
      await tx.twoFactorRecoveryCode.updateMany({
        where: { userId: actor.userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((value) => ({
          userId: actor.userId,
          codeHash: hashRecoveryCode(value),
        })),
      });
      await this.audit(
        tx,
        'TWO_FACTOR_RECOVERY_CODES_REGENERATED',
        actor.userId,
        actor.sessionId,
        requestId,
        now,
      );
    });
    return { recoveryCodes };
  }

  async disable(
    actor: Actor,
    input: { method?: TwoFactorMethod; code?: string; recoveryCode?: string },
    ip: string,
    requestId: string,
  ) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('two-factor-disable', ip, actor.userId);
    const [totp, sms] = await Promise.all([
      this.db.userTwoFactor.findUnique({ where: { userId: actor.userId }, select: { enabledAt: true } }),
      this.db.userSmsTwoFactor.findUnique({ where: { userId: actor.userId }, select: { enabledAt: true } }),
    ]);
    const method = input.method ?? (sms?.enabledAt && !totp?.enabledAt ? 'SMS' : 'TOTP');
    const now = new Date();
    const disabled = await this.db.withTransaction(async (tx) => {
      if (method === 'SMS') {
        if (!sms?.enabledAt) return false;
        await tx.userSmsTwoFactor.delete({ where: { userId: actor.userId } });
        await this.audit(tx, 'TWO_FACTOR_SMS_DISABLED', actor.userId, actor.sessionId, requestId, now);
      } else {
        const record = await tx.userTwoFactor.findUnique({ where: { userId: actor.userId } });
        if (!record?.enabledAt) return false;
        const validTotp = input.code
          ? await this.isValidCode(this.crypto.decrypt(record.secretCiphertext, actor.userId), input.code)
          : false;
        const recovery = input.recoveryCode
          ? await tx.twoFactorRecoveryCode.updateMany({
              where: { userId: actor.userId, codeHash: hashRecoveryCode(input.recoveryCode), consumedAt: null },
              data: { consumedAt: now },
            })
          : { count: 0 };
        if (!validTotp && recovery.count !== 1) return false;
        await tx.userTwoFactor.delete({ where: { userId: actor.userId } });
        await this.audit(tx, 'TWO_FACTOR_DISABLED', actor.userId, actor.sessionId, requestId, now);
      }
      await tx.twoFactorLoginChallenge.deleteMany({ where: { userId: actor.userId } });
      const remaining = await tx.userTwoFactor.findUnique({ where: { userId: actor.userId }, select: { enabledAt: true } });
      const remainingSms = await tx.userSmsTwoFactor.findUnique({ where: { userId: actor.userId }, select: { enabledAt: true } });
      if (!remaining?.enabledAt && !remainingSms?.enabledAt)
        await tx.twoFactorRecoveryCode.deleteMany({ where: { userId: actor.userId } });
      return true;
    });
    if (!disabled) throw invalidCode();
    void this.transactionalEmail?.safeSecurityNotification({
      userId: actor.userId,
      event: 'MFA_DISABLED',
      idempotencyKey: `security-mfa-disabled:${actor.userId}:${now.toISOString()}`,
    });
    return { disabled: true };
  }

  async createLoginChallenge(
    userId: string,
    requestId: string,
    ip = 'unknown',
  ): Promise<TwoFactorLoginChallenge | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        phoneE164: true,
        phoneVerifiedAt: true,
        twoFactor: { select: { enabledAt: true } },
        smsTwoFactor: { select: { enabledAt: true } },
      },
    });
    if (!user) return null;
    const method: TwoFactorMethod | null = user.twoFactor?.enabledAt
      ? 'TOTP'
      : user.smsTwoFactor?.enabledAt
        ? 'SMS'
        : null;
    if (!method) return null;
    if (method === 'SMS') {
      this.requireSmsEnabled();
      if (!user.phoneE164 || !user.phoneVerifiedAt) throw new ServiceUnavailableException({
        code: 'MFA_UNAVAILABLE',
        message: 'This account security method is temporarily unavailable.',
      });
    }
    const rawChallenge = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.twoFactorChallengeTtlSeconds * 1000);
    if (method === 'SMS') {
      await this.abuse.enforce('two-factor-sms-login-send', ip, userId);
      await this.delivery.deliver({ userId, phoneE164: user.phoneE164!, purpose: 'MFA_LOGIN' });
    }
    await this.db.withTransaction(async (tx) => {
      await tx.twoFactorLoginChallenge.deleteMany({
        where: { userId, OR: [{ consumedAt: { not: null } }, { expiresAt: { lte: now } }] },
      });
      await tx.twoFactorLoginChallenge.create({
        data: {
          userId,
          tokenHash: hashChallenge(rawChallenge),
          method,
          phoneE164: method === 'SMS' ? user.phoneE164 : null,
          expiresAt,
          lastSentAt: method === 'SMS' ? now : null,
        },
      });
      await this.audit(
        tx,
        method === 'SMS' ? 'TWO_FACTOR_SMS_CHALLENGE_SENT' : 'TWO_FACTOR_LOGIN_CHALLENGE_CREATED',
        userId,
        null,
        requestId,
        now,
        method === 'SMS' ? { method } : undefined,
      );
    });
    return {
      requiresTwoFactor: true,
      challenge: rawChallenge,
      method,
      phone: method === 'SMS' ? maskPhone(user.phoneE164!) : null,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt:
        method === 'SMS'
          ? new Date(now.getTime() + this.config.phoneVerificationResendSeconds * 1000).toISOString()
          : null,
    };
  }

  async resendLoginChallenge(challengeToken: string, ip: string, requestId: string) {
    this.requireSmsEnabled();
    const challenge = await this.db.twoFactorLoginChallenge.findUnique({ where: { tokenHash: hashChallenge(challengeToken) } });
    const now = new Date();
    if (!challenge || challenge.method !== 'SMS' || challenge.consumedAt || challenge.expiresAt <= now || !challenge.phoneE164)
      throw invalidCode();
    const user = await this.db.user.findUnique({
      where: { id: challenge.userId },
      select: {
        phoneE164: true,
        phoneVerifiedAt: true,
        smsTwoFactor: { select: { enabledAt: true } },
      },
    });
    if (
      !user?.smsTwoFactor?.enabledAt ||
      !user.phoneVerifiedAt ||
      user.phoneE164 !== challenge.phoneE164
    )
      throw invalidCode();
    await this.abuse.enforce('two-factor-sms-login-resend', ip, hashChallenge(challengeToken), challenge.phoneE164);
    const resendAt = new Date((challenge.lastSentAt ?? challenge.createdAt).getTime() + this.config.phoneVerificationResendSeconds * 1000);
    if (resendAt > now)
      throw new ConflictException({
        code: 'PHONE_VERIFICATION_RESEND_COOLDOWN',
        message: 'A verification code was recently sent.',
        details: { resendAvailableAt: resendAt.toISOString() },
      });
    await this.delivery.deliver({ userId: challenge.userId, phoneE164: challenge.phoneE164, purpose: 'MFA_LOGIN' });
    await this.db.twoFactorLoginChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
      data: { lastSentAt: now, attemptCount: 0 },
    });
    await this.db.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: challenge.userId,
        actorType: 'USER',
        action: 'TWO_FACTOR_SMS_CHALLENGE_SENT',
        resourceType: 'user',
        resourceId: challenge.userId,
        requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { method: 'SMS' },
        createdAt: now,
      },
    });
    return { resendAvailableAt: new Date(now.getTime() + this.config.phoneVerificationResendSeconds * 1000).toISOString() };
  }

  async beginSensitiveActionChallenge(
    actor: Actor,
    action: SensitiveAction,
    ip: string,
    requestId: string,
  ) {
    const actionKey = sensitiveActionKey(action);
    this.recentAuth.require(actor);
    await this.abuse.enforce('bank-mfa', ip, actor.userId);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        phoneE164: true,
        phoneVerifiedAt: true,
        twoFactor: { select: { enabledAt: true } },
        smsTwoFactor: { select: { enabledAt: true } },
      },
    });
    const method: TwoFactorMethod | null = user.twoFactor?.enabledAt
      ? 'TOTP'
      : user.smsTwoFactor?.enabledAt
        ? 'SMS'
        : null;
    if (method !== 'SMS') return { required: Boolean(method), method, challenge: null, phone: null, expiresAt: null };
    this.requireSmsEnabled();
    if (!user.phoneE164 || !user.phoneVerifiedAt) throw new ServiceUnavailableException({
      code: 'MFA_UNAVAILABLE',
      message: 'This account security method is temporarily unavailable.',
    });
    const rawChallenge = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.twoFactorChallengeTtlSeconds * 1000);
    await this.delivery.deliver({
      userId: actor.userId,
      phoneE164: user.phoneE164,
      purpose: 'MFA_SENSITIVE_ACTION',
    });
    await this.db.withTransaction(async (tx) => {
      await tx.twoFactorActionChallenge.deleteMany({
        where: { userId: actor.userId, action: actionKey, OR: [{ consumedAt: { not: null } }, { expiresAt: { lte: now } }] },
      });
      await tx.twoFactorActionChallenge.create({
        data: {
          userId: actor.userId,
          tokenHash: hashChallenge(rawChallenge),
          action: actionKey,
          method,
          phoneE164: user.phoneE164,
          expiresAt,
          lastSentAt: now,
        },
      });
      await this.audit(tx, 'TWO_FACTOR_SENSITIVE_CHALLENGE_SENT', actor.userId, actor.sessionId, requestId, now, { action: action.kind, resourceId: action.resourceId, method });
    });
    return {
      required: true,
      method,
      challenge: rawChallenge,
      phone: maskPhone(user.phoneE164),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifySensitiveAction(
    actor: Actor,
    input: { action: SensitiveAction; code?: string; challenge?: string },
    ip: string,
    requestId: string,
  ) {
    const actionKey = sensitiveActionKey(input.action);
    this.recentAuth.require(actor);
    await this.abuse.enforce('bank-mfa', ip, actor.userId);
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        phoneE164: true,
        phoneVerifiedAt: true,
        twoFactor: { select: { enabledAt: true, secretCiphertext: true } },
        smsTwoFactor: { select: { enabledAt: true, phoneE164: true } },
      },
    });
    const method: TwoFactorMethod | null = user.twoFactor?.enabledAt
      ? 'TOTP'
      : user.smsTwoFactor?.enabledAt
        ? 'SMS'
        : null;
    if (!method) return { verified: true, method: null };
    if (!input.code) throw sensitiveMfaRequired(method);
    if (method === 'TOTP') {
      const valid = await this.isValidCode(this.crypto.decrypt(user.twoFactor!.secretCiphertext, actor.userId), input.code);
      if (!valid) throw invalidCode();
      await this.db.auditEvent.create({
        data: {
          id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'TWO_FACTOR_SENSITIVE_CHALLENGE_SUCCEEDED',
          resourceType: 'user', resourceId: actor.userId, requestId, sessionId: actor.sessionId, result: 'SUCCESS',
          metadata: { action: input.action.kind, resourceId: input.action.resourceId, method }, createdAt: new Date(),
        },
      });
      return { verified: true, method };
    }
    this.requireSmsEnabled();
    if (!input.challenge || !user.smsTwoFactor?.phoneE164 || !user.phoneVerifiedAt || user.phoneE164 !== user.smsTwoFactor.phoneE164)
      throw sensitiveMfaRequired(method);
    const tokenHash = hashChallenge(input.challenge);
    const pending = await this.db.twoFactorActionChallenge.findUnique({ where: { tokenHash } });
    const now = new Date();
    if (!pending || pending.userId !== actor.userId || pending.action !== actionKey || pending.method !== 'SMS' || pending.consumedAt || pending.expiresAt <= now)
      throw invalidCode();
    const approved = await this.delivery.verify({
      userId: actor.userId,
      phoneE164: user.smsTwoFactor.phoneE164,
      code: input.code,
      purpose: 'MFA_SENSITIVE_ACTION',
    });
    const consumed = await this.db.withTransaction(async (tx) => {
      const current = await tx.twoFactorActionChallenge.findUnique({ where: { id: pending.id } });
      if (!current || current.consumedAt || current.expiresAt <= new Date()) return false;
      if (!approved) {
        const exhausted = current.attemptCount + 1 >= this.config.phoneVerificationMaxAttempts;
        await tx.twoFactorActionChallenge.update({ where: { id: current.id }, data: { attemptCount: { increment: 1 }, consumedAt: exhausted ? new Date() : undefined } });
        await this.audit(tx, 'TWO_FACTOR_SENSITIVE_CHALLENGE_FAILED', actor.userId, actor.sessionId, requestId, new Date(), { action: input.action.kind, resourceId: input.action.resourceId, method }, 'FAILURE');
        return false;
      }
      const updated = await tx.twoFactorActionChallenge.updateMany({ where: { id: current.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (updated.count !== 1) return false;
      await this.audit(tx, 'TWO_FACTOR_SENSITIVE_CHALLENGE_SUCCEEDED', actor.userId, actor.sessionId, requestId, new Date(), { action: input.action.kind, resourceId: input.action.resourceId, method });
      return true;
    });
    if (!consumed) throw invalidCode();
    return { verified: true, method };
  }

  async verifyLoginChallenge(
    input: { challenge: string; code?: string; recoveryCode?: string },
    ip: string,
    requestId: string,
  ) {
    await this.abuse.enforce('two-factor-login', ip, hashChallenge(input.challenge));
    const tokenHash = hashChallenge(input.challenge);
    const pending = await this.db.twoFactorLoginChallenge.findUnique({ where: { tokenHash } });
    if (!pending || pending.consumedAt || pending.expiresAt <= new Date()) throw invalidCode();
    let providerApproved = false;
    if (pending.method === 'SMS' && input.code) {
      this.requireSmsEnabled();
      if (!pending.phoneE164) throw invalidCode();
      await this.abuse.enforce('two-factor-sms-login-check', ip, pending.userId, pending.phoneE164);
      providerApproved = await this.delivery.verify({
        userId: pending.userId,
        phoneE164: pending.phoneE164,
        code: input.code,
        purpose: 'MFA_LOGIN',
      });
    }
    const userId = await this.db.withTransaction(async (tx) => {
      const challenge = await tx.twoFactorLoginChallenge.findUnique({ where: { tokenHash } });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) return null;
      let valid = providerApproved;
      let usedRecovery = false;
      if (challenge.method === 'TOTP' && input.code) {
        const twoFactor = await tx.userTwoFactor.findUnique({ where: { userId: challenge.userId } });
        valid = Boolean(twoFactor?.enabledAt) && await this.isValidCode(
          this.crypto.decrypt(twoFactor!.secretCiphertext, challenge.userId),
          input.code,
        );
      }
      if (!valid && input.recoveryCode) {
        const consumed = await tx.twoFactorRecoveryCode.updateMany({
          where: { userId: challenge.userId, codeHash: hashRecoveryCode(input.recoveryCode), consumedAt: null },
          data: { consumedAt: new Date() },
        });
        usedRecovery = consumed.count === 1;
        valid = usedRecovery;
      }
      if (!valid) {
        const exhausted = challenge.attemptCount + 1 >= this.config.phoneVerificationMaxAttempts;
        await tx.twoFactorLoginChallenge.update({
          where: { id: challenge.id },
          data: { attemptCount: { increment: 1 }, consumedAt: exhausted ? new Date() : undefined },
        });
        if (challenge.method === 'SMS') {
          await this.audit(tx, 'TWO_FACTOR_SMS_CHALLENGE_FAILED', challenge.userId, null, requestId, new Date(), { method: 'SMS' }, 'FAILURE');
        }
        return null;
      }
      const consumedChallenge = await tx.twoFactorLoginChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumedChallenge.count !== 1) return null;
      await this.audit(
        tx,
        challenge.method === 'SMS' ? 'TWO_FACTOR_SMS_CHALLENGE_SUCCEEDED' : usedRecovery ? 'TWO_FACTOR_RECOVERY_CODE_USED' : 'TWO_FACTOR_CHALLENGE_SUCCEEDED',
        challenge.userId,
        null,
        requestId,
        new Date(),
        challenge.method === 'SMS' ? { method: 'SMS' } : undefined,
      );
      return challenge.userId;
    });
    if (!userId) throw invalidCode();
    return userId;
  }

  private async hasEnabledMethod(userId: string) {
    const [totp, sms] = await Promise.all([
      this.db.userTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true } }),
      this.db.userSmsTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true } }),
    ]);
    return Boolean(totp?.enabledAt || sms?.enabledAt);
  }

  private async ensureRecoveryCodes(tx: Prisma.TransactionClient, userId: string) {
    const existing = await tx.twoFactorRecoveryCode.count({ where: { userId, consumedAt: null } });
    if (existing > 0) return [];
    const recoveryCodes = generateRecoveryCodes();
    await tx.twoFactorRecoveryCode.createMany({
      data: recoveryCodes.map((value) => ({ userId, codeHash: hashRecoveryCode(value) })),
    });
    return recoveryCodes;
  }

  private requireSmsEnabled() {
    if (!this.config.phoneVerificationEnabled || (this.config.phoneDeliveryMode === 'local_test' && this.config.environment === 'production'))
      throw new ServiceUnavailableException({
        code: 'SMS_MFA_UNAVAILABLE',
        message: 'SMS two-factor authentication is currently unavailable.',
      });
  }

  private async isValidCode(secret: string, code: string) {
    return authenticator.check(code.replace(/\s/g, ''), secret);
  }

  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    userId: string,
    sessionId: string | null,
    requestId: string,
    now: Date,
    metadata?: Record<string, string>,
    result: 'SUCCESS' | 'FAILURE' = 'SUCCESS',
  ) {
    await tx.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: userId,
        actorType: 'USER',
        action,
        resourceType: 'user',
        resourceId: userId,
        requestId,
        sessionId,
        result,
        metadata: metadata ?? Prisma.DbNull,
        createdAt: now,
      },
    });
  }
}

export async function generateTotpForTest(secret: string) {
  return authenticator.generate(secret);
}

export function hashRecoveryCode(value: string) {
  return createHash('sha256').update(normalizeRecoveryCode(value)).digest('hex');
}

export function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashChallenge(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function sensitiveActionKey(action: SensitiveAction) {
  return `${action.kind}:${action.resourceId}`;
}

function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase();
    return value.match(/.{1,5}/g)!.join('-');
  });
}

function invalidCode() {
  return new UnauthorizedException({
    code: 'TWO_FACTOR_INVALID',
    message: 'The two-factor code is invalid or expired.',
  });
}

function sensitiveMfaRequired(method: TwoFactorMethod) {
  return new ForbiddenException({
    code: 'MFA_REQUIRED',
    message: method === 'TOTP'
      ? 'Enter your authenticator code to continue.'
      : 'Enter the SMS security code to continue.',
    method,
  });
}

function twoFactorDisabled() {
  return new BadRequestException({
    code: 'TWO_FACTOR_NOT_ENABLED',
    message: 'Two-factor authentication is not enabled.',
  });
}
