# Slice Stripe Sandbox Deposit + Withdrawal QA

Status: implementation complete; controlled Stripe sandbox execution remains account/provider dependent

This document records the GBP-only deposit and withdrawal implementation for staging. It supersedes the older capability-gating snapshot that described funding as feature-disabled.

## Root cause of the old capability cards

The deployed VPS environment contained explicit `OPERATIONAL_DEPOSITS_ENABLED=false` and `OPERATIONAL_WITHDRAWALS_ENABLED=false` settings. The capability service therefore returned `TEMPORARILY_UNAVAILABLE` before evaluating bank or payout readiness. This was a real operational kill switch, not a missing Stripe API route.

After the staging configuration is corrected, the capability projection is truthful:

- deposits are `ACTION_REQUIRED` with `BANK_ACCOUNT_REQUIRED` when approved identity exists but no connected default GBP Bacs mandate exists;
- withdrawals are `BLOCKED` with `COLLECTOR_PAYOUTS_REQUIRED` for non-collector accounts because the current external payout product is collector-proceeds-only;
- collector withdrawals are `ACTION_REQUIRED` with `PAYOUT_ACCOUNT_REQUIRED` or `PAYOUT_ACCOUNT_REVIEW_REQUIRED` until the verified Connect account is ready;
- feature-level `TEMPORARILY_UNAVAILABLE` is reserved for an explicit operational/provider kill switch.

## Current architecture

Slice's financial authority remains `FINANCIAL_CURRENCY = GBP`. `MoneyMovement`, financial accounts, journals, reservations, provider payouts, and customer-facing wallet amounts remain GBP and minor-unit based. No FX, USD ledger entry, multi-currency cash account, ownership, offering, market, or static conversion was added.

### Deposit

1. An authenticated account passes the existing email, account-status, compliance, and funding capability checks.
2. Wallet opens a Stripe-hosted Checkout Session in `mode=setup` with `payment_method_types=['bacs_debit']` for the existing provider Customer.
3. The verified return path retrieves the Checkout Session, SetupIntent, and customer-owned Bacs PaymentMethod before persisting only encrypted/hashed provider references and safe masked metadata.
4. A deposit creates the existing `MoneyMovement` first in `PENDING_PROVIDER`, then creates one idempotent GBP Bacs PaymentIntent.
5. A processing or action-required provider state never credits Slice cash.
6. Only a signature-verified, environment-matched, deduplicated `payment_intent.succeeded` event calls the existing exactly-once ledger settlement path.
7. Payment failure/cancel and later Bacs return events use the existing failure, cancel, return, reversal, reservation, and deficit-hold authorities.

### Withdrawal

The current product architecture is not a generic customer bank-withdrawal rail. External Stripe withdrawals are collector-proceeds payouts through Stripe Connect:

1. Collector role, email, phone, MFA, approved Slice compliance, no active hold, and ready GBP Connect account are required.
2. Slice validates settled, unreserved available cash and creates the existing movement.
3. The existing reservation is created before provider execution.
4. Stripe Connect creates an idempotent GBP platform transfer and connected-account payout.
5. The movement stays processing until a verified payout event confirms the provider state.
6. `payout.paid` consumes the reservation and completes the existing GBP journal once. Failure after transfer holds funds for review; it is never silently released.

Stripe Connect bank payouts are not blockchain withdrawals. The non-local withdrawal path no longer sends them through the blockchain destination-risk adapter, which previously required a chain and could reject a valid Connect payout before provider execution. Slice compliance, account holds, Connect requirements, and Stripe's connected-account controls remain authoritative.

## Provider and webhook controls

- Staging provider mode: `STRIPE_SANDBOX` when the final environment assignment is sourced.
- GBP funding rail: `bacs_debit`.
- Stripe live mode remains fail-closed and disabled.
- Stripe signatures are verified against the raw request body and the active sandbox webhook secret; livemode must match the active provider mode.
- `WebhookInbox` deduplicates provider event IDs before dispatch.
- Movement provider references are encrypted at rest and hashed for lookup/idempotency.
- Repeated settlement, payout, return, or failure events cannot create duplicate journals.
- Unknown signed provider events are recorded without mutating financial authority.

The intended single staging endpoint is:

`https://staging.slicecollectable.com/api/v1/providers/STRIPE_SANDBOX/webhooks`

## Capability and UI behavior

The Account Center and Wallet consume the backend capability projection; they do not relabel blocked actions as available. The wallet now:

- shows GBP amount entry and delayed Bacs settlement copy for deposits;
- directs users without a mandate to the hosted UK bank setup flow;
- shows pending movements from real wallet history;
- uses the verified payout destination for withdrawals instead of asking users to type an arbitrary bank destination into Slice;
- explains that settled cash remains reserved until provider confirmation;
- keeps the existing compliance, recent-auth, phone, MFA, and Connect requirements.

No buy-order blocker was changed except for the shared authoritative capability projection.

## Automated QA

Focused coverage includes:

- capability kill-switch, bank-required, payout-required, and provider-specific KYC decisions;
- hosted Bacs Checkout setup with explicit `bacs_debit` allowlisting;
- no Financial Connections call for GBP funding;
- GBP PaymentIntent creation and idempotency;
- local movement lifecycle, settlement, reversal, failure, and risk-window behavior;
- Connect readiness mapping and collector-only payout access;
- no blockchain destination screening for Stripe Connect bank payouts;
- webhook signature/livemode/deduplication boundaries;
- frontend capability copy and safe blocker actions.

Automated tests use deterministic providers and do not call Stripe.

## Controlled staging QA

Real Stripe sandbox execution is not represented as PASS without an authorized eligible account and provider evidence. The controlled run requires:

1. a staging user with approved Stripe Sandbox identity;
2. a completed hosted Bacs mandate and connected default GBP funding method;
3. a Stripe sandbox `payment_intent.processing`/success webhook path;
4. a collector test account with settled collector proceeds and ready GB/GBP Connect payout account for withdrawal QA;
5. webhook receipt, settlement, payout, and reconciliation evidence.

No manual balance mutation, fake movement, fake webhook, market mutation, ownership mutation, offering mutation, or real production money is permitted.

## Release gate

- Stripe live mode: fail-closed.
- Currency invariant: GBP throughout the ledger/provider/journal path.
- Deposit cash credit before authoritative success: NO.
- Withdrawal cash consumption before provider confirmation: NO; reservation only.
- Duplicate PaymentIntent/payout/journal on replay: NO by idempotency and movement locks.
- Investor withdrawals through an unsupported generic bank path: NO; collector Connect path only.
- Umbreon, Charizard, ownership, offering, trades, and market data: unchanged.
- Full real Stripe sandbox E2E: BLOCKED until the authorized eligible fixtures and provider webhook evidence are available.
