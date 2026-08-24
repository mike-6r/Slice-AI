# Slice Monetization and Revenue Accounting Implementation

Status: implemented for the GBP / Stripe Sandbox staging architecture

This document records the monetization implementation delivered in the
forward-only migration `20260824090000_monetization_revenue_accounting`.
It does not enable Stripe live mode or move real money.

## Authoritative fee policy

The backend projection at `GET /api/v1/fees` is the only customer-facing fee
authority:

| Flow | Current policy |
| --- | ---: |
| Deposit | 0 bps |
| Secondary maker | 0 bps |
| Secondary taker | 0 bps |
| Withdrawal | 250 bps / 2.5% |
| Collector Initial Offering | 500 bps / 5% of successfully sold proceeds |

The secondary policy is `SLICE_ZERO_TRADING_FEES_V2`. New Initial Offerings use
`INITIAL_OFFERING_5_PERCENT_V1`. Existing offerings retain their persisted
`feeScheduleVersion` and `feeBps`; `INITIAL_OFFERING_ZERO_FEE_V1` is not rewritten.
Existing staging markets with the old `0 / 100` policy are moved to the new
zero-fee policy by the controlled migration. Historical `TradingExecution`
rows retain their recorded buyer and seller fee amounts.

## Accounting separation

Slice continues to use GBP integer minor units and the existing balanced journal
authority. The following remain separate:

- customer wallet liabilities (`CASH_AVAILABLE`);
- Collector proceeds (`COLLECTOR_PROCEEDS_AVAILABLE`);
- platform revenue accounts;
- provider expenses and provider clearing;
- external clearing (`EXTERNAL_GBP_CLEARING`).

No platform revenue is routed through a customer wallet, Collector payout, or
customer Connect withdrawal.

## Withdrawal accounting

The withdrawal amount entered by a customer is gross. For a £1,000 request:

| Posting / effect | Amount |
| --- | ---: |
| Customer gross cash reduction | £1,000 |
| `WITHDRAWAL_FEE_REVENUE` credit | £25 |
| Provider-facing payout amount | £975 |

`MoneyMovement.amountMinor` remains the customer gross amount. New rows also
persist `sliceFeeMinor` and `providerAmountMinor`; the reservation remains the
gross amount. Stripe Connect receives `providerAmountMinor`, while the
withdrawal journal debits the customer gross, credits external clearing with
the provider amount, and credits `WITHDRAWAL_FEE_REVENUE` with the Slice fee.
Stripe provider cost is never added to the customer charge.

Fee calculations use integer minor units and no invented minimum or maximum.

## Initial Offering accounting

New offering terms persist the new immutable 500 bps policy. A £10,000 gross
offering settles as:

- buyer cash debit: £10,000;
- Collector proceeds credit: £9,500;
- `INITIAL_OFFERING_FEE_REVENUE` credit: £500;
- additional investor fee: £0.

The existing controlled offering is not mutated retroactively.

## Provider expense evidence

`ProviderFinancialCost` stores provider, environment, currency, nullable actual
amount, typed cost, source object, balance transaction, related movement or
Connect payout, status, observation time, and posted journal reference.

Stripe PaymentIntent → Charge → Balance Transaction and Connect Payout →
Balance Transaction are inspected only through the Stripe adapter. If the
provider has not exposed the balance transaction yet, the record remains
`PENDING_EVIDENCE`; the system never posts a public-rate estimate as truth and
never displays unavailable evidence as £0.

When actual fee evidence is available, one unique provider-cost source record
produces one `PROVIDER_EXPENSE` journal posting:

- debit `STRIPE_PROVIDER_EXPENSE`;
- credit `STRIPE_PROVIDER_CLEARING`.

The source/cost uniqueness and posted journal reference make webhook replay
idempotent. A known zero provider fee is recorded as reconciled without a zero
amount expense journal; an unavailable fee is pending, not known zero.

## Platform revenue projection and settlement

`PlatformRevenueSettlementService` projects only positive, posted authority from:

- `TRADING_FEE_REVENUE`;
- `INITIAL_OFFERING_FEE_REVENUE`;
- `WITHDRAWAL_FEE_REVENUE`.

It excludes customer liabilities, Collector proceeds, external clearing,
pending provider movements, and unresolved provider evidence. It reports gross
revenue, posted provider expenses, estimated net contribution, known provider
costs, pending evidence count, and the eligible settlement balance.

Settlement workflow endpoints are protected by `finance.manage` and recent auth:

- `POST /api/v1/admin/finance/revenue-settlements/request`;
- `POST /api/v1/admin/finance/revenue-settlements/:id/approve`;
- `GET /api/v1/admin/finance/revenue-settlements/projection`.

Requests and approvals are idempotent and audited. Approval requires a second
distinct authorized operator; self-approval is rejected. The schema supports
`DRAFT`, `AWAITING_APPROVAL`, `APPROVED`, `PROCESSING`, `SETTLED`, `FAILED`,
and `CANCELLED`. No Slice company bank destination is configured in the current
staging architecture, so external settlement remains `NOT_CONFIGURED` and no
fake payout or journal transfer is attempted.

## UI changes

- Fees page consumes `/api/v1/fees` and explains deposits, trading, withdrawals,
  and Collector Initial Offerings.
- Wallet withdrawal preview shows gross amount, backend-authoritative Slice fee,
  and net payout.
- Order entry says `No trading fees` when both current secondary rates are zero.
- Collector offering previews label the 5% Slice fee and estimated net proceeds.
- Admin Finance shows platform gross revenue, posted provider expense, known
  provider costs, estimated contribution, eligible settlement balance, pending
  evidence count, and external settlement status.

## Reconciliation and release safety

Provider reconciliation now reports pending provider-cost evidence and missing
expense journals in addition to existing movement, journal, reservation, and
provider-reference checks. Reconciliation creates durable discrepancies and
holds where existing policy requires them; it never repairs ledger state.

The migration is additive and does not reset data or rewrite historical fee
records. Stripe live mode remains fail-closed; this change does not alter live
credentials, live enablement, or customer/provider currency.
