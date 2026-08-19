# Stripe Currency and Funding Architecture Decision

Audit date: 2026-08-19  
Decision status: **APPROVED — UK/GBP-FIRST**  
Implementation status: **GBP Bacs rail implemented locally with hosted Checkout setup; sandbox validation pending**

## Current State

Slice currently has a single authoritative financial ledger currency: GBP. The
approved product direction is UK/GBP-first with Stripe Bacs Direct Debit as the
customer deposit rail. It consistently implements a GBP-first money model:

- `docs/backend-build-guide/implementation/013-financial-ledger-and-portfolio-authority.md`
  explicitly defines the initial supported currency as GBP only and prohibits
  implicit FX.
- The finance money type is GBP-only integer minor units.
- Trading policy, cash reservation, trade settlement, fees, lots, and
  withdrawals are GBP-only.
- User locale, default timezone, and the current Connect configuration support
  the approved UK/GBP product shape (`en-GB`, `Europe/London`, GB Connect
  account, GBP Connect currency).
- `docs/backend-build-guide/implementation/018-security-production-readiness-and-final-frontend-integration.md`
  explicitly says UK Payment Initiation is not claimed or substituted with a
  US transfer.

The correct product conclusion is therefore: **Slice is UK/GBP-first, with Bacs
Direct Debit selected for customer funding; no USD migration, FX, or
multi-currency launch is approved.**

## Current GBP Authority

### Finance and ledger

`server/src/modules/finance/domain/money.ts` exports
`FINANCIAL_CURRENCY = 'GBP'`. `Money` only accepts GBP and integer minor units.
`server/src/modules/finance/domain/journal.ts` rejects non-GBP journal lines
and requires every journal entry to use GBP. The financial ledger service
rejects non-GBP accounts for posting and wallet reads.

The authoritative database fields are explicit even though the current domain
is single-currency:

| Table/model | Currency authority | Current behavior |
| --- | --- | --- |
| `FinancialAccount` | `currency` | Stored per account; unique by owner/code/currency, but active finance operations select GBP only. |
| `JournalTransaction` | `currency` | Stored per transaction; posting is GBP-only. |
| `JournalEntry` | `currency` | Stored per entry; must match the GBP journal. |
| `AccountBalance` | Inherited from account | Projection has no independent currency and therefore relies on its account. |
| `CashReservation` | Inherited from account | Has no currency column; account currency is the authority. |
| `MoneyMovement` | `currency` | Stored per movement; creation and provider reconciliation require GBP. |
| `PortfolioLot` | `currency` | Stored per lot; acquisition currently writes GBP. |
| `FinancialReconciliationRun` | `currency` | Stored per run; provider reconciliation expects GBP movements. |
| `ConnectPayout` | `currency` | Stored per payout; current Connect transfer/payout code writes GBP. |

The schema can technically hold multiple currencies in several rows, but the
domain invariants do not make this a supported multi-currency ledger. The
existing unique key on `FinancialAccount` permits another currency; it does not
provide multi-currency posting, settlement, or reconciliation semantics.

### Ownership, valuations, and offerings

Ownership units are currency-independent. Valuation is not:

- `ValuationDecision`, `AssetValuationPoint`, `AssetMarketSnapshot`, and
  market observations store a currency with their minor amount.
- External market observations may remain in their source currency and are not
  automatically Slice cash.
- Portfolio authority only treats a Slice valuation as authoritative for the
  GBP financial view; non-GBP marks do not become GBP balances by implication.
- `OwnershipSupplyPolicy` stores `valuationCurrency` and
  `InitialOffering` stores `currency`. Offering validation requires the
  offering currency to equal the approved valuation/policy currency.

This is appropriate for valuation provenance, but it does not make the cash
ledger multi-currency. A non-GBP valuation/offer would require an explicit
product and settlement decision before it could safely reach cash settlement.

### Orders and trades

`TradingMarket`, `TradingOrder`, and `TradingExecution` do not store an
independent currency column. Their monetary interpretation comes from the
GBP-only `tradingPolicy` and the settlement implementation:

