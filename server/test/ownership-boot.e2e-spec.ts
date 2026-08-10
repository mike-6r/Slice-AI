import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/database/prisma.service';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';

describe('ownership boot probe', () => {
  it('boots the normal real-service app and closes it', async () => {
    const app = await createApp(AppModule);
    await app.init();
    await app.get(PrismaService).$queryRaw`SELECT 1`;
    await app.get(RedisCacheStore).connect();
    const health = await request(app.getHttpServer() as never).get('/health');
    expect(health.status).toBe(200);
    await app.close();
  }, 20_000);
});
