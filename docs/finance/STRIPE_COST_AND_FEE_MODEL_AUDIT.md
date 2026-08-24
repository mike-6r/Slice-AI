# Slice Stripe Cost + Fee Model Audit

**Scope:** audit and recommendation only. No customer fee, Stripe
configuration, ledger journal, or external-money behavior was changed.

**Staging:** `https://staging.slicecollectable.com`

**Access date for public Stripe pricing:** 2026-08-24

## Executive conclusion

Slice is currently a GBP/UK product in the audited staging configuration:

```text
External bank
  -> Stripe Bacs Direct Debit PaymentIntent (GBP, delayed confirmation)
  -> EXTERNAL_GBP_CLEARING / provider-confirmed journal
  -> user CASH_AVAILABLE in the Slice ledger
  -> internal ownership/trading settlement (no Stripe call)
  -> user CASH_AVAILABLE or COLLECTOR_PROCEEDS_AVAILABLE
  -> Slice withdrawal movement and reservation
  -> platform transfer to the user's Stripe Connect account
  -> standard GBP payout from that connected account to the bank
```

The active app creates Express connected accounts in GBP. Staging Stripe
metadata confirms an Express-style connected account with
`controller.fees.payer=application` and `controller.losses.payments=application`.
That means Slice/the platform is responsible for the applicable Connect costs
and payment losses for that account configuration. A Standard account also
exists in the test account, but the Slice code does not create Standard
accounts; it explicitly creates Express accounts.

The code does not expose Slice's negotiated Stripe pricing, and the repository
does not model provider expenses in the financial ledger. Public UK pricing is
therefore useful for planning estimates only. Before changing fees, Slice
needs the account's commercial terms and a provider-fee accounting/revenue
settlement design.

## Current architecture

### Runtime and account metadata

Read-only staging checks returned:

| Item | Verified value |
| --- | --- |
| Provider mode | `stripe_sandbox` |
| Stripe live enabled | `false` |
| Identity provider flag | `true` |
| Platform country | `GB` |
| Platform default currency | `gbp` |
| Active funding rail | `bacs_debit` |
| Platform account API type | `standard` |
| Connected-account app creation | `type: express` |
| Observed Express-style controller | Fees payer: application; payment losses: application; Express dashboard; Stripe requirement collection |
| Payout currency in code | GBP |
| Payout method in code | `standard` |

Secrets were not recorded. The platform metadata was queried through the
existing staging test key and reduced to non-sensitive fields only.

Relevant authorities:

- `server/src/config/app-config.ts` — provider mode, live fail-closed gates,
  GBP Bacs rail, and Stripe credential configuration.
- `server/src/modules/providers/application/stripe-provider.client.ts` —
  pinned Stripe SDK/API version, test/live key checks, timeout and retries.
- `server/src/modules/providers/application/external-provider-boundaries.ts` —
  Customer, Bacs Checkout/SetupIntent, PaymentMethod, and deposit PaymentIntent
  boundary.
- `server/src/modules/providers/application/stripe-connect-payout.service.ts`
  — Express account creation, account links, platform transfer, connected
  account standard payout, and payout webhooks.
- `server/src/modules/providers/application/provider-webhook.service.ts` —
  signed Stripe webhook inbox and PaymentIntent, SetupIntent, payout, account,
  subscription, and return/reversal dispatch.
- `server/prisma/schema.prisma` — `ExternalProviderCustomer`,
  `BacsSetupSession`, `ExternalFinancialAccount`, `ExternalConnectAccount`,
  `ConnectPayout`, `MoneyMovement`, and `WebhookInbox` persistence.

### Stripe products used

1. **Bacs Direct Debit:** GBP customer funding using Checkout setup mode to
   collect a reusable mandate/payment method, followed by an off-session GBP
   PaymentIntent.
2. **Connect Express accounts:** user-owned payout destinations created by
   Slice with `country: GB`, `default_currency: gbp`, and transfers requested.
3. **Standard connected-account payouts:** a platform transfer is created in
   GBP, then a `payouts.create` call is made with the connected-account header
   and `method: standard`.
4. **Stripe Billing subscriptions:** Collector memberships use configured
   Stripe Price IDs and Checkout subscription mode when billing is configured.
   Portal, plan changes, cancellation, and webhook projections are present.
   Price amounts and account-specific payment fees are not established by the
   repository.
