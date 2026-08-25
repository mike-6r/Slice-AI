# Slice real-money foundation

## What “available” means

If Wallet says a customer has £500 available, the amount is backed by a posted,
balanced Slice ledger entry. A requested deposit is not available yet. It first
appears as pending and only becomes available after a trusted provider
confirmation (or an explicitly controlled internal settlement).

The customer-facing balance is:

```text
available = posted authority - active reservations
```

Reservations are not lost money. They are amounts held for a particular order
or withdrawal so the same pounds cannot be spent twice.

## Deposit lifecycle

1. A deposit request creates a `MoneyMovement` in `PENDING_PROVIDER`.
2. Pending money is visible as pending, but does not increase spendable cash.
3. A confirmed settlement creates one balanced journal and credits
   `CASH_AVAILABLE`.
4. Repeated provider events are idempotent and do not create another credit.
5. A failed deposit has no settled-cash journal. A later return creates an
   explicit reversal journal; the original journal remains in history.

Phase 3 uses the deterministic `LOCAL_TEST` provider seam only. It performs no
network calls and does not represent a real bank payout.

## Purchases and proceeds

Once money is settled, an Initial Offering purchase is an internal ledger
transfer. It does not initiate another bank transfer. The buyer's settled cash
is debited, the collector's `COLLECTOR_PROCEEDS_AVAILABLE` account is credited,
and any configured Slice fee is posted to an explicit fee revenue account.

Collector proceeds are customer money, not Slice revenue. Secondary seller
proceeds follow the existing trading settlement policy. Slice revenue is only
what an explicit fee journal says it is; customer deposits, treasury/customer
liabilities, clearing balances, and seller proceeds are never counted as
revenue.

## Withdrawals

When a customer requests a withdrawal, the backend checks the user's own
authoritative account, compliance state, currency, limits, and available cash.
It creates a withdrawal movement and reserves the requested amount. While the
provider result is pending, the amount is reserved but not permanently spent.

- Success consumes the reservation and posts the external-clearing withdrawal
  journal.
- Failure releases the reservation and posts no payout journal.
- A later provider return creates an append-only reversal and marks the
  movement `RETURNED`. If the customer has already spent the money, Slice does
  not invent a balance: it records a returned-funds deficit and applies the
  existing account hold model for review.

External withdrawal eligibility is a separate projection from internal cash.
The wallet reads provider-backed maturity evidence (`available_on`) and the
Stripe platform's available GBP balance; pending provider balance is never
treated as payout liquidity. See
[`PROVIDER_LIQUIDITY_AND_WITHDRAWAL_MATURITY.md`](PROVIDER_LIQUIDITY_AND_WITHDRAWAL_MATURITY.md)
for the customer-liability, provider-expense, concurrency-reservation, and
admin-finance model.

## Reconciliation and safety

Reconciliation compares every provider movement with its journal, amount,
currency, status, reservation, and reversal. It reports mismatches; it never
edits `AccountBalance` to hide a discrepancy. Corrections require an explicit
journal or reversal workflow.

The staging configuration remains `PROVIDER_MODE=local` with external deposits
and withdrawals disabled. No Plaid or Bridge credentials are required, and no
real money is moved by this foundation.
