# Bacs Deposit Risk and Returns

Status: implemented in the repository; staging deployment is gated on the validation listed below.

This document records Slice's current GBP-only Bacs Direct Debit risk model. It does not set a commercial hold period or a market-finality policy.

## Current State

Slice uses GBP as its authoritative internal ledger currency. Customer funding uses Stripe `bacs_debit`; the deposit fee remains 0%, secondary maker/taker fees remain 0%, withdrawal remains 2.5%, and the current Initial Offering fee remains 5%.

The funding adapter creates a customer-owned GBP Bacs PaymentIntent. Slice first creates a `MoneyMovement` in `PENDING_PROVIDER`; no customer cash is posted at intent creation, Checkout completion, or provider processing. The signed provider webhook and environment/provider mapping are the authority boundary.

Before this hardening, `payment_intent.succeeded` posted directly to `CASH_AVAILABLE`. That made provider confirmation immediately usable by the order path. The hardened path posts the provider-confirmed deposit to `BACS_RISK_HOLD` and marks the movement `HELD` until an explicit internal-use policy releases it.

## Bacs Lifecycle

| Stage | Slice state | Ledger effect | Internal use |
| --- | --- | --- | --- |
| Deposit initiated | `PENDING_PROVIDER` | None | No |
| Provider processing / action required | `PROCESSING` | None | No |
| Provider succeeded | `HELD` for Bacs | One `EXTERNAL_DEPOSIT` journal: clearing debit, `BACS_RISK_HOLD` credit | No |
| Provider `available_on` evidence recorded | Still `HELD` unless policy is configured and matured | Evidence only; it is not a return-risk guarantee | No |
| Configured hold has matured | `SETTLED` | One `CASH_RELEASE` journal from `BACS_RISK_HOLD` to `CASH_AVAILABLE` | Yes |
| Return / funds withdrawn / refund | `RETURNED` | Append-only reversal of the settlement and, if applicable, the release | No |
| Dispute opened | `MANUAL_REVIEW` plus provider movement hold | No automatic ownership or cash confiscation | No |

For a newly funded £100, the exact customer-facing moments are:

- Wallet visibility: after the signed `payment_intent.succeeded` event and ledger post. The amount is visible in total cash and the bank-clearing bucket.
- Buy-order eligibility: only after the movement is released to `CASH_AVAILABLE`; the order preflight uses `tradeAvailableMinor`.
- Trade execution: only through an order whose reservation was created from trade-eligible cash. `BACS_RISK_HOLD` is never a reservation source.
- External withdrawal: separately governed by the posted withdrawal projection, provider `available_on` maturity, Connect readiness, provider liquidity, reservations, and the existing capability gates. Risk-held Bacs cash is not a withdrawal source.

Stripe provider success and a Stripe balance transaction's `available_on` are different signals. The repository's Stripe cost/evidence audit records delayed Bacs notification and dispute support; the integration therefore does not treat either signal as proof that later return/dispute risk is zero. An external-source audit attempt was unavailable in this run, so the existing primary-source links in `docs/finance/STRIPE_COST_AND_FEE_MODEL_AUDIT.md` remain the provider reference.

## Internal Use Policy

The policy is fail-closed until Product/Risk configures `BACS_INTERNAL_TRADE_HOLD_DAYS`. When omitted, Bacs-confirmed value remains visible in `BACS_RISK_HOLD` indefinitely; Slice does not invent 3-, 5-, or 7-day behavior. When configured, release is based on `providerAvailableOn + configured days`, performed lazily by wallet, trading, and provider-evidence reads. The release is transactional, idempotent, auditable, and moves the exact amount to `CASH_AVAILABLE`.

The policy currently has one explicit release control. Account age, successful deposit history, previous returns, identity/phone/MFA state, amount, shared-instrument signal, bank-change state, and admin flags remain available inputs for a future explainable rule set, but no opaque fraud score or silent first-deposit rule was introduced.

## Irreversible Actions and Finality

- A completed secondary purchase can transfer ownership and seller proceeds. The buyer's returned deposit does not silently delete ownership or claw back an unrelated seller.
- An Initial Offering purchase uses the existing trading/settlement authority and can issue ownership, consume offering inventory, and allocate Collector/Slice proceeds. No provider call is made by the offering path.
- Ownership transfer, completed executions, proceeds, and recognized fees remain append-only under the current accounting model. No automatic legal reversal was invented.
- Withdrawals create external provider effects and remain governed by existing maturity/liquidity and payout controls.
- No user-to-user cash transfer path was found in the current authority.

If a returned deposit leaves the customer's cash account negative, Slice posts a balanced `CUSTOMER_DEFICIT_RECEIVABLE` reclassification, creates a `FinancialDeficit`, and creates an account compliance hold. Seller proceeds are deliberately not used to cover that shortfall without an explicit market-finality policy. Recovery is currently supported from a future verified deposit after it is released; a future dual-control finance adjustment or sale-proceeds policy is not silently enabled.

## Trade Safety

`walletForUser()` now returns `tradeAvailableMinor` from `CASH_AVAILABLE` and `COLLECTOR_PROCEEDS_AVAILABLE` after active reservations. It returns `riskHeldMinor` separately. `TradingService.place()` refreshes matured Bacs releases before capability/order work, and the existing cash reservation path only selects trade-eligible accounts. Held Bacs cash cannot reserve or execute.

