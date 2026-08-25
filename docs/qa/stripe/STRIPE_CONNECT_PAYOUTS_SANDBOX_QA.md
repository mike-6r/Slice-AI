# Stripe Connect Payouts — Sandbox QA

## Phase

Phase 4C — implementation complete locally; controlled Stripe sandbox execution remains blocked until Stripe test credentials and a configured UK Connect test recipient are available.

### Credentialed staging gate update — 2026-08-25

Staging is configured with `PROVIDER_MODE=stripe_sandbox`, a valid `sk_test_`
credential, and `https://staging.slicecollectable.com` as the public origin.
The platform credential was checked with a read-only Stripe account request
(HTTP 200). The Connect onboarding repair is deployed at
`/opt/slice/releases/20260824-43f65d2`; `/opt/slice/current` and
`/opt/slice/app` point to the same release. API health/readiness and the local
web root passed after restart.

The regression was introduced by switching new-account creation to Stripe
Accounts v2 recipient configuration. New users failed before Slice could
persist `ExternalConnectAccount`, producing the generic HTTP 500. New users
now use the established Express Connect v1 account/account-link contract;
existing v2 rows remain readable through the retrieval compatibility path.
No Connect account was created by this repair or by the read-only credential
check. The existing HTTPS provider webhook route remains shared with Connect
and payout handlers; a second route was not created.

## Scope and authority

Slice remains authoritative for collector proceeds, cash availability, withdrawal reservations, ledger journals, movement status, and reconciliation. Stripe Connect is only the external payout rail. Investor deposits and purchases do not create or require a Connect account; Connect setup is exposed only to users with the `COLLECTOR` role.

No live Stripe calls are enabled. The existing provider-mode guard accepts only `sk_test_` keys for `stripe_sandbox`, rejects live keys in sandbox, and keeps `stripe_live` fail-closed.

## Connect account lifecycle

Slice stores one encrypted/hash-mapped connected account per user, provider, and environment. Only safe projections are retained: lifecycle status, requirement counts/flags, `details_submitted`, `payouts_enabled`, and the transfers capability status. Raw requirements, identity documents, bank details, and KYC values never enter Slice storage.

The public status domain is:

`NOT_STARTED` → `ACTION_REQUIRED` → `UNDER_REVIEW` → `READY`, with `RESTRICTED` and `DISABLED` terminal/blocked states as reported by Stripe. `READY` requires both active transfers and enabled payouts with no current/past due or validation errors; onboarding completion alone is not sufficient.

Onboarding uses Stripe-hosted Express Connect account onboarding. Slice does not collect KYC or payout-bank forms. Refresh and return routes generate a new hosted link through the same service.

## Money flow

1. Slice creates the withdrawal intent and reserves the selected cash account inside the existing reservation lifecycle.
2. Collector proceeds withdrawals require a `READY` Connect account.
3. Slice creates one idempotent platform transfer to the connected account.
4. Slice creates one idempotent standard payout in the connected-account context.
5. Slice keeps the movement pending/processing until a verified Stripe payout webhook confirms the external state.
6. `payout.paid` completes the existing Slice movement and consumes the existing reservation exactly once.
7. A transfer failure before external funds move fails the movement and releases the reservation.
8. A payout failure after the transfer exists moves the movement to manual review and keeps the reservation locked; it is never silently released or double-credited.

The mapping is one-to-one from `MoneyMovement` to `ConnectPayout`. Transfer and payout references are encrypted at rest and hashed for lookup/idempotency. Provider webhook processing uses the existing `WebhookInbox` and `/providers/:provider/webhooks` controller; no second webhook controller was added.

## Automated checks

- Prisma schema validation/generation: PASS
- Server typecheck: PASS
- Connect status mapping tests: PASS
- Existing server suite: PASS — 74 suites, 322 tests
- Frontend suite/typecheck/build: PASS — 36 files, 126 tests; production build PASS
- Server typecheck/build/lint: PASS
- Frontend typecheck and touched-file lint: PASS
- Stripe sandbox credential reachability: PASS — read-only account request HTTP 200
- Stripe Connect onboarding execution: pending a fresh authenticated browser retry
- Live payout execution: NOT RUN / fail-closed

## Controlled sandbox checklist

The following must be run only with disposable Stripe sandbox data and explicit sandbox credentials:

- connected-account creation and deterministic replay
- hosted onboarding and refresh link
- requirements/action-required/under-review/ready/restricted projections
- transfer and payout idempotency
- processing, paid, failed, and canceled webhooks
- duplicate webhook replay through the existing inbox
- concurrent withdrawal attempts against the same reserved proceeds
- reconciliation with matching and deliberately discrepant provider references
- confirmation that no investor-only deposit/purchase flow creates a Connect account

Until the controlled onboarding, payout, and webhook run is complete, Phase 4C
remains not release-ready for real-money launch. Live payout execution remains
not run and fail-closed.

## Data-safety assertion

This implementation made no staging business mutations and did not touch Umbreon, Charizard, ownership, orders, trades, balances, or financial journals.
