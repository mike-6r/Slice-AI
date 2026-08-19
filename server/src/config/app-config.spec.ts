import { loadAppConfig } from './app-config';

describe('loadAppConfig', () => {
  const unitTestEnvironment = { NODE_ENV: 'test' };

  it('uses safe explicit unit-test defaults', () => {
    expect(loadAppConfig(unitTestEnvironment)).toMatchObject({
      environment: 'test',
      host: '127.0.0.1',
      port: 3001,
      stripeBankFundingRail: 'bacs_debit',
    });
  });

  it('exposes an explicit beta deployment mode without treating it as production', () => {
    const beta = loadAppConfig({
      NODE_ENV: 'test',
      APP_ENV: 'beta',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'beta-test-secret-that-is-long-enough',
      APP_PUBLIC_URL: 'https://beta.slice.test',
      CORS_ORIGINS: 'https://beta.slice.test',
      COOKIE_SECURE: 'true',
    });
    expect(beta).toMatchObject({ appEnvironment: 'beta', isBeta: true });
  });

  it('rejects invalid ports', () => {
    expect(() =>
      loadAppConfig({ ...unitTestEnvironment, PORT: '0' }),
    ).toThrow();
  });

  it('trims and deduplicates explicit CORS origins', () => {
    expect(
      loadAppConfig({
        ...unitTestEnvironment,
        CORS_ORIGINS:
          ' http://localhost:4173,https://slice.test,http://localhost:4173 ',
      }).corsOrigins,
    ).toEqual(['http://localhost:4173', 'https://slice.test']);
  });

  it.each(['*', 'null', ''])('rejects unsafe CORS origins: %s', (origins) => {
    expect(() =>
      loadAppConfig({ ...unitTestEnvironment, CORS_ORIGINS: origins }),
    ).toThrow();
  });

  it.each(['16kb', '512kb', '1mb', '2mb'])(
    'accepts body limit %s',
    (bodyLimit) => {
      expect(
        loadAppConfig({ ...unitTestEnvironment, HTTP_BODY_LIMIT: bodyLimit })
          .bodyLimit,
      ).toBe(bodyLimit);
    },
  );

  it.each(['15kb', '3mb', '16mb', 'one megabyte'])(
    'rejects body limit %s',
    (bodyLimit) => {
      expect(() =>
        loadAppConfig({ ...unitTestEnvironment, HTTP_BODY_LIMIT: bodyLimit }),
      ).toThrow();
    },
  );

  it('requires database and Redis URLs outside unit-test mode', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL is required',
    );
    expect(() =>
      loadAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      }),
    ).toThrow('REDIS_URL is required');
  });

  it('fails closed for an enabled production CAPTCHA without a real configured provider', () => {
    const production = {
      NODE_ENV: 'production' as const,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a-production-test-secret-that-is-long-enough',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      COOKIE_SECURE: 'true' as const,
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://app.slice.example',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      CAPTCHA_ENABLED: 'true' as const,
    };
    expect(() => loadAppConfig(production)).toThrow('TURNSTILE_SECRET_KEY');
    expect(() =>
      loadAppConfig({
        ...production,
        CAPTCHA_PROVIDER: 'local_test',
        CAPTCHA_SECRET_KEY: 'test-only-captcha-secret-key-long-enough',
        CAPTCHA_SITE_KEY: 'site-key',
      }),
    ).toThrow('CAPTCHA_PROVIDER=local_test');
  });

  it('requires selected Resend and Twilio Verify credentials in production without local-test fallback', () => {
    const production = {
      NODE_ENV: 'production' as const,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a-production-test-secret-that-is-long-enough',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      COOKIE_SECURE: 'true' as const,
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://app.slice.example',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      CAPTCHA_ENABLED: 'false' as const,
      APP_PUBLIC_URL: 'https://app.slice.example',
      EMAIL_DELIVERY_MODE: 'resend' as const,
      PHONE_DELIVERY_MODE: 'twilio_verify' as const,
    };
    expect(() => loadAppConfig(production)).toThrow(
      'RESEND_API_KEY and RESEND_FROM_EMAIL',
    );
    expect(() =>
      loadAppConfig({
        ...production,
        RESEND_API_KEY: 'resend-test-key',
        RESEND_FROM_EMAIL: 'verify@slice.example',
      }),
    ).toThrow(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID',
    );
    expect(
      loadAppConfig({
        ...production,
        RESEND_API_KEY: 'resend-test-key',
        RESEND_FROM_EMAIL: 'verify@slice.example',
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'twilio-test-token',
        TWILIO_VERIFY_SERVICE_SID: 'VAverify',
      }),
    ).toMatchObject({
      emailDeliveryMode: 'resend',
      phoneDeliveryMode: 'twilio_verify',
    });
  });

  it('accepts Twilio SMS without a Verify Service SID but requires an E.164 sender', () => {
    const sms = {
      NODE_ENV: 'test' as const,
      PHONE_DELIVERY_MODE: 'twilio_sms' as const,
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
    };
    expect(() => loadAppConfig(sms)).toThrow('TWILIO_FROM_NUMBER');
    expect(
      loadAppConfig({ ...sms, TWILIO_FROM_NUMBER: '+447700900000' }),
    ).toMatchObject({
      phoneDeliveryMode: 'twilio_sms',
      twilioFromNumber: '+447700900000',
      twilioVerifyServiceSid: undefined,
    });
    expect(() =>
      loadAppConfig({ ...sms, TWILIO_FROM_NUMBER: 'not-an-e164-sender' }),
    ).toThrow();
  });

  it('rejects insecure production cookies and accepts the secure production default', () => {
    const production = {
      NODE_ENV: 'production' as const,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a-production-test-secret-that-is-long-enough',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://app.slice.example',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      APP_PUBLIC_URL: 'https://app.slice.example',
      RESEND_API_KEY: 'resend-test-key',
      RESEND_FROM_EMAIL: 'verify@slice.example',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
      TWILIO_VERIFY_SERVICE_SID: 'VAverify',
      CAPTCHA_ENABLED: 'false' as const,
    };
    expect(() =>
      loadAppConfig({ ...production, COOKIE_SECURE: 'false' }),
    ).toThrow('COOKIE_SECURE must be true in production.');
    expect(
      loadAppConfig({ ...production, COOKIE_SECURE: 'true' }).cookieSecure,
    ).toBe(true);
  });

  it('requires explicit HTTPS CORS origins and a non-loopback host in production', () => {
    const production = {
      NODE_ENV: 'production' as const,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a-production-test-secret-that-is-long-enough',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      COOKIE_SECURE: 'true' as const,
      HOST: '0.0.0.0',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      APP_PUBLIC_URL: 'https://app.slice.example',
      RESEND_API_KEY: 'resend-test-key',
      RESEND_FROM_EMAIL: 'verify@slice.example',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
      TWILIO_VERIFY_SERVICE_SID: 'VAverify',
      CAPTCHA_ENABLED: 'false' as const,
    };
    expect(() => loadAppConfig(production)).toThrow(
      'CORS_ORIGINS must be explicitly configured',
    );
    expect(() =>
      loadAppConfig({
        ...production,
        CORS_ORIGINS: 'http://app.slice.example',
      }),
    ).toThrow('CORS_ORIGINS must use HTTPS');
    expect(() =>
      loadAppConfig({
        ...production,
        CORS_ORIGINS: 'https://app.slice.example',
        HOST: '127.0.0.1',
      }),
    ).toThrow('HOST must not be a loopback');
    expect(
      loadAppConfig({
        ...production,
        CORS_ORIGINS: 'https://app.slice.example',
      }).corsOrigins,
    ).toEqual(['https://app.slice.example']);
  });

  it.each([
    'javascript:alert(1)',
    'https://slice.test/path',
    'ftp://slice.test',
  ])('rejects malformed CORS origin %s', (origin) => {
    expect(() =>
      loadAppConfig({ ...unitTestEnvironment, CORS_ORIGINS: origin }),
    ).toThrow('CORS_ORIGINS must contain valid HTTP(S) origins only.');
  });

  it('fails closed when explicitly enabled Stripe live mode lacks credentials or webhook key', () => {
    const production = {
      NODE_ENV: 'production' as const,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a-production-test-secret-that-is-long-enough',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://app.slice.example',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      APP_PUBLIC_URL: 'https://app.slice.example',
      RESEND_API_KEY: 'resend-test-key',
      RESEND_FROM_EMAIL: 'verify@slice.example',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
      TWILIO_VERIFY_SERVICE_SID: 'VAverify',
      CAPTCHA_ENABLED: 'false' as const,
      PROVIDER_MODE: 'stripe_live',
      STRIPE_LIVE_ENABLED: 'true',
      PROVIDER_ENCRYPTION_KEY:
        'an-encryption-key-that-is-long-enough-for-tests',
    };
    expect(() => loadAppConfig(production)).toThrow('STRIPE_SECRET_KEY');
    expect(() =>
      loadAppConfig({
        ...production,
        STRIPE_SECRET_KEY: 'stripe-secret-not-a-real-secret',
      }),
    ).toThrow('STRIPE_WEBHOOK_SECRET');
  });

  it('rejects placeholder secrets in Stripe live mode', () => {
    const production = {
      NODE_ENV: 'production' as const,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/slice',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'a-production-test-secret-that-is-long-enough',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-only-two-factor-encryption-key',
      HOST: '0.0.0.0',
      CORS_ORIGINS: 'https://app.slice.example',
      TERMS_POLICY_VERSION: 'terms-production-v1',
      PRIVACY_POLICY_VERSION: 'privacy-production-v1',
      APP_PUBLIC_URL: 'https://app.slice.example',
      RESEND_API_KEY: 'resend-test-key',
      RESEND_FROM_EMAIL: 'verify@slice.example',
      TWILIO_ACCOUNT_SID: 'ACtest',
      TWILIO_AUTH_TOKEN: 'twilio-test-token',
      TWILIO_VERIFY_SERVICE_SID: 'VAverify',
      CAPTCHA_ENABLED: 'false' as const,
      COOKIE_SECURE: 'true' as const,
      PROVIDER_MODE: 'stripe_live' as const,
      STRIPE_LIVE_ENABLED: 'true' as const,
      PROVIDER_ENCRYPTION_KEY: 'replace-with-production-encryption-key',
      STRIPE_SECRET_KEY: 'replace-with-stripe-secret-key',
      STRIPE_WEBHOOK_SECRET: 'a'.repeat(32),
      BLOCKCHAIN_ANALYSIS_API_KEY: 'blockchain-analysis-key',
    };
    expect(() => loadAppConfig(production)).toThrow(
      'PROVIDER_ENCRYPTION_KEY must be supplied from the deployment secret manager.',
    );
  });

  it('keeps Stripe sandbox representable without activating live mode', () => {
    const config = loadAppConfig({
      ...unitTestEnvironment,
      PROVIDER_MODE: 'stripe_sandbox',
      STRIPE_LIVE_ENABLED: 'false',
    });
    expect(config.providerMode).toBe('stripe_sandbox');
    expect(config.stripeLiveEnabled).toBe(false);
  });

  it('rejects the retired US bank funding rail in the GBP product mode', () => {
    expect(() => loadAppConfig({ ...unitTestEnvironment, STRIPE_BANK_FUNDING_RAIL: 'us_bank_account' })).toThrow();
  });

  it('rejects live enablement unless Stripe live mode is selected', () => {
    expect(() =>
      loadAppConfig({ ...unitTestEnvironment, STRIPE_LIVE_ENABLED: 'true' }),
    ).toThrow('STRIPE_LIVE_ENABLED requires PROVIDER_MODE=stripe_live.');
  });

  it('uses explicit proxy hop configuration and rejects the retired broad setting', () => {
    expect(
      loadAppConfig({ ...unitTestEnvironment, TRUST_PROXY_HOPS: '1' })
        .trustProxyHops,
    ).toBe(1);
    expect(() =>
      loadAppConfig({ ...unitTestEnvironment, TRUST_PROXY_HOPS: '-1' }),
    ).toThrow();
    expect(() =>
      loadAppConfig({ ...unitTestEnvironment, TRUST_PROXY: 'true' }),
    ).toThrow('TRUST_PROXY is not supported');
  });

  it('accepts missing dependency URLs only in explicit test mode', () => {
    expect(loadAppConfig({ NODE_ENV: 'test' }).databaseUrl).toBeUndefined();
  });

  it('uses a marked test database URL in test mode', () => {
    expect(
      loadAppConfig({
        NODE_ENV: 'test',
        TEST_DATABASE_URL:
          'postgresql://user:pass@localhost:5432/slice_test?schema=public',
      }).databaseUrl,
    ).toContain('slice_test');
  });

  it.each([
    'mysql://user:pass@localhost:3306/slice',
    'postgresql://user:pass@localhost:5432/slice',
  ])('rejects unsafe test database URL %s', (testDatabaseUrl) => {
    expect(() =>
      loadAppConfig({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: testDatabaseUrl,
      }),
    ).toThrow();
  });
});
