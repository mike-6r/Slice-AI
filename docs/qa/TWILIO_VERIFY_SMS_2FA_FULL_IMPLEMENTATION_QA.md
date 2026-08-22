# Slice Twilio Verify + SMS 2FA — Full Implementation QA

## Scope

This document records the implementation and release checks for phone verification and optional SMS two-factor authentication. Twilio Verify is the OTP authority. Slice remains authoritative for the verified phone, MFA enrollment, challenge state, authorization, audit history, and final session issuance.

No Stripe, Discord, Resend, wallet, ledger, ownership, trading, or public-profile authority was changed.

## Architecture found and reused

- Existing `User.phoneE164` and `User.phoneVerifiedAt` remain the authoritative phone state. The existing global phone uniqueness constraint is preserved.
- Existing `PhoneVerificationService`, account security routes, recent-auth checks, `AuthAbuseService`, audit events, and the normal session issuance path were extended.
- Existing TOTP, recovery-code, pre-auth challenge, and login completion flows remain in place.
- `PhoneVerificationDelivery` is the provider boundary. `TwilioVerifyPhoneDelivery` is the production adapter; `LocalTestPhoneDelivery` is available only to isolated automated tests.
- The former raw Programmable Messaging adapter was removed. Slice never generates or stores an OTP for provider-backed verification.

## Provider configuration

Server-only variables:

```text
TWILIO_ACCOUNT_SID
TWILIO_API_KEY
TWILIO_API_SECRET
TWILIO_VERIFY_SERVICE_SID
TWILIO_SMS_ENABLED
PHONE_DELIVERY_MODE=twilio_verify
```

Twilio is authenticated with API key + API secret and the Account SID. Secrets and the Verify Service SID are never returned to the browser. The browser calls Slice endpoints only.

`TWILIO_SMS_ENABLED=false` fails closed: Slice does not call Twilio and phone/SMS operations return a safe unavailable response. Outside isolated tests, the missing flag also defaults to disabled. If enabled in beta/production, all four Twilio settings are required at startup. `local_test` is not an allowed production delivery path.

## Phone storage and verification flow

Phone input is normalized to E.164 before persistence or provider use. The client submits a phone only when starting a verification. Confirmation submits only the six-digit code; the server resolves the number from the active, user-bound challenge. This prevents starting a code for number A and attaching number B during confirmation.

`PhoneVerificationChallenge` stores the pending number, expiry, attempt count, delivery state, and timestamps. Provider-backed rows have a nullable legacy `codeHash`, which is always `NULL` for new Twilio Verify challenges. Twilio owns code generation and checking. Slice records `phoneVerifiedAt` only after an approved Verify check and an atomic database transaction.

Changing a verified phone leaves the current phone unchanged until the new number is approved. When SMS MFA is active, changing or removing the phone is blocked until SMS MFA is disabled, preventing an enabled MFA row from pointing at an old number. Pending challenges are superseded on replacement/removal.

Routes:

- `GET /me/phone-verification/status`
- `POST /me/phone-verification/send`
- `POST /me/phone-verification/confirm` with `{ code }`
- `DELETE /me/phone-verification`

The account security UI shows masked numbers, pending state, six-digit numeric input, paste/autofill support, resend countdown, loading/error states, and an explicit verified state. Full phone values are not present in public projections, marketplace, collector directory, Discord, or ordinary audit metadata.

## SMS MFA flow

Phone verification does not enable MFA. SMS MFA requires an explicit, recent-authenticated enrollment and an already verified phone. Enrollment sends a Verify challenge for purpose `MFA_ENROLLMENT`; confirmation atomically enables `UserSmsTwoFactor` only if the stored phone still equals the currently verified phone.

Existing TOTP remains supported. If both methods are enabled, login deterministically prefers TOTP. If only SMS is enabled, password validation creates a short-lived pre-auth challenge, sends Verify purpose `MFA_LOGIN`, and returns only the challenge token, method, masked phone, expiry, and resend time. No normal session or protected account data is issued before `/auth/2fa/verify` succeeds.

Routes:

