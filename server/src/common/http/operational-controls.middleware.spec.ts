import { loadAppConfig } from '../../config/app-config';
import {
  createOperationalControlsMiddleware,
  featureForRequest,
} from './operational-controls.middleware';

describe('operational controls middleware', () => {
  const productionConfig = loadAppConfig({
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    CORS_ORIGINS: 'https://app.slice.example',
    DATABASE_URL: 'postgresql://user:password@db.example/slice',
    REDIS_URL: 'rediss://cache.example:6379',
    JWT_ACCESS_SECRET: 'a-production-secret-that-is-at-least-thirty-two-bytes',
    TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
    TERMS_POLICY_VERSION: 'terms-production-v1',
    PRIVACY_POLICY_VERSION: 'privacy-production-v1',
    APP_PUBLIC_URL: 'https://app.slice.example',
    RESEND_API_KEY: 'resend-test-key',
    RESEND_FROM_EMAIL: 'verify@slice.example',
    TWILIO_ACCOUNT_SID: 'ACtest',
    TWILIO_AUTH_TOKEN: 'twilio-test-token',
    TWILIO_VERIFY_SERVICE_SID: 'VAverify',
    CAPTCHA_ENABLED: 'false',
  });

  it('defaults new-risk features off in production and preserves safe recovery paths', () => {
    expect(productionConfig.operationalFeatures).toEqual({
      trading: false,
      deposits: false,
      withdrawals: false,
      realtime: false,
      listing: false,
    });
    expect(
      featureForRequest('DELETE', '/api/v1/trading/orders/order-1'),
    ).toBeUndefined();
    expect(
      featureForRequest('POST', '/api/v1/providers/BRIDGE/webhooks'),
    ).toBeUndefined();
  });

  it('gates only configured risk operations with a canonical safe response', () => {
    const middleware = createOperationalControlsMiddleware(productionConfig);
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    middleware(
      {
        method: 'POST',
        path: '/api/v1/trading/orders',
        originalUrl: '/api/v1/trading/orders',
        requestId: 'phase3-request-id',
      } as never,
      { status, json } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'FEATURE_DISABLED',
          message: 'This operation is temporarily unavailable.',
        },
        requestId: 'phase3-request-id',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows explicitly enabled features and retains local defaults outside production', () => {
    const local = loadAppConfig({ NODE_ENV: 'test' });
    expect(local.operationalFeatures.trading).toBe(true);
    const enabled = loadAppConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://app.slice.example',
      DATABASE_URL: 'postgresql://user:password@db.example/slice',
      REDIS_URL: 'rediss://cache.example:6379',
      JWT_ACCESS_SECRET:
        'a-production-secret-that-is-at-least-thirty-two-bytes',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      APP_PUBLIC_URL: 'https://app.slice.example',
      RESEND_API_KEY: 'resend-test-key',
      RESEND_FROM_EMAIL: 'verify@slice.example',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
      TWILIO_VERIFY_SERVICE_SID: 'VAverify',
      CAPTCHA_ENABLED: 'false',
      OPERATIONAL_TRADING_ENABLED: 'true',
    });
    const next = jest.fn();
    createOperationalControlsMiddleware(enabled)(
      {
        method: 'POST',
        path: '/api/v1/trading/orders',
        originalUrl: '/api/v1/trading/orders',
      } as never,
      { status: jest.fn(), json: jest.fn() } as never,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
