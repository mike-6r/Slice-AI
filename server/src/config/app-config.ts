import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGINS: z
    .string()
    .default('http://127.0.0.1:4173,http://localhost:4173'),
  SERVICE_VERSION: z.string().min(1).max(64).default('0.1.0'),
  HTTP_BODY_LIMIT: z.string().default('1mb'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  DATABASE_URL: z.string().url().optional(),
  TEST_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  DB_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(3_000),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(3_000),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ISSUER: z.string().min(1).default('slice-api'),
  JWT_AUDIENCE: z.string().min(1).default('slice-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(900)
    .default(900),
  RECENT_AUTH_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(2_592_000)
    .default(2_592_000),
  REFRESH_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .default('slice_refresh'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_DOMAIN: z.string().min(1).optional(),
  PROVIDER_MODE: z.enum(['local', 'sandbox', 'production']).default('local'),
  PROVIDERS_PRODUCTION_ENABLED: z.enum(['true', 'false']).default('false'),
  PROVIDER_ENCRYPTION_KEY: z.string().min(32).optional(),
  BRIDGE_API_KEY: z.string().min(16).optional(),
  BRIDGE_API_BASE_URL: z.string().url().default('https://api.bridge.xyz/v0'),
  BRIDGE_WEBHOOK_PUBLIC_KEY: z.string().min(64).optional(),
  BRIDGE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(10_000),
  PLAID_CLIENT_ID: z.string().min(1).optional(),
  PLAID_SECRET: z.string().min(16).optional(),
  PLAID_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PLAID_IDV_TEMPLATE_ID: z.string().min(1).optional(),
  PLAID_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(10_000),
  DISCORD_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_OAUTH_CLIENT_SECRET: z.string().min(16).optional(),
  DISCORD_OAUTH_REDIRECT_URI: z.string().url().optional(),
  // `provider` is accepted only as a backwards-compatible alias for `resend`.
  EMAIL_DELIVERY_MODE: z.enum(['local_test', 'resend', 'provider']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_FROM_NAME: z.string().trim().min(1).max(128).optional(),
  RESEND_TEST_RECIPIENT_OVERRIDE: z.string().email().optional(),
  APP_PUBLIC_URL: z.string().url().optional(),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86_400)
    .default(3_600),
  PHONE_VERIFICATION_ENABLED: z.enum(['true', 'false']).default('true'),
  // `provider` is accepted only as a backwards-compatible alias for `twilio_verify`.
  PHONE_DELIVERY_MODE: z
    .enum(['local_test', 'twilio_sms', 'twilio_verify', 'provider'])
    .optional(),
  TWILIO_ACCOUNT_SID: z.string().trim().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().trim().min(1).optional(),
  TWILIO_FROM_NUMBER: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().trim().min(1).optional(),
  PHONE_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(900)
    .default(600),
  PHONE_VERIFICATION_RESEND_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3_600)
    .default(60),
  PHONE_VERIFICATION_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(3)
    .max(10)
    .default(5),
  // CAPTCHA is a provider-neutral signup gate.  It is opt-in outside an
  // explicitly configured production deployment; a configured production gate
  // can never silently use the deterministic local adapter.
  CAPTCHA_ENABLED: z.enum(['true', 'false']).default('false'),
  // `provider` is accepted only as a backwards-compatible alias for Turnstile.
  CAPTCHA_PROVIDER: z
    .enum(['local_test', 'cloudflare_turnstile', 'provider'])
    .optional(),
  CAPTCHA_SITE_KEY: z.string().min(1).optional(),
  CAPTCHA_SECRET_KEY: z.string().min(16).optional(),
  CAPTCHA_EXPECTED_ACTION: z.string().trim().min(1).max(128).optional(),
  CAPTCHA_EXPECTED_HOSTNAME: z.string().trim().min(1).max(255).optional(),
  TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().trim().min(1).max(255).optional(),
  TURNSTILE_EXPECTED_ACTION: z.string().trim().min(1).max(128).optional(),
  // Terms and privacy references are configuration, never client authority.
  SIGNUP_CONSENT_REQUIRED: z.enum(['true', 'false']).optional(),
  TERMS_POLICY_VERSION: z.string().trim().min(1).max(128).optional(),
  PRIVACY_POLICY_VERSION: z.string().trim().min(1).max(128).optional(),
  TWO_FACTOR_ENCRYPTION_KEY: z.string().min(32).optional(),
  TWO_FACTOR_CHALLENGE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(900)
    .default(300),
  TWO_FACTOR_ISSUER: z.string().trim().min(1).max(64).default('Slice'),
  BLOCKCHAIN_ANALYSIS_API_KEY: z.string().min(16).optional(),
  BLOCKCHAIN_ANALYSIS_API_BASE_URL: z
    .string()
    .url()
    .default('https://blockchainanalysis.io/api/v1'),
  BLOCKCHAIN_ANALYSIS_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(10_000),
  // Deterministic local-only webhook signing. Never used for Bridge webhooks.
  PROVIDER_WEBHOOK_SIGNING_SECRET: z.string().min(32).optional(),
  PROVIDER_WEBHOOK_PREVIOUS_SIGNING_SECRET: z.string().min(32).optional(),
  PROVIDER_WEBHOOK_PREVIOUS_SECRET_EXPIRES_AT: z.coerce.date().optional(),
  PROVIDER_WEBHOOK_TOLERANCE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  WITHDRAWAL_LIMIT_PER_MOVEMENT_MINOR: z.coerce
    .number()
    .int()
    .min(100)
    .max(5_000_000)
    .default(500_000),
  WITHDRAWAL_LIMIT_24H_MINOR: z.coerce
    .number()
    .int()
    .min(100)
    .max(10_000_000)
    .default(1_000_000),
  WITHDRAWAL_LIMIT_7D_MINOR: z.coerce
    .number()
    .int()
    .min(100)
    .max(25_000_000)
    .default(2_500_000),
  OUTBOX_WORKER_ENABLED: z.enum(['true', 'false']).default('false'),
  OUTBOX_WORKER_ID: z.string().min(1).max(128).optional(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  OUTBOX_LEASE_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OUTBOX_RETRY_BASE_MS: z.coerce
    .number()
    .int()
    .min(10)
    .max(60_000)
    .default(1_000),
  OUTBOX_RETRY_MAX_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(3_600_000)
    .default(60_000),
  // Operations controls are deliberately explicit. Production defaults to fail closed;
  // non-production environments retain their local test/development behavior unless set.
  OPERATIONAL_TRADING_ENABLED: z.enum(['true', 'false']).optional(),
  OPERATIONAL_DEPOSITS_ENABLED: z.enum(['true', 'false']).optional(),
  OPERATIONAL_WITHDRAWALS_ENABLED: z.enum(['true', 'false']).optional(),
  OPERATIONAL_REALTIME_ENABLED: z.enum(['true', 'false']).optional(),
  OPERATIONAL_LISTING_ENABLED: z.enum(['true', 'false']).optional(),
  // Explicitly opt-in local diskless upload transport for staging only. Real
  // production remains fail-closed until object storage is approved.
  LOCAL_SUBMISSION_STORAGE_ENABLED: z.enum(['true', 'false']).optional(),
});

export type AppConfig = {
  environment: 'development' | 'test' | 'production';
  host: string;
  port: number;
  corsOrigins: string[];
  serviceVersion: string;
  bodyLimit: string;
  trustProxyHops: number;
  databaseUrl?: string;
  testDatabaseUrl?: string;
  redisUrl?: string;
  dbConnectTimeoutMs: number;
  redisConnectTimeoutMs: number;
  jwtAccessSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  recentAuthWindowSeconds: number;
  refreshTokenTtlSeconds: number;
  refreshCookieName: string;
  cookieSecure: boolean;
  cookieDomain?: string;
  providerMode: 'local' | 'sandbox' | 'production';
  providersProductionEnabled: boolean;
  providerEncryptionKey?: string;
  bridgeApiKey?: string;
  bridgeApiBaseUrl: string;
  bridgeWebhookPublicKey?: string;
  bridgeRequestTimeoutMs: number;
  plaidClientId?: string;
  plaidSecret?: string;
  plaidEnvironment: 'sandbox' | 'production';
  plaidIdentityVerificationTemplateId?: string;
  plaidRequestTimeoutMs: number;
  discordOauthClientId?: string;
  discordOauthClientSecret?: string;
  discordOauthRedirectUri?: string;
  emailDeliveryMode: 'local_test' | 'resend';
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
  resendTestRecipientOverride?: string;
  appPublicUrl: string;
  emailVerificationTtlSeconds: number;
  phoneVerificationEnabled: boolean;
  phoneDeliveryMode: 'local_test' | 'twilio_sms' | 'twilio_verify';
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  twilioVerifyServiceSid?: string;
  phoneVerificationTtlSeconds: number;
  phoneVerificationResendSeconds: number;
  phoneVerificationMaxAttempts: number;
  captcha: {
    enabled: boolean;
    provider: 'local_test' | 'cloudflare_turnstile';
    siteKey?: string;
    secretKey?: string;
    expectedAction?: string;
    expectedHostname?: string;
  };
  signupConsent: {
    required: boolean;
    termsVersion?: string;
    privacyVersion?: string;
  };
  twoFactorEncryptionKey?: string;
  twoFactorChallengeTtlSeconds: number;
  twoFactorIssuer: string;
  blockchainAnalysisApiKey?: string;
  blockchainAnalysisApiBaseUrl: string;
  blockchainAnalysisRequestTimeoutMs: number;
  providerWebhookSigningSecret?: string;
  providerWebhookPreviousSigningSecret?: string;
  providerWebhookPreviousSecretExpiresAt?: Date;
  providerWebhookToleranceSeconds: number;
  withdrawalLimitPerMovementMinor: number;
  withdrawalLimit24hMinor: number;
  withdrawalLimit7dMinor: number;
  outboxWorkerEnabled: boolean;
  outboxWorkerId?: string;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  outboxLeaseMs: number;
  outboxMaxAttempts: number;
  outboxRetryBaseMs: number;
  outboxRetryMaxMs: number;
  operationalFeatures: {
    trading: boolean;
    deposits: boolean;
    withdrawals: boolean;
    realtime: boolean;
    listing: boolean;
  };
  localSubmissionStorageEnabled: boolean;
};

export const APP_CONFIG = Symbol('APP_CONFIG');

const validBodyLimits = new Set([
  '16kb',
  '32kb',
  '64kb',
  '128kb',
  '256kb',
  '512kb',
  '1mb',
  '2mb',
]);

export function loadAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
  if (environment.TRUST_PROXY !== undefined) {
    throw new Error(
      'TRUST_PROXY is not supported. Configure TRUST_PROXY_HOPS explicitly.',
    );
  }
  const parsed = configSchema.parse(environment);
  const origins = [
    ...new Set(
      parsed.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
  if (
    origins.length === 0 ||
    origins.some((origin) => origin === '*' || origin === 'null')
  ) {
    throw new Error(
      'CORS_ORIGINS must contain one or more explicit origins only.',
    );
  }
  for (const origin of origins) {
    try {
      const parsedOrigin = new URL(origin);
      if (
        parsedOrigin.origin !== origin ||
        !['http:', 'https:'].includes(parsedOrigin.protocol)
      ) {
        throw new Error();
      }
    } catch {
      throw new Error('CORS_ORIGINS must contain valid HTTP(S) origins only.');
    }
  }
  const bodyLimit = parsed.HTTP_BODY_LIMIT.toLowerCase();
  if (!validBodyLimits.has(bodyLimit)) {
    throw new Error('HTTP_BODY_LIMIT must be between 16kb and 2mb.');
  }
  const databaseUrl =
    parsed.NODE_ENV === 'test'
      ? (parsed.TEST_DATABASE_URL ?? parsed.DATABASE_URL)
      : parsed.DATABASE_URL;
  if (parsed.NODE_ENV !== 'test' && !databaseUrl) {
    throw new Error('DATABASE_URL is required outside NODE_ENV=test.');
  }
  if (parsed.NODE_ENV !== 'test' && !parsed.REDIS_URL) {
    throw new Error('REDIS_URL is required outside NODE_ENV=test.');
  }
  if (databaseUrl) {
    assertPostgresUrl(databaseUrl, 'DATABASE_URL');
  }
  if (parsed.TEST_DATABASE_URL) {
    assertTestDatabaseUrl(parsed.TEST_DATABASE_URL);
  }
  if (parsed.REDIS_URL) {
    assertRedisUrl(parsed.REDIS_URL);
  }
  if (parsed.NODE_ENV !== 'test' && !parsed.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET is required outside NODE_ENV=test.');
  }
  if (parsed.NODE_ENV === 'production' && parsed.COOKIE_SECURE === 'false') {
    throw new Error('COOKIE_SECURE must be true in production.');
  }
  if (parsed.NODE_ENV === 'production' && !parsed.TWO_FACTOR_ENCRYPTION_KEY) {
    throw new Error('TWO_FACTOR_ENCRYPTION_KEY is required in production.');
  }
  const captchaEnabled = parsed.CAPTCHA_ENABLED === 'true';
  const captchaProviderRaw =
    parsed.CAPTCHA_PROVIDER ??
    (parsed.NODE_ENV === 'test' ? 'local_test' : 'cloudflare_turnstile');
  const captchaProvider =
    captchaProviderRaw === 'provider'
      ? 'cloudflare_turnstile'
      : captchaProviderRaw;
  const turnstileSiteKey = parsed.TURNSTILE_SITE_KEY ?? parsed.CAPTCHA_SITE_KEY;
  const turnstileSecretKey =
    parsed.TURNSTILE_SECRET_KEY ?? parsed.CAPTCHA_SECRET_KEY;
  const turnstileExpectedAction =
    parsed.TURNSTILE_EXPECTED_ACTION ?? parsed.CAPTCHA_EXPECTED_ACTION;
  const turnstileExpectedHostname =
    parsed.TURNSTILE_EXPECTED_HOSTNAME ?? parsed.CAPTCHA_EXPECTED_HOSTNAME;
  if (parsed.NODE_ENV === 'production' && captchaProvider === 'local_test') {
    throw new Error(
      'CAPTCHA_PROVIDER=local_test is not permitted in production.',
    );
  }
  if (
    captchaEnabled &&
    captchaProvider === 'cloudflare_turnstile' &&
    parsed.NODE_ENV === 'production' &&
    !turnstileSecretKey
  ) {
    throw new Error(
      'TURNSTILE_SECRET_KEY is required when CAPTCHA is enabled in production.',
    );
  }
  if (parsed.NODE_ENV === 'production' && captchaEnabled && !turnstileSiteKey) {
    throw new Error(
      'TURNSTILE_SITE_KEY is required when CAPTCHA is enabled in production.',
    );
  }
  const emailDeliveryModeRaw =
    parsed.EMAIL_DELIVERY_MODE ??
    (parsed.NODE_ENV === 'test' ? 'local_test' : 'resend');
  const emailDeliveryMode =
    emailDeliveryModeRaw === 'provider' ? 'resend' : emailDeliveryModeRaw;
  const phoneDeliveryModeRaw =
    parsed.PHONE_DELIVERY_MODE ??
    (parsed.NODE_ENV === 'test' ? 'local_test' : 'twilio_verify');
  const phoneDeliveryMode =
    phoneDeliveryModeRaw === 'provider'
      ? 'twilio_verify'
      : phoneDeliveryModeRaw;
  const appPublicUrl =
    parsed.APP_PUBLIC_URL ??
    (parsed.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:5173');
  if (!appPublicUrl)
    throw new Error('APP_PUBLIC_URL is required in production.');
  if (
    parsed.NODE_ENV === 'production' &&
    new URL(appPublicUrl).protocol !== 'https:'
  )
    throw new Error('APP_PUBLIC_URL must use HTTPS in production.');
  if (
    parsed.NODE_ENV === 'production' &&
    emailDeliveryMode === 'resend' &&
    (!parsed.RESEND_API_KEY || !parsed.RESEND_FROM_EMAIL)
  )
    throw new Error(
      'RESEND_API_KEY and RESEND_FROM_EMAIL are required for Resend in production.',
    );
  if (
    parsed.NODE_ENV === 'production' &&
    phoneDeliveryMode === 'twilio_verify' &&
    (!parsed.TWILIO_ACCOUNT_SID ||
      !parsed.TWILIO_AUTH_TOKEN ||
      !parsed.TWILIO_VERIFY_SERVICE_SID)
  )
    throw new Error(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID are required for Twilio Verify in production.',
    );
  if (
    phoneDeliveryMode === 'twilio_sms' &&
    (!parsed.TWILIO_ACCOUNT_SID ||
      !parsed.TWILIO_AUTH_TOKEN ||
      !parsed.TWILIO_FROM_NUMBER)
  )
    throw new Error(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required for Twilio SMS.',
    );
  if (parsed.NODE_ENV === 'production' && parsed.RESEND_TEST_RECIPIENT_OVERRIDE)
    throw new Error(
      'RESEND_TEST_RECIPIENT_OVERRIDE is not permitted in production.',
    );
  const signupConsentRequired =
    parsed.SIGNUP_CONSENT_REQUIRED === undefined
      ? parsed.NODE_ENV !== 'test'
      : parsed.SIGNUP_CONSENT_REQUIRED === 'true';
  if (parsed.NODE_ENV === 'production' && !signupConsentRequired) {
    throw new Error('SIGNUP_CONSENT_REQUIRED must be true in production.');
  }
  if (parsed.NODE_ENV === 'production') {
    if (!environment.CORS_ORIGINS) {
      throw new Error(
        'CORS_ORIGINS must be explicitly configured in production.',
      );
    }
    if (origins.some((origin) => new URL(origin).protocol !== 'https:')) {
      throw new Error('CORS_ORIGINS must use HTTPS origins in production.');
    }
    if (['127.0.0.1', 'localhost', '::1'].includes(parsed.HOST)) {
      throw new Error('HOST must not be a loopback address in production.');
    }
    assertNoPlaceholderSecret(parsed.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET');
  }
  const providersProductionEnabled =
    parsed.PROVIDERS_PRODUCTION_ENABLED === 'true';
  const operationalFeatureDefault = parsed.NODE_ENV !== 'production';
  const localSubmissionStorageEnabled =
    parsed.LOCAL_SUBMISSION_STORAGE_ENABLED === 'true' ||
    (parsed.LOCAL_SUBMISSION_STORAGE_ENABLED === undefined &&
      parsed.NODE_ENV !== 'production');
  if (providersProductionEnabled && parsed.PROVIDER_MODE !== 'production') {
    throw new Error(
      'PROVIDERS_PRODUCTION_ENABLED requires PROVIDER_MODE=production.',
    );
  }
  if (parsed.PROVIDER_MODE === 'production' && !providersProductionEnabled) {
    throw new Error(
      'Provider production mode is fail-closed until explicitly enabled.',
    );
  }
  if (providersProductionEnabled && !parsed.PROVIDER_ENCRYPTION_KEY) {
    throw new Error(
      'PROVIDER_ENCRYPTION_KEY is required when production providers are enabled.',
    );
  }
  if (providersProductionEnabled && !parsed.BRIDGE_API_KEY) {
    throw new Error(
      'BRIDGE_API_KEY is required when production providers are enabled.',
    );
  }
  if (providersProductionEnabled && !parsed.BRIDGE_WEBHOOK_PUBLIC_KEY) {
    throw new Error(
      'BRIDGE_WEBHOOK_PUBLIC_KEY is required when production providers are enabled.',
    );
  }
  if (
    providersProductionEnabled &&
    (!parsed.PLAID_CLIENT_ID ||
      !parsed.PLAID_SECRET ||
      !parsed.PLAID_IDV_TEMPLATE_ID)
  ) {
    throw new Error(
      'PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_IDV_TEMPLATE_ID are required when production providers are enabled.',
    );
  }
  if (providersProductionEnabled && !parsed.BLOCKCHAIN_ANALYSIS_API_KEY) {
    throw new Error(
      'BLOCKCHAIN_ANALYSIS_API_KEY is required when production providers are enabled.',
    );
  }
  if (providersProductionEnabled) {
    if (parsed.PLAID_ENV !== 'production') {
      throw new Error(
        'PLAID_ENV must be production when production providers are enabled.',
      );
    }
    assertNoPlaceholderSecret(
      parsed.PROVIDER_ENCRYPTION_KEY,
      'PROVIDER_ENCRYPTION_KEY',
    );
    assertNoPlaceholderSecret(parsed.BRIDGE_API_KEY, 'BRIDGE_API_KEY');
    assertNoPlaceholderSecret(
      parsed.BRIDGE_WEBHOOK_PUBLIC_KEY,
      'BRIDGE_WEBHOOK_PUBLIC_KEY',
    );
    assertNoPlaceholderSecret(parsed.PLAID_CLIENT_ID, 'PLAID_CLIENT_ID');
    assertNoPlaceholderSecret(parsed.PLAID_SECRET, 'PLAID_SECRET');
    assertNoPlaceholderSecret(
      parsed.PLAID_IDV_TEMPLATE_ID,
      'PLAID_IDV_TEMPLATE_ID',
    );
    assertNoPlaceholderSecret(
      parsed.BLOCKCHAIN_ANALYSIS_API_KEY,
      'BLOCKCHAIN_ANALYSIS_API_KEY',
    );
  }
  if (
    signupConsentRequired &&
    (!parsed.TERMS_POLICY_VERSION || !parsed.PRIVACY_POLICY_VERSION)
  ) {
    throw new Error(
      'TERMS_POLICY_VERSION and PRIVACY_POLICY_VERSION are required when signup consent is required.',
    );
  }
  if (parsed.OUTBOX_RETRY_MAX_MS < parsed.OUTBOX_RETRY_BASE_MS) {
    throw new Error(
      'OUTBOX_RETRY_MAX_MS must be greater than or equal to OUTBOX_RETRY_BASE_MS.',
    );
  }

  return {
    environment: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    corsOrigins: origins,
    serviceVersion: parsed.SERVICE_VERSION,
    bodyLimit,
    trustProxyHops: parsed.TRUST_PROXY_HOPS,
    databaseUrl,
    testDatabaseUrl: parsed.TEST_DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    dbConnectTimeoutMs: parsed.DB_CONNECT_TIMEOUT_MS,
    redisConnectTimeoutMs: parsed.REDIS_CONNECT_TIMEOUT_MS,
    jwtAccessSecret:
      parsed.JWT_ACCESS_SECRET ??
      'test-only-jwt-secret-must-never-be-used-outside-tests',
    jwtIssuer: parsed.JWT_ISSUER,
    jwtAudience: parsed.JWT_AUDIENCE,
    accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
    recentAuthWindowSeconds: parsed.RECENT_AUTH_WINDOW_SECONDS,
    refreshTokenTtlSeconds: parsed.REFRESH_TOKEN_TTL_SECONDS,
    refreshCookieName: parsed.REFRESH_COOKIE_NAME,
    cookieSecure: parsed.COOKIE_SECURE
      ? parsed.COOKIE_SECURE === 'true'
      : parsed.NODE_ENV === 'production',
    cookieDomain: parsed.COOKIE_DOMAIN,
    providerMode: parsed.PROVIDER_MODE,
    providersProductionEnabled,
    providerEncryptionKey: parsed.PROVIDER_ENCRYPTION_KEY,
    bridgeApiKey: parsed.BRIDGE_API_KEY,
    bridgeApiBaseUrl: parsed.BRIDGE_API_BASE_URL.replace(/\/$/, ''),
    bridgeWebhookPublicKey: parsed.BRIDGE_WEBHOOK_PUBLIC_KEY,
    bridgeRequestTimeoutMs: parsed.BRIDGE_REQUEST_TIMEOUT_MS,
    plaidClientId: parsed.PLAID_CLIENT_ID,
    plaidSecret: parsed.PLAID_SECRET,
    plaidEnvironment: parsed.PLAID_ENV,
    plaidIdentityVerificationTemplateId: parsed.PLAID_IDV_TEMPLATE_ID,
    plaidRequestTimeoutMs: parsed.PLAID_REQUEST_TIMEOUT_MS,
    discordOauthClientId: parsed.DISCORD_OAUTH_CLIENT_ID,
    discordOauthClientSecret: parsed.DISCORD_OAUTH_CLIENT_SECRET,
    discordOauthRedirectUri: parsed.DISCORD_OAUTH_REDIRECT_URI,
    emailDeliveryMode,
    resendApiKey: parsed.RESEND_API_KEY,
    resendFromEmail: parsed.RESEND_FROM_EMAIL,
    resendFromName: parsed.RESEND_FROM_NAME,
    resendTestRecipientOverride:
      parsed.NODE_ENV === 'production'
        ? undefined
        : parsed.RESEND_TEST_RECIPIENT_OVERRIDE,
    appPublicUrl: appPublicUrl.replace(/\/$/, ''),
    emailVerificationTtlSeconds: parsed.EMAIL_VERIFICATION_TTL_SECONDS,
    phoneVerificationEnabled: parsed.PHONE_VERIFICATION_ENABLED === 'true',
    phoneDeliveryMode,
    twilioAccountSid: parsed.TWILIO_ACCOUNT_SID,
    twilioAuthToken: parsed.TWILIO_AUTH_TOKEN,
    twilioFromNumber: parsed.TWILIO_FROM_NUMBER,
    twilioVerifyServiceSid: parsed.TWILIO_VERIFY_SERVICE_SID,
    phoneVerificationTtlSeconds: parsed.PHONE_VERIFICATION_TTL_SECONDS,
    phoneVerificationResendSeconds: parsed.PHONE_VERIFICATION_RESEND_SECONDS,
    phoneVerificationMaxAttempts: parsed.PHONE_VERIFICATION_MAX_ATTEMPTS,
    captcha: {
      enabled: captchaEnabled,
      provider: captchaProvider,
      siteKey: turnstileSiteKey,
      secretKey: turnstileSecretKey,
      expectedAction: turnstileExpectedAction,
      expectedHostname: turnstileExpectedHostname,
    },
    signupConsent: {
      required: signupConsentRequired,
      termsVersion: parsed.TERMS_POLICY_VERSION,
      privacyVersion: parsed.PRIVACY_POLICY_VERSION,
    },
    twoFactorEncryptionKey: parsed.TWO_FACTOR_ENCRYPTION_KEY,
    twoFactorChallengeTtlSeconds: parsed.TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    twoFactorIssuer: parsed.TWO_FACTOR_ISSUER,
    blockchainAnalysisApiKey: parsed.BLOCKCHAIN_ANALYSIS_API_KEY,
    blockchainAnalysisApiBaseUrl:
      parsed.BLOCKCHAIN_ANALYSIS_API_BASE_URL.replace(/\/$/, ''),
    blockchainAnalysisRequestTimeoutMs:
      parsed.BLOCKCHAIN_ANALYSIS_REQUEST_TIMEOUT_MS,
    providerWebhookSigningSecret: parsed.PROVIDER_WEBHOOK_SIGNING_SECRET,
    providerWebhookPreviousSigningSecret:
      parsed.PROVIDER_WEBHOOK_PREVIOUS_SIGNING_SECRET,
    providerWebhookPreviousSecretExpiresAt:
      parsed.PROVIDER_WEBHOOK_PREVIOUS_SECRET_EXPIRES_AT,
    providerWebhookToleranceSeconds: parsed.PROVIDER_WEBHOOK_TOLERANCE_SECONDS,
    withdrawalLimitPerMovementMinor: parsed.WITHDRAWAL_LIMIT_PER_MOVEMENT_MINOR,
    withdrawalLimit24hMinor: parsed.WITHDRAWAL_LIMIT_24H_MINOR,
    withdrawalLimit7dMinor: parsed.WITHDRAWAL_LIMIT_7D_MINOR,
    outboxWorkerEnabled: parsed.OUTBOX_WORKER_ENABLED === 'true',
    outboxWorkerId: parsed.OUTBOX_WORKER_ID,
    outboxPollIntervalMs: parsed.OUTBOX_POLL_INTERVAL_MS,
    outboxBatchSize: parsed.OUTBOX_BATCH_SIZE,
    outboxLeaseMs: parsed.OUTBOX_LEASE_MS,
    outboxMaxAttempts: parsed.OUTBOX_MAX_ATTEMPTS,
    outboxRetryBaseMs: parsed.OUTBOX_RETRY_BASE_MS,
    outboxRetryMaxMs: parsed.OUTBOX_RETRY_MAX_MS,
    operationalFeatures: {
      trading: parseOperationalFeature(
        parsed.OPERATIONAL_TRADING_ENABLED,
        operationalFeatureDefault,
      ),
      deposits: parseOperationalFeature(
        parsed.OPERATIONAL_DEPOSITS_ENABLED,
        operationalFeatureDefault,
      ),
      withdrawals: parseOperationalFeature(
        parsed.OPERATIONAL_WITHDRAWALS_ENABLED,
        operationalFeatureDefault,
      ),
      realtime: parseOperationalFeature(
        parsed.OPERATIONAL_REALTIME_ENABLED,
        operationalFeatureDefault,
      ),
      listing: parseOperationalFeature(
        parsed.OPERATIONAL_LISTING_ENABLED,
        operationalFeatureDefault,
      ),
    },
    localSubmissionStorageEnabled,
  };
}

function parseOperationalFeature(
  value: 'true' | 'false' | undefined,
  fallback: boolean,
) {
  return value === undefined ? fallback : value === 'true';
}

function assertPostgresUrl(value: string, variableName: string) {
  const protocol = new URL(value).protocol;
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`${variableName} must use a PostgreSQL URL.`);
  }
}

function assertRedisUrl(value: string) {
  const protocol = new URL(value).protocol;
  if (protocol !== 'redis:' && protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use a Redis URL.');
  }
}

function assertNoPlaceholderSecret(
  value: string | undefined,
  variableName: string,
) {
  if (
    !value ||
    /replace[-_ ]?with|change[-_ ]?me|example|not[-_ ]?real/i.test(value)
  ) {
    throw new Error(
      `${variableName} must be supplied from the deployment secret manager.`,
    );
  }
}

export function assertTestDatabaseUrl(value: string) {
  assertPostgresUrl(value, 'TEST_DATABASE_URL');
  const url = new URL(value);
  const databaseName = url.pathname.replace(/^\//, '');
  const schema = url.searchParams.get('schema');
  if (!databaseName.endsWith('_test') && !schema?.endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must target a database or schema ending in "_test".',
    );
  }
}
