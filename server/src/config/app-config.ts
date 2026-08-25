import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  // Deployment intent is explicit so a beta instance cannot be inferred from
  // a hostname or accidentally inherit the public-production policy.
  APP_ENV: z.enum(['development', 'test', 'beta', 'production']).optional(),
  // Provisioning-only inputs; never returned to application consumers.
  BETA_ADMIN_EMAIL: z.string().email().optional(),
  BETA_ADMIN_USERNAME: z
    .string()
    .regex(/^[a-z0-9_]{3,32}$/)
    .optional(),
  BETA_ADMIN_PASSWORD: z.string().min(12).optional(),
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
  PROVIDER_MODE: z.enum(['local', 'stripe_sandbox', 'stripe_live']).default('local'),
  STRIPE_LIVE_ENABLED: z.enum(['true', 'false']).default('false'),
  // Identity verification is an explicit product/provider opt-in. This lets
  // beta deployments use Stripe Identity sandbox without enabling it on every
  // environment that happens to have Stripe credentials.
  STRIPE_IDENTITY_ENABLED: z.enum(['true', 'false']).default('false'),
  // The active GBP customer-funding rail is deliberately narrow. A future
  // USD/ACH rail must use a separate, explicitly approved product mode.
  STRIPE_BANK_FUNDING_RAIL: z.enum(['bacs_debit']).default('bacs_debit'),
  PROVIDER_ENCRYPTION_KEY: z.string().min(32).optional(),
  STRIPE_SECRET_KEY: z.string().min(16).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(16).optional(),
  STRIPE_MEMBERSHIP_STARTER_PRICE_ID: z.string().trim().min(1).optional(),
  STRIPE_MEMBERSHIP_PRO_PRICE_ID: z.string().trim().min(1).optional(),
  STRIPE_MEMBERSHIP_ELITE_PRICE_ID: z.string().trim().min(1).optional(),
  XIMILAR_API_TOKEN: z.string().min(1).optional(),
  XIMILAR_ENABLED: z.enum(['true', 'false']).default('false'),
  XIMILAR_CARD_GRADING_ENABLED: z.enum(['true', 'false']).default('false'),
  XIMILAR_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(45_000),
  XIMILAR_MAX_RETRIES: z.coerce.number().int().min(0).max(4).default(2),
  DISCORD_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_OAUTH_CLIENT_SECRET: z.string().min(16).optional(),
  DISCORD_OAUTH_REDIRECT_URI: z.string().url().optional(),
  DISCORD_BOT_SERVICE_TOKEN: z.string().min(32).optional(),
  DISCORD_BOT_GUILD_ID: z.string().regex(/^\d+$/).optional(),
  // `provider` is accepted only as a backwards-compatible alias for `resend`.
  EMAIL_DELIVERY_MODE: z.enum(['local_test', 'resend', 'provider']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_FROM_NAME: z.string().trim().min(1).max(128).optional(),
  RESEND_REPLY_TO_EMAIL: z.string().email().optional(),
  RESEND_TEST_RECIPIENT_OVERRIDE: z.string().email().optional(),
  EMAIL_ENABLED: z.enum(['true', 'false']).optional(),
  APP_PUBLIC_URL: z.string().url().optional(),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86_400)
    .default(3_600),
  EMAIL_VERIFICATION_RESEND_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3_600)
    .default(60),
  PASSWORD_RESET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86_400)
    .default(900),
  // SMS verification is opt-in outside tests. Missing provider credentials must
  // never accidentally enable an external delivery path in staging/production.
  PHONE_VERIFICATION_ENABLED: z.enum(['true', 'false']).default('false'),
  // `provider` is accepted only as a backwards-compatible alias for `twilio_verify`.
  // Programmable Messaging is deliberately not a supported OTP transport.
  PHONE_DELIVERY_MODE: z.enum(['local_test', 'twilio_verify', 'provider']).optional(),
  TWILIO_ACCOUNT_SID: z.string().trim().min(1).optional(),
  TWILIO_API_KEY: z.string().trim().min(1).optional(),
  TWILIO_API_SECRET: z.string().trim().min(1).optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().trim().min(1).optional(),
  // Legacy name is parsed only so older test fixtures can be migrated without
  // leaking it into the provider adapter. Production requires API key auth.
  TWILIO_AUTH_TOKEN: z.string().trim().min(1).optional(),
  TWILIO_SMS_ENABLED: z.enum(['true', 'false']).optional(),
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
  // Deterministic local-only webhook signing. External webhook verification is
  // intentionally deferred until the Stripe integration phase.
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
  // Explicitly opt-in. Zero keeps the hold inactive until product policy
  // chooses a duration; the application never invents one.
  BANK_CHANGE_WITHDRAWAL_HOLD_HOURS: z.coerce
    .number()
    .int()
    .min(0)
    .max(720)
    .default(0),
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
  MARKET_REFRESH_WORKER_ENABLED: z.enum(['true', 'false']).optional(),
  MARKET_REFRESH_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(3_600_000)
    .default(300_000),
  MARKET_REFRESH_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  MARKET_REFRESH_LEASE_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(3_600_000)
    .default(120_000),
  MARKET_REFRESH_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5),
  MARKET_REFRESH_RETRY_BASE_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(30_000),
  MARKET_REFRESH_RETRY_MAX_MS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(86_400_000)
    .default(3_600_000),
  PRICECHARTING_API_BASE_URL: z.string().url().optional(),
  PRICECHARTING_API_KEY: z.string().min(1).optional(),
  PRICECHARTING_API_TOKEN: z.string().min(1).optional(),
  PRICECHARTING_ENABLED: z.enum(['true', 'false']).default('false'),
  PRICECHARTING_BASE_URL: z
    .string()
    .url()
    .default('https://www.pricecharting.com'),
  PRICECHARTING_MIN_REQUEST_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(1_000),
  PRICECHARTING_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(21_600),
  PRICECHARTING_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(10_000),
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
  LOCAL_SUBMISSION_STORAGE_ROOT: z.string().trim().min(1).default('.local-submission-storage'),
  OBJECT_STORAGE_PROVIDER: z.enum(['LOCAL', 'S3_COMPATIBLE']).default('LOCAL'),
  OBJECT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_REGION: z.string().trim().min(1).default('auto'),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  OBJECT_STORAGE_PRIVATE_PREFIX: z.string().trim().min(1).default('private'),
  OBJECT_STORAGE_PUBLIC_PREFIX: z.string().trim().min(1).default('public'),
  OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  OBJECT_STORAGE_LAST_PROBE_AT: z.string().datetime().optional(),
});