5. **Stripe Identity:** available only when explicitly enabled by configuration.

No Stripe charge, destination charge, application fee, or transfer is created
by the secondary trading matcher itself.

## Stripe Connect model and responsibility

### What Slice creates

The implementation calls:

```ts
stripe.accounts.create({
  type: 'express',
  country: 'GB',
  default_currency: 'gbp',
  capabilities: { transfers: { requested: true } },
})
```

It then creates an Account Link for Stripe-hosted onboarding. Stripe handles
the hosted onboarding and requirement collection; Slice persists only a safe
projection of status, requirements counts, and payout readiness.

The staging Account API listing showed an Express-style account with:

```text
controller.fees.payer = application
controller.losses.payments = application
controller.requirement_collection = stripe
controller.stripe_dashboard.type = express
```

This is evidence that the application/platform is responsible for the
connected account's applicable fees and payment losses in that observed
configuration. It is stronger than inferring responsibility from the UI.

The same Stripe test account also listed a Standard account. That does not
change Slice's application-created path and may be a separately created test
account. Any Standard-account pricing/responsibility must be assessed from
that account's own configuration and commercial terms.

### What cannot be established from code

The following require Stripe Dashboard/account terms or Stripe support and are
not silently guessed here:

- negotiated Bacs pricing;
- negotiated Connect monthly or payout pricing;
- whether a promotional, custom, or legacy Connect schedule applies;
- payout, dispute, return, reserve, or negative-balance commercial terms;
- exact subscription payment-method processing rates;
- taxes, country-specific adjustments, or account-level discounts.

## Bacs deposit architecture

The current path is:

1. Slice creates/reuses a Stripe Customer for the Slice user.
2. Slice creates a Stripe Checkout Session in `mode: setup` with
   `payment_method_types: ['bacs_debit']`.
3. Checkout creates a SetupIntent and a reusable Bacs PaymentMethod.
4. Slice verifies the Checkout Session, SetupIntent, customer, livemode, and
   payment-method type before persisting encrypted/hashed references.
5. A deposit creates a GBP PaymentIntent using the saved Bacs PaymentMethod,
   `confirm: true`, `off_session: true`, and metadata linking the Slice
   movement.
6. The movement remains pending/processing until a signed Stripe webhook
   confirms success. Pending money does not increase available wallet cash.
7. `payment_intent.succeeded` creates the provider-confirmed Slice journal;
   failure, cancellation, dispute, refund, and return paths are handled as
   failed/returned/reversed provider states rather than silently settled cash.

Stripe's Bacs documentation describes the method as delayed notification. A
new mandate can take longer than a payment using an existing mandate. Slice's
webhook confirmation, not a guessed time interval, is the settlement authority.

### Deposit cost categories

| Category | Current finding |
| --- | --- |
| Bacs transaction fee | Public UK pricing gives a planning estimate; exact account terms unknown. |
| Minimum/cap | Public UK page currently shows 1%, minimum 20p, £4 cap. |
| Failed/returned debit | Operational exposure exists; exact fee is account/contract dependent and is not modeled in Slice. |
| Dispute/indemnity | Bacs supports disputes; do not apply the card-dispute price to Bacs without account terms. |
| Connect fee | Not involved in a customer deposit itself; the platform Connect schedule is relevant to connected-account payouts. |
| FX/cross-border | Not present in this GBP-to-GB-GBP path. |
| Ledger expense | Not represented as a provider-expense journal in Slice today. |

## Withdrawal architecture

The current investor/customer and Collector proceeds path is:

```text
USER CASH_AVAILABLE or COLLECTOR_PROCEEDS_AVAILABLE
  -> capability/compliance/recent-auth checks
  -> withdrawal MoneyMovement
  -> CashReservation
  -> ConnectPayout row
  -> Stripe platform transfer in GBP to the user's Express account
  -> Stripe standard payout in GBP from the connected account
  -> signed payout webhook
  -> provider-confirmed movement finalization or hold/review
```

The code uses a user-owned `ExternalConnectAccount` unique by provider,
environment, and user. It does not create a separate Collector payout account.
The connected account's external bank account is owned/managed by Stripe's
Connect account lifecycle, while Slice owns the user-to-connected-account
mapping and payout state.

