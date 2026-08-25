# Slice Financial Launch Policy

Status: **OWNER APPROVED — INITIAL LAUNCH POLICY ACTIVATED (2026-08-25)**

This is the authoritative launch policy for the current GBP Slice ledger and
Stripe Bacs Direct Debit funding rail. The owner approved the conservative
initial policy on 2026-08-25. The approved values are activated in staging;
production remains a separately configured environment and is not changed by
this pass. No FX behavior or real financial/provider activity is enabled.

## Current State

Slice is a GBP-only customer-liability ledger. Customer Bacs funding is
provider-confirmed before it is ledger-posted, but provider confirmation is
not treated as proof that return or dispute risk has ended. Bacs deposits use
`BACS_RISK_HOLD` first; trade and withdrawal projections use only released
`CASH_AVAILABLE` and other explicitly eligible accounts.

The current fee authorities remain unchanged: 0% Bacs deposit fee, 0% current
secondary maker/taker fees, 2.5% withdrawal fee, and 5% new Initial Offering
fee. No deposit, withdrawal, order, trade, payout, transfer, or provider
money was created for this policy pass.

## Current GBP Authority

The source of truth is the balanced GBP journal and its account projections.
Amounts are stored in integer minor units. Customer liability, provider
expenses, Collector proceeds, Slice fee revenue, clearing, reservations, and
deficits are separate accounting concepts. The frontend receives authoritative
GBP projections; it does not convert or invent values.

## BACS Hold

### Exact current semantics

`BACS_INTERNAL_TRADE_HOLD_DAYS` is the only internal Bacs release duration
currently implemented. If it is absent, the policy fails closed: a
provider-confirmed Bacs deposit remains `HELD` in `BACS_RISK_HOLD` and cannot
be traded, withdrawn, reserved, or used for an Initial Offering purchase.

If configured, the release boundary is:

`providerAvailableOn + (BACS_INTERNAL_TRADE_HOLD_DAYS × 24 hours)`

The release check runs against the provider's persisted `providerAvailableOn`
evidence. The clock does **not** begin at PaymentIntent creation, PaymentIntent
success, webhook receipt, or Slice movement creation. At the boundary, a
transactional, idempotent `CASH_RELEASE` journal moves the exact amount from
`BACS_RISK_HOLD` to `CASH_AVAILABLE`. The duration reduces exposure; no finite
period eliminates Bacs return or dispute risk.

### Policy options and approved launch choice

| Option | Proposed hold timing | Return/fraud exposure | Customer friction | Treasury exposure | Operational burden |
| --- | --- | --- | --- | --- | --- |
| Conservative | `providerAvailableOn + 7 days` | Lowest of these options, but not zero | Highest delay | Lowest provisional-spend exposure | More clearing/support questions |
| Balanced | `providerAvailableOn + 5 days` | Moderate; not zero | Moderate delay | Moderate exposure | Moderate monitoring |
| Fast | `providerAvailableOn + 3 days` | Highest of these options; not zero | Lowest delay | Highest provisional-spend exposure | Highest return/recovery pressure |

Approved initial launch choice: **Conservative**, with
`BACS_INTERNAL_TRADE_HOLD_DAYS=7`. Release is exactly
`providerAvailableOn + 7 days`; there is no zero-day fallback. Staging is
activated. Production must load the same approved value through its own
controlled environment configuration or fail closed.

## First Deposit / New Account

The repository has explainable signals and controls, not an opaque fraud score:
account age, deposit history, prior returns, active restriction history,
shared-instrument review, recent bank change, identity/security state, amount,
and configured velocity limits. The current release implementation does not
silently add separate first-deposit rules.

Proposed policy matrix:

| Profile | Explainable rule | Proposed treatment |
| --- | --- | --- |
| `ESTABLISHED_LOW_RISK` | Verified account, successful history, no active return/restriction/shared-instrument review | Normal approved hold and configured limits |
| `NEW_ACCOUNT` | Account has not established successful Slice funding history | Conservative approved hold and conservative limits; no opaque score |
| `FIRST_DEPOSIT` | First provider-confirmed deposit for the account | Same conservative treatment until the first deposit is released; no provisional credit |
| `ELEVATED_RISK` | Recent return, shared-instrument review, recent bank/security change, active review, or repeated limit/velocity block | Manual review or continued clearing; no trading/withdrawal exposure until resolved |
| `RESTRICTED` | Open financial deficit or active account financial hold | Block exposure-increasing actions; allow safe read-only access and approved recovery |

