import { createHash } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../../infrastructure/redis/redis.store';

export class RateLimitedException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    readonly limit?: number,
    readonly remaining?: number,
  ) {
    super(
      {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please retry later.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class AuthAbuseService {
  constructor(@Inject(CACHE_STORE) private readonly cache: CacheStore) {}
  async enforce(
    operation:
      | 'signup'
      | 'login'
      | 'refresh'
      | 'refresh-failure'
      | 'logout-all'
      | 'profile'
      | 'password'
      | 'email-send'
      | 'email-confirm'
      | 'two-factor-enroll'
      | 'two-factor-confirm'
      | 'two-factor-login'
      | 'two-factor-recovery-regenerate'
      | 'two-factor-disable'
      | 'session-revoke'
      | 'session-revoke-others'
      | 'preferences'
      | 'data-export'
      | 'account-deactivate'
      | 'deletion-request'
      | 'deletion-cancel'
      | 'phone-send'
      | 'phone-confirm'
      | 'phone-remove'
      | 'two-factor-sms-enroll'
      | 'two-factor-sms-confirm'
      | 'two-factor-sms-login-send'
      | 'two-factor-sms-login-check'
      | 'two-factor-sms-login-resend'
      | 'notification-preferences',
    ip: string,
    accountHint?: string,
    phoneHint?: string,
  ) {
    const limit =
      operation === 'login'
        ? 10
        : operation === 'refresh'
          ? 120
          : operation === 'refresh-failure'
            ? 10
          : operation === 'preferences'
            ? 60
            : 5;
    const ttlSeconds =
      operation === 'login' || operation === 'refresh-failure' ? 900 : 3600;
    const keys = [this.cache.key(`auth-${operation}-ip`, hash(ip))];
    if (accountHint)
      keys.push(this.cache.key(`auth-${operation}-account`, hash(accountHint)));
    if (phoneHint)
      keys.push(this.cache.key(`auth-${operation}-phone`, hash(phoneHint)));
    try {
      for (const key of keys) {
        const counter = await this.cache.incrementWithTtl(key, ttlSeconds);
        if (counter.count > limit)
          throw new RateLimitedException(Math.max(1, counter.ttlSeconds));
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException({
        code: 'PERSISTENCE_UNAVAILABLE',
        message: 'Service is temporarily unavailable.',
      });
    }
  }
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
