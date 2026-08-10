import { loadAppConfig } from '../src/config/app-config';
import { RedisCacheStore } from '../src/infrastructure/redis/redis.store';
import { ControlRateLimitService } from '../src/modules/identity/access/control-rate-limit.service';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL is required.');

describe('control rate limits', () => {
  const cache = new RedisCacheStore(
    loadAppConfig({ NODE_ENV: 'test', REDIS_URL: redisUrl }),
  );
  const limiter = new ControlRateLimitService(cache);
  const id = `control-limit-${Date.now()}`;
  const ip = `control-limit-ip-${id}`;
  beforeAll(() => cache.connect());
  afterAll(() => cache.quit());

  it('is distributed, TTL-bound and fails closed when Redis is unavailable', async () => {
    await Promise.all(
      Array.from({ length: 30 }, () =>
        limiter.enforce('adminMutation', ip, id),
      ),
    );
    await expect(
      limiter.enforce('adminMutation', ip, id),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: expect.any(Number),
    });
    await cache.quit();
    await expect(
      limiter.enforce('auditRead', '198.51.100.200', `${id}-outage`),
    ).rejects.toMatchObject({ status: 503 });
    await cache.connect();
    await expect(
      limiter.enforce('auditRead', '198.51.100.200', `${id}-outage`),
    ).resolves.toBeUndefined();
  });
});
