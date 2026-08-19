# Stripe GBP Bacs Funding QA

Run date: 2026-08-19  
Decision: **UK/GBP-first; GBP ledger retained; Bacs Direct Debit selected**  
Deployment: **NOT PERFORMED**  
Sandbox execution: **BLOCKED until credentialed staging is prepared**

## 1. GBP Bacs Migration

**PARTIAL — local implementation complete; credentialed Stripe sandbox validation
pending.** The active GBP customer-funding runtime now uses Stripe Bacs Direct
Debit (`bacs_debit`). Existing GBP finance, ownership, offering, trading,
collector-proceeds, withdrawal, and Connect economics were preserved.

## 2. Existing US Funding Path Findings

The former path created US Financial Connections sessions, filtered for US
accounts, created `us_bank_account` payment methods, and persisted a GBP label
onto a US-oriented external account projection. That combination was not an
approved GBP funding rail. It is no longer reachable from active `server/src`
or `src` runtime code. Historical schema/migration rows are retained and are
not relabeled or used for GBP funding.

## 3. Financial Connections Runtime Status

**DISABLED/DEFERRED for GBP.** No Financial Connections session, US bank
account, or US country filter is created by the current runtime. The retained
Financial Connections schema is historical compatibility only.

## 4. Bacs Payment-Method Architecture

1. Slice creates/reuses its existing provider Customer mapping.
2. Slice creates a Stripe SetupIntent restricted to `bacs_debit` and `usage:
   off_session`, with a deterministic idempotency key.
3. Stripe Payment Element collects the Bacs details and mandate in the browser.
4. Slice verifies the completed SetupIntent belongs to the authenticated Slice
   user and the current provider environment.
5. A later deposit reuses the saved Bacs PaymentMethod to create a GBP
   PaymentIntent with `payment_method_types: ['bacs_debit']`.

Slice never receives raw account numbers, sort codes, online-banking
credentials, or raw mandate text.

## 5. Mandate Implementation

The Wallet uses Stripe.js Elements and `confirmSetup({ redirect: 'if_required' })`.
The backend accepts only the resulting SetupIntent ID, retrieves it from Stripe,
requires `succeeded`, and requires a customer-owned `bacs_debit` PaymentMethod.

## 6. Customer Funding-Method Persistence

The existing `ExternalFinancialAccount` projection is reused for Bacs methods.
Only safe metadata is stored: provider/environment ownership, encrypted and
hashed PaymentMethod reference, safe account name if supplied, last four digits
if supplied, `bacs_debit` type, GBP currency, status, default flag, and sync time.
Legacy US rows remain intact but are excluded by the GBP Bacs runtime filter.

An additive `BacsSetupSession` table records SetupIntent ownership and lifecycle.
No deposit model or second webhook inbox was introduced.

## 7. Deposit Lifecycle

The existing `MoneyMovement` is created first as GBP `PENDING_PROVIDER` with
the existing idempotency key. The backend then creates one Stripe Bacs GBP
PaymentIntent, stores its encrypted/hashed provider reference, and transitions
the movement to `PROCESSING` while Stripe processes it.

## 8. Pending Behavior

Creating or confirming a Bacs PaymentIntent never credits Slice cash. Available
GBP cash changes only after the verified `payment_intent.succeeded` webhook
reaches the existing exactly-once ledger completion path.

## 9. Webhooks

The existing `POST /providers/:provider/webhooks` route and `WebhookInbox` are
reused. Existing raw-body signature verification, livemode separation,
deduplication, encrypted payload storage, and idempotent movement dispatch are
preserved.

The active payment lifecycle is:

- `payment_intent.processing` / `payment_intent.requires_action` → processing;
- `payment_intent.succeeded` → existing settlement path;
- `payment_intent.payment_failed` → failed movement;
- `payment_intent.canceled` → canceled movement.

For full Bacs returns, the current handler also recognizes Stripe charge
dispute/return events when they identify the original PaymentIntent and the
provider amount exactly matches the GBP movement. Mismatches fail into webhook
review rather than performing an unsafe automatic repair. Duplicate returns are
safe through the existing movement state/idempotency boundary.

## 10. Failure / Return Handling

