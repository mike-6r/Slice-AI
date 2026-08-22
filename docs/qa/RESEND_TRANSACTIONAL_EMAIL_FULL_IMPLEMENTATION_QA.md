# Resend Transactional Email — Full Implementation QA

Status: implementation complete; staging provider verification is pending the staging Resend configuration and a real recipient test.

## Scope

Resend is the delivery provider. Slice remains authoritative for user identity, email verification, password-reset state, session security, audit events, and account status. A provider acceptance response never changes those states by itself.

The implementation covers:

- signup verification delivery and authenticated resend;
- one-time, hashed, expiring email verification tokens;
- non-enumerating password-reset request and one-time password-reset completion;
- revocation of all sessions and pending two-factor login challenges after reset;
- security notifications for password changes, email verification, phone changes/removal, and TOTP/SMS MFA changes;
- provider-safe failure handling and delivery observability;
- Slice-branded HTML and plain-text templates;
- local-test delivery for automated tests only.

## Audit Classification

| Area | Result | Notes |
| --- | --- | --- |
| Resend SDK | WORKING | `resend` is server-only and is used by the production provider adapter. |
| Configuration | WORKING | Existing `EMAIL_DELIVERY_MODE`, `RESEND_*`, and `APP_PUBLIC_URL` names were retained; reply-to, enablement, cooldown, and reset TTL were added. |
| Email verification | PARTIAL → COMPLETE | Beta hard-disable removed; delivery status, provider id, idempotency, failure handling, resend cooldown, and signup trigger are now authoritative. |
| Password reset | MISSING → COMPLETE | Request, non-enumerating response, reset confirmation, session revocation, audit, and confirmation email added. |
| Email-address change | NOT SUPPORTED | No existing Slice email-change product flow or pending-email authority was found. No unsafe replacement flow was invented. |
| Security notifications | PARTIAL → COMPLETE for current identity events | Password, email verification, phone, TOTP, and SMS MFA changes are covered. Login spam notifications were not added. |
| Collector workflow email | NOT IMPLEMENTED | Current Collector lifecycle has in-app/Discord routing but no authoritative email event contract. No physical or workflow truth was invented. |
| Financial email | NOT IMPLEMENTED | No financial notification contract was changed; ledger, Stripe, Connect, wallet, and payout behavior are untouched. |
| Outbox | REVIEWED | Existing outbox routes in-app/Discord notifications. It has no email channel. Auth-critical email delivery uses the new durable delivery record and Resend idempotency rather than creating a second general-purpose worker. |
| SMTP/legacy mail | ISOLATED | No SMTP production path exists. The old `ResendEmailDelivery` constructor remains only as a narrow unit-test compatibility seam; Nest production wiring uses `TransactionalEmailService`. |
| Resend webhooks | DEFERRED | Send acceptance and durable status are sufficient for the current transactional launch scope. Bounce/complaint policy and signed webhook processing are a separate release gate. |

## Configuration

Server-side values are read from `server/.env` or the VPS secret environment. The API key is never returned or logged.

```dotenv
EMAIL_DELIVERY_MODE=resend
EMAIL_ENABLED=true
APP_PUBLIC_URL=https://staging.slicecollectable.com
RESEND_API_KEY=<server secret>
RESEND_FROM_EMAIL=no-reply@slicecollectable.com
RESEND_FROM_NAME=Slice
# Optional; only set when an approved support address exists.
RESEND_REPLY_TO_EMAIL=<approved reply address>
EMAIL_VERIFICATION_TTL_SECONDS=3600
EMAIL_VERIFICATION_RESEND_SECONDS=60
PASSWORD_RESET_TTL_SECONDS=900
```

The sender is configuration-driven and renders as `Slice <no-reply@slicecollectable.com>`. `RESEND_TEST_RECIPIENT_OVERRIDE` is development-only and is rejected in production.

If Resend credentials or sender-domain verification are missing, the API fails closed for delivery. It does not mark a token sent, verified, reset, or secured. Password-reset requests still return the same safe response whether or not an eligible account exists.

## Data and Delivery Authority

