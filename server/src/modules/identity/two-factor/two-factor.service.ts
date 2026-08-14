import {
  BadRequestException,
  ConflictException,
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
import { TwoFactorCryptoService } from './two-factor-crypto.service';

const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_BYTES = 10;

export type TwoFactorLoginChallenge = {
  requiresTwoFactor: true;
  challenge: string;
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
  ) {}

  async status(actor: Actor) {
    const record = await this.db.userTwoFactor.findUnique({
      where: { userId: actor.userId },
      select: { enabledAt: true },
    });
    return {
      enabled: Boolean(record?.enabledAt),
      enabledAt: record?.enabledAt?.toISOString() ?? null,
    };
  }

  async beginEnrollment(actor: Actor, ip: string, requestId: string) {
    if (this.config.isBeta)
      throw new ServiceUnavailableException({
        code: 'BETA_DISABLED',
        message:
          'Two-factor authentication will be enabled before public launch.',
      });
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
        message: 'Two-factor authentication is already enabled.',
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
      await tx.twoFactorRecoveryCode.deleteMany({
        where: { userId: actor.userId },
      });
      await tx.twoFactorLoginChallenge.deleteMany({
        where: { userId: actor.userId },
      });
      await this.audit(
        tx,
        'TWO_FACTOR_ENROLLMENT_STARTED',
        actor.userId,
        actor.sessionId,
        requestId,
        now,
      );
    });
    return {
      issuer: this.config.twoFactorIssuer,
      accountLabel: user.email,
      manualEntryKey: secret,
      otpauthUri: authenticator.keyuri(
        user.email,
        this.config.twoFactorIssuer,
        secret,
      ),
    };
  }

  async confirmEnrollment(
    actor: Actor,
    code: string,
    ip: string,
    requestId: string,
  ) {
    if (this.config.isBeta)
      throw new ServiceUnavailableException({
        code: 'BETA_DISABLED',
        message:
          'Two-factor authentication will be enabled before public launch.',
      });
    this.recentAuth.require(actor);
    await this.abuse.enforce('two-factor-confirm', ip, actor.userId);
    const now = new Date();
    const result = await this.db.withTransaction(async (tx) => {
      const enrollment = await tx.userTwoFactor.findUnique({
        where: { userId: actor.userId },
      });
      if (!enrollment || enrollment.enabledAt) return null;
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
      const recoveryCodes = generateRecoveryCodes();
      await tx.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((value) => ({
          userId: actor.userId,
          codeHash: hashRecoveryCode(value),
        })),
      });
      await this.audit(
        tx,
        'TWO_FACTOR_ENABLED',
        actor.userId,
        actor.sessionId,
        requestId,
        now,
      );
      return recoveryCodes;
    });
    if (!result) throw invalidCode();
    return { recoveryCodes: result };
  }

  async regenerateRecoveryCodes(actor: Actor, ip: string, requestId: string) {
    this.recentAuth.require(actor);
    await this.abuse.enforce(
      'two-factor-recovery-regenerate',
      ip,
      actor.userId,
    );
    const now = new Date();
    const result = await this.db.withTransaction(async (tx) => {
      const enabled = await tx.userTwoFactor.findUnique({
        where: { userId: actor.userId },
        select: { enabledAt: true },
      });
      if (!enabled?.enabledAt) return null;
      const recoveryCodes = generateRecoveryCodes();
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
      return recoveryCodes;
    });
    if (!result) throw twoFactorDisabled();
    return { recoveryCodes: result };
  }

  async disable(
    actor: Actor,
    input: { code?: string; recoveryCode?: string },
    ip: string,
    requestId: string,
  ) {
    this.recentAuth.require(actor);
    await this.abuse.enforce('two-factor-disable', ip, actor.userId);
    const now = new Date();
    const disabled = await this.db.withTransaction(async (tx) => {
      const record = await tx.userTwoFactor.findUnique({
        where: { userId: actor.userId },
      });
      if (!record?.enabledAt) return false;
      const validTotp = input.code
        ? await this.isValidCode(
            this.crypto.decrypt(record.secretCiphertext, actor.userId),
            input.code,
          )
        : false;
      const recovery = input.recoveryCode
        ? await tx.twoFactorRecoveryCode.updateMany({
            where: {
              userId: actor.userId,
              codeHash: hashRecoveryCode(input.recoveryCode),
              consumedAt: null,
            },
            data: { consumedAt: now },
          })
        : { count: 0 };
      if (!validTotp && recovery.count !== 1) return false;
      await tx.twoFactorLoginChallenge.deleteMany({
        where: { userId: actor.userId },
      });
      await tx.userTwoFactor.delete({ where: { userId: actor.userId } });
      await this.audit(
        tx,
        'TWO_FACTOR_DISABLED',
        actor.userId,
        actor.sessionId,
        requestId,
        now,
      );
      return true;
    });
    if (!disabled) throw invalidCode();
    return { disabled: true };
  }

  async createLoginChallenge(
    userId: string,
    requestId: string,
  ): Promise<TwoFactorLoginChallenge | null> {
    const twoFactor = await this.db.userTwoFactor.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    if (!twoFactor?.enabledAt) return null;
    const rawChallenge = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.twoFactorChallengeTtlSeconds * 1000,
    );
    await this.db.withTransaction(async (tx) => {
      await tx.twoFactorLoginChallenge.deleteMany({
        where: {
          userId,
          OR: [{ consumedAt: { not: null } }, { expiresAt: { lte: now } }],
        },
      });
      await tx.twoFactorLoginChallenge.create({
        data: { userId, tokenHash: hashChallenge(rawChallenge), expiresAt },
      });
      await this.audit(
        tx,
        'TWO_FACTOR_LOGIN_CHALLENGE_CREATED',
        userId,
        null,
        requestId,
        now,
      );
    });
    return {
      requiresTwoFactor: true,
      challenge: rawChallenge,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async verifyLoginChallenge(
    input: { challenge: string; code?: string; recoveryCode?: string },
    ip: string,
    requestId: string,
  ) {
    await this.abuse.enforce(
      'two-factor-login',
      ip,
      hashChallenge(input.challenge),
    );
    const now = new Date();
    const userId = await this.db.withTransaction(async (tx) => {
      const challenge = await tx.twoFactorLoginChallenge.findUnique({
        where: { tokenHash: hashChallenge(input.challenge) },
      });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= now)
        return null;
      const twoFactor = await tx.userTwoFactor.findUnique({
        where: { userId: challenge.userId },
      });
      if (!twoFactor?.enabledAt) return null;
      const validTotp = input.code
        ? await this.isValidCode(
            this.crypto.decrypt(twoFactor.secretCiphertext, challenge.userId),
            input.code,
          )
        : false;
      let usedRecovery = false;
      if (!validTotp && input.recoveryCode) {
        const consumed = await tx.twoFactorRecoveryCode.updateMany({
          where: {
            userId: challenge.userId,
            codeHash: hashRecoveryCode(input.recoveryCode),
            consumedAt: null,
          },
          data: { consumedAt: now },
        });
        usedRecovery = consumed.count === 1;
      }
      if (!validTotp && !usedRecovery) return null;
      const consumedChallenge = await tx.twoFactorLoginChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumedChallenge.count !== 1) throw invalidCode();
      await this.audit(
        tx,
        usedRecovery
          ? 'TWO_FACTOR_RECOVERY_CODE_USED'
          : 'TWO_FACTOR_CHALLENGE_SUCCEEDED',
        challenge.userId,
        null,
        requestId,
        now,
      );
      return challenge.userId;
    });
    if (!userId) throw invalidCode();
    return userId;
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
        result: 'SUCCESS',
        metadata: Prisma.DbNull,
        createdAt: now,
      },
    });
  }
}

export async function generateTotpForTest(secret: string) {
  return authenticator.generate(secret);
}

export function hashRecoveryCode(value: string) {
  return createHash('sha256')
    .update(normalizeRecoveryCode(value))
    .digest('hex');
}

export function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashChallenge(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function generateRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(RECOVERY_CODE_BYTES)
      .toString('hex')
      .toUpperCase();
    return value.match(/.{1,5}/g)!.join('-');
  });
}

function invalidCode() {
  return new UnauthorizedException({
    code: 'TWO_FACTOR_INVALID',
    message: 'The two-factor code is invalid or expired.',
  });
}

function twoFactorDisabled() {
  return new BadRequestException({
    code: 'TWO_FACTOR_NOT_ENABLED',
    message: 'Two-factor authentication is not enabled.',
  });
}
