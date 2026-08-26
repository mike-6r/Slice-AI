import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import {
  EmailVerificationService,
  LocalTestEmailDelivery,
  hashVerificationToken,
} from '../src/modules/identity/email-verification/email-verification.service';
import type { Actor } from '../src/modules/identity/auth/auth.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'TEST_DATABASE_URL is required for email verification integration tests.',
  );

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const runId = `email-verification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = {
  environment: 'test',
  emailDeliveryMode: 'local_test',
  emailVerificationTtlSeconds: 3_600,
  emailVerificationResendSeconds: 60,
} as AppConfig;
const delivery = new LocalTestEmailDelivery();
const service = new EmailVerificationService(
  Object.assign(db, {
    withTransaction: <T>(work: (tx: never) => Promise<T>) =>
      db.$transaction(work as never),
  }) as never,
  config,
  { enforce: jest.fn().mockResolvedValue(undefined) } as never,
  delivery,
);

describe('email verification PostgreSQL authority', () => {
  const userIds: string[] = [];

  beforeAll(async () => db.$connect());
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  async function user(label: string) {
    const created = await db.user.create({
      data: {
        email: `${runId}-${label}@example.test`,
        normalizedEmail: `${runId}-${label}@example.test`,
        passwordHash: 'test-password-hash',
        accountStatus: 'ACTIVE',
      },
    });
    userIds.push(created.id);
    return {
      user: created,
      actor: {
        userId: created.id,
        sessionId: `${runId}-${label}-session`,
      } as Actor,
    };
  }

  it('stores a digest, consumes a proof exactly once, and serializes concurrent confirmation', async () => {
    const fixture = await user('concurrent');
    await service.send(fixture.actor, '198.51.100.1', `${runId}-send`);
    const proof = delivery.tokenForTest(fixture.user.id)!;
    const token = await db.emailVerificationToken.findFirstOrThrow({
      where: { userId: fixture.user.id },
    });
    expect(token.tokenHash).toBe(hashVerificationToken(proof));
    expect(token.tokenHash).not.toContain(proof);

    const outcomes = await Promise.allSettled([
      service.confirm(proof, '198.51.100.2', `${runId}-confirm-a`),
      service.confirm(proof, '198.51.100.3', `${runId}-confirm-b`),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      await db.emailVerificationToken.count({
        where: { userId: fixture.user.id, consumedAt: { not: null } },
      }),
    ).toBe(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: fixture.user.id } }))
        .emailVerifiedAt,
    ).not.toBeNull();
    expect(
      await db.auditEvent.count({
        where: { actorUserId: fixture.user.id, action: 'EMAIL_VERIFIED' },
      }),
    ).toBe(1);
  });

  it('rejects expiry and supersedes the previous active proof on resend', async () => {
    const fixture = await user('resend');
    await service.send(fixture.actor, '198.51.100.4', `${runId}-first`);
    const first = await db.emailVerificationToken.findFirstOrThrow({
      where: { userId: fixture.user.id },
    });
    await db.emailVerificationToken.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    await service.send(fixture.actor, '198.51.100.5', `${runId}-resend`);
    const tokens = await db.emailVerificationToken.findMany({
      where: { userId: fixture.user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(tokens).toHaveLength(2);
    expect(tokens[0].consumedAt).not.toBeNull();
    expect(tokens[1].consumedAt).toBeNull();
    expect(
      await db.auditEvent.count({
        where: {
          actorUserId: fixture.user.id,
          action: 'EMAIL_VERIFICATION_RESENT',
        },
      }),
    ).toBe(1);

    await db.emailVerificationToken.update({
      where: { id: tokens[1].id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      service.confirm(
        delivery.tokenForTest(fixture.user.id)!,
        '198.51.100.6',
        `${runId}-expired`,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: fixture.user.id } }))
        .emailVerifiedAt,
    ).toBeNull();
  });
});