The current code supports `method: standard` only. There is no Instant Payout
branch, no instant-payout capability request, and no instant-payout fee
calculation.

### Withdrawal cost categories

| Category | Current finding |
| --- | --- |
| Standard payout | Public Connect planning estimate: 0.25% + 10p per payout under the platform-handles-pricing schedule. Exact account terms unknown. |
| Monthly active connected account | Public Connect planning estimate: £2 per monthly active account when payouts are sent to bank/debit card under that schedule. |
| Instant payout | Not supported by Slice. Public UK pricing currently lists 1% of Instant Payout volume, minimum 40p; eligibility and Connect treatment require confirmation before implementation. |
| Transfer to connected account | The code creates a Stripe Transfer; no separate public per-transfer charge was established in this audit. Balance, reserve, and negative-balance exposure remain platform risks. |
| Cross-border/FX | Not present in the current GB/GBP domestic path. Future non-GBP or non-GB payouts would need separate pricing and FX disclosure. |
| Payout failure/return | Provider state and hold/review are modeled; provider expense/recovery journals are not. |
| Ledger expense | No provider payout-expense account or fee field is currently posted. |

## Internal trading and Initial Offering cost path

### Secondary trading

For an investor who already has settled GBP cash, the matcher and settlement
transaction operate entirely inside Slice:

```text
buyer CASH_AVAILABLE
  -> internal trade settlement journal
  -> seller CASH_AVAILABLE / collector proceeds or Slice-owned settlement account
  -> ownership transfer and FIFO updates
```

The trading service does not invoke Stripe during matching or settlement.
Therefore the provider cost per internal secondary trade is **£0 in Stripe
transaction fees**, subject to normal Slice operating costs. Stripe was
involved earlier if the buyer's cash originally came from a deposit, and later
if either party withdraws.

### Collector Initial Offering

The Initial Offering path is also an internal ledger settlement after investor
cash is already settled. It can credit the originating Collector's
`COLLECTOR_PROCEEDS_AVAILABLE` account and a separate
`INITIAL_OFFERING_FEE_REVENUE` account according to the approved policy. The
current policy is zero fee.

For a £10,000 Initial Offering, no Stripe transaction occurs at the moment of
the internal investor purchase. Stripe cost appears only when the Collector
withdraws proceeds. Under the public Connect planning estimate, a £10,000
Collector withdrawal would cost about £23.85 in payout fees (0.25% + 10p),
excluding the monthly active-account charge and any unknown account-specific
terms.

## Official pricing references

These are official Stripe pages, accessed 2026-08-24. Public pricing is not a
substitute for Slice's Stripe commercial agreement.