- `GET /me/2fa/status`
- Existing TOTP enrollment/confirmation routes
- `POST /me/2fa/sms/enroll`
- `POST /me/2fa/sms/confirm` with `{ code }`
- `POST /me/2fa/disable` with `{ method: "SMS" }` or the existing TOTP proof
- `POST /auth/2fa/verify`
- `POST /auth/2fa/resend`

SMS login challenges bind to the user, method, stored phone, expiry, attempt count, and hashed challenge token. Disabling SMS, changing/removing the phone, expiry, replay, or exhausted attempts prevents completion. Provider failure never bypasses MFA and never issues a session.

## Recovery and disable behavior

Existing recovery codes remain user-owned hashes and are consumed atomically. Enabling SMS creates recovery codes only when none are available; existing TOTP recovery codes are preserved. Regeneration requires recent authentication and an enabled method. Trusted-device behavior was not invented because no trusted-device contract existed.

Disabling SMS requires an authenticated session plus the existing recent-auth control, updates state atomically, removes pending login challenges, and records an audit event. Phone removal is blocked while SMS MFA is enabled.

## Rate limits and abuse controls

`AuthAbuseService` uses Redis-backed counters. Unless a more specific existing rule applies, the limit is 5 attempts per key per 3,600 seconds; login is 10 per IP/account key per 900 seconds. SMS/phone operations use layered IP, account, and—where the target is known—normalized-phone keys:

- phone send: IP + account + phone, with a resend cooldown from configuration
- phone confirm: IP + account + phone, plus Slice attempt ceiling
- SMS enrollment/confirmation: IP + account + phone
- SMS login send: IP + account + phone
- SMS login resend: IP + challenge + phone, plus resend cooldown
- SMS login check: existing MFA challenge/IP control plus IP + account + phone

`PHONE_VERIFICATION_MAX_ATTEMPTS` defaults to 5 and is bounded by configuration. Twilio Verify supplies provider-side verification behavior as a second layer. No unauthenticated arbitrary-number SMS endpoint exists. A separate daily SMS budget is not yet modeled; production launch should add provider cost alerting and, if required by final policy, a daily cap before enabling live SMS at scale.

## Error mapping and privacy

Twilio errors are mapped to safe Slice errors such as unavailable delivery or unsupported phone. Provider stack traces, raw payloads, credentials, OTPs, and unnecessary provider identifiers are not returned. Invalid/expired codes use generic failure behavior. Phone values are masked outside the backend authority; no full number is projected to public surfaces. Passing phone verification does not affect Stripe Identity, Connect, KYC, financial state, or Discord roles.

Verify webhooks are not required for this direct start/check flow: the synchronous Verify API response is the provider authority for each attempt. No webhook surface was introduced without a product need.

## Database migration

Additive migration:

`server/prisma/migrations/20260822150000_twilio_verify_sms_mfa/migration.sql`

It adds delivery status/timestamps to phone challenges, `UserSmsTwoFactor`, explicit MFA method and SMS challenge fields, and moves recovery-code ownership to `User` while preserving existing records. No main database reset or destructive data workflow was used.

## Automated QA

Passed:

- Prisma schema validation
- Prisma client generation
- backend typecheck
- focused backend unit tests: 4 suites, 45 tests
- frontend typecheck
- focused frontend tests: 3 files, 19 tests
- phone normalization and local adapter isolation
- Twilio Verify v2 adapter success/failure mapping
- no Slice OTP persistence for provider-backed challenges
- explicit disabled-flag behavior
- server-bound phone confirmation contract

The database-backed integration command was attempted with the repository’s isolated test runner. It was blocked before test execution because the local PostgreSQL test service at `127.0.0.1:55432` was unavailable. No staging or production database was touched.

Required remaining build gates before release are backend build, frontend client/SSR builds, touched-file lint, and a rerun of the integration suite after the isolated PostgreSQL/Redis test services are available.

## Real Twilio staging QA

Not run in this implementation pass. A controlled test requires staging credentials with `TWILIO_SMS_ENABLED=true` and an authorized disposable/test phone number. The controlled sequence must verify:

1. phone SMS arrival and approved verification;
2. persisted verified state and resend cooldown;
3. SMS MFA enrollment and recovery-code behavior;
4. logout/login withholding the normal session before the SMS check;
5. successful final session issuance, refresh, and logout;
6. one invalid-code attempt without bypass or account lockout.

