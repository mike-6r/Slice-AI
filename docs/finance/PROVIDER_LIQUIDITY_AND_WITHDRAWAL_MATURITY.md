# Provider liquidity and withdrawal maturity

Status: implemented in code; Stripe Sandbox withdrawal remains gated until the
provider reports enough available GBP.

## Authorities are separate

Slice has one GBP customer-liability ledger. A posted customer balance is the
authority for internal cash and trading under the existing policy. It is not a
promise that Stripe can fund an external payout at that moment.

The withdrawal projection therefore keeps three concepts separate:

| Concept | Authority | Meaning |
| --- | --- | --- |
| Available cash | Slice posted GBP accounts minus active cash reservations | Customer cash available inside Slice. |
| Withdrawal maturity | Provider balance-transaction `available_on` evidence for settled provider-backed deposits | Customer cash that may be released for external withdrawal after provider settlement. |
| Payout liquidity | Stripe platform `balance.available` GBP minus active internal payout reservations | Provider funds available now for a Connect transfer. `balance.pending` never counts. |

The customer preview also exposes `tradeAvailableMinor` separately from
`withdrawableMinor` and a `maturityStatus`. Slice currently has one internal
cash pool for investing and trading, so `tradeAvailableMinor` equals posted
cash after active reservations. It is still an explicit action-specific
projection; future trading holds must not silently reuse withdrawal maturity.
`maturityStatus` is `MATURED`, `PARTIALLY_SETTLING`, `SETTLING`, or
`NOT_AVAILABLE`.

`settlingMinor` is the customer-specific maturity bucket. A platform-wide
liquidity shortfall is reported through `providerLiquidityStatus` and a
customer-friendly message, not mislabeled as the customer's deposit still
settling.

## Customer liability and provider expense

A £100 provider-confirmed deposit credits £100 of Slice customer liability.
Stripe's £1 processing fee is a Slice provider expense and is recorded through
`ProviderFinancialCost` evidence. It does not reduce the customer's wallet or
withdrawal entitlement. Slice must fund that provider expense from its own
treasury/provider balance.

## Provider evidence

For Stripe-backed settled deposits, the movement stores encrypted/hash-backed
evidence for the balance transaction and source charge, along with gross,
provider fee, provider net, GBP currency, and `available_on`. Missing provider
evidence remains a reconciliation concern; the system does not guess a fee,
currency, or maturity date.

## Withdrawal gates

Both gates must pass before a Stripe transfer is created:

1. Customer eligibility: posted cash, active reservations, identity/capability,
   and provider maturity.
2. Platform liquidity: a sufficiently fresh Stripe available GBP balance can
   cover the provider-facing amount after the disclosed 2.5% Slice withdrawal
   fee.

The preview endpoint is `/api/v1/wallet/withdrawal-preflight`. It returns
authoritative wallet, eligibility, maturity, fee, net payout, provider status,
and the next safely attributable availability timestamp. The frontend does not
derive these values.

## Concurrency and failure safety

Before a non-local withdrawal is reserved, Slice refreshes the provider
projection. It then takes a PostgreSQL advisory transaction lock for the
provider/environment/currency and creates a `ProviderLiquidityReservation`.
The reservation is internal concurrency control; it does not alter Stripe's
balance. A second withdrawal cannot reserve the same available provider GBP.

If the provider transfer fails, the internal liquidity reservation is released,
the customer cash reservation is released by the existing movement failure
path, and no customer ledger debit or Slice withdrawal-fee journal is created.
If the provider reports an external transfer that requires review, the
internal reservation is consumed and the movement remains held for review.

## Admin finance

Admin Finance exposes customer cash liabilities, withdrawal-eligible liabilities,
customer maturity settling, Stripe available/pending GBP, active payout
reservations, provider-liquidity coverage, expected provider availability, and a
warning when available capacity is below eligible withdrawal liabilities.
Provider balances and treasury warnings are never shown in customer-facing
copy.

## Bacs policy boundary

The existing product policy allows internal cash after the trusted provider
success/settlement workflow. External withdrawal additionally requires provider
available liquidity/maturity. This pass does not change trading behavior or
invent a Bacs return-risk policy. The Bacs risk decision remains a separate
product, fraud, and release-gate decision.

## Cash-source maturity policy

| Cash source | Internal Slice use | External withdrawal maturity |
| --- | --- | --- |
| Settled Bacs deposit with provider `available_on` in the future | Available under the existing internal settlement/risk policy | Not eligible; remains in the customer settling bucket until the authoritative timestamp |
| Settled Bacs deposit with provider `available_on` reached | Available | Eligible, subject to cash reservations, account controls, and platform payout liquidity |
| Settled secondary-sale or Collector proceeds | Available after existing Slice settlement and ledger controls | Eligible under the existing settled-proceeds policy; still subject to payout readiness, reservations, and platform liquidity |
| Missing provider maturity evidence | Available only according to existing internal settlement policy | Not promoted by guesswork; reconciliation review is required |

The projection is recalculated from the ledger and stored provider evidence on
each request, with a short provider-balance cache. A provider re-read or
reconciliation therefore promotes matured funds without a user action; no
fixed timer or manual balance patch is used.

## Release gate

Do not fake the calendar, patch Stripe balances, or create a second deposit to
force availability. Once Stripe Sandbox actually reports sufficient available
GBP, run one controlled gross £50 withdrawal and reconcile the transfer,
connected-account payout, signed webhook, customer reservation, £1.25 Slice
fee, £48.75 provider amount, provider expense evidence, and closing balances.
