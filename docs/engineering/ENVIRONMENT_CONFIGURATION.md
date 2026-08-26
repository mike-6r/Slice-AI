# Environment configuration

`server/src/config/app-config.ts` is the API configuration authority.
`server/.env.example` is a placeholder-only template; protected deployment
values belong in the environment store, never Git. Required means required for
the applicable configured mode, not that every local developer must enable the
feature.

| Keys | Classification / format / notes |
| --- | --- |
| `NODE_ENV`, `APP_ENV`, `HOST`, `PORT`, `CORS_ORIGINS`, `SERVICE_VERSION`, `HTTP_BODY_LIMIT`, `TRUST_PROXY_HOPS` | REQUIRED runtime baseline; enum, host, integer port, comma-separated origins, string, size, integer hops. |
| `DATABASE_URL`, `REDIS_URL`, `DB_CONNECT_TIMEOUT_MS`, `REDIS_CONNECT_TIMEOUT_MS` | REQUIRED outside isolated tests; PostgreSQL/Redis URLs and milliseconds. |
| `TEST_DATABASE_URL` | LOCAL/TEST only; must target a database/schema ending `_test`. |
| `JWT_ACCESS_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ACCESS_TOKEN_TTL_SECONDS`, `RECENT_AUTH_WINDOW_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `REFRESH_COOKIE_NAME`, `COOKIE_SECURE`, `COOKIE_DOMAIN` | Production-required session/security configuration; secret, strings, seconds, boolean, optional domain. |
| `BETA_ADMIN_EMAIL`, `BETA_ADMIN_USERNAME`, `BETA_ADMIN_PASSWORD` | STAGING ONLY provisioning inputs; optional and secret where applicable. |
| `PROVIDER_MODE`, `STRIPE_LIVE_ENABLED`, `STRIPE_IDENTITY_ENABLED`, `STRIPE_BANK_FUNDING_RAIL`, `PROVIDER_ENCRYPTION_KEY`, `STRIPE_*` | Provider configuration; production-required only when the approved provider mode is enabled. Defaults remain fail-closed. |
| `XIMILAR_API_TOKEN`, `XIMILAR_ENABLED`, `XIMILAR_CARD_GRADING_ENABLED`, `XIMILAR_TIMEOUT_MS`, `XIMILAR_MAX_RETRIES` | OPTIONAL provider analysis; token, booleans, milliseconds, integer retries. |
| `DISCORD_OAUTH_*`, `DISCORD_BOT_SERVICE_TOKEN`, `DISCORD_BOT_GUILD_ID` | OPTIONAL integration; IDs/tokens are deployment secrets. |
| `EMAIL_DELIVERY_MODE`, `EMAIL_ENABLED`, `RESEND_*`, `APP_PUBLIC_URL`, `EMAIL_VERIFICATION_*`, `PASSWORD_RESET_TTL_SECONDS` | OPTIONAL communication provider; seconds and URL. `provider` is a deprecated alias for `resend`. |
| `PHONE_*`, `TWILIO_*` | OPTIONAL SMS/MFA; booleans, seconds, IDs/secrets. `PHONE_DELIVERY_MODE=provider` and `TWILIO_AUTH_TOKEN` are deprecated compatibility paths; production uses `twilio_verify` API-key credentials. |
| `CAPTCHA_*`, `TURNSTILE_*`, `SIGNUP_CONSENT_REQUIRED`, `TERMS_POLICY_VERSION`, `PRIVACY_POLICY_VERSION` | OPTIONAL signup controls. `CAPTCHA_*` and `CAPTCHA_PROVIDER=provider` are deprecated aliases; prefer `TURNSTILE_*` and `cloudflare_turnstile`. |
| `TWO_FACTOR_*` | Production-required where MFA policy applies; encryption secret, seconds, issuer. |
| `BLOCKCHAIN_ANALYSIS_*` | OPTIONAL provider; API key, URL, milliseconds. |
| `PROVIDER_WEBHOOK_*` | OPTIONAL local/provider webhook signature policy; secrets, ISO timestamp, seconds. |
| `WITHDRAWAL_LIMIT_*`, `BANK_CHANGE_WITHDRAWAL_HOLD_HOURS`, `BACS_INTERNAL_TRADE_HOLD_DAYS`, `BACS_DEPOSIT_*` | Financial policy. GBP minor units, hours/days/counts/seconds. Optional Bacs controls intentionally stay unset until approved; omission is fail-closed. |
| `OUTBOX_*` | OPTIONAL worker activation; boolean, identifier, milliseconds, batch/count values. Outbox/delivery are disabled unless enabled. |
| `MARKET_REFRESH_*` | OPTIONAL worker activation; boolean, milliseconds, batch/count values. It defaults enabled outside tests if omitted, so deployments should set it explicitly. |
| `PRICECHARTING_ENABLED`, `PRICECHARTING_BASE_URL`, `PRICECHARTING_MIN_REQUEST_INTERVAL_MS`, `PRICECHARTING_CACHE_TTL_SECONDS`, `PRICECHARTING_REQUEST_TIMEOUT_MS` | OPTIONAL reference data; boolean, URL, milliseconds/seconds. |
| `PRICECHARTING_API_KEY`, `PRICECHARTING_API_TOKEN`, `PRICECHARTING_API_BASE_URL` | OPTIONAL API credential. `API_KEY` is canonical; `API_TOKEN` is a compatibility alias and takes precedence when both are supplied. |
| `OPERATIONAL_TRADING_ENABLED`, `OPERATIONAL_DEPOSITS_ENABLED`, `OPERATIONAL_WITHDRAWALS_ENABLED`, `OPERATIONAL_REALTIME_ENABLED`, `OPERATIONAL_LISTING_ENABLED` | Production risk gates; booleans and fail-closed by default. |
| `LOCAL_SUBMISSION_STORAGE_ENABLED`, `LOCAL_SUBMISSION_STORAGE_ROOT`, `OBJECT_STORAGE_*` | LOCAL/TEST or approved storage configuration; booleans, path, provider enum, bucket/URL/credentials, seconds. Local submission storage remains disabled for production. |

The frontend template has only `VITE_*` public build values. The Discord
template is separate and contains Discord-specific runtime values. Never copy
server provider secrets into either client-visible template.
