# Slice TOTP Authenticator 2FA — Full Implementation QA

## Scope

This change completes the existing Slice authenticator-app flow:

'password → recent password confirmation → TOTP enrollment → OTP confirmation → enabled → recovery-code acknowledgement'

It does not change Stripe, provider movements, wallets, ledger, ownership, trading, Discord, marketplace, or valuation behavior.

## Existing architecture audit

The repository already contained and continues to use:

- UserTwoFactor with an AES-GCM encrypted TOTP secret;
- UserSmsTwoFactor and the existing Twilio Verify boundary;
- TwoFactorRecoveryCode with one-way digests and atomic consumption;
- TwoFactorLoginChallenge for pre-authentication MFA;
- TwoFactorService for TOTP/SMS enrollment, login, recovery, and disable;
- RecentAuthService, AuthAbuseService, session rotation, and identity audit events;
- Account Security and Secure Setup screens;
- TOTP-preferred login when both TOTP and SMS are enabled.

No second MFA system was introduced.

## Root cause of the dead end

Before this change, RecentAuthService compared the current time only with Session.authenticatedAt, the original login timestamp. There was no supported endpoint for the user to re-confirm their password for the current session. The backend correctly returned RECENT_AUTH_REQUIRED, but the Account Security and setup-wizard clients converted that response into a sign-in-again message, so the protected action stopped instead of resuming.

## Recent-auth contract

POST /api/v1/me/security/recent-auth accepts only { password } after the access-token guard has authenticated the current session.

On success the server:

1. verifies the password against the authoritative password hash;
2. updates Session.recentAuthAt for that exact active session;
3. records RECENT_AUTH_CONFIRMED with the session and request correlation;
4. returns only a confirmation timestamp.

The browser cannot set or claim recent-auth state. No recentAuth=true field is accepted. The endpoint is rate-limited through AuthAbuseService; wrong passwords return a safe RECENT_AUTH_INVALID response. Refresh/session rotation preserves the timestamp for the successor session, while a new login starts a new freshness boundary.

The configured RECENT_AUTH_WINDOW_SECONDS remains the TTL (default 300 seconds, bounded by existing configuration). Legacy sessions with a null recentAuthAt safely fall back to their original authentication timestamp until they rotate or re-authenticate.

## TOTP lifecycle

- Clicking Set up authenticator first calls the server enrollment endpoint.
- If the session is stale, the UI opens Confirm it's you, keeps the original action, and automatically retries it after successful password confirmation.
- The server creates/replaces one pending enrollment row and never marks it enabled at enrollment start.
- The response provides the otpauth URI, a manual setup key, and a server-derived expiry timestamp. The client renders a QR code, a copyable manual key, explanatory text, and a six-digit confirmation field.
- Pending enrollment is valid for the configured MFA challenge TTL. Expired enrollment cannot be confirmed; starting again replaces it.
- Correct OTP verification atomically sets enabledAt and generates recovery codes. Invalid or expired OTPs do not enable the method.
- A second active authenticator enrollment is rejected with TWO_FACTOR_ALREADY_ENABLED.
- The encrypted secret remains backend-only except for the one-time setup material required to configure the user's authenticator. It is not logged, included in public projections, or returned by status/admin surfaces.

## Recovery codes

Recovery codes are generated with cryptographically secure randomness, stored only as SHA-256 digests, returned once, and consumed atomically. The Account Security and setup-wizard flows provide:

- copy;
- download as a local text file;
- an explicit “I've saved these codes” acknowledgement;
- no later retrieval endpoint.

Regeneration requires recent authentication, invalidates all unused prior codes, and records an audit event. Login fallback consumes a code exactly once; replay is denied.

## Login and coexistence

Password verification creates a pending MFA challenge when an enabled method exists. It does not issue a normal access or refresh session first. TOTP is preferred when both TOTP and SMS are enabled. A valid TOTP or one unused recovery code completes the challenge and only then issues the normal Slice session. Existing SMS Verify behavior remains provider-backed and separate.

Disabling TOTP requires recent authentication plus the existing TOTP or recovery proof. Disabling TOTP does not delete an independently enabled SMS method. Phone changes/removal and SMS MFA continue to use the existing verified-phone and recent-auth controls.

## Security and audit

The implementation does not log or expose raw TOTP secrets, OTPs, recovery codes, passwords, provider credentials, or access tokens. Audit records contain event names, safe request/session linkage, and allowlisted metadata only. Existing security notification behavior for MFA enable/disable remains in place.

Relevant events include:

- RECENT_AUTH_CONFIRMED;
- TWO_FACTOR_ENROLLMENT_STARTED;
- TWO_FACTOR_ENABLED;
- TWO_FACTOR_DISABLED;
- TWO_FACTOR_RECOVERY_CODES_REGENERATED;
- TWO_FACTOR_RECOVERY_CODE_USED;
- existing SMS enrollment/challenge events.

## Database migration

Additive migration:

server/prisma/migrations/20260823150000_session_recent_auth/migration.sql

It adds nullable Session.recentAuthAt and an index. Existing rows remain valid and use the safe legacy fallback described above. No financial or provider data is touched.

## Automated QA

Passed:

- Prisma validation;
- Prisma client generation;
- frontend typecheck;
- frontend production client + SSR build;
- backend Nest build;
- frontend suite: 39 files / 138 tests passed;
- focused backend identity suite: 3 suites / 9 tests passed;
- recent-auth freshness, stale-session rejection, legacy fallback, mapper, and session-management tests.

The new database-backed E2E test covers stale-session rejection, wrong-password denial, successful re-authentication, automatic continuation eligibility, expiry material, and the audit record. It was not executable in this workspace because the isolated PostgreSQL service at 127.0.0.1:55432 was unavailable; the runner refused before test execution. No staging or production database was touched by the attempted run.

Repository-wide gates still report two unrelated pre-existing issues:

- backend typecheck: server/src/modules/finance/application/portfolio-query.service.spec.ts has a mock widening the literal currency: GBP to string;
- backend lint: server/src/modules/providers/application/stripe-provider.client.ts uses a pre-existing require() import.

Touched frontend lint passes. The server changes are type-safe in the build and focused tests.

## Browser/accessibility QA

The Account Security and Secure Setup flows now include:

- a password re-auth modal;
- automatic focus and focus return;
- Escape handling and keyboard Tab trapping;
- labeled password/OTP controls;
- QR explanatory copy;
- accessible manual-key copy control;
- loading, disabled, and announced error states;
- recovery-code acknowledgement, copy, and download.

Required browser widths remain:

1920×1080, 1440×900, 1280×800, 768×1024, 390×844

Visual staging QA with an authorized disposable account and an authenticator app is pending deployment. It must verify the complete chain without recording any secret, OTP, or recovery code in screenshots or logs.

## Deployment

Deployment is pending the final commit/release gate in this working pass. After commit, push, and staging deployment, record:

- commit and release identifier;
- /opt/slice/current and /opt/slice/app targets;
- /health and /ready;
- browser QA result at all required widths;
- zero financial/provider mutations.

## Release gate

The code path is fail-closed for stale sessions and MFA proof failures. Do not enable SMS or make any provider configuration change as part of this task. Final GO requires the isolated database-backed E2E suite and controlled staging browser QA to be run successfully.