- order input contains integer `limitPriceMinor` but no currency;
- available cash is selected from the user's GBP `CASH_AVAILABLE` account;
- journal settlement lines are written as GBP;
- portfolio acquisition lots and execution projections are written as GBP.

Therefore orders are currently same-currency by global policy, not by a
per-order currency field. A multi-currency order model cannot be enabled by
adding a display selector.

### Collector proceeds and withdrawals

Collector proceeds use the same GBP financial-account model as investor cash.
Withdrawal creation selects GBP `COLLECTOR_PROCEEDS_AVAILABLE` or GBP
`CASH_AVAILABLE`, creates a GBP `MoneyMovement`, and reserves from that
account. Reversals, holds, settlement journals, and reconciliation remain tied
to the same movement/account currency.

Connect payout code currently creates a GB Express account with
`default_currency: 'gbp'` and creates both the platform transfer and connected
account payout in GBP. This aligns with the existing ledger, subject to real
credentialed Connect capability verification.

## Stripe Funding Limitation

The former Stripe Financial Connections implementation was specifically
US-oriented:

- sessions filter for `countries: ['US']`;
- selected accounts must support `us_bank_account`;
- the payment method type is `us_bank_account`;
- the external account projection is currently written with `currency: 'GBP'`
  even though its provider path is US-bank based;
- deposits create a Stripe PaymentIntent with `payment_method_types:
  ['us_bank_account']` and `currency: 'gbp'`.

This was the exact mismatch. The Slice side expects a GBP cash movement and GBP
journal; the provider side was a US bank-account/ACH path. That runtime path is
now disabled for GBP. The local implementation uses Stripe Bacs Direct Debit
(`bacs_debit`) and still requires credentialed sandbox capability validation.

The current staging VPS remains `PROVIDER_MODE=local`; no Stripe sandbox E2E
has been run and no provider state should be inferred from the implementation.

## Option A

### Slice remains GBP; use a Stripe-compatible GBP bank funding rail

This is the approved architecture for the current codebase, subject to a
credentialed provider capability check.

Safety assessment:

- preserves the existing GBP ledger, account, journal, reservation, lot,
  trading, collector-proceeds, withdrawal, and Connect invariants;
- requires no FX and therefore no hidden conversion, spread, or rounding;
- keeps every customer cash amount in one authoritative currency;
- makes reconciliation a direct amount-and-currency comparison;
- is compatible with the existing GB/GBP Connect payout shape;
- can be implemented behind the current provider-neutral boundaries.

The former US Financial Connections adapter is not Option A and is no longer
active for GBP funding. Stripe Bacs Direct Debit is the selected rail.

## Option B

### Slice launch money ledger becomes USD for US bank funding

This would align the current `us_bank_account` implementation more naturally,
but it is not supported by the current product requirements or code authority.

Safety assessment:

- would invalidate the documented GBP-only finance authority;
- would require an explicit product/legal/accounting decision, not a config
  toggle;
- would require a forward migration and controlled treatment of any existing
  GBP balances, journals, offerings, proceeds, reservations, lots, orders,
  executions, and withdrawals;
- would require changing trading, Connect payouts, customer copy, locale,
  reporting, reconciliation, and operational controls together;
- cannot silently convert existing GBP values to USD.

Option B is unsafe now and must not be implemented without a separate approved
currency migration plan.

## Option C

### Multi-currency Slice cash accounts

This is a future architecture, not a capability of the current code.

Safety assessment:

- `FinancialAccount` and several money tables already retain currency fields,
  but the journal, reservations, orders, executions, and provider paths do
  not consistently carry or validate currency as a first-class operation key;
- each currency would need independently balanced books and available-cash
  projections;
- orders and executions would need an explicit market currency, with buy
  reservations and sell proceeds constrained to that currency;
- offerings, valuation decisions, portfolio lots, realized P&L, fees,
  reconciliation, and customer disclosures would need currency-specific
  rules;
- every provider movement and payout would need an exact currency match;
- cross-currency transfers would need a separately specified FX operation.

Adding columns or allowing `USD` through existing validators would not make
Option C safe. It would create states the current settlement and reconciliation
code cannot prove correct.

## Option D

### Retain GBP internally but use provider FX/conversion

