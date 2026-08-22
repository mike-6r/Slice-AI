# Collector Membership + Stripe Full Implementation QA

**Status:** IMPLEMENTED — Sandbox E2E BLOCKED until staging Stripe configuration is supplied
**Scope:** Collector membership billing and entitlement enforcement only
**Currency:** GBP
**Economic boundary:** No wallet, cash, ledger, ownership, offering, order, trade, or payout state is created or changed by membership billing.

## 1. Product authority and non-goals

Collector membership is a recurring subscription product. Slice owns the plan catalog, the persisted subscription projection, entitlement decisions, usage counters, and access enforcement. Stripe owns payment collection, recurring billing, customer payment methods, and provider-side subscription state. A hosted Checkout redirect is not proof of membership access; access begins only after a verified Stripe webhook is projected into the Slice database.

This implementation does not create or modify:

- wallets, balances, deposits, withdrawals, or financial journals;
- ownership units, offerings, market status, orders, executions, or treasury state;
- custody, grading, valuation, market-data, PriceCharting, or Ximilar state;
- controlled beta assets such as Umbreon or Charizard.

## 2. Persisted source of truth

`CollectorPlan` is the authoritative plan catalog. Plans are seeded by the Prisma migration, not by application startup or a demo setup script. The seeded Sandbox launch catalog is:

| Plan | Monthly price | Currency | Interval | Active collectible limit | Monthly submissions |
|---|---:|---|---|---:|---:|
| Collector Starter | £9.00 | GBP | month | 10 | 10 |
| Collector Pro | £19.00 | GBP | month | 50 | 20 |
| Collector Elite | £49.00 | GBP | month | 250 | 100 |

The complete entitlement JSON remains on each persisted plan row. It includes open drafts, open submissions, concurrent intake, market research tier/history, bulk import, analytics, featured profile capacity, priority support, and export flags. No runtime `ensurePlans()` or demo subscription upsert remains in the application path.

`CollectorSubscription` is the authoritative Slice projection. It stores:

- plan and lifecycle status;
- provider, customer, Checkout Session, subscription, and Price references;
- current period dates and cancel-at-period-end state;
- safe payment-method summary fields only;
- last provider event timestamp and hashed event identifier for ordering/replay protection.

`CollectorSubscriptionStatusHistory` records every persisted status/plan transition with source, reason, and hashed provider event reference. Provider event payloads and secrets are not copied into customer projections.

## 3. Lifecycle model

Supported projected states are `INCOMPLETE`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCEL_AT_PERIOD_END`, `SUSPENDED`, `CANCELLED`, and `EXPIRED`.

Only `TRIALING`, `ACTIVE`, and `CANCEL_AT_PERIOD_END` grant Collector capacity. `INCOMPLETE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, and `EXPIRED` do not grant new capacity. Out-of-order provider events are ignored when their event timestamp is older than the persisted projection timestamp.

The customer can:

1. start hosted Stripe Checkout for a configured recurring GBP Price;
2. open the Stripe Customer Portal after a verified remote subscription exists;
3. change plan with provider-side proration and a downgrade usage check;
4. cancel at period end;
5. resume a scheduled cancellation.

Checkout completion only attaches provider references to the pending Slice row. It never activates the plan. `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required` are projected through the existing `WebhookInbox` and `ProviderWebhookService` boundary.

## 4. Stripe configuration contract

The following configuration is required per environment:

```text
PROVIDER_MODE=stripe_sandbox
STRIPE_LIVE_ENABLED=false
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MEMBERSHIP_STARTER_PRICE_ID=price_...
STRIPE_MEMBERSHIP_PRO_PRICE_ID=price_...
STRIPE_MEMBERSHIP_ELITE_PRICE_ID=price_...
```

Price IDs must reference recurring monthly GBP Prices created in the intended Stripe Sandbox. The application does not create Products or Prices and does not guess or convert currencies. Checkout verifies mode, customer, and livemode before returning a redirect.

The staging VPS was audited before implementation verification. It was still `PROVIDER_MODE=local` and did not contain the three membership Price ID variables. Therefore the real Stripe Sandbox flow is intentionally unavailable until those operator-owned settings are configured. This is a release blocker, not a frontend fallback.

## 5. Server enforcement

