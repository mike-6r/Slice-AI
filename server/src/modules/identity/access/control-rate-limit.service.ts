import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../../infrastructure/redis/redis.store';
import { RateLimitedException } from '../auth/auth-abuse.service';

const policies = {
  adminMutation: { limit: 30, ttlSeconds: 3600 },
  auditRead: { limit: 120, ttlSeconds: 3600 },
  catalogueMutation: { limit: 60, ttlSeconds: 3600 },
  submissionMutation: { limit: 60, ttlSeconds: 3600 },
  marketResearch: { limit: 12, ttlSeconds: 3600 },
  referenceImport: { limit: 30, ttlSeconds: 3600 },
  assetLifecycleMutation: { limit: 60, ttlSeconds: 3600 },
  tradingMutation: { limit: 120, ttlSeconds: 3600 },
  providerMutation: { limit: 30, ttlSeconds: 3600 },
} as const;
export type ControlRatePolicy = keyof typeof policies;

@Injectable()
export class ControlRateLimitService {
  constructor(@Inject(CACHE_STORE) private readonly cache: CacheStore) {}

  async enforce(policy: ControlRatePolicy, ip: string, userId: string) {
    const config = policies[policy];
    const keys = [
      this.cache.key(`control-${policy}-ip`, digest(ip)),
      this.cache.key(`control-${policy}-user`, digest(userId)),
    ];
    try {
      for (const key of keys) {
        const counter = await this.cache.incrementWithTtl(
          key,
          config.ttlSeconds,
        );
        if (counter.count > config.limit) {
          throw new RateLimitedException(
            Math.max(1, counter.ttlSeconds),
            config.limit,
            Math.max(0, config.limit - counter.count),
          );
        }
      }
    } catch (error) {
      if (error instanceof RateLimitedException) throw error;
      throw new ServiceUnavailableException({
        code: 'CONTROL_STORE_UNAVAILABLE',
        message: 'Service is temporarily unavailable.',
      });
    }
  }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