This could allow a USD bank rail to fund a GBP ledger, but it is not defined in
Slice and must not be introduced implicitly.

Every conversion would require an authoritative record containing:

1. source amount and source currency;
2. destination amount and destination currency;
3. FX rate and rate source;
4. provider fee and who pays it;
5. quote/execution timestamp and expiry;
6. minor-unit rounding method;
7. separate ledger postings for source, destination, fee, and any suspense;
8. settlement, return, reversal, and chargeback behavior;
9. reconciliation against both provider currencies;
10. customer disclosure and receipt presentation.

None of these FX rules is currently defined. Option D is therefore unsafe and
must not be implemented as a convenience around the current US adapter.

## Recommended Architecture

Keep Slice's internal ledger GBP-only and use Stripe Bacs Direct Debit: a rail
that delivers GBP bank funding with explicit provider-side GBP settlement.

The Stripe US Financial Connections/`us_bank_account` implementation remains
disabled. If Bacs capability is unavailable for the approved Stripe account,
stop and select another GBP-compatible provider behind the existing
provider-neutral ports rather than changing Slice's ledger or inventing FX.

This recommendation is the simplest safe launch because it preserves:

- existing integer GBP ledger invariants;
- direct cash-account and movement reconciliation;
- GBP initial offering and trade settlement;
- collector proceeds and withdrawal semantics;
- current GB/GBP Connect payout intent;
- truthful customer UX with no hidden conversion.

This is an approved architecture direction, not approval to launch. Sandbox
evidence, operational readiness, and product/legal release gates remain
required.

## Required Product Decision

**APPROVED — UK/GBP-FIRST.** The product decision is:

1. Slice remains GBP-first.
2. Stripe Bacs Direct Debit (`bacs_debit`) is the customer deposit rail.
3. The US/USD Financial Connections rail is deferred and disabled.
4. USD migration, FX, and multi-currency are not approved.

Provider mode must remain off/local until credentialed sandbox gates pass. No
currency migration or FX behavior may be deployed.

## Schema Impact

### Option A — recommended

No ledger currency migration is required. Preserve existing per-row currency
columns and GBP invariants. The provider implementation should:

- store the actual provider account currency rather than hardcoding GBP for a
  US-oriented account;
- reject or quarantine a provider account whose currency is not GBP before a
  funding movement is created;
- carry the selected rail/currency in provider-neutral projections if needed;
- ensure the movement currency, cash-account currency, provider payment
  currency, and settlement journal currency are all GBP.

Any cleanup of existing external-account rows must be an explicitly scoped,
read-only audit first. Do not backfill or rewrite financial history during this
decision task.

### Options B/C/D

Each requires a separately approved forward migration. No migration should be
designed or applied until product terms, opening-balance treatment, reporting,
reconciliation, customer disclosure, and rollback/reversal rules are approved.

## Ledger Impact

The ledger remains the authority for:

- deposit pending and settlement;
- available and reserved cash;
- initial-offering settlement;
- trade settlement and fees;
- collector proceeds;
- withdrawal reservations and payout completion;
- reversals, returns, holds, and reconciliation.

For Option A, the invariant is:

`provider settlement currency = money movement currency = cash account currency = journal currency = GBP`

No provider response may credit available GBP cash until the verified provider
settlement event is accepted and the existing exactly-once ledger path posts.

## Frontend Impact

No frontend change is authorized in this task. Amounts must continue to use
backend-provided `amountMinor` plus `currency` fields. The existing display
currency selector and GBP-based FX presentation are presentation-only and must
never be used to imply that ledger cash, an order, or a deposit was converted.

Future UX must distinguish:

- authoritative ledger amount/currency;
- source market valuation currency;
- display-only converted estimate, if product continues to support it;
- provider funding currency and availability.

No static USD/GBP conversion should be added to make the current Stripe flow
appear compatible.

## Connect Impact

The existing Connect intent is GB Express onboarding with GBP transfers and
payouts. Under Option A, retain that shape and verify it with credentialed
sandbox data only after the funding decision is approved.

If Option B or C is selected, Connect country, account default currency,
transfer currency, payout currency, collector disclosure, and reconciliation
must be reviewed together. A deposit currency decision cannot be made in
isolation from collector proceeds and withdrawals.