Account age alone must not be treated as a fraud verdict. The exact extra
hold/rule for new accounts and first deposits remains an owner decision.

Approved initial launch choice: first deposits, new accounts, and established
accounts use the same seven-day baseline. Existing explainable signals may
route a deposit to continued clearing or manual review, but never shorten the
approved hold.

## Deposit Limits

The existing controls are evaluated inside the serialized deposit-create
transaction and count active provider lifecycle attempts:

`BACS_DEPOSIT_MAX_MINOR`, `BACS_DEPOSIT_DAILY_LIMIT_MINOR`,
`BACS_DEPOSIT_ROLLING_7D_LIMIT_MINOR`, `BACS_DEPOSIT_DAILY_COUNT_LIMIT`,
`BACS_DEPOSIT_RAPID_WINDOW_SECONDS`, and `BACS_DEPOSIT_RAPID_COUNT_LIMIT`.

Unset controls are not replaced with hidden thresholds. The following are
illustrative launch proposals in GBP minor units, not deployed values:

| Profile | Max per deposit | Daily amount | Rolling 7-day amount | Daily count | Rapid window / count | Marketplace consequence |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Conservative | 500,000 (£5,000) | 500,000 (£5,000) | 1,000,000 (£10,000) | 2 | 3,600s / 1 | Strongest early containment; more support escalations for high-value cards |
| Balanced | 1,000,000 (£10,000) | 1,000,000 (£10,000) | 2,500,000 (£25,000) | 4 | 900s / 2 | Reasonable access with moderate exposure |
| High-limit | 2,500,000 (£25,000) | 2,500,000 (£25,000) | 10,000,000 (£100,000) | 10 | 300s / 3 | Lowest friction but highest return and liquidity exposure |

Approved initial launch choice: **Conservative**, because Slice handles
high-value collectibles and the Bacs rail can return after provider success.
The owner approved all six controls together in GBP minor units. The approved
staging values are max `500000`, daily `500000`, rolling seven-day `1000000`,
daily count `2`, rapid window `3600` seconds, and rapid count `1`.

### Customer limit UX

Limit responses are semantic and do not expose internal risk classifications:

- “This deposit would exceed your current bank funding limit.”
- “You’ve reached your current daily bank funding limit.”
- “This deposit would exceed your current rolling bank funding limit.”
- “You’ve reached the current number of bank deposits allowed today.”
- “Please wait a little before trying another bank deposit.”

## Market Finality

This is a proposed **platform market-finality policy**, not a legal-finality
claim. Current accounting matches the following behavior once a secondary
execution is completed:

- buyer ownership remains recorded;
- seller/Collector proceeds remain recorded;
- the completed transaction is not silently unwound;
- a later returned funding event creates a customer deficit and restrictions;
- Slice carries temporary/unrecovered platform exposure until recovery succeeds.

Seller clawback: **NO** under the current implementation.

Ownership auto-reversal: **NO** under the current implementation.

The policy must still receive Product, Finance, Risk, and legal review before a
production launch claim is made.

## Initial Offering Finality

Initial Offering purchases use the same trade-eligible cash boundary. Held
Bacs cash cannot purchase an offering. If a buyer's funding later returns, the
current append-only accounting preserves buyer ownership, offering inventory
transfers, Collector proceeds, and the stored 5% Slice fee policy. Deficit and
restriction recovery handles the buyer's outstanding obligation. No automatic
offering allocation reversal or seller clawback is active.

## Deficit Restrictions

An unresolved `FinancialDeficit` is reclassified to the platform's explicit
`CUSTOMER_DEFICIT_RECEIVABLE` account and creates an account hold. Current
capability integration blocks new buys, Initial Offering purchases,
withdrawals, and exposure-increasing listings/offers. It permits login,
security/account access, read-only browsing, portfolio/history, support, and a
verified future Bacs deposit used for recovery. Funding-bank relink remains
available so recovery is not made impossible; whether payout-bank changes
need an additional restriction is an owner policy decision.