export type AppConfig = {
  environment: 'development' | 'test' | 'production';
  appEnvironment?: 'development' | 'test' | 'beta' | 'production';
  isBeta?: boolean;
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
  providerMode: 'local' | 'stripe_sandbox' | 'stripe_live';
  stripeIdentityEnabled?: boolean;
  /** @deprecated Test fixtures may still provide this historical flag. */
  providersProductionEnabled?: boolean;
  stripeLiveEnabled: boolean;
  stripeBankFundingRail: 'bacs_debit';
  providerEncryptionKey?: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;
  stripeMembershipStarterPriceId?: string;
  stripeMembershipProPriceId?: string;
  stripeMembershipElitePriceId?: string;
  ximilarApiToken?: string;
  ximilarEnabled?: boolean;
  ximilarCardGradingEnabled?: boolean;
  ximilarTimeoutMs?: number;
  ximilarMaxRetries?: number;
  discordOauthClientId?: string;
  discordOauthClientSecret?: string;
  discordOauthRedirectUri?: string;
  discordBotServiceToken?: string;
  discordBotGuildId?: string;
  emailDeliveryMode: 'local_test' | 'resend';
  emailEnabled: boolean;
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
  resendReplyToEmail?: string;
  resendTestRecipientOverride?: string;
  appPublicUrl: string;
  emailVerificationTtlSeconds: number;
  emailVerificationResendSeconds: number;
  passwordResetTtlSeconds: number;
  phoneVerificationEnabled: boolean;
  phoneDeliveryMode: 'local_test' | 'twilio_verify';
  twilioAccountSid?: string;
  twilioApiKey?: string;
  twilioApiSecret?: string;
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
  bankChangeWithdrawalHoldHours: number;
  outboxWorkerEnabled: boolean;
  outboxWorkerId?: string;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  outboxLeaseMs: number;
  outboxMaxAttempts: number;
  outboxRetryBaseMs: number;
  outboxRetryMaxMs: number;
  marketRefreshWorkerEnabled: boolean;
  marketRefreshPollIntervalMs: number;
  marketRefreshBatchSize: number;
  marketRefreshLeaseMs: number;
  marketRefreshMaxAttempts: number;
  marketRefreshRetryBaseMs: number;
  marketRefreshRetryMaxMs: number;
  priceChartingApiBaseUrl?: string;
  priceChartingApiKey?: string;
  priceChartingApiToken?: string;
  priceChartingEnabled?: boolean;
  priceChartingBaseUrl?: string;
  priceChartingMinRequestIntervalMs?: number;
  priceChartingCacheTtlSeconds?: number;
  priceChartingRequestTimeoutMs: number;
  operationalFeatures: {
    trading: boolean;
    deposits: boolean;
    withdrawals: boolean;
    realtime: boolean;
    listing: boolean;
  };
  localSubmissionStorageEnabled: boolean;
  localSubmissionStorageRoot?: string;
  objectStorageProvider?: 'LOCAL' | 'S3_COMPATIBLE';
  objectStorageBucket?: string;
  objectStorageRegion?: string;
  objectStorageEndpoint?: string;
  objectStorageAccessKeyId?: string;
  objectStorageSecretAccessKey?: string;
  objectStorageForcePathStyle?: boolean;
  objectStoragePrivatePrefix?: string;
  objectStoragePublicPrefix?: string;
  objectStorageSignedUrlTtlSeconds?: number;
  objectStorageLastProbeAt?: Date;
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
  const appEnvironment =
    parsed.APP_ENV ??
    (parsed.NODE_ENV === 'production'
      ? 'production'
      : parsed.NODE_ENV === 'test'
        ? 'test'
        : 'development');
  const isBeta = appEnvironment === 'beta';
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
  if (isBeta && parsed.COOKIE_SECURE === 'false') {
    throw new Error('COOKIE_SECURE must be true in beta.');
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
  const emailEnabled =
    parsed.EMAIL_ENABLED !== undefined
      ? parsed.EMAIL_ENABLED === 'true'
      : parsed.NODE_ENV === 'test'
        ? true
        : emailDeliveryMode === 'resend' &&
          Boolean(parsed.RESEND_API_KEY && parsed.RESEND_FROM_EMAIL);
  const phoneDeliveryModeRaw =
    parsed.PHONE_DELIVERY_MODE ??
    (parsed.NODE_ENV === 'test' ? 'local_test' : 'twilio_verify');
  const phoneDeliveryMode =
    phoneDeliveryModeRaw === 'provider'
      ? 'twilio_verify'
      : phoneDeliveryModeRaw;
  const twilioSmsEnabled =
    parsed.TWILIO_SMS_ENABLED !== undefined
      ? parsed.TWILIO_SMS_ENABLED === 'true'
      : parsed.NODE_ENV === 'test'
        ? parsed.PHONE_VERIFICATION_ENABLED === 'true'
        : false;
  const appPublicUrl =
    parsed.APP_PUBLIC_URL ??
    (parsed.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:5173');
  if (!appPublicUrl)
    throw new Error('APP_PUBLIC_URL is required in production.');
  if (
    (parsed.NODE_ENV === 'production' || isBeta) &&
    new URL(appPublicUrl).protocol !== 'https:'
  )
    throw new Error('APP_PUBLIC_URL must use HTTPS in beta/production.');
  if (
    parsed.NODE_ENV === 'production' &&
    emailDeliveryMode === 'resend' &&
    (!parsed.RESEND_API_KEY || !parsed.RESEND_FROM_EMAIL)
  )
    throw new Error(
      'RESEND_API_KEY and RESEND_FROM_EMAIL are required for Resend in production.',
    );
  if (
    (parsed.NODE_ENV === 'production' || isBeta) &&
    twilioSmsEnabled &&
    phoneDeliveryMode === 'twilio_verify' &&
    (!parsed.TWILIO_ACCOUNT_SID ||
      !parsed.TWILIO_API_KEY ||
      !parsed.TWILIO_API_SECRET ||
      !parsed.TWILIO_VERIFY_SERVICE_SID)
  )
    throw new Error(
      'TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_VERIFY_SERVICE_SID are required when Twilio SMS is enabled.',
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
  if (parsed.NODE_ENV === 'production' || isBeta) {
    if (!environment.CORS_ORIGINS) {
      throw new Error(
        'CORS_ORIGINS must be explicitly configured in production.',
      );
    }
    if (origins.some((origin) => new URL(origin).protocol !== 'https:')) {
      throw new Error(
        'CORS_ORIGINS must use HTTPS origins in beta/production.',
      );
    }
    if (
      ['127.0.0.1', 'localhost', '::1'].includes(parsed.HOST) &&
      parsed.NODE_ENV === 'production'
    ) {
      throw new Error('HOST must not be a loopback address in production.');
    }
    if (parsed.NODE_ENV === 'production') {
      assertNoPlaceholderSecret(parsed.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET');
    }
  }
  const stripeLiveEnabled = parsed.STRIPE_LIVE_ENABLED === 'true';
  const stripeIdentityEnabled = parsed.STRIPE_IDENTITY_ENABLED === 'true';
  const operationalFeatureDefault = parsed.NODE_ENV !== 'production';
  const localSubmissionStorageEnabled =
    parsed.LOCAL_SUBMISSION_STORAGE_ENABLED === 'true' ||
    (parsed.LOCAL_SUBMISSION_STORAGE_ENABLED === undefined &&
      parsed.NODE_ENV !== 'production');
  if (
    parsed.OBJECT_STORAGE_PROVIDER === 'S3_COMPATIBLE' &&
    (!parsed.OBJECT_STORAGE_BUCKET ||
      !parsed.OBJECT_STORAGE_REGION ||
      (!parsed.OBJECT_STORAGE_ENDPOINT && !parsed.OBJECT_STORAGE_REGION))
  ) {
    throw new Error(
      'S3_COMPATIBLE object storage requires OBJECT_STORAGE_BUCKET and OBJECT_STORAGE_REGION.',
    );
  }
  if (stripeLiveEnabled && parsed.PROVIDER_MODE !== 'stripe_live') {
    throw new Error('STRIPE_LIVE_ENABLED requires PROVIDER_MODE=stripe_live.');
  }
  if (stripeIdentityEnabled && parsed.PROVIDER_MODE === 'local') {
    throw new Error('STRIPE_IDENTITY_ENABLED requires a Stripe provider mode.');
  }
  if (
    stripeIdentityEnabled &&
    parsed.PROVIDER_MODE === 'stripe_sandbox' &&
    (!parsed.STRIPE_SECRET_KEY || !parsed.STRIPE_SECRET_KEY.startsWith('sk_test_'))
  ) {
    throw new Error('Stripe Identity sandbox requires a test-mode secret key.');
  }
  if (parsed.PROVIDER_MODE === 'stripe_live' && !stripeLiveEnabled) {
    throw new Error(
      'Stripe live mode is fail-closed until STRIPE_LIVE_ENABLED=true.',
    );
  }
  if (parsed.PROVIDER_MODE === 'stripe_live' &&
    (!parsed.PROVIDER_ENCRYPTION_KEY ||
      !parsed.STRIPE_SECRET_KEY ||
      !parsed.STRIPE_WEBHOOK_SECRET)) {
    throw new Error(
      'PROVIDER_ENCRYPTION_KEY, STRIPE_SECRET_KEY, and STRIPE_WEBHOOK_SECRET are required for Stripe live mode.',
    );
  }
  if (parsed.PROVIDER_MODE === 'stripe_live') {
    if (!parsed.BLOCKCHAIN_ANALYSIS_API_KEY) {
      throw new Error(
        'BLOCKCHAIN_ANALYSIS_API_KEY is required in Stripe live mode.',
      );
    }
    assertNoPlaceholderSecret(
      parsed.PROVIDER_ENCRYPTION_KEY,
      'PROVIDER_ENCRYPTION_KEY',
    );
    assertNoPlaceholderSecret(parsed.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY');
    assertNoPlaceholderSecret(
      parsed.STRIPE_WEBHOOK_SECRET,
      'STRIPE_WEBHOOK_SECRET',
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
    appEnvironment,
    isBeta,
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
      : parsed.NODE_ENV === 'production' || isBeta,
    cookieDomain: parsed.COOKIE_DOMAIN,
    providerMode: parsed.PROVIDER_MODE,
    stripeIdentityEnabled,
    stripeLiveEnabled,
    stripeBankFundingRail: parsed.STRIPE_BANK_FUNDING_RAIL,
    providerEncryptionKey: parsed.PROVIDER_ENCRYPTION_KEY,
    stripeSecretKey: parsed.STRIPE_SECRET_KEY,
    stripePublishableKey: parsed.STRIPE_PUBLISHABLE_KEY,
    stripeWebhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    stripeMembershipStarterPriceId: parsed.STRIPE_MEMBERSHIP_STARTER_PRICE_ID,
    stripeMembershipProPriceId: parsed.STRIPE_MEMBERSHIP_PRO_PRICE_ID,
    stripeMembershipElitePriceId: parsed.STRIPE_MEMBERSHIP_ELITE_PRICE_ID,
    ximilarApiToken: parsed.XIMILAR_API_TOKEN,
    ximilarEnabled: parsed.XIMILAR_ENABLED === 'true',
    ximilarCardGradingEnabled: parsed.XIMILAR_CARD_GRADING_ENABLED === 'true',
    ximilarTimeoutMs: parsed.XIMILAR_TIMEOUT_MS,
    ximilarMaxRetries: parsed.XIMILAR_MAX_RETRIES,
    discordOauthClientId: parsed.DISCORD_OAUTH_CLIENT_ID,
    discordOauthClientSecret: parsed.DISCORD_OAUTH_CLIENT_SECRET,
    discordOauthRedirectUri: parsed.DISCORD_OAUTH_REDIRECT_URI,
    discordBotServiceToken: parsed.DISCORD_BOT_SERVICE_TOKEN,
    discordBotGuildId: parsed.DISCORD_BOT_GUILD_ID,
    emailDeliveryMode,
    emailEnabled,
    resendApiKey: parsed.RESEND_API_KEY,
    resendFromEmail: parsed.RESEND_FROM_EMAIL,
    resendFromName: parsed.RESEND_FROM_NAME,
    resendReplyToEmail: parsed.RESEND_REPLY_TO_EMAIL,
    resendTestRecipientOverride:
      parsed.NODE_ENV === 'production'
        ? undefined
        : parsed.RESEND_TEST_RECIPIENT_OVERRIDE,
    appPublicUrl: appPublicUrl.replace(/\/$/, ''),
    emailVerificationTtlSeconds: parsed.EMAIL_VERIFICATION_TTL_SECONDS,
    emailVerificationResendSeconds: parsed.EMAIL_VERIFICATION_RESEND_SECONDS,
    passwordResetTtlSeconds: parsed.PASSWORD_RESET_TTL_SECONDS,
    phoneVerificationEnabled: twilioSmsEnabled,
    phoneDeliveryMode,
    twilioAccountSid: parsed.TWILIO_ACCOUNT_SID,
    twilioApiKey: parsed.TWILIO_API_KEY,
    twilioApiSecret: parsed.TWILIO_API_SECRET,
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
    bankChangeWithdrawalHoldHours: parsed.BANK_CHANGE_WITHDRAWAL_HOLD_HOURS,
    outboxWorkerEnabled: parsed.OUTBOX_WORKER_ENABLED === 'true',
    outboxWorkerId: parsed.OUTBOX_WORKER_ID,
    outboxPollIntervalMs: parsed.OUTBOX_POLL_INTERVAL_MS,
    outboxBatchSize: parsed.OUTBOX_BATCH_SIZE,
    outboxLeaseMs: parsed.OUTBOX_LEASE_MS,
    outboxMaxAttempts: parsed.OUTBOX_MAX_ATTEMPTS,
    outboxRetryBaseMs: parsed.OUTBOX_RETRY_BASE_MS,
    outboxRetryMaxMs: parsed.OUTBOX_RETRY_MAX_MS,
    marketRefreshWorkerEnabled:
      parsed.MARKET_REFRESH_WORKER_ENABLED === undefined
        ? parsed.NODE_ENV !== 'test'
        : parsed.MARKET_REFRESH_WORKER_ENABLED === 'true',
    marketRefreshPollIntervalMs: parsed.MARKET_REFRESH_POLL_INTERVAL_MS,
    marketRefreshBatchSize: parsed.MARKET_REFRESH_BATCH_SIZE,
    marketRefreshLeaseMs: parsed.MARKET_REFRESH_LEASE_MS,
    marketRefreshMaxAttempts: parsed.MARKET_REFRESH_MAX_ATTEMPTS,
    marketRefreshRetryBaseMs: parsed.MARKET_REFRESH_RETRY_BASE_MS,
    marketRefreshRetryMaxMs: parsed.MARKET_REFRESH_RETRY_MAX_MS,
    priceChartingApiBaseUrl: parsed.PRICECHARTING_API_BASE_URL?.replace(
      /\/$/,
      '',
    ),
    priceChartingApiKey: parsed.PRICECHARTING_API_KEY,
    priceChartingApiToken:
      parsed.PRICECHARTING_API_TOKEN ?? parsed.PRICECHARTING_API_KEY,
    priceChartingEnabled: parsed.PRICECHARTING_ENABLED === 'true',
    priceChartingBaseUrl: parsed.PRICECHARTING_BASE_URL.replace(/\/$/, ''),
    priceChartingMinRequestIntervalMs:
      parsed.PRICECHARTING_MIN_REQUEST_INTERVAL_MS,
    priceChartingCacheTtlSeconds: parsed.PRICECHARTING_CACHE_TTL_SECONDS,
    priceChartingRequestTimeoutMs: parsed.PRICECHARTING_REQUEST_TIMEOUT_MS,
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
    localSubmissionStorageRoot: parsed.LOCAL_SUBMISSION_STORAGE_ROOT,
    objectStorageProvider: parsed.OBJECT_STORAGE_PROVIDER,
    objectStorageBucket: parsed.OBJECT_STORAGE_BUCKET,
    objectStorageRegion: parsed.OBJECT_STORAGE_REGION,
    objectStorageEndpoint: parsed.OBJECT_STORAGE_ENDPOINT?.replace(/\/$/, ''),
    objectStorageAccessKeyId: parsed.OBJECT_STORAGE_ACCESS_KEY_ID,
    objectStorageSecretAccessKey: parsed.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    objectStorageForcePathStyle: parsed.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true',
    objectStoragePrivatePrefix: parsed.OBJECT_STORAGE_PRIVATE_PREFIX.replace(/\/$/, ''),
    objectStoragePublicPrefix: parsed.OBJECT_STORAGE_PUBLIC_PREFIX.replace(/\/$/, ''),
    objectStorageSignedUrlTtlSeconds: parsed.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS,
    objectStorageLastProbeAt: parsed.OBJECT_STORAGE_LAST_PROBE_AT
      ? new Date(parsed.OBJECT_STORAGE_LAST_PROBE_AT)
      : undefined,
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
