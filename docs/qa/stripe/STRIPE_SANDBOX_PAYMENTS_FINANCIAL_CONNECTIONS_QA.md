# Stripe Sandbox Payments + Financial Connections QA

> Historical superseded record. The Financial Connections/US ACH bank-link
> implementation described below is not the active GBP funding path. See
> `STRIPE_GBP_BACS_FUNDING_QA.md` for the current Stripe-hosted Checkout
> `bacs_debit` architecture.

## Final Status

**Phase 4B: SUPERSEDED — implementation retained for historical audit only.**

The Stripe boundary, customer mapping, Financial Connections flow, safe bank projection, payment-intent lifecycle, signed webhook handling, idempotency, and frontend flow are implemented. A real Stripe sandbox E2E was not run because no sandbox credentials are configured in this workspace. The local Slice ledger remains GBP; Stripe Financial Connections ACH uses US bank accounts and must be validated against the product's supported currency/provider arrangement before release.

### Credentialed staging gate update — 2026-08-19

Read-only staging audit confirmed that the active VPS release is still
`/opt/slice/releases/20260818-dd2c7cb`, with `PROVIDER_MODE=local`. The
protected `/etc/slice/slice.env` contains no Stripe secret, publishable-key, or
webhook-secret variables, so staging was not switched to `stripe_sandbox`, no
release was deployed, and no Stripe API or webhook registration call was made.
The existing HTTPS route is ready for the current controller at
`https://staging.slicecollectable.com/api/v1/providers/STRIPE_SANDBOX/webhooks`,
but signature and delivery behavior remain unverified until credentials are
provided.

## Stripe SDK

The official `stripe` Node SDK is pinned at `22.5.0` in `server/package.json`. Stripe construction is centralized in `StripeClientFactory`; controllers and domain services do not instantiate Stripe directly.

## API Version

Pinned intentionally to `2026-07-29.dahlia` in `stripe-provider.client.ts`.

## Provider Modes

`LOCAL_TEST`, `STRIPE_SANDBOX`, and `STRIPE_LIVE` remain distinct. `LOCAL_TEST` performs no external I/O. Sandbox requires `sk_test_`/`pk_test_` credentials. Live requires explicit `STRIPE_LIVE_ENABLED=true`, live credentials, and the existing production safety checks.

## Stripe Customer

Added `ExternalProviderCustomer`, unique per Slice user, provider, and environment. Customer creation uses Stripe idempotency keys tied to the Slice user and persists only the Stripe customer ID.

## Financial Connections

The former `POST /api/v1/wallet/bank-link/token` Financial Connections route is
not an active endpoint. The current GBP route is
`POST /api/v1/wallet/bank-link/checkout`, which creates a Stripe-hosted Checkout
Session in setup mode restricted to `bacs_debit`.

## Requested Permissions

Only `payment_method` and `ownership` are requested. `transactions` and `balances` are not requested.

## Bank Persistence

`ExternalFinancialAccount` stores encrypted provider references, hashes, payment-method reference, institution, account type, last four digits, status, ownership availability, default selection, and last sync time. Full account/routing numbers and credentials are never persisted. Multiple connected accounts are supported with one explicit default funding account.

## ACH Deposit Flow

Deposits still begin as Slice `PENDING_PROVIDER` movements. In Stripe modes, the selected connected account is used to create an idempotent Stripe PaymentIntent with Slice movement metadata. The provider reference is encrypted and hashed into the existing movement row. No separate wallet or Stripe-balance projection is created.

## Pending Funds

Stripe `processing`, `requires_action`, and `succeeded` responses do not directly credit available Slice cash. The movement remains pending/processing until a verified provider webhook is accepted and the existing ledger completion path runs.

## Settlement

Only `payment_intent.succeeded` reaches `completeFromProvider`, which posts the existing journal exactly once. Local test settlement behavior is unchanged.

## Returns/Reversals

The existing `FAILED`, `RETURNED`, `REVERSED`, reservation release, deficit-hold, and append-only reversal services remain authoritative. Stripe failure/cancel events map into those services; no negative balance is written directly.

## Webhooks

Stripe webhook requests use the preserved raw request bytes and `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. Invalid signatures and livemode mismatches are rejected. Payment intent processing, success, failure, required action, and cancellation events are mapped to Slice movement transitions.

## WebhookInbox

The existing `WebhookInbox` is reused. The Stripe event ID is hashed and uniquely stored by provider. Payloads remain encrypted and unknown signed event types are safely recorded without domain mutation.

## Idempotency

Customer creation, bank payment-method creation, and deposits use deterministic Stripe idempotency keys. Duplicate webhook deliveries are accepted as replays by the existing inbox uniqueness boundary. Ledger completion remains concurrency-safe and replay-safe.

## Livemode Separation

Sandbox rejects live keys/events and live rejects test keys/events. Cross-environment provider objects are not processed. `STRIPE_LIVE` remains fail-closed by default.

## Reconciliation

Existing provider reconciliation remains the read-only authority check for movement currency, journal amount, terminal state, provider reference, reservations, and duplicate postings. The Stripe movement reference is stored through the same provider-neutral fields for reconciliation.

## Frontend

The temporary “bank connection setup coming soon” control was replaced with a Stripe Financial Connections launch flow. Connected accounts show safe institution/type/mask data, default funding account, make-default, and disconnect controls. Deposit status copy continues to distinguish pending/processing/available/failed states.

## Admin

The existing admin provider inspection boundary can expose provider-neutral movement and webhook state. No secrets, full account numbers, routing numbers, or raw Stripe errors are returned by the customer-facing projection.

## Automated QA

- Server typecheck: PASS
- Server unit suite: PASS — 59 suites, 244 tests
- Stripe factory safety tests: PASS
- Existing provider boundary suite: PASS
- Frontend typecheck: PASS
- Frontend unit suite: PASS after updating the temporary deferred-bank assertions to the live Connect Bank UX
- Prisma format/generate: PASS

## Sandbox E2E

**BLOCKED.** No `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, or
`STRIPE_WEBHOOK_SECRET` is configured locally or on staging. The VPS remains
on `PROVIDER_MODE=local`; no real sandbox Customer, Financial Connections
Session, bank account, PaymentIntent, webhook, failure, replay, disconnect, or
reconciliation call was made.

## Security

Raw webhook verification, provider-mode isolation, encrypted provider references, hashed lookup keys, minimum Financial Connections permissions, deterministic idempotency, safe account masking, no Stripe balance exposure, and no live-mode default are implemented. Stripe SDK failures are not exposed as raw stack traces in the intended API boundary.

## Remaining Risks

1. Stripe Financial Connections and `us_bank_account` ACH are US-bank oriented, while Slice's current ledger is GBP. The provider/currency product decision and a real test-account verification are required before enabling deposits in staging.
2. Real Stripe sandbox E2E and webhook delivery verification remain outstanding until sandbox secrets and a Stripe test institution are supplied.
3. Integration tests requiring local PostgreSQL/Redis remain environment-dependent; the prior Phase 4A local dependency blocker still applies.
4. Connect payouts and Stripe Identity are intentionally deferred.

## Release Decision

**DO NOT RELEASE / DO NOT DEPLOY Phase 4B yet.** The code is ready for
credentialed sandbox integration testing, but Phase 4B is not green and is not
ready for Phase 4C.