No opaque score is used and no provider code is shown to customers.

## Deficit Recovery

| Method | Current status | Launch recommendation |
| --- | --- | --- |
| Future verified Bacs deposit after its own hold clears | Active | Active recovery path |
| Eligible settled sale proceeds | Not active | Hold pending owner/accounting policy; do not automatically offset |
| Manual finance adjustment | Supported only through the dual-control finance workflow | Finance initiator creates a draft, submits it, and a different recently authenticated Finance operator approves or rejects it; approval posts a balanced journal |
| External collections/manual recovery | Not active | Separate support/collections policy required |

No raw balance patch is permitted. Every active recovery is a balanced,
idempotent, auditable journal posting. Recommended launch policy: only the
future verified deposit path is active. Future sale proceeds should be held
pending review rather than automatically offset until Finance approves a
specific proceeds waterfall.

## Customer Notifications

Financial state changes append deterministic `financial.notification` events
inside the same domain transaction. Delivery is at-least-once and idempotent
by event/channel/destination. Mandatory in-app notices are created through the
existing notification delivery worker; mandatory email notices use the existing
transactional email provider and retry/dead-letter controls. Provider email
failure cannot roll back a completed financial journal.

Implemented customer notices:

1. Bank deposit clearing — amount, unavailable-for-use state, and next status.
2. Bank deposit released — amount and trading availability.
3. Bank deposit returned — amount, whether an outstanding balance exists, and support/recovery direction.
4. Bank deposit under review — amount and impact without provider/internal codes.
5. Outstanding balance created — amount, restriction impact, and recovery path.
6. Outstanding balance partially recovered — recovered and remaining amounts.
7. Outstanding balance resolved — recovery complete.
8. Account financial restrictions applied — blocked actions and safe access that remains.
9. Account financial restrictions removed — normal actions are available subject to normal checks.

Copy is calm, amount-specific, non-accusatory, and never exposes full bank
details, Stripe codes, or internal fraud classifications.

## Support / Admin Workflow

`GET /api/v1/admin/finance/bacs-risk` is a finance-authorized, read-only safe
projection of held and returned deposits, provider availability evidence,
original movement IDs, deficits and recovery, account users, reason codes,
and shared-instrument review count. Existing audit and movement-history rows
provide the state timeline. It intentionally excludes full bank details.

Admin Finance separately exposes customer cash liability, provider expenses,
returned deposits, provider available/pending GBP, provider payout liquidity,
reservations, and reconciliation information. These projections must be read
together; a returned-deposit amount is not silently labeled GAAP loss.

There is no supported one-admin manual deficit cure. The implemented workflow
is `DRAFT → PENDING_APPROVAL → APPROVED → APPLIED` or `REJECTED` and requires
Finance authority, recent authentication, a second approver, an immutable
reason, a fixed GBP journal template, idempotency, audit evidence, and before /
after projections. It can only reduce an explicitly identified open returned-
funds deficit. It never accepts a raw balance patch and never uses Discord for
approval. The supported admin surfaces are `GET /api/v1/admin/finance/adjustments`,
`POST /api/v1/admin/finance/adjustments`, `POST /:id/submit`,
`POST /:id/approve`, and `POST /:id/reject`.

## Treasury Exposure

The operational view is:

- Bacs funds in `BACS_RISK_HOLD`: Wallet and Bacs risk projection;
- Bacs funds trade-released: `CASH_AVAILABLE` and `tradeAvailableMinor`;
- withdrawal-eligible liabilities: withdrawal preflight/wallet projection;
- unrecovered deficits: `FinancialDeficit` open/partial outstanding amount;
- Stripe available and pending GBP: provider liquidity projection;
- provider expenses: platform revenue/provider-cost projection;
- payout coverage: withdrawal preflight and active provider-liquidity reservations.

Pending provider GBP is never treated as available payout liquidity.

## Configuration Registry

