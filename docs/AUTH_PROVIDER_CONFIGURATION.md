# Auth provider configuration

Slice owns account state. External providers only supply delivery or proof evidence:
an accepted Resend delivery does not verify an email, an approved Twilio Verify
check must still be committed by Slice, and a Turnstile widget callback is never
accepted without server-side Siteverify.

## Modes

`local_test` is deterministic, network-free, and intended for automated tests.
It is not accepted for CAPTCHA in production. `resend`, `twilio_verify`, and
`cloudflare_turnstile` fail closed when their selected provider is unavailable.
There is no automatic provider-to-local-test fallback.

## Required deployment configuration

Set these only in the deployment secret manager; do not put values in frontend
environment files or source control.

| Provider | Required values |
| --- | --- |
| Resend | `EMAIL_DELIVERY_MODE=resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, optional `RESEND_FROM_NAME`, and an HTTPS `APP_PUBLIC_URL` |
| Twilio Programmable SMS | `PHONE_DELIVERY_MODE=twilio_sms`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Twilio Verify | `PHONE_DELIVERY_MODE=twilio_verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_VERIFY_SERVICE_SID` |
| Cloudflare Turnstile | `CAPTCHA_PROVIDER=cloudflare_turnstile`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME`, `TURNSTILE_EXPECTED_ACTION=signup` |

`RESEND_TEST_RECIPIENT_OVERRIDE` may redirect delivery in development or test
without changing the account email. It is rejected in production.

## Manual provider verification (opt-in)

Do not run paid or live-recipient checks in automated tests. Use a disposable
Slice user and explicit provider credentials.

1. Configure the provider mode and credentials above, with the provider's
   dashboard-approved test recipient/phone and a trusted HTTPS callback URL.
2. For Resend, request a verification email and confirm that delivery acceptance
   alone leaves `emailVerifiedAt` unset; then follow the link and confirm it.
3. For Twilio Programmable SMS, request an SMS only to an approved trial
   recipient, enter the code, and confirm Slice's hashed, expiring challenge —
   not Twilio delivery acceptance — changes phone state. For Twilio Verify, only
   an `approved` Verify check may change Slice phone state.

## Opt-in Twilio Trial SMS QA

`twilio_sms` uses Twilio Programmable Messaging only to deliver a code. Slice
remains authoritative for code generation, hashing, expiry, resend limits,
verification attempts, single use, and `phoneVerifiedAt`.

1. Set `PHONE_DELIVERY_MODE=twilio_sms`.
2. Set `TWILIO_ACCOUNT_SID` to the Twilio **Account SID** (it begins `AC`, not
   an API-key SID beginning `SK`).
3. Set `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` (an approved Twilio trial
   sender in E.164 form).
4. Restart the backend, request one code for an explicitly approved trial
   recipient, and complete verification with that code.

Do not automate bulk messages or use unapproved trial recipients.
`TWILIO_VERIFY_SERVICE_SID` is not used in `twilio_sms` mode; it remains only
for the separate `twilio_verify` mode.
4. For Turnstile, configure Cloudflare's documented test keys for the desired
   pass/fail behavior; complete the widget and confirm Siteverify decides signup.
   Reuse the returned token once to confirm the provider's duplicate rejection
   fails signup without creating another user.
5. Remove the disposable user and provider test data permitted by each provider.

No Resend, Twilio, or Cloudflare credentials are required for the local test
suite. A real provider test is an external configuration gate, not a reason to
enable a less secure fallback.
