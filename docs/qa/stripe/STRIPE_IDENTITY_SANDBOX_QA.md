# Stripe Identity — Sandbox QA

## 1. Phase 4D status

Implemented behind the existing Slice compliance authority with an explicit
`STRIPE_IDENTITY_ENABLED` provider opt-in. Live verification remains disabled.

### Credentialed staging gate update — 2026-08-19

Credentialed staging smoke QA on 2026-08-20 confirmed the active release
`/opt/slice/releases/20260820-a850c59` runs with `PROVIDER_MODE=stripe_sandbox`,
`STRIPE_IDENTITY_ENABLED=true`, and `STRIPE_LIVE_ENABLED=false`. The Wallet
button opened Stripe's hosted test page and the returned Slice state was
`PENDING`. The hosted test outcome and real webhook completion path remain
unrun in this pass.

## 2. Identity architecture

`ComplianceCase` remains the authoritative Slice identity/compliance record. Phase 4D extends it with `identityState`, request/completion/verification timestamps, a safe failure category, and the last provider sync time. No second identity authority or parallel case table was introduced.

Stripe Identity is isolated in `StripeIdentityVerificationService`, behind the existing `StripeClientFactory` and provider mode boundary.

## 3. Verification flow

1. The customer opens Account → Identity verification.
2. Slice reuses an active `requires_input` or `processing` session when one exists.
3. For a new attempt, Slice creates a Stripe VerificationSession with a deterministic attempt idempotency key.
4. Stripe returns a hosted verification URL.
5. The customer completes the test flow on Stripe.
6. The existing signed Stripe webhook endpoint accepts the event through `WebhookInbox`.
7. Slice maps the event into the existing `ComplianceCase` and existing backend capability gates update from Slice state.

## 4. Document/selfie configuration

The baseline requests government identity document verification with live capture and matching selfie when supported by the configured Stripe Identity product. SSN, address, phone, and other extra checks are not requested.

## 5. State mapping

| Stripe state/event | Slice identity state | Existing compliance status |
| --- | --- | --- |
| no case | `NOT_STARTED` | `NOT_STARTED` |
| `requires_input` | `REQUIRES_INPUT` | `PENDING` |
| `processing` | `PROCESSING` | `REVIEW` |
| `verified` | `VERIFIED` | `APPROVED` |
| failed/unsupported terminal | `FAILED` | `REJECTED` |
| `canceled` | `CANCELED` | `EXPIRED` |

Sandbox `VERIFIED` is test-only and does not prove real-world identity.

## 6. Session reuse

Account refresh is read-only. Starting verification reuses active Slice cases with a provider reference. Retry creates a new attempt only after a terminal failed/canceled case. Stripe idempotency keys are scoped to the user and current attempt, preventing duplicate session creation during retries of the same attempt.

## 7. Webhooks

Stripe signature verification, livemode validation, encrypted `WebhookInbox` storage, replay handling, and unknown-event handling remain in the existing shared webhook controller. Identity events are dispatched internally; no Identity-specific webhook controller was added.

Older events cannot downgrade a verified case. Events older than the stored provider sync time are ignored, and a verified case rejects later non-verified downgrades.

## 8. Stored data

Slice stores only:

- user and provider/environment through the existing case
- encrypted/hashed VerificationSession reference through existing provider-reference fields
- identity state
- requested, completed, verified, and last-sync timestamps
- safe machine-readable failure category

## 9. Data deliberately not stored

Slice does not store passport, driving-license, ID-card, or selfie imagery; full document numbers; full DOB; raw Stripe Identity payloads; or verified PII unless separately authorized by product/legal policy. Stripe remains the provider-sensitive document holder.

## 10. Backend gates

Existing `ComplianceService.requireApproved()` remains the reusable authority for money movement and other currently gated actions. It relies on the Slice case status (`APPROVED` only after a mapped `VERIFIED` event). No new KYC rule was invented and no frontend-only gate is trusted.

## 11. Connect vs Identity separation

Stripe Identity verifies a Slice user. Stripe Connect handles connected-account onboarding and external payout requirements. Neither automatically completes the other.

## 12. Customer UI

Account settings and Wallet include Identity verification with Not started,
Action required, Processing, Verified, and Failed presentations. Retry/continue
is available for valid terminal/input states. Wallet and Account redirect to
the provider's hosted session URL, and Stripe sandbox is visibly labeled as a
TEST verification environment.

## 13. Admin UI

The existing admin compliance detail projection now includes safe identity state, masked/hash-derived session reference, requested/completed/verified timestamps, safe failure category, and last provider sync. Raw identity documents and sensitive provider payloads are not exposed.

## 14. LOCAL_TEST

The deterministic `LOCAL_TEST` identity adapter remains active in local mode. Existing compliance, wallet, reservation, settlement, reversal, and reconciliation behavior remains on the local provider path. No Stripe call is made in `LOCAL_TEST`.

## 15. Sandbox E2E

**PARTIAL.** A credentialed staging hosted-session smoke test passed. The full
test outcome, webhook delivery/signature verification, and mapped terminal
Slice state were not completed in this pass.

## 16. Automated/full QA

- Stripe Identity mapping/safe-failure tests: PASS
- Stripe Identity configuration/return-url tests: PASS
- Stripe factory and external boundary tests: PASS
- Frontend Account/Wallet/repository tests: PASS
- Server typecheck: PASS
- Frontend typecheck: PASS
- Full server suite: PASS — 63 suites, 262 tests
- Full frontend suite: PASS — 38 files, 131 tests
- Production server/frontend builds: PASS
- Server lint and touched-frontend lint: PASS
- Prisma validation/generation: PASS
- Live-mode safety: fail-closed

## 17. Commit/push/deployment

Code is pushed at `a850c59` and deployed to staging at
`/opt/slice/releases/20260820-a850c59`. One intended Stripe sandbox
VerificationSession was created by the authenticated Wallet smoke test; no
money, bank, ownership, offering, trading, or payout state was created.

## 18. Remaining blockers

1. Complete a disposable Stripe Identity sandbox test outcome.
2. Exercise webhook delivery/signature verification with the configured endpoint.
3. Stripe Identity product configuration must confirm matching selfie support for the selected account/country.
4. Credentialed tests must confirm retries, duplicate events, stale events, failed/canceled states, and backend gating.

## 19. READY FOR 4E

**NO.** Phase 4D implementation is locally complete, but credentialed Stripe
Identity sandbox E2E and final release QA remain outstanding.
