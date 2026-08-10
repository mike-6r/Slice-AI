import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  withTimeout,
  type DependencyHealth,
} from '../../database/prisma.service';

export const CACHE_STORE = Symbol('CACHE_STORE');

export type CacheSetOptions = { ttlSeconds: number; nx?: boolean };
export type CacheCounter = { count: number; ttlSeconds: number };

/** Legacy minimal port retained for the existing offline identity rule tests. */
export interface RedisStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  increment(key: string): Promise<number>;
}

export class RedisUnavailableStore implements RedisStore {
  private unavailable(): never {
    throw new Error('Redis is not configured.');
  }

  async get(_key: string) {
    void _key;
    return this.unavailable();
  }

  async set(_key: string, _value: string, _ttlSeconds?: number) {
    void _key;
    void _value;
    void _ttlSeconds;
    return this.unavailable();
  }

  async delete(_key: string) {
    void _key;
    return this.unavailable();
  }

  async exists(_key: string) {
    void _key;
    return this.unavailable();
  }

  async expire(_key: string, _ttlSeconds: number) {
    void _key;
    void _ttlSeconds;
    return this.unavailable();
  }

  async increment(_key: string) {
    void _key;
    return this.unavailable();
  }
}

export interface CacheStore {
  key(purpose: string, suffix: string): string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: CacheSetOptions): Promise<boolean>;
  delete(key: string): Promise<void>;
  increment(key: string): Promise<number>;
  incrementWithTtl(key: string, ttlSeconds: number): Promise<CacheCounter>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  compareAndDelete(key: string, expectedValue: string): Promise<boolean>;
  ping(timeoutMs?: number): Promise<DependencyHealth>;
  quit(): Promise<void>;
}

@Injectable()
export class RedisCacheStore implements CacheStore {
  private client?: Redis;
  private readonly keyPrefix: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.keyPrefix = `slice:${config.environment}:`;
    if (config.redisUrl) {
      this.client = this.createClient();
    }
  }

  isEnabled() {
    return Boolean(this.client);
  }

  key(purpose: string, suffix: string) {
    if (!/^[a-z0-9_-]+$/i.test(purpose) || !suffix || suffix.includes('..')) {
      throw new Error('Redis keys require a valid purpose and suffix.');
    }
    return `${this.keyPrefix}${purpose}:${suffix}`;
  }

  async connect() {
    let client = this.requireClient();
    if (client.status === 'end') {
      client = this.createClient();
      this.client = client;
    }
    if (client.status === 'wait') {
      await withTimeout(client.connect(), this.config.redisConnectTimeoutMs);
    }
  }

  async get(key: string) {
    return this.requireClient().get(this.assertNamespaced(key));
  }

  async set(key: string, value: string, options: CacheSetOptions) {
    const ttlSeconds = options.ttlSeconds;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error('Redis writes require a positive TTL.');
    }
    const result = options.nx
      ? await this.requireClient().set(
          this.assertNamespaced(key),
          value,
          'EX',
          ttlSeconds,
          'NX',
        )
      : await this.requireClient().set(
          this.assertNamespaced(key),
          value,
          'EX',
          ttlSeconds,
        );
    return result === 'OK';
  }

  async delete(key: string) {
    await this.requireClient().del(this.assertNamespaced(key));
  }

  async increment(key: string) {
    return this.requireClient().incr(this.assertNamespaced(key));
  }

  async incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<CacheCounter> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error('Redis counter expiry requires a positive TTL.');
    }
    const result = (await this.requireClient().eval(
      [
        "local count = redis.call('INCR', KEYS[1])",
        "local ttl = redis.call('TTL', KEYS[1])",
        'if count == 1 or ttl < 0 then',
        "  redis.call('EXPIRE', KEYS[1], ARGV[1])",
        "  ttl = redis.call('TTL', KEYS[1])",
        'end',
        'return { count, ttl }',
      ].join('\n'),
      1,
      this.assertNamespaced(key),
      ttlSeconds,
    )) as [number, number];
    return { count: Number(result[0]), ttlSeconds: Number(result[1]) };
  }

  async expire(key: string, ttlSeconds: number) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error('Redis expiry requires a positive TTL.');
    }
    await this.requireClient().expire(this.assertNamespaced(key), ttlSeconds);
  }

  async compareAndDelete(key: string, expectedValue: string) {
    const result = await this.requireClient().eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      this.assertNamespaced(key),
      expectedValue,
    );
    return result === 1;
  }

  async ping(
    timeoutMs = this.config.redisConnectTimeoutMs,
  ): Promise<DependencyHealth> {
    const start = performance.now();
    await this.connect();
    await withTimeout(this.requireClient().ping(), timeoutMs);
    return { status: 'up', latencyMs: Math.round(performance.now() - start) };
  }

  async quit() {
    if (this.client && this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  private requireClient() {
    if (!this.client) {
      throw new Error('Redis runtime is not configured.');
    }
    return this.client;
  }

  private createClient() {
    const client = new Redis(this.config.redisUrl!, {
      connectTimeout: this.config.redisConnectTimeoutMs,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    return client;
  }

  private assertNamespaced(key: string) {
    if (!key.startsWith(this.keyPrefix)) {
      throw new Error('Redis key is outside the Slice namespace.');
    }
    return key;
  }
}
