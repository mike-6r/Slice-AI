import { RedisCacheStore } from './redis.store';

describe('RedisCacheStore', () => {
  const config = {
    environment: 'test' as const,
    redisConnectTimeoutMs: 3000,
  };

  it('namespaces every key by environment and purpose', () => {
    const store = new RedisCacheStore(config as never);

    expect(store.key('idempotency', 'request-1')).toBe(
      'slice:test:idempotency:request-1',
    );
    expect(() => store.key('not valid', 'request-1')).toThrow();
    expect(() => store.key('idempotency', '../request-1')).toThrow();
  });

  it('does not permit cache operations without explicit runtime configuration', async () => {
    const store = new RedisCacheStore(config as never);

    await expect(
      store.set('slice:test:idempotency:request-1', 'value', {
        ttlSeconds: 60,
      }),
    ).rejects.toThrow('not configured');
  });
});