1. [Stripe UK pricing](https://stripe.com/gb/pricing)
   - Bacs Direct Debit: currently displayed as 1%, minimum 20p, £4 cap.
   - Instant Payouts: currently displayed as 1% of volume, minimum 40p.
   - Standard schedule is described as free on the general Stripe pricing
     page, but Slice's Express Connect platform schedule must be considered
     separately.
2. [Stripe UK Connect pricing](https://stripe.com/gb/connect/pricing)
   - The platform-handles-pricing option currently displays £2 per monthly
     active account and 0.25% + 10p per payout sent.
   - It states that platforms are responsible for Stripe processing fees under
     that option and may collect fees from users.
3. [Bacs Direct Debit payments in the UK](https://docs.stripe.com/payments/payment-methods/bacs-debit)
   - UK customer location, GBP presentment, delayed notification, dispute
     support, and Bacs operating constraints.
4. [Accept Bacs Direct Debit payments](https://docs.stripe.com/payments/bacs-debit/accept-a-payment)
   - PaymentIntent processing and webhook-confirmed success/failure behavior.
5. [Save Bacs Direct Debit bank details](https://docs.stripe.com/payments/bacs-debit/save-bank-details)
   - Checkout setup mode, SetupIntent, mandate, and reusable PaymentMethod
     flow.
6. [Using Express connected accounts](https://docs.stripe.com/connect/express-accounts)
   - Stripe-hosted onboarding and Express account operating model.
7. [Connected account types](https://docs.stripe.com/connect/accounts)
   - Standard/Express/Custom responsibility differences.
8. [Instant Payouts](https://docs.stripe.com/payouts/instant-payouts)
   - Eligibility, timing, pre-deducted fee behavior, and links to pricing.

## Cost scenarios

The numerical tables below use only the public UK planning rates above:

```text
Bacs estimate       = min(1% of deposit, £4.00), subject to £0.20 minimum
Standard payout     = 0.25% of payout + £0.10
Instant payout      = max(1% of payout, £0.40), not supported by Slice today
```

They exclude taxes, monthly fees, disputes, failures, returns, reserves,
negotiated pricing, and any fee that Stripe may apply differently to this
account.

| Amount | A. Bacs deposit | B. Standard withdrawal | C. Deposit + standard withdrawal | D. Instant payout if later enabled |
| ---: | ---: | ---: | ---: | ---: |
| £100 | £1.00 | £0.35 | £1.35 | £1.00 |
| £500 | £4.00 | £1.35 | £5.35 | £5.00 |
| £1,000 | £4.00 | £2.60 | £6.60 | £10.00 |
| £5,000 | £4.00 | £12.60 | £16.60 | £50.00 |
| £10,000 | £4.00 | £25.10 | £29.10 | £100.00 |

The Instant column is a base public-price estimate only. It does not prove
that a connected Express account is eligible, that the rail is available for
the account, or that it replaces the Connect platform payout charge.

### Proposed 2.5% withdrawal model

Assumption: the Slice withdrawal fee is withheld from the gross customer
withdrawal and Slice absorbs the provider charge. Monthly active-account cost
is excluded from the per-operation margin below.

| Gross withdrawal | Proposed Slice fee | Estimated standard payout cost | Net paid to user | Estimated Slice fee less payout cost |
| ---: | ---: | ---: | ---: | ---: |
| £100 | £2.50 | £0.35 | £97.50 | £2.15 |
| £500 | £12.50 | £1.35 | £487.50 | £11.15 |
| £1,000 | £25.00 | £2.60 | £975.00 | £22.40 |
| £5,000 | £125.00 | £12.60 | £4,875.00 | £112.40 |
| £10,000 | £250.00 | £25.10 | £9,750.00 | £224.90 |

This is gross contribution, not net profit. It excludes the £2 monthly active
connected-account fee, provider disputes/returns, support, compliance,
taxes, reserves, and ledger/accounting costs.

### Proposed 5% Collector Initial Offering fee

Assumption: the fee is taken from gross offering proceeds, and the Collector
withdraws the resulting net proceeds in one standard payout.

| Gross raised | 5% Slice fee | Collector proceeds before payout cost | Estimated payout cost | Estimated Slice fee less payout cost |
| ---: | ---: | ---: | ---: | ---: |
| £1,000 | £50.00 | £950.00 | £2.48 | £47.52 |
| £5,000 | £250.00 | £4,750.00 | £11.98 | £238.02 |
| £10,000 | £500.00 | £9,500.00 | £23.85 | £476.15 |
| £25,000 | £1,250.00 | £23,750.00 | £59.48 | £1,190.52 |
| £50,000 | £2,500.00 | £47,500.00 | £118.85 | £2,381.15 |

The initial sale itself remains Stripe-free. The provider estimate applies to
the later Collector payout only.

### Deposit fee comparison at £1,000

Assumption: a future deposit fee would be deducted from the requested £1,000
and the remainder would be credited to the wallet. Slice currently charges
none and must remain unchanged in this audit.

| Deposit fee model | Wallet credit | Slice fee | Estimated Bacs cost | Estimated fee less Bacs cost | Customer friction |
| ---: | ---: | ---: | ---: | ---: | --- |
| 0% | £1,000.00 | £0.00 | £4.00 | -£4.00 | Lowest; no first-funding surprise |
| 1% | £990.00 | £10.00 | £4.00 | £6.00 | Visible deduction at the first step |
| 2.5% | £975.00 | £25.00 | £4.00 | £21.00 | High first-funding friction |
| 5% | £950.00 | £50.00 | £4.00 | £46.00 | Very high first-funding friction |

Charging the fee on top instead would preserve the wallet credit but increase
the customer's bank debit; that choice requires an explicit product decision.

## Current Slice revenue model

Current runtime policy, unchanged:

| Fee line | Current rate | Revenue on £100 | £500 | £1,000 | £5,000 | £10,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Secondary maker | 0% | £0 | £0 | £0 | £0 | £0 |
| Secondary taker | 1% | £1 | £5 | £10 | £50 | £100 |
| Initial Offering | 0% | £0 | £0 | £0 | £0 | £0 |
| Deposit | 0% | £0 | £0 | £0 | £0 | £0 |
| Withdrawal | 0% | £0 | £0 | £0 | £0 | £0 |

The taker table assumes one taker side and a single gross trade notional. The
current fee authority is `tradingPolicy` / `INITIAL_POLICY_V1`; the current
Initial Offering authority is `INITIAL_OFFERING_ZERO_FEE_V1`.

### Proposed free-trading comparison

At the same secondary trade volume, moving from a 1% taker fee to 0% gives up
exactly 1% of taker notional:

| Monthly secondary taker volume | Current 1% revenue | Proposed 0% revenue | Revenue sacrificed |
| ---: | ---: | ---: | ---: |
| £100 | £1 | £0 | £1 |
| £500 | £5 | £0 | £5 |
| £1,000 | £10 | £0 | £10 |
| £5,000 | £50 | £0 | £50 |
| £10,000 | £100 | £0 | £100 |
| £100,000 | £1,000 | £0 | £1,000 |

Free trading is economically possible because internal settlement does not
invoke Stripe. It is a product/liquidity choice, not a provider-cost
requirement.

## Round-trip user cost comparison

Assumptions for a comparable £1,000 cash cycle:

- the user deposits £1,000;
- a separate £1,000 gross taker trade is modeled so the trading fee is visible;
- the user later withdraws £1,000 gross;
- provider costs are paid by Slice, not passed through;
- monthly Connect account cost is shown separately because it is not a
  per-transaction charge.

| Model | Deposit Slice fee | Trading Slice fee | Withdrawal Slice fee | Total customer Slice fees | Estimated provider costs |
| --- | ---: | ---: | ---: | ---: | ---: |
| A — current | £0 | £10 | £0 | £10 | £6.60 + monthly active-account cost |
| B — proposed | £0 | £0 | £25 | £25 | £6.60 + monthly active-account cost |
| C — 5% deposit / 5% withdrawal | £50 | £0 | £47.50 on £950 withdrawn | £97.50 | about £6.48 + monthly active-account cost |
| D — 5% withdrawal only | £0 | £0 | £50 | £50 | £6.60 + monthly active-account cost |

Model C assumes the 5% deposit fee is deducted first, leaving £950 to
withdraw. Models A, B, and D assume a £1,000 withdrawal amount. These are
comparisons, not implemented customer balances.

## Trading frequency

For a fixed £1,000 total taker notional split across 1, 5, 10, 25, or 50
trades, the current 1% policy produces £10 of total Slice fee revenue in every
case; a 0% policy produces £0. Trade count changes operational activity and
liquidity, not fee revenue when total notional is fixed.

If instead “a £1,000 investor” means £1,000 per trade, the current fee is £10,
£50, £100, £250, and £500 respectively for 1, 5, 10, 25, and 50 trades. This
distinction must be explicit in future product modelling.

## Business scenario: 1,000 active users

Illustrative assumptions, not a forecast:

- 1,000 active users;
- each deposits £1,000 during the month: £1,000,000 Bacs deposits;
- £500 average secondary taker volume per user: £500,000 total volume;
- £300 average investor withdrawal per user: £300,000 across 1,000 payouts;
- one £250,000 Collector Initial Offering payout;
- all secondary volume is assumed taker-side for a conservative current-fee
  comparison;
- every withdrawing user is a monthly active connected account, plus one
  Collector connected account;
- public UK pricing estimates are used; negotiated terms and exceptions are
  excluded.

| Metric | Current model | Proposed model |
| --- | ---: | ---: |
| Deposit fee revenue | £0 | £0 |
| Secondary fee revenue | £5,000 | £0 |
| Withdrawal fee revenue | £0 | £7,500 |
| Initial Offering fee revenue | £0 | £12,500 |
| Slice gross fee revenue | **£5,000** | **£20,000** |
| Estimated Bacs costs | £4,000 | £4,000 |
| Estimated investor payout costs | £850 | £850 |
| Estimated Collector payout cost | £625.10 | £625.10 |
| Estimated monthly active-account Connect cost | £2,002 | £2,002 |
| Estimated provider costs | **£7,477.10** | **£7,477.10** |
| Fee revenue less these provider estimates | **-£2,477.10** | **£12,522.90** |

The current repository does not post the £7,477.10 as provider expense, so the
last row is an economic planning view rather than current ledger-reported
profit. The proposed model has more provider-cost coverage under these
assumptions, but it also introduces materially higher withdrawal and Collector
fees.

## Ledger revenue and provider-expense architecture

### Revenue accounts currently present

- `TRADING_FEE_REVENUE` — secondary maker/taker fee revenue.
- `INITIAL_OFFERING_FEE_REVENUE` — present as an approved initial-offering
  settlement destination, currently 0 bps.
- `DISTRIBUTION_FEE_REVENUE` — separate community-distribution feature; not a
  withdrawal, trading, or Initial Offering fee.
- `EXTERNAL_GBP_CLEARING` — clearing account, not Slice revenue.

There is no `WITHDRAWAL_FEE_REVENUE` account. Do not create it during this
audit.

### Provider expense gap

Stripe provider costs are not currently represented as explicit Slice ledger
expenses. `MoneyMovement` records customer amount and provider state;
`ConnectPayout` records payout amount/status/references; neither records a
provider fee amount or Stripe Balance Transaction ID. There is no identified
provider-processing, payout, dispute, return, or reserve-expense account.

Required future accounting design:

1. capture verified provider balance-transaction/fee evidence;
2. record provider fee currency, amount, type, source object, and provider
   balance-transaction reference;
3. post a balanced provider-expense journal against a clearly defined clearing
   or Stripe-balance account;
4. reconcile provider balance, Slice movement, payout, fee, reversal, and
   ledger entry idempotently;
5. keep provider expense separate from customer cash and Slice fee revenue.

### Platform revenue withdrawal

Slice has reporting/aggregate views for platform revenue and external clearing,
but this audit found no dedicated operation that moves platform revenue from
`TRADING_FEE_REVENUE`/`INITIAL_OFFERING_FEE_REVENUE` into a company bank account.
The customer withdrawal flow must not be reused for company revenue.

Recommended future architecture:

```text
Slice fee revenue
  -> platform revenue reconciliation
  -> approved company-settlement journal
  -> separate company payout/treasury operation
  -> Slice business bank account
```

That operation needs dual control, period/balance reconciliation, provider
balance evidence, tax/reporting treatment, and an explicit separation from
customer liabilities. Until then, **Can Slice withdraw company revenue today:
NO** (reporting exists; company settlement does not).

## Customer experience and disclosure

| Model | First deposit | Active trading | Cash-out | Perception |
| --- | --- | --- | --- | --- |
| 5% deposit | Highest barrier | No trading friction | Depends on withdrawal | Worst first-use surprise |
| 2.5% withdrawal | Low barrier | No trading friction | Noticeable exit cost | Simple, but users feel it at the moment of trust |
| 1% each trade | Low barrier | Repeated friction | No exit fee | Predictable, but can reduce frequent trading |

Slice can truthfully market **“No trading fees”** only if the approved policy
sets both maker and taker fees to 0%, and the customer-facing policy clearly
discloses any withdrawal, Initial Offering, subscription, or provider fee that
can reach the customer. It must not imply that Stripe costs do not exist or
that all actions are free.

The proposed model is more compatible with that message because it shifts
revenue away from secondary trading. It is also less forgiving to customers
who deposit, trade little, and cash out. Initial Offering fees are charged on
the supply side and should be disclosed before Collector approval.

## Recommendation

### Recommended candidate for a later implementation pass

| Fee | Recommendation |
| --- | ---: |
| Deposit | **0%** |
| Secondary maker | **0%** |
| Secondary taker | **0%** |
| Withdrawal | **2.5%** |
| Initial Offering | **5%** |

This is the proposed model under evaluation, and it is the strongest candidate
if Slice's product strategy is to minimize marketplace trading friction while
monetizing cash-out and Collector supply. The audit supports its direction,
not its final approval:

- Bacs has a small capped public cost, so a 0% deposit reduces first-funding
  friction while Slice knowingly absorbs that cost.
- Internal trades have no Stripe transaction cost, so 0% trading is technically
  viable and can improve liquidity.
- 2.5% withdrawal covers the public standard payout estimate and the fixed
  payout component at small and medium amounts better than 0%.
- 5% Initial Offering revenue can fund Collector payout/provider operations
  without taxing every secondary trade.

The recommendation is conditional. Product, finance, compliance, and Stripe
commercial review must approve the customer experience, disclosure, tax and
regulatory treatment, and any minimum/maximum or fee-on-top behavior before
implementation.

### Why it is not implemented now

- Slice's negotiated Stripe pricing is not verified.
- Provider expenses are not represented in the ledger.
- Platform revenue cannot currently be settled to the company bank through a
  dedicated controlled operation.
- Current frontend/backend runtime policy must remain unchanged during this
  audit.
- Connect payout and Bacs return/dispute costs can vary by account terms.

## Final audit return

### SLICE STRIPE COST + FEE MODEL AUDIT — COMPLETE

## STRIPE PLATFORM

**Country:** GB (read-only Stripe Account API metadata)

**Mode:** `stripe_sandbox`; `STRIPE_LIVE_ENABLED=false`

**Connect account type:** Slice code creates Express connected accounts. A
staging account listing also contains a Standard account; it is not created by
the current Slice payout code.

**Platform responsible for Connect fees:** YES for the observed Express-style
connected account. The account metadata reports
`controller.fees.payer=application` and `controller.losses.payments=application`.

**Evidence:** `stripe.accounts.create({ type: 'express', country: 'GB',
default_currency: 'gbp' })`; staging Account API metadata; public Connect
pricing. Exact negotiated rates remain UNKNOWN.

## DEPOSITS

**Rail:** Bacs Direct Debit

**Currency:** GBP

**Stripe involved:** YES

**Current official cost:** Public UK planning rate 1%, minimum 20p, £4 cap;
account-specific terms UNKNOWN.

**Source:** [Stripe UK pricing](https://stripe.com/gb/pricing) and [Bacs UK
documentation](https://docs.stripe.com/payments/payment-methods/bacs-debit)

**£100 deposit provider cost:** Approximately £1.00

**£1,000:** Approximately £4.00

**£10,000:** Approximately £4.00, subject to the Bacs transaction limit and
account terms

## WITHDRAWALS

**Rail:** Stripe Connect Express transfer plus standard GBP payout

**Connect involved:** YES

**Standard payout cost:** Public Connect planning rate 0.25% + 10p per payout;
exact account terms UNKNOWN.

**Instant payout cost:** Slice does not support Instant Payouts. Public UK
planning rate is 1%, minimum 40p, with eligibility and Connect treatment to be
confirmed.

**Monthly connected-account cost:** Public Connect planning rate £2 per monthly
active account under the platform-handles-pricing option; exact account terms
UNKNOWN.

**Other costs:** Bacs returns/disputes, payout failures, reserves, negative
balances, taxes, cross-border, and FX may apply depending on operation and
account terms. No FX/cross-border operation exists in the current GB/GBP path.

## SECONDARY TRADING

**Stripe invoked during internal trade:** NO

**Provider cost per internal trade:** £0 in Stripe transaction fees. Deposit
and later withdrawal costs remain separate.

## CURRENT SLICE FEES

**Deposit:** 0%

**Maker:** 0%

**Taker:** 1%

**Withdrawal:** 0%

**Initial Offering:** 0%

## CURRENT £1,000 USER EXAMPLE

**Deposit:** £1,000 wallet credit after provider confirmation; Slice fee £0;
public Bacs cost estimate £4.00 borne by Slice.

**Trade:** £1,000 gross taker trade; Slice fee £10.00; no Stripe call.

**Withdrawal:** £1,000 gross standard payout; Slice fee £0; public Connect
payout estimate £2.60, excluding monthly active-account cost.

**Total Slice revenue:** £10.00

**Total estimated Stripe cost:** £6.60 for the deposit plus payout, plus the
applicable monthly active-account fee; provider expense is not currently posted
to the Slice ledger.

## PROPOSED MODEL ANALYSIS

**Deposit 0%:** Lowest onboarding friction; Slice absorbs the capped Bacs cost.

**Trading 0%:** No Stripe cost at internal settlement; gives up current 1%
taker revenue but may improve liquidity and support a clear “no trading fees”
message.

**Withdrawal 2.5%:** Covers known public standard-payout estimates better than
0%; creates meaningful cash-out friction and requires explicit disclosure.

**Initial Offering 5%:** Produces supply-side revenue and can cover Collector
payout costs; requires Collector economics, tax, and product approval.

**£1,000 round trip:** Under the proposed model, a £1,000 withdrawal has a
£25.00 Slice fee, estimated £2.60 standard payout cost, and £975.00 net paid to
the user. Deposit and internal trading Slice fees are £0.

**User deposited:** £1,000

**User received in wallet:** £1,000 after delayed provider confirmation

**Trading fees:** £0 under the proposed 0% trading policy

**Withdrawal fee:** £25.00

**Stripe estimated cost:** £4.00 Bacs + £2.60 standard payout, excluding monthly
Connect account cost

**User receives:** £975.00 from the £1,000 gross withdrawal

**Slice estimated gross fee revenue:** £25.00 for the withdrawal; £0 from the
deposit/trade

## COLLECTOR EXAMPLE

### £10,000 Initial Offering

**Slice fee:** £500.00 at 5%

**Collector proceeds:** £9,500.00 before payout-provider cost

**Estimated Stripe/provider costs:** approximately £23.85 for one standard GBP
Connect payout, excluding monthly active-account cost and unknown terms

**Estimated Slice revenue:** £500.00 gross; approximately £476.15 after the
illustrative payout cost and before other costs

## CURRENT VS PROPOSED

**Current model estimated revenue:** In the illustrative 1,000-user scenario,
£5,000 monthly Slice fee revenue.

**Proposed model estimated revenue:** £20,000 under the same illustrative
activity assumptions.

**Major advantage:** Removes fee friction from every secondary trade while
creating revenue from withdrawal and Collector-originated supply.

**Major disadvantage:** Cash-out and Collector fees become more visible, while
provider expenses and commercial terms remain unresolved.

## PLATFORM REVENUE

**Current Slice revenue accounts:** `TRADING_FEE_REVENUE` and
`INITIAL_OFFERING_FEE_REVENUE`; `DISTRIBUTION_FEE_REVENUE` is a separate feature.
`EXTERNAL_GBP_CLEARING` is not revenue.

**Can Slice withdraw company revenue today:** NO. Reporting and aggregate
views exist, but a controlled company-bank settlement operation was not found.

**Recommended company settlement architecture:** Reconcile platform revenue
and provider expenses, post a balanced platform/company settlement journal,
then execute a separately authorized corporate payout to the Slice business
bank. Never use a customer withdrawal or customer liability account.

**CUSTOMER MONEY SEPARATION:** PASS for current ledger account separation;
provider-expense and company-settlement operations remain a release gap.

## FINAL RECOMMENDATION

**Deposit:** 0%

**Secondary maker:** 0%

**Secondary taker:** 0%

**Withdrawal:** 2.5%

**Initial Offering:** 5%

**WHY:** This candidate best balances the current no-fee deposit experience,
internal-ledger trading economics, marketplace liquidity, and monetization of
cash-out/supply-side operations. It is conditional on commercial pricing,
provider-expense accounting, company-revenue settlement, and product/legal
approval.

**IMPLEMENTATION RECOMMENDED:** NO — audit only; do not change current runtime
fees in this pass.

**NEXT IMPLEMENTATION PASS:** Obtain Stripe commercial terms; add provider fee
and balance-transaction reconciliation; design controlled platform revenue
settlement; approve exact customer disclosure/rounding/minimum/maximum rules;
then implement the new fee policy atomically across backend journals,
projections, UI, tests, and release gates.

## Release gate

This audit intentionally made no code, database, Stripe configuration, fee,
journal, external-money, or staging-domain changes. No deployment is required
for this report. Any later fee implementation must be a separate approved
change and must not be inferred from this document.
