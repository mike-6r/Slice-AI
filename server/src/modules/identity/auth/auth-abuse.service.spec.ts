import { AuthAbuseService, RateLimitedException } from './auth-abuse.service';

function service(counter: (key: string, ttl: number) => { count: number; ttlSeconds: number }) {
  const cache = {
    key: jest.fn((purpose: string, suffix: string) => `${purpose}:${suffix}`),
    incrementWithTtl: jest.fn(async (key: string, ttl: number) => counter(key, ttl)),
  };
  return { instance: new AuthAbuseService(cache as never), cache };
}

describe('AuthAbuseService refresh policies', () => {
  it('allows realistic successful refresh volume but remains bounded', async () => {
    let count = 0;
    const { instance } = service((_key, ttl) => ({ count: ++count, ttlSeconds: ttl }));

    for (let index = 0; index < 120; index += 1)
      await instance.enforce('refresh', '127.0.0.1');

    await expect(instance.enforce('refresh', '127.0.0.1')).rejects.toBeInstanceOf(
      RateLimitedException,
    );
  });

  it('uses a shorter aggressive window for failed refresh attempts', async () => {
    let count = 0;
    const { instance, cache } = service((_key, ttl) => ({ count: ++count, ttlSeconds: ttl }));

    for (let index = 0; index < 10; index += 1)
      await instance.enforce('refresh-failure', '127.0.0.1');

    await expect(instance.enforce('refresh-failure', '127.0.0.1')).rejects.toMatchObject({
      status: 429,
    });
    expect(cache.incrementWithTtl).toHaveBeenLastCalledWith(expect.any(String), 900);
  });
});
