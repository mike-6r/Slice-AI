import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';

export type SubmissionHarness = {
  app: INestApplication;
  db: PrismaService;
  inspector: Redis;
  runId: string;
};

export async function bootSubmissionHarness(
  name: string,
): Promise<SubmissionHarness> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl)
    throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
  Object.assign(process.env, {
    NODE_ENV: 'test',
    TEST_DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
    COOKIE_SECURE: 'false',
    TRUST_PROXY_HOPS: '1',
    // E2E provider behavior must never inherit a developer's sandbox or
    // production configuration from server/.env.
    PROVIDER_MODE: 'local',
    PROVIDERS_PRODUCTION_ENABLED: 'false',
    PROVIDER_ENCRYPTION_KEY: 'provider-e2e-local-key-not-production',
    PROVIDER_WEBHOOK_SIGNING_SECRET:
      'slice-local-webhook-signing-secret-not-production',
  });
  const app = await createApp(AppModule);
  await app.init();
  const db = app.get(PrismaService);
  await db.$queryRaw`SELECT 1`;
  await app.get(RedisCacheStore).connect();
  const inspector = new Redis(redisUrl, { lazyConnect: true });
  await inspector.connect();
  return {
    app,
    db,
    inspector,
    runId: `submission-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

export async function signup(
  h: SubmissionHarness,
  label: string,
  offset: number,
) {
  const clientIp = `198.51.${100 + (offset % 100)}.${100 + ((offset * 7) % 100)}`;
  const response = await request(h.app.getHttpServer())
    .post('/api/v1/auth/signup')
    .set('idempotency-key', `${h.runId}-${label}-signup`)
    .set('x-forwarded-for', clientIp)
    .send({
      email: `${h.runId}-${label}@example.test`,
      password: 'a sufficiently strong password',
      displayName: label,
    });
  expect(response.status).toBe(201);
  return {
    id: response.body.user.id as string,
    auth: `Bearer ${response.body.accessToken}`,
    clientIp,
  };
}

export async function closeSubmissionHarness(
  h: SubmissionHarness,
  userIds: string[],
  categoryId: string,
) {
  await h.db.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await h.db.idempotencyRecord.deleteMany({
    where: { key: { startsWith: h.runId } },
  });
  await h.db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await h.db.verificationReview.deleteMany({
    where: { submission: { ownerUserId: { in: userIds } } },
  });
  await h.db.submissionMedia.deleteMany({
    where: { submission: { ownerUserId: { in: userIds } } },
  });
  await h.db.assetSubmission.deleteMany({
    where: { ownerUserId: { in: userIds } },
  });
  await h.db.roleAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await h.db.session.deleteMany({ where: { userId: { in: userIds } } });
  await h.db.user.deleteMany({ where: { id: { in: userIds } } });
  await h.db.category.deleteMany({ where: { id: categoryId } });
  await h.app.close();
  await h.inspector.quit();
}

export async function createCategory(h: SubmissionHarness) {
  const id = `${h.runId}-category`;
  await h.db.category.create({
    data: { id, slug: id, name: 'Submission category' },
  });
  return id;
}