Payment creation failures fail the pending movement without crediting cash.
Full provider returns use the existing append-only `RETURNED` reversal and
deficit-hold path. Unsupported, partial, mismatched, stale, or out-of-order
events do not edit balances directly and remain available for reconciliation or
manual review.

## 11. Currency Invariant Enforcement

The required invariant is enforced by the selected rail and runtime filters:

`provider settlement currency = MoneyMovement currency = FinancialAccount currency = Journal currency = GBP`

The provider PaymentIntent is explicitly `gbp`; only GBP Bacs projections can be
selected; the finance domain remains GBP-only; and no display conversion or FX
is introduced. The typed funding configuration accepts only `bacs_debit`.

## 12. Stripe Customer Regression

**PASS locally.** Existing one-customer-per-Slice-user/provider/environment
mapping and deterministic creation idempotency are reused. Customers are not
recreated for Bacs setup or deposits.

## 13. Connect Regression

**PASS locally.** Connect remains collector/payout-recipient only with the
existing GB/GBP transfer and payout architecture. This task did not change
Connect or create payout state.

## 14. Identity Regression

**PASS locally.** Identity remains separate from customer funding. Existing
compliance gates still run before a deposit movement is created.

## 15. LOCAL_TEST Regression

**PASS.** Server Jest: **63 suites, 260 tests**. Frontend Vitest: **38 files,
131 tests**. No Stripe network access is required by the automated suite.

## 16. Prisma Changes

**PASS.** `prisma validate` and `prisma generate` passed. The only schema change
is an additive `BacsSetupSession` model and migration. No database reset,
historical journal rewrite, historical MoneyMovement currency rewrite, or
legacy US row relabeling was performed.

## 17. Frontend Changes

Wallet-only change: the former Financial Connections launcher was replaced by a
Stripe Payment Element Bacs mandate setup flow. It displays real backend/provider
state, supports cancel/confirm, masks safe account metadata, and does not create
fake connected-bank or balance state. Markets, asset cards, collectible pages,
homepage design, filtering, and Discord were not touched.

## 18. Unit Tests

**PASS.** Focused backend provider/config tests: **39 tests**. Coverage includes
typed Bacs rail selection, SetupIntent creation, no Financial Connections call,
GBP Bacs PaymentIntent creation, legacy-row exclusion, and live/config safety.

## 19. Integration Tests

**LOCAL_TEST PASS.** Existing provider wallet, movement, settlement, reversal,
concurrency, and webhook suites passed as part of the 63-suite run. Real Stripe
integration was not run because no sandbox credentials are configured.

## 20. Full Regression

**PASS locally.** Server and frontend typechecks passed. Full server and
frontend test suites passed. Touched-file lint passed after formatting.

## 21. Build

**PASS.** Production server build and production frontend client/SSR build
passed. The existing frontend chunk-size advisory remains non-blocking.

## 22. Commit Hash

**NOT COMMITTED.** The repository contains unrelated existing worktree changes;
no commit was created to avoid bundling unrelated product work.

## 23. Push Status

**NOT PUSHED.**

## 24. Deployment

**NOT PERFORMED.** No VPS, staging, marketplace, homepage, static asset,
business, or provider state was changed.

## 25. Remaining Blockers

1. Provide Stripe sandbox `sk_test_`, `pk_test_`, and `whsec_` through the
   deployment-managed secret channel.
2. Deploy a clean provider-only release containing the additive migration.
3. Configure `PROVIDER_MODE=stripe_sandbox` and verify the single HTTPS webhook
   route with Stripe Bacs sandbox fixtures.
4. Execute disposable setup, mandate, deposit, processing, success, failure,
   canceled, return, replay, reconciliation, and restart-safety QA.
5. Confirm Stripe account Bacs capability and complete product/legal/compliance
   release review.

## 26. Ready for Sandbox Deployment

**NO.** Local implementation and regression are green, but credentialed sandbox
validation, deployment-managed secrets, webhook delivery, and release-gate
review remain outstanding.

## Release Safety

Stripe live mode remains disabled. No USD migration, FX, multi-currency,
ownership, offering, fee, journal, or Connect economics change was made.