## Migration Plan

### Gate 0 — product and provider decision — COMPLETE

1. UK/GBP-first is recorded and approved.
2. Bacs Direct Debit and GBP settlement are selected.
3. Stripe account sandbox and production capability still require verification.
4. Keep `PROVIDER_MODE=local` and all real-money flags off until these gates
   pass.

### Gate 1 — Option A implementation plan

1. Keep `FINANCIAL_CURRENCY='GBP'` and all existing ledger invariants.
2. The US-only Financial Connections runtime adapter has been replaced with
   Stripe Bacs Direct Debit behind the existing provider ports.
3. Bacs projections persist GBP and legacy US rows remain unsupported/deferred;
   they are not relabeled.
4. Add backend fail-closed checks for provider-account, movement, cash-account,
   PaymentIntent/rail, payout, and journal currency equality.
5. Add disposable sandbox QA for success, failure, duplicate webhook,
   return/reversal, and reconciliation mismatch.
6. Update only provider/currency QA documents with observed evidence.
7. Deploy a clean backend/provider release only after secrets, webhook
   registration, migrations, and readiness checks are complete.

### Gate 2 — if Option B, C, or D is chosen

Stop and create a separate approved implementation specification. It must define
opening balances, historical records, account and order currency, FX or
conversion records, fees, rounding, reversals, reporting, customer disclosure,
reconciliation, and rollback before code or schema changes begin.

## Test Matrix

| Flow | Required currency assertion |
| --- | --- |
| Deposit creation | Requested amount is an integer in the funding/cash currency; movement currency is explicit. |
| Financial account | Provider account currency is stored from authoritative provider data; no hardcoded GBP label for a US account. |
| Cash account | Movement currency equals `FinancialAccount.currency`. |
| Offering | Offering, approved valuation, supply policy, price, and settlement currency agree; non-GBP terms are blocked until supported. |
| Trade order | Market/order currency is explicit or the global GBP policy is enforced; no currencyless multi-currency order is accepted. |
| Trade settlement | Buyer cash, seller proceeds, fees, journal, execution, and lots all use the same currency. |
| Collector proceeds | Proceeds account, movement, journal, and customer projection use the same currency. |
| Withdrawal | Withdrawal movement and reservation use the selected cash account currency. |
| Stripe Connect payout | Transfer, payout, Connect account configuration, movement, and journal agree. |
| Reversal/return | Reversal mirrors the original currency exactly and never creates an implicit FX entry. |
| Reconciliation mismatch | Currency mismatch is durable, blocks unsafe completion/credit, and does not auto-repair authority. |

## Risks

- Enabling the current US bank adapter against a GBP ledger may fail at the
  provider boundary or create an incorrect provider projection.
- Treating display FX as funding FX would create undisclosed customer,
  accounting, and reconciliation risk.
- The schema's per-row currency fields could give a false impression that
  multi-currency settlement is already supported.
- A non-GBP valuation can be persisted in valuation/offer records, while the
  current trade settlement path is GBP-only; this requires a fail-closed guard
  before any non-GBP offering can be activated.
- Changing the ledger to USD would affect existing state and cannot be safely
  achieved by changing defaults or formatting.
- A provider rail selected without matching Connect payout support could leave
  collector proceeds stranded in an incompatible currency.

## Release Gate

**NOT READY FOR FULL STRIPE E2E.** The product/currency decision and local Bacs
implementation are now in place, but the staging VPS remains on
`PROVIDER_MODE=local` without Stripe sandbox credentials or verified Bacs
capability/webhook delivery.

Required before full Stripe E2E:

- credentialed Bacs sandbox capability and webhook evidence;
- exact currency invariant and provider capability confirmation;
- clean provider-only release with no unrelated frontend/static work;
- sandbox secrets and a single verified webhook endpoint;
- disposable QA users and documented mutation boundaries;
- success, failure, replay, reversal, payout, and reconciliation evidence.

The local implementation adds one additive Bacs setup-session table and a
wallet-only funding UI change. No staging business data, historical journals,
ownership, or deployment state was changed.
