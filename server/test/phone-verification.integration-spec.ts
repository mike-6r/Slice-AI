import { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../src/config/app-config';
import type { Actor } from '../src/modules/identity/auth/auth.service';
import { LocalTestPhoneDelivery, PhoneVerificationService } from '../src/modules/identity/phone-verification/phone-verification.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for phone verification integration tests.');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const run = `phone-verification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const config = { environment: 'test', phoneVerificationEnabled: true, phoneDeliveryMode: 'local_test', phoneVerificationTtlSeconds: 600, phoneVerificationResendSeconds: 60, phoneVerificationMaxAttempts: 3 } as AppConfig;
const delivery = new LocalTestPhoneDelivery();
const service = new PhoneVerificationService(Object.assign(db, { withTransaction: <T>(work: (tx: never) => Promise<T>) => db.$transaction(work as never) }) as never, config, { enforce: jest.fn().mockResolvedValue(undefined) } as never, delivery);

describe('phone verification PostgreSQL authority', () => {
  const userIds: string[] = [];
  beforeAll(async () => db.$connect());
  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.phoneVerificationChallenge.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });
  async function user(label: string) {
    const created = await db.user.create({ data: { email: `${run}-${label}@example.test`, normalizedEmail: `${run}-${label}@example.test`, passwordHash: 'test-password-hash', accountStatus: 'ACTIVE' } });
    userIds.push(created.id);
    return { user: created, actor: { userId: created.id, sessionId: `${run}-${label}-session`, status: 'ACTIVE', roles: [], sessionRevokedAt: null, sessionRevocationReason: null, authenticatedAt: new Date() } as unknown as Actor };
  }
  it('stores only a hash and permits exactly one concurrent confirmation', async () => {
    const fixture = await user('concurrent'); const phone = '+12025550100';
    await service.send(fixture.actor, phone, '198.51.100.1', `${run}-send`);
    const code = delivery.codeForTest(fixture.user.id, phone)!;
    const challenge = await db.phoneVerificationChallenge.findFirstOrThrow({ where: { userId: fixture.user.id } });
    expect(challenge.codeHash).not.toContain(code); expect(challenge.codeHash).not.toBe(code);
    const results = await Promise.allSettled([service.confirm(fixture.actor, phone, code, '198.51.100.2', `${run}-a`), service.confirm(fixture.actor, phone, code, '198.51.100.3', `${run}-b`)]);
    expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
    expect(await db.phoneVerificationChallenge.count({ where: { userId: fixture.user.id, consumedAt: { not: null } } })).toBe(1);
    await expect(db.user.findUniqueOrThrow({ where: { id: fixture.user.id } })).resolves.toMatchObject({ phoneE164: phone, phoneVerifiedAt: expect.any(Date) });
  });
  it('supersedes a resend and replaces a prior verified phone only on confirmation', async () => {
    const fixture = await user('change'); const oldPhone = '+12025550101'; const newPhone = '+12025550102';
    await service.send(fixture.actor, oldPhone, '198.51.100.4', `${run}-old`); await service.confirm(fixture.actor, oldPhone, delivery.codeForTest(fixture.user.id, oldPhone)!, '198.51.100.4', `${run}-old-confirm`);
    await service.send(fixture.actor, newPhone, '198.51.100.5', `${run}-new`);
    const firstCode = delivery.codeForTest(fixture.user.id, newPhone)!;
    await expect(service.send(fixture.actor, newPhone, '198.51.100.5', `${run}-too-soon`)).rejects.toMatchObject({ status: 409 });
    expect((await db.user.findUniqueOrThrow({ where: { id: fixture.user.id } })).phoneE164).toBe(oldPhone);
    const first = await db.phoneVerificationChallenge.findFirstOrThrow({ where: { userId: fixture.user.id, phoneE164: newPhone } });
    await db.phoneVerificationChallenge.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 61_000) } });
    await service.send(fixture.actor, newPhone, '198.51.100.6', `${run}-resend`);
    await expect(service.confirm(fixture.actor, newPhone, firstCode, '198.51.100.7', `${run}-old-code`)).rejects.toMatchObject({ status: 401 });
    await expect(service.confirm(fixture.actor, newPhone, delivery.codeForTest(fixture.user.id, newPhone)!, '198.51.100.7', `${run}-new-confirm`)).resolves.toMatchObject({ verified: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: fixture.user.id } })).phoneE164).toBe(newPhone);
    expect((await db.phoneVerificationChallenge.findUniqueOrThrow({ where: { id: first.id } })).supersededAt).not.toBeNull();
  });
});