The wallet API and UI show separate trade-available, withdrawal-available, bank-clearing, reserved, settling, and total values. The frontend does not derive affordability from total cash.

## Return Handling

Returns reverse the existing journal exactly once under a movement row lock and stable idempotency correlations. If a released deposit returns, the release journal is reversed before the original deposit journal. If the customer's cash was spent, the negative cash is reclassified to the explicit receivable; no mystery negative balance or fake balance patch is left behind.

- Unused cash: the hold or cash is reversed and no deficit is created.
- Partially spent cash: remaining cash is reversed; the actual outstanding customer shortfall becomes a deficit.
- Fully spent cash: ownership and seller proceeds remain intact; the customer deficit/recovery state records the loss.
- Partial or ambiguous provider return amounts fail closed with `STRIPE_RETURN_AMOUNT_MISMATCH` for reconciliation review rather than guessing.

Repeated return events find the terminal `RETURNED` movement and do not double reverse journals or create another deficit. Provider `charge.dispute.created` opens manual review; `charge.dispute.funds_withdrawn` and `charge.refunded` are treated as provider money reversals. Dispute closure is not treated as an automatic release; it remains an auditable admin decision.

## Initial Offering

The Initial Offering uses the same buy/trading accounting boundary, so risk-held Bacs cash cannot reach it. There is no Stripe call in the offering purchase path. If a later provider return is associated with a buyer, the existing ownership, offering inventory, Collector proceeds, and Slice fee journals are preserved; the new deficit/restriction path handles the customer's obligation. Product/legal policy is still required before any action against a completed seller or offering allocation.

## Webhooks and Idempotency

Stripe signatures, livemode/provider checks, WebhookInbox persistence, and replay processing remain in force. Relevant handled paths are `payment_intent.processing`, `payment_intent.requires_action`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`, and `charge.dispute.funds_withdrawn`. `mandate.updated` remains evidence-only because it does not identify a Slice movement by itself. Unknown signed events remain durably recorded without mutating authority.

The provider reference hash, movement lock, journal correlation, deficit `sourceMovementId` uniqueness, and compliance-hold checks prevent duplicate financial effects. A dispute is held for review rather than automatically destroyed; a later definite funds withdrawal/refund can still reverse a `MANUAL_REVIEW` movement.

## Concurrency

Movement completion, release, return, reservation, and deficit reclassification use database transactions and row/account locks. Deposit and withdrawal velocity reads are serialized by per-user advisory locks. A return racing an order can either lock before the order's capability/reservation path or before the return; active cash reservations are placed into account review and execution re-checks returned-funds holds, while any post-return shortfall is a deficit rather than an ownership deletion. Full production load/concurrency evidence still requires the existing database integration harness.

## Fraud Controls

Deposit velocity is now configurable, without invented production values:

- `BACS_DEPOSIT_MAX_MINOR`
- `BACS_DEPOSIT_DAILY_LIMIT_MINOR`
- `BACS_DEPOSIT_ROLLING_7D_LIMIT_MINOR`
- `BACS_DEPOSIT_DAILY_COUNT_LIMIT`
- `BACS_DEPOSIT_RAPID_WINDOW_SECONDS`
- `BACS_DEPOSIT_RAPID_COUNT_LIMIT`

Configured limits are checked in the locked create transaction and count only active provider lifecycle attempts. With values omitted, the system reports the policy as unconfigured rather than silently claiming a threshold. Existing shared-bank detection remains a review signal rather than an automatic fraud verdict. Existing `BANK_CHANGE_WITHDRAWAL_HOLD_HOURS` remains the bank-change withdrawal control and is unchanged.

## Admin and Customer UX

Finance staff can read `GET /api/v1/admin/finance/bacs-risk`, which exposes safe GBP projections for held deposits, provider `available_on`, provider status, hold reason, returns, deficits/recovery, and shared-instrument review count. It does not expose bank details. Existing finance movement records also retain the provider/movement audit trail.

Wallet copy describes bank clearing without using fraud language or promising immediate spendability. A Bacs activity row is `Clearing` while risk-held, `Completed` only after release, and `Reversed`/`Needs review` for corresponding provider states. The deposit form discloses that funds may remain held before they can be used or withdrawn.

## Recovery and Treasury

The explicit receivable is a platform asset and is balanced against the customer's cash reclassification. The account restriction blocks new purchases, listings/offers, withdrawals, and other exposure-increasing actions while allowing read-only access and a verified deposit recovery path. Existing provider expense, customer liability, reconciliation, and revenue journals are not reclassified by this task. Finance must still define long-term risk-reserve economics and any dual-control manual recovery workflow.

## Remaining Product Policy Decisions

1. Select the production Bacs internal-use hold duration/rule; do not deploy a number by inference.
2. Decide whether first deposits, new accounts, and high-risk signals receive separate configurable holds.
3. Set deposit max/daily/rolling/count/rapid limits for the launch market.
4. Define market finality and who bears a buyer's returned-debit loss; no seller clawback is active.
5. Define whether and when sale proceeds or a dual-control finance adjustment can cure a deficit.
6. Define user notification templates and support/collections handling for returns and deficits.
