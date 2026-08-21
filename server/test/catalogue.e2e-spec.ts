import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl)
  throw new Error('TEST_DATABASE_URL and REDIS_URL are required.');
const runId = `catalogue-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'a sufficiently strong password';

describe('catalogue HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let companyCode: string | undefined;
  let userId: string | undefined;
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      TEST_DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
      COOKIE_SECURE: 'false',
      TRUST_PROXY_HOPS: '1',
    });
    app = await createApp(AppModule);
    await app.init();
    prisma = app.get(PrismaService);
    redis = new Redis(redisUrl, { lazyConnect: true });
    await redis.connect();
  });
  beforeEach(async () => {
    const keys = await redis.keys('slice:test:*');
    if (keys.length) await redis.del(...keys);
  });
  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { requestId: { startsWith: runId } },
          ...(userId ? [{ actorUserId: userId }] : []),
        ],
      },
    });
    await prisma.idempotencyRecord.deleteMany({
      where: { key: { startsWith: runId } },
    });
    await prisma.asset.deleteMany({ where: { slug: { startsWith: runId } } });
    if (companyCode) {
      await prisma.gradeScaleEntry.deleteMany({
        where: { company: { code: companyCode } },
      });
      await prisma.gradingCompany.deleteMany({ where: { code: companyCode } });
    }
    await prisma.collectibleSet.deleteMany({
      where: { slug: { startsWith: runId } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: runId } },
    });
    await prisma.user.deleteMany({
      where: { normalizedEmail: { startsWith: runId } },
    });
    await app.close();
    await redis.quit();
  });
  it('publishes only allowlisted metadata and protects admin catalogue mutations', async () => {
    const publicCategories = await request(app.getHttpServer()).get(
      '/api/v1/categories',
    );
    expect(publicCategories.status).toBe(200);
    expect(publicCategories.headers.etag).toBeDefined();
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/categories')
          .set('if-none-match', publicCategories.headers.etag)
      ).status,
    ).toBe(304);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/admin/categories')
          .set('idempotency-key', `${runId}-anon`)
          .send({ name: 'Nope' })
      ).status,
    ).toBe(401);
    const signup = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .set('idempotency-key', `${runId}-signup`)
      .set('x-forwarded-for', '198.51.100.180')
      .send({
        email: `${runId}@example.test`,
        password,
        displayName: 'Catalogue Admin',
        username: 'qa_catalogue_admin',
      });
    expect(signup.status).toBe(201);
    userId = signup.body.user.id;
    await prisma.roleAssignment.create({
      data: {
        id: `${runId}-admin-role`,
        userId: signup.body.user.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        assignedByUserId: null,
      },
    });
    const auth = {
      authorization: `Bearer ${signup.body.accessToken}`,
      'x-forwarded-for': '198.51.100.181',
    };
    const categoryInput = {
      slug: `${runId}-cards`,
      name: 'Reference Cards',
      iconKey: 'cards',
    };
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set(auth)
      .set('idempotency-key', `${runId}-category`)
      .send(categoryInput);
    expect(first.status).toBe(201);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set(auth)
      .set('idempotency-key', `${runId}-category`)
      .send(categoryInput);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set(auth)
      .set('idempotency-key', `${runId}-category`)
      .send({ ...categoryInput, name: 'Different' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    const set = await request(app.getHttpServer())
      .post('/api/v1/admin/sets')
      .set(auth)
      .set('idempotency-key', `${runId}-set`)
      .send({
        categoryId: first.body.id,
        slug: `${runId}-set`,
        name: 'Reference Set',
        releaseYear: 1999,
      });
    expect(set.status).toBe(201);
    companyCode = `T${Date.now().toString(36)}`.slice(0, 16);
    const company = await request(app.getHttpServer())
      .post('/api/v1/admin/grading-companies')
      .set(auth)
      .set('idempotency-key', `${runId}-company`)
      .send({ code: companyCode, name: 'Test Grading' });
    expect(company.status).toBe(201);
    const grade = await request(app.getHttpServer())
      .post('/api/v1/admin/grades')
      .set(auth)
      .set('idempotency-key', `${runId}-grade`)
      .send({ companyId: company.body.id, grade: '10', label: 'Gem Mint' });
    expect(grade.status).toBe(201);
    const asset = await request(app.getHttpServer())
      .post('/api/v1/admin/catalogue/assets')
      .set(auth)
      .set('idempotency-key', `${runId}-asset`)
      .send({
        categoryId: first.body.id,
        setId: set.body.id,
        slug: `${runId}-asset`,
        title: 'Catalogue Fixture',
        gradeScaleEntryId: grade.body.id,
        certificationNumber: 'TEST-1234',
      });
    expect(asset.status).toBe(201);
    expect(asset.body.certificationNumber).toBeUndefined();
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/admin/catalogue/assets')
      .set(auth)
      .set('idempotency-key', `${runId}-invalid`)
      .send({
        categoryId: first.body.id,
        setId: 'missing',
        slug: `${runId}-invalid`,
        title: 'Invalid Set',
      });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('INVALID_CATEGORY_SET');
    expect(
      (
        await request(app.getHttpServer()).get(
          `/api/v1/catalogue/assets/${runId}-asset`,
        )
      ).status,
    ).toBe(404);
    await prisma.asset.update({
      where: { id: asset.body.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    const published = await request(app.getHttpServer()).get(
      `/api/v1/catalogue/assets/${runId}-asset`,
    );
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      slug: `${runId}-asset`,
      status: 'PUBLISHED',
      grading: { companyCode: company.body.code, grade: '10.00' },
    });
    expect(JSON.stringify(published.body)).not.toMatch(
      /certification|price|marketValue|ownership/i,
    );
    await expect(
      prisma.auditEvent.count({
        where: {
          actorUserId: signup.body.user.id,
          action: { startsWith: 'CATALOGUE_' },
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(5);
  });
});
