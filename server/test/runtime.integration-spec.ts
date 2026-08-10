import { PrismaClient } from '@prisma/client';
import { loadAppConfig, assertTestDatabaseUrl } from '../src/config/app-config';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

if (!databaseUrl || !redisUrl) {
  throw new Error(
    'TEST_DATABASE_URL and REDIS_URL are required for runtime integration tests.',
  );
}

assertTestDatabaseUrl(databaseUrl);

const runId = `runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const cache = new RedisCacheStore(
  loadAppConfig({
    NODE_ENV: 'test',
    TEST_DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
  }),
);

describe('runtime integration', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cache.connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: runId } },
    });
    await cache.quit();
    await prisma.$disconnect();
  });

  it('connects to PostgreSQL and commits or rolls back transactions', async () => {
    const committed = await prisma.$transaction((transaction) =>
      transaction.user.create({
        data: {
          id: `${runId}-committed`,
          email: `${runId}-commit@example.test`,
          normalizedEmail: `${runId}-commit@example.test`,
          passwordHash: 'test-only-hash',
          accountStatus: 'ACTIVE',
        },
      }),
    );
    expect(committed.id).toBe(`${runId}-committed`);

    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.user.create({
          data: {
            id: `${runId}-rolled-back`,
            email: `${runId}-rollback@example.test`,
            normalizedEmail: `${runId}-rollback@example.test`,
            passwordHash: 'test-only-hash',
            accountStatus: 'ACTIVE',
          },
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    await expect(
      prisma.user.findUnique({ where: { id: `${runId}-rolled-back` } }),
    ).resolves.toBeNull();
  });

  it('enforces existing unique and foreign-key constraints', async () => {
    const user = await prisma.user.create({
      data: {
        id: `${runId}-constraints`,
        email: `${runId}-constraint@example.test`,
        normalizedEmail: `${runId}-constraint@example.test`,
        passwordHash: 'test-only-hash',
        accountStatus: 'ACTIVE',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          id: `${runId}-duplicate`,
          email: `${runId}-duplicate@example.test`,
          normalizedEmail: user.normalizedEmail,
          passwordHash: 'test-only-hash',
          accountStatus: 'ACTIVE',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.userProfile.create({
        data: {
          id: `${runId}-orphan-profile`,
          userId: `${runId}-absent-user`,
          displayName: 'Test User',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('proves Redis lifecycle, namespace, TTL, NX, increment and compare-delete behavior', async () => {
    await expect(cache.ping()).resolves.toMatchObject({ status: 'up' });
    const key = cache.key('integration', runId);
    expect(key).toMatch(/^slice:test:integration:/);

    await expect(
      cache.set(key, 'one', { ttlSeconds: 1, nx: true }),
    ).resolves.toBe(true);
    await expect(
      cache.set(key, 'two', { ttlSeconds: 1, nx: true }),
    ).resolves.toBe(false);
    await expect(cache.get(key)).resolves.toBe('one');
    await expect(cache.compareAndDelete(key, 'wrong')).resolves.toBe(false);
    await expect(cache.compareAndDelete(key, 'one')).resolves.toBe(true);

    const counter = cache.key('integration-counter', runId);
    await cache.set(counter, '0', { ttlSeconds: 2 });
    await expect(cache.increment(counter)).resolves.toBe(1);

    const ttlKey = cache.key('integration-ttl', runId);
    await cache.set(ttlKey, 'expires', { ttlSeconds: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(cache.get(ttlKey)).resolves.toBeNull();
    await cache.delete(counter);
  });
});