The code registry is `server/src/config/app-config.ts`; staging and production
load separate environment files. The table below is the authoritative policy
registry for the current release.

| Name | Unit | Default / absent behavior | Production value | Meaning | Security consequence | Last changed / authority |
| --- | --- | --- | --- | --- | --- | --- |
| `BACS_INTERNAL_TRADE_HOLD_DAYS` | days | absent = fail-closed indefinite Bacs hold | **7 staging / 7 production contract** | Extra internal-use delay after provider availability | Prevents immediate spendability | Owner approved 2026-08-25 |
| `BACS_DEPOSIT_MAX_MINOR` | GBP minor | absent = no per-deposit threshold | **500000 staging / 500000 production contract** | Maximum one deposit | Limits single-event exposure | Owner approved 2026-08-25 |
| `BACS_DEPOSIT_DAILY_LIMIT_MINOR` | GBP minor | absent = no daily amount threshold | **500000 staging / 500000 production contract** | UTC-day aggregate amount | Limits same-day exposure | Owner approved 2026-08-25 |
| `BACS_DEPOSIT_ROLLING_7D_LIMIT_MINOR` | GBP minor | absent = no rolling amount threshold | **1000000 staging / 1000000 production contract** | Rolling seven-day amount | Limits burst exposure across day boundaries | Owner approved 2026-08-25 |
| `BACS_DEPOSIT_DAILY_COUNT_LIMIT` | deposits/day | absent = no daily count threshold | **2 staging / 2 production contract** | UTC-day attempt count | Limits repeated funding attempts | Owner approved 2026-08-25 |
| `BACS_DEPOSIT_RAPID_WINDOW_SECONDS` | seconds | only active with rapid count limit | **3600 staging / 3600 production contract** | Short attempt window | Limits rapid attempts | Owner approved 2026-08-25 |
| `BACS_DEPOSIT_RAPID_COUNT_LIMIT` | attempts/window | absent = no rapid threshold | **1 staging / 1 production contract** | Attempt count within rapid window | Reduces automated retry/burst exposure | Owner approved 2026-08-25 |
| `BANK_CHANGE_WITHDRAWAL_HOLD_HOURS` | hours | existing configured authority | Existing separately managed value | Hold after funding-bank change | Prevents immediate payout after destination/funding change | Existing policy; Product/Risk/Finance authority |
| `RETURNED_FUNDS_DEFICIT` | account hold | created on unresolved returned-funds deficit | Active by ledger event | Blocks exposure-increasing actions while receivable is open | Prevents further unsupported exposure | Current code; Finance authority |
| verified-deposit recovery | lifecycle rule | only after deposit clears under approved hold | Active | Applies positive unreserved available cash to oldest deficit | No raw balance patch | Current code; Finance authority |
| sale-proceeds cure | policy rule | not implemented | **DISABLED** | Whether future proceeds cure deficit | Avoids silent cross-account appropriation | Owner approved 2026-08-25 |
| manual deficit adjustment | privileged workflow | dual-control workflow implemented | **ENABLED WITH DUAL CONTROL** | Finance correction | Prevents one-admin silent erasure | Owner approved 2026-08-25 |

Critical absent values fail closed. Staging may use explicitly documented QA
values in its own environment only; production values must be separately
approved and set. No relaxed staging value is copied to production by deploy.

## Automated Test Matrix

The existing Bacs hardening tests cover no-hold fail-closed behavior, maturity
boundary, returned funds, partial/full recovery, restrictions, seller/Initial
Offering preservation, and duplicate event idempotency at the ledger/provider
boundaries. This pass adds focused coverage for customer-safe limit messages,
deterministic financial notification identities, and mandatory in-app/email
routing. Full release validation is recorded with this document and the
companion Bacs risk document.

No real financial mutation was performed for this policy task.

## Release Gate

The code is ready for owner review, not for automatic policy activation. Before
production, owners must approve hold duration, deposit limit values, the
new/first-deposit matrix, market-finality wording, sale-proceeds policy,
manual-adjustment dual control, provider email configuration/monitoring, and
reserve/loss treatment. Then set production configuration through the approved
change process and run the controlled provider test only when Stripe Sandbox
available GBP is sufficient.