Do not use a real customer number, print the number or code, or repeat sends unnecessarily.

## Responsive and accessibility QA

The existing Account Security and Login surfaces were extended rather than replaced. The six-digit controls use semantic labels, `inputMode="numeric"`, `autocomplete="one-time-code"`, paste-compatible single inputs, bounded input length, resend countdowns, inline errors, disabled/loading states, and keyboard-accessible buttons.

Browser QA remains to be completed at 390×844, 768×1024, 1280×800, 1440×900, and 1920×1080. Check for no horizontal overflow, readable errors, focus movement, screen-reader status, and non-color-only success/error indications.

## Deployment and release gate

The implementation is safe to deploy with SMS disabled. Staging SMS behavior must not be enabled by accident. Before enabling it, configure only staging Twilio credentials and the approved test service/number policy. Production requires separate credentials, approved geographic permissions, provider/compliance requirements, fraud/cost monitoring, and an explicit release decision.

The earlier implementation deployment completed at commit `17e3d6f` with SMS disabled. The deployment and runtime state for the database-constraint fix is recorded in the addendum below.

## Known limitations / launch blockers

1. The local PostgreSQL/Redis integration test services must be available for the full database-backed suite.
2. Real Twilio Verify and SMS MFA staging QA requires authorized staging credentials and a disposable test phone.
3. There is no trusted-device feature; users must use TOTP or recovery codes when available.
4. A configurable daily SMS spend/cap policy and operational alert dashboard remain production hardening work.

## Final authority rule

The full chain is:

`PHONE → TWILIO VERIFY SEND → OTP → TWILIO VERIFY CHECK → SLICE VERIFIED PHONE`

and:

`PASSWORD → PENDING MFA CHALLENGE → TWILIO VERIFY SEND → OTP → TWILIO VERIFY CHECK → FINAL SLICE SESSION`

No fake SMS, universal QA code, client-authoritative verification, provider bypass, or browser secret is part of this implementation.

## 2026-08-22 international-number and staging-500 fix addendum

### Root cause and database correction

Staging reproduced a 500 on `POST /api/v1/me/phone-verification/send` before any Twilio request. The deployed service delegated OTP ownership to Twilio and created a challenge with `codeHash = NULL`, while the original database migration still defined `PhoneVerificationChallenge.codeHash` as `TEXT NOT NULL`. Prisma returned a null-constraint violation.

The Prisma model was already nullable. Migration `20260822210000_phone_verification_provider_owned_otp` now drops the database `NOT NULL` constraint. New provider-backed challenges continue to store no OTP or local hash; Twilio Verify remains the OTP authority.

### International input

- The send endpoint accepts optional `country` as a two-letter ISO country code.
- Direct `+...` E.164 input works without a country selector.
- Local-format input is normalized server-side with `libphonenumber-js` for the selected country.
- Account Center and onboarding use the shared country selector and direct E.164 input. The selector is not persisted as account data.
- Invalid or unqualified local input now returns 400 instead of the previous 409.

### Safe provider mapping

Provider responses are never returned raw. The adapter maps invalid destinations to `PHONE_INVALID` (400), unsupported SMS destinations to `PHONE_UNSUPPORTED` (422), provider rate limits to `PHONE_RATE_LIMITED` (429), and provider/configuration failures to `PHONE_DELIVERY_UNAVAILABLE` (503). Actual application defects retain normal 500 handling.

### Verification gates

- Focused phone suite: **13 passed**.
- Full backend suite: **272 passed across 65 suites**.
- Full frontend suite: **135 passed across 38 files**.
- Backend and frontend typechecks: **PASS**.
- Backend and frontend production builds: **PASS**.
- Prisma validation and client generation: **PASS**.
- Twilio Verify v2 API key SID + secret + Account SID configuration remains server-only.
- `STRIPE`, wallet, ledger, ownership, trading, collectible, Discord, Resend, and identity-verification paths were not changed.

Real SMS delivery QA still requires an explicitly authorized test phone. No SMS was sent without one. The remaining staging check is to send one controlled US test SMS, confirm the OTP, and verify the resulting masked account state without printing the number, OTP, secrets, or provider identifiers.