`EmailVerificationToken` and `PasswordResetToken` store only SHA-256 token digests. Both have expiry, one-time consumption, delivery status, delivered/failed timestamps, and provider message id. `TransactionalEmailDelivery` stores the email type, user reference where available, recipient hash, provider, idempotency key, provider message id, timestamps, and safe failure category. Raw recipient email, raw token, API key, and provider response bodies are not stored there.

Resend receives a deterministic `Idempotency-Key`. A previously recorded `SENT` delivery is not sent again for that same key. A failed delivery is recorded and can be retried by the bounded user action that created it.

## Backend Acceptance Criteria

- Signup persists an unverified user and invokes verification delivery after the user transaction commits.
- Resend acceptance does not verify an email.
- Verification requires a `SENT`, unexpired, unconsumed Slice token.
- Resend requests are abuse-limited and cooldown-protected server-side.
- Provider failure marks the delivery failed and leaves the user unverified.
- Password reset requests do not reveal account existence.
- Password reset completion updates the password, consumes the token, revokes sessions, invalidates pending two-factor login challenges, writes an audit event, and then sends a security confirmation.
- Security notification failure never rolls back the completed security state.
- Twilio remains the SMS/phone provider; it is not coupled to email verification.
- Stripe, wallet, ledger, Connect, custody, ownership, and Collector financial state are untouched.

## Automated QA

Completed locally:

- API typecheck: PASS
- API build: PASS
- API unit suite: PASS — 259 tests across 62 suites
- Resend/config/email verification focused suite: PASS — 40 tests
- Prisma schema validation: PASS
- Frontend typecheck: PASS
- Frontend production build: PASS
- Frontend validation test: PASS — 6 tests
- Nest runtime/module bootstrap: PASS with `PROVIDER_MODE=local`; new routes were mapped successfully. Local PostgreSQL/Redis were unavailable, so dependency health workers logged their expected unavailable warnings.

New API routes:

- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`

New frontend routes/UX:

- `/login` password reset request panel
- `/reset-password?token=...` reset completion form
- `/verify-email?token=...` existing verification flow now backed by real delivery state

## Staging QA Procedure

1. Configure Resend API key and verified `slicecollectable.com` sender in the VPS secret environment. Never paste the key into Git or this document.
2. Apply the Prisma migration before starting the API.
3. Confirm safe runtime configuration without printing secrets:

   ```sh
   printf 'EMAIL_DELIVERY_MODE=%s\n' "$EMAIL_DELIVERY_MODE"
   printf 'EMAIL_ENABLED=%s\n' "$EMAIL_ENABLED"
   printf 'RESEND_FROM_EMAIL=%s\n' "$RESEND_FROM_EMAIL"
   test -n "$RESEND_API_KEY" && echo 'RESEND_API_KEY=present' || echo 'RESEND_API_KEY=absent'
   ```

4. Register a disposable staging account and confirm:
   - user remains unverified before link use;
   - one verification email arrives from Slice;
   - the link is the staging Slice URL;
   - the token verifies once and a replay is rejected/idempotently safe;
   - resend cooldown is enforced;
   - provider failure leaves the account unverified and exposes a retry-safe customer message.
5. Request a password reset for both an existing and a nonexistent address. Responses must be indistinguishable. Complete the existing-account reset and confirm all previous sessions are revoked and the confirmation email arrives.
6. Exercise password change, email verification, phone change/removal, TOTP enable/disable, and SMS MFA enable/disable where the staging account is configured. Confirm security messages do not contain passwords, OTPs, bank data, uploaded media, or provider secrets.
7. Inspect `TransactionalEmailDelivery`, token status, and audit events using approved admin/read-only tooling. Do not edit rows directly.

Staging mail delivery and domain/DNS verification are not claimed by this commit until the above is run with the actual VPS Resend secret and a disposable recipient.

## Release Gate

Blocked until staging confirms:

- Resend API reachability;
- verified sender-domain acceptance;
- real verification delivery;
- real password-reset delivery and session revocation;
- provider failure behavior;
- retention and operational handling for bounces/complaints.

No live Resend mode was enabled by this implementation.
