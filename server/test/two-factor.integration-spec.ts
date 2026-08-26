import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { AppConfig } from '../src/config/app-config';
import { RecentAuthService } from '../src/modules/identity/access/recent-auth.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { TwoFactorCryptoService } from '../src/modules/identity/two-factor/two-factor-crypto.service';
import {
  generateTotpForTest,
  TwoFactorService,
} from '../src/modules/identity/two-factor/two-factor.service';
import { LocalTestPhoneDelivery } from '../src/modules/identity/phone-verification/phone-verification.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'TEST_DATABASE_URL is required for two-factor integration tests.',
  );
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `two-factor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = {
  environment: 'test',
  twoFactorEncryptionKey: 'two-factor-integration-key-that-is-long-enough',
  twoFactorChallengeTtlSeconds: 300,
  twoFactorIssuer: 'Slice',
  recentAuthWindowSeconds: 300,
  phoneVerificationEnabled: true,
  phoneDeliveryMode: 'local_test',
  phoneVerificationTtlSeconds: 600,
  phoneVerificationResendSeconds: 60,
  phoneVerificationMaxAttempts: 5,
} as AppConfig;
const delivery = new LocalTestPhoneDelivery();
const service = new TwoFactorService(
  Object.assign(db, {
    withTransaction: <T>(work: (tx: never) => Promise<T>) =>
      db.$transaction(work as never),
  }) as never,
  config,
  new TwoFactorCryptoService(config),
  { enforce: jest.fn().mockResolvedValue(undefined) } as never,
  new RecentAuthService(config),
  delivery,
);

describe('two-factor PostgreSQL authority', () => {
  const userIds: string[] = [];
  beforeAll(async () => db.$connect());
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  async function fixture(label: string, verifiedPhone?: string) {
    const user = await db.user.create({
      data: {
        email: `${runId}-${label}@example.test`,
        normalizedEmail: `${runId}-${label}@example.test`,
        passwordHash: 'test-password-hash',
        accountStatus: 'ACTIVE',
        phoneE164: verifiedPhone,
        phoneVerifiedAt: verifiedPhone ? new Date() : null,
      },
    });
    userIds.push(user.id);
    return {
      user,
      actor: {
        userId: user.id,
        sessionId: `${runId}-${label}-session`,
        authenticatedAt: new Date(),
      } as Actor,
    };
  }

  async function enable(actor: Actor) {
    const enrollment = await service.beginEnrollment(
      actor,
      '198.51.100.1',
      `${runId}-enroll`,
    );
    const code = await generateTotpForTest(enrollment.manualEntryKey);
    const confirmed = await service.confirmEnrollment(
      actor,
      code,
      '198.51.100.2',
      `${runId}-confirm`,
    );
    return { enrollment, code, recoveryCode: confirmed.recoveryCodes[0] };
  }

  it('encrypts the secret, persists recovery hashes only, and consumes recovery codes once', async () => {
    const { user, actor } = await fixture('recovery');
    const enabled = await enable(actor);
    const persisted = await db.userTwoFactor.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(persisted.enabledAt).not.toBeNull();
    expect(persisted.secretCiphertext).not.toContain(
      enabled.enrollment.manualEntryKey,
    );
    expect(
      await db.twoFactorRecoveryCode.count({ where: { userId: user.id } }),
    ).toBe(8);
    expect(
      (
        await db.twoFactorRecoveryCode.findFirstOrThrow({
          where: { userId: user.id },
        })
      ).codeHash,
    ).not.toContain(enabled.recoveryCode);

    const challenge = await service.createLoginChallenge(
      user.id,
      `${runId}-challenge`,
    );
    expect(challenge).not.toBeNull();
    await expect(
      service.verifyLoginChallenge(
        { challenge: challenge!.challenge, recoveryCode: enabled.recoveryCode },
        '198.51.100.3',
        `${runId}-recovery`,
      ),
    ).resolves.toBe(user.id);
    const replay = await service.createLoginChallenge(
      user.id,
      `${runId}-challenge-replay`,
    );
    await expect(
      service.verifyLoginChallenge(
        { challenge: replay!.challenge, recoveryCode: enabled.recoveryCode },
        '198.51.100.4',
        `${runId}-recovery-replay`,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('regenerates codes, expires challenges, and allows exactly one concurrent successful challenge', async () => {
    const { user, actor } = await fixture('challenge');
    const enabled = await enable(actor);
    const replacement = await service.regenerateRecoveryCodes(
      actor,
      '198.51.100.5',
      `${runId}-regenerate`,
    );
    expect(replacement.recoveryCodes).toHaveLength(8);
    const oldChallenge = await service.createLoginChallenge(
      user.id,
      `${runId}-old`,
    );
    await expect(
      service.verifyLoginChallenge(
        {
          challenge: oldChallenge!.challenge,
          recoveryCode: enabled.recoveryCode,
        },
        '198.51.100.6',
        `${runId}-old-code`,
      ),
    ).rejects.toMatchObject({ status: 401 });

    const expired = await service.createLoginChallenge(
      user.id,
      `${runId}-expired`,
    );
    await db.twoFactorLoginChallenge.update({
      where: { tokenHash: hash(expired!.challenge) },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      service.verifyLoginChallenge(
        {
          challenge: expired!.challenge,
          recoveryCode: replacement.recoveryCodes[0],
        },
        '198.51.100.7',
        `${runId}-expired-code`,
      ),
    ).rejects.toMatchObject({ status: 401 });

    const concurrent = await service.createLoginChallenge(
      user.id,
      `${runId}-concurrent`,
    );
    const code = await generateTotpForTest(enabled.enrollment.manualEntryKey);
    const outcomes = await Promise.allSettled([
      service.verifyLoginChallenge(
        { challenge: concurrent!.challenge, code },
        '198.51.100.8',
        `${runId}-a`,
      ),
      service.verifyLoginChallenge(
        { challenge: concurrent!.challenge, code },
        '198.51.100.9',
        `${runId}-b`,
      ),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      await db.auditEvent.count({
        where: {
          actorUserId: user.id,
          action: 'TWO_FACTOR_CHALLENGE_SUCCEEDED',
        },
      }),
    ).toBe(1);
  });

  it('enrolls SMS MFA only for a verified phone and withholds login completion until the SMS check', async () => {
    const phone = '+12025550103';
    const { user, actor } = await fixture('sms', phone);
    const started = await service.beginSmsEnrollment(
      actor,
      '198.51.100.10',
      `${runId}-sms-enroll`,
    );
    expect(started.phone).toContain('0103');
    await expect(
      service.confirmSmsEnrollment(
        actor,
        delivery.codeForTest(user.id, phone, 'MFA_ENROLLMENT')!,
        '198.51.100.11',
        `${runId}-sms-confirm`,
      ),
    ).resolves.toMatchObject({ recoveryCodes: expect.any(Array) });
    await expect(
      db.userSmsTwoFactor.findUniqueOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({ phoneE164: phone, enabledAt: expect.any(Date) });

    const challenge = await service.createLoginChallenge(
      user.id,
      `${runId}-sms-login`,
      '198.51.100.12',
    );
    expect(challenge).toMatchObject({
      requiresTwoFactor: true,
      method: 'SMS',
      phone: expect.stringContaining('0103'),
    });
    const smsCode = delivery.codeForTest(user.id, phone, 'MFA_LOGIN')!;
    await expect(
      service.verifyLoginChallenge(
        { challenge: challenge!.challenge, code: '000000' },
        '198.51.100.13',
        `${runId}-sms-invalid`,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.verifyLoginChallenge(
        { challenge: challenge!.challenge, code: smsCode },
        '198.51.100.13',
        `${runId}-sms-success`,
      ),
    ).resolves.toBe(user.id);
  });
});

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