The Collector workspace reads the persisted projection and shared usage projection. Submission creation checks active collectibles, drafts, open submissions, monthly submissions, and concurrent intake inside the same database transaction as the create. A PostgreSQL transaction advisory lock serializes capacity checks per Collector so concurrent creates cannot both consume the same final slot.

Market research requires an active persisted Collector membership before provider quota is used or a research snapshot is written. Staff/Admin review operations remain permission-controlled and do not use customer membership flags.

Downgrades are rejected with `MEMBERSHIP_DOWNGRADE_USAGE_CONFLICT` when current persisted usage exceeds the target plan. No assets or submissions are deleted automatically.

## 6. Frontend behavior

The Collector Membership page reads plan prices, descriptions, interval, availability, status, dates, payment method summary, and usage from the backend projection. It does not contain plan prices or provider IDs. Local or incompletely configured environments show a truthful configuration-required state and disable billing actions. The page distinguishes payment setup in progress, active, payment issue, scheduled cancellation, suspension, and ended states.

Plan cards use Checkout only when there is no membership and use the plan-change action when a persisted active membership exists. The Customer Portal and cancellation controls are disabled until a provider-backed active projection exists. Redirect results are handled only as navigation; TanStack Query refreshes the projection after returning.

Admin Memberships exposes `INCOMPLETE` and `SUSPENDED` status filters, current period dates, provider/configuration state, usage, warnings, and eligible provider actions. There is no manual admin override that can fabricate paid membership access.

## 7. Idempotency and audit

All customer billing mutation endpoints require an `Idempotency-Key` header. The browser repository generates a fresh key for each user action. Stripe requests use environment- and membership-scoped idempotency keys. Checkout, portal open, plan change, cancellation, resume, status synchronization, payment failure, and webhook projection are audited through the existing identity audit transaction boundary.

Stripe events continue through the existing raw-body signature verification, livemode check, `WebhookInbox` deduplication, and provider dispatch path. No second webhook framework or direct database retry path was introduced.

## 8. Automated QA

| Gate | Result |
|---|---|
| Prisma schema validation | PASS |
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Backend regression suite | PASS — 63 suites / 261 tests |
| Frontend regression suite | PASS — 38 files / 135 tests |
| Focused membership suite | PASS — 5 tests |
| Frontend production build | PASS |
| Backend production build | PASS |
| Stripe Sandbox Checkout | BLOCKED — staging provider mode/Price IDs not configured |
| Stripe webhook projection | BLOCKED — staging webhook secret/provider configuration not enabled |
| Stripe Customer Portal | BLOCKED — requires verified provider-backed membership |

## 9. Required Sandbox E2E matrix

After operator configuration, run only with disposable Collector credentials and Stripe Sandbox test payment methods:

1. no active membership → each plan Checkout URL is recurring GBP and customer-scoped;
2. Checkout success URL alone leaves Slice state `INCOMPLETE`;
3. signed `checkout.session.completed` attaches references only;
4. signed `customer.subscription.created` projects the matching plan and period;
5. access is granted only after the subscription projection is active;
6. duplicate webhook delivery is idempotent;
7. older webhook delivery cannot roll back a newer projection;
8. payment failure moves projection to `PAST_DUE` and blocks new capacity;
9. recovery/payment success restores access through the provider event;
10. upgrade applies provider-side proration and projects the target plan;
11. downgrade above target usage is rejected without provider mutation;
12. downgrade within target usage updates the provider and projection;
13. cancel sets `CANCEL_AT_PERIOD_END` without removing current access;
14. resume clears the scheduled cancellation;
15. Customer Portal opens only for a verified provider-backed subscription;
16. all membership actions remain outside wallet/ledger/ownership/trading tables;
17. provider calls are limited to the requested Stripe action and webhook reconciliation;
18. live mode remains fail-closed.

## 10. Release gate

**Code readiness:** PASS for the implementation and automated gates.
**Staging Sandbox readiness:** NO-GO until the three recurring GBP Price IDs, `stripe_sandbox` mode, test keys, and the membership webhook secret are configured on staging.
**Live mode:** NOT ENABLED.
**Financial/economic mutation:** NONE.

The final release decision must be updated only after the controlled Sandbox E2E matrix above is executed and the persisted subscription, status history, audit events, and unchanged financial/economic state are verified.
