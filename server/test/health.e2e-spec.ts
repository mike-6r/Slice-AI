import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { IsEmail } from 'class-validator';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';

class TestValidationDto {
  @IsEmail()
  email!: string;
}

@Controller('test')
class TestOnlyController {
  @Post('validation')
  validate(@Body() body: TestValidationDto) {
    return body;
  }

  @Get('failure')
  failure() {
    throw new Error('test-only private failure');
  }
}

@Module({ imports: [AppModule], controllers: [TestOnlyController] })
class E2eAppModule {}

describe('HTTP foundation', () => {
  let app: INestApplication;
  const validRequestId = 'c1b32d9e-4920-4a5a-bd56-4d98663cd0f4';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const databaseUrl = process.env.DATABASE_URL;
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    delete process.env.REDIS_URL;
    app = await createApp(E2eAppModule);
    await app.init();
    if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
    if (testDatabaseUrl) process.env.TEST_DATABASE_URL = testDatabaseUrl;
    if (redisUrl) process.env.REDIS_URL = redisUrl;
  });

  afterAll(async () => app?.close());

  it('returns the dependency-free health response and a generated request ID', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(
        ({
          body,
          headers,
        }: {
          body: Record<string, unknown>;
          headers: Record<string, string>;
        }) => {
          expect(body).toMatchObject({
            status: 'ok',
            service: 'slice-api',
            version: '0.1.0',
          });
          expect(body).not.toHaveProperty('environment');
          expect(typeof body.timestamp).toBe('string');
          expect(headers['x-request-id']).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          );
        },
      );
  });

  it('echoes a valid request ID and replaces an invalid one', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', validRequestId)
      .expect('x-request-id', validRequestId)
      .expect(200);

    await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'not-a-uuid')
      .expect(200)
      .expect(({ headers }: { headers: Record<string, string> }) => {
        expect(headers['x-request-id']).not.toBe('not-a-uuid');
      });
  });

  it('supports HEAD health checks without a response body', async () => {
    await request(app.getHttpServer())
      .head('/health')
      .expect(200)
      .expect(({ text }: { text?: string }) => expect(text ?? '').toBe(''));
  });

  it('sets measured security headers on every API response', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ headers }: { headers: Record<string, string> }) => {
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(headers['referrer-policy']).toBeTruthy();
        expect(headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(headers['x-powered-by']).toBeUndefined();
      });
  });

  it('keeps liveness available while safe readiness reports missing test dependencies', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);

    await request(app.getHttpServer())
      .get('/ready')
      .expect(503)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toEqual(
          expect.objectContaining({
            status: 'not_ready',
            checks: {
              postgres: { status: 'down' },
              redis: { status: 'down' },
            },
            timestamp: expect.any(String),
          }),
        );
        expect(JSON.stringify(body)).not.toContain('localhost');
      });
  });

  it('uses a canonical safe error envelope for an unknown route', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/missing')
      .set('x-request-id', validRequestId)
      .expect(404)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toEqual(
          expect.objectContaining({
            error: {
              code: 'NOT_FOUND',
              message: 'Resource not found.',
            },
            requestId: validRequestId,
            path: '/api/v1/missing',
            timestamp: expect.any(String),
          }),
        );
      });
  });

  it('maps validation, malformed JSON, oversized JSON and unexpected failures safely', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/test/validation')
      .send({ email: 'not-an-email' })
      .expect(400)
      .expect(({ body }: { body: { error: Record<string, unknown> } }) => {
        expect(body.error).toEqual(
          expect.objectContaining({
            code: 'VALIDATION_FAILED',
            fieldErrors: { email: expect.any(Array) },
          }),
        );
      });

    await request(app.getHttpServer())
      .post('/api/v1/test/validation')
      .type('json')
      .send('{')
      .expect(400)
      .expect(({ body }: { body: { error: Record<string, unknown> } }) => {
        expect(body.error.code).toBe('INVALID_JSON');
      });

    await request(app.getHttpServer())
      .post('/api/v1/test/validation')
      .send({ payload: 'x'.repeat(1024 * 1024 + 1024) })
      .expect(413)
      .expect(({ body }: { body: { error: Record<string, unknown> } }) => {
        expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
      });

    await request(app.getHttpServer())
      .get('/api/v1/test/failure')
      .expect(500)
      .expect(({ body }: { body: { error: { message: string } } }) => {
        expect(body.error.message).toBe('An unexpected error occurred.');
        expect(JSON.stringify(body)).not.toContain('test-only private failure');
      });
  });

  it('allows only configured exact CORS origins', async () => {
    await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'http://127.0.0.1:4173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)
      .expect('access-control-allow-origin', 'http://127.0.0.1:4173');

    await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'GET')
      .expect(({ headers }: { headers: Record<string, string> }) => {
        expect(headers['access-control-allow-origin']).toBeUndefined();
      });
  });
});
