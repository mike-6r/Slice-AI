import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../../infrastructure/redis/redis.store';

/** Provider-neutral boundary. Raw CAPTCHA proofs never enter audit or persistence. */
export interface CaptchaVerifier {
  verify(input: { token: string; action: 'signup' }): Promise<void>;
}

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

@Injectable()
export class ConfiguredCaptchaVerifier implements CaptchaVerifier {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
  ) {}

  async verify(input: { token: string; action: 'signup' }) {
    if (!this.config.captcha.enabled) return;
    if (this.config.captcha.provider === 'cloudflare_turnstile')
      return this.verifyTurnstile(input);
    if (this.config.environment === 'production') {
      throw new ServiceUnavailableException({
        code: 'CAPTCHA_UNAVAILABLE',
        message: 'Signup verification is temporarily unavailable.',
      });
    }
    if (!input.token.startsWith('local-test:') || input.token.length < 20) {
      throw new BadRequestException({
        code: 'CAPTCHA_VERIFICATION_FAILED',
        message: 'Signup verification could not be completed.',
      });
    }
    const fingerprint = createHash('sha256').update(input.token).digest('hex');
    try {
      const acquired = await this.cache.set(
        this.cache.key('captcha-proof', fingerprint),
        input.action,
        { ttlSeconds: 600, nx: true },
      );
      if (!acquired) {
        throw new BadRequestException({
          code: 'CAPTCHA_VERIFICATION_FAILED',
          message: 'Signup verification could not be completed.',
        });
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException({
        code: 'CAPTCHA_UNAVAILABLE',
        message: 'Signup verification is temporarily unavailable.',
      });
    }
  }

  private async verifyTurnstile(input: { token: string; action: 'signup' }) {
    if (!this.config.captcha.secretKey) throw this.unavailable();
    try {
      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            secret: this.config.captcha.secretKey,
            response: input.token,
            idempotency_key: randomUUID(),
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = (await response.json()) as {
        success?: unknown;
        hostname?: unknown;
        action?: unknown;
      };
      if (!response.ok || body.success !== true) throw this.failed();
      if (
        this.config.captcha.expectedHostname &&
        body.hostname !== this.config.captcha.expectedHostname
      )
        throw this.failed();
      if (
        this.config.captcha.expectedAction &&
        body.action !== this.config.captcha.expectedAction
      )
        throw this.failed();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.unavailable();
    }
  }

  private failed() {
    return new BadRequestException({
      code: 'CAPTCHA_VERIFICATION_FAILED',
      message: 'Signup verification could not be completed.',
    });
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: 'CAPTCHA_UNAVAILABLE',
      message: 'Signup verification is temporarily unavailable.',
    });
  }
}
