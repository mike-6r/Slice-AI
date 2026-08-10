import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import type { CacheStore } from '../../../infrastructure/redis/redis.store';
import { ConfiguredCaptchaVerifier } from './captcha-verifier';

describe('ConfiguredCaptchaVerifier', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const cache = () => {
    const used = new Set<string>();
    return {
      key: jest.fn((purpose: string, suffix: string) => `${purpose}:${suffix}`),
      set: jest.fn(async (key: string) => {
        if (used.has(key)) return false;
        used.add(key);
        return true;
      }),
    } as unknown as CacheStore;
  };

  it('accepts a deterministic local-test proof exactly once', async () => {
    const verifier = new ConfiguredCaptchaVerifier(
      {
        environment: 'test',
        captcha: { enabled: true, provider: 'local_test' },
      } as AppConfig,
      cache(),
    );
    const proof = 'local-test:signup-proof-0001';
    await expect(
      verifier.verify({ token: proof, action: 'signup' }),
    ).resolves.toBeUndefined();
    await expect(
      verifier.verify({ token: proof, action: 'signup' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed local proof and fails closed for an unavailable provider', async () => {
    const local = new ConfiguredCaptchaVerifier(
      {
        environment: 'test',
        captcha: { enabled: true, provider: 'local_test' },
      } as AppConfig,
      cache(),
    );
    await expect(
      local.verify({ token: 'not-a-proof', action: 'signup' }),
    ).rejects.toMatchObject({
      response: { code: 'CAPTCHA_VERIFICATION_FAILED' },
    });
    const provider = new ConfiguredCaptchaVerifier(
      {
        environment: 'production',
        captcha: {
          enabled: true,
          provider: 'cloudflare_turnstile',
        },
      } as unknown as AppConfig,
      cache(),
    );
    await expect(
      provider.verify({
        token: 'provider-token-that-is-never-trusted',
        action: 'signup',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('verifies Turnstile server-side and validates configured hostname/action', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          hostname: 'app.slice.test',
          action: 'signup',
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as typeof fetch;
    const verifier = new ConfiguredCaptchaVerifier(
      {
        environment: 'test',
        captcha: {
          enabled: true,
          provider: 'cloudflare_turnstile',
          secretKey: 'turnstile-test-secret',
          expectedHostname: 'app.slice.test',
          expectedAction: 'signup',
        },
      } as unknown as AppConfig,
      cache(),
    );

    await expect(
      verifier.verify({ token: 'turnstile-token', action: 'signup' }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        secret: 'turnstile-test-secret',
        response: 'turnstile-token',
      }),
    );
  });

  it('rejects failed, duplicate, and mismatched Turnstile responses without falling back', async () => {
    const verifier = new ConfiguredCaptchaVerifier(
      {
        environment: 'test',
        captcha: {
          enabled: true,
          provider: 'cloudflare_turnstile',
          secretKey: 'turnstile-test-secret',
          expectedHostname: 'app.slice.test',
          expectedAction: 'signup',
        },
      } as unknown as AppConfig,
      cache(),
    );
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    await expect(
      verifier.verify({ token: 'spent-token', action: 'signup' }),
    ).rejects.toMatchObject({ response: { code: 'CAPTCHA_VERIFICATION_FAILED' } });

    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          hostname: 'wrong.slice.test',
          action: 'wrong-action',
        }),
        { status: 200 },
      ),
    ) as typeof fetch;
    await expect(
      verifier.verify({ token: 'mismatch-token', action: 'signup' }),
    ).rejects.toMatchObject({ response: { code: 'CAPTCHA_VERIFICATION_FAILED' } });
  });
});
