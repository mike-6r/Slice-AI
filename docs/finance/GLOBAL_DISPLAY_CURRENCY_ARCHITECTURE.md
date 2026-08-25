# Slice global display currency architecture

## Purpose

Slice has three separate currency concepts:

1. **Source currency** — the currency supplied by an external market source, such as USD from PriceCharting.
2. **Ledger / settlement currency** — the currency used by Slice's accounting and executable money flows.
3. **Display currency** — the customer's presentation preference.

The display currency is a read-time presentation choice. It never changes the amount or currency stored in a financial authority.

## Current state

- Slice financial authority remains GBP (`FINANCIAL_CURRENCY=GBP`). Wallet balances, reservations, deposits, withdrawals, trading settlement, fees, journals, ownership economics, and initial offerings remain GBP.
- PriceCharting observations retain their source amount and source currency. The source is not rewritten when a customer chooses another display currency.
- Supported display currencies are GBP, USD, CAD, and EUR. GBP is the default for new and anonymous visitors.
- `UserProfile.preferredCurrency` stores an authenticated customer's preference. Anonymous selection is stored in local storage and a same-site cookie (`slice_display_currency`); an authenticated server preference takes precedence after login.
- The footer `CurrencySelector` is the single customer-facing authority. It updates the shared `CurrencyProvider` without a reload.

## Shared display service

The frontend currency authority is `src/currency/CurrencyProvider.tsx` plus `src/currency/currency-presentation.ts`.

Eligible customer surfaces call the shared `formatMoney`/`formatDisplayMoney` path with an explicit source currency. No component owns an exchange rate. Same-currency values and converted values are rounded from minor units at the final display boundary with integer arithmetic. Normal fiat output uses two decimals.

When rates are unavailable, the formatter returns the original source currency. The selector explains that live conversion is unavailable; it never renders a fabricated zero or stale hardcoded rate.

## FX provider, cache, and freshness

The backend `CurrencyService` is the only external FX caller. It requests GBP-base USD, CAD, and EUR rates from Frankfurter's central-bank reference feed. The response includes `baseCurrency`, `rates`, `asOf`, `fetchedAt`, `source`, and `cached` metadata.

Valid snapshots are cached in the existing Redis cache for six hours. This is the bounded refresh cadence for display FX; price renders do not call the provider. A malformed, incomplete, failed, or timed-out provider response returns `FX_RATES_UNAVAILABLE` (HTTP 503). The UI then keeps source values visible.

The initial history policy is **current-rate display conversion**: historical external observations remain stored in their source currency and are converted at read/display time using the current approved snapshot. The chart does not imply historical FX-adjusted performance. Historical FX observations are a future data-model extension, not something this release fabricates.

## Customer-facing semantics

- Marketplace cards, homepage market content, ticker values, asset detail valuation/reference/history, portfolio projections, wallet summaries, order summaries, and similar assets use the selected display currency where a valid rate exists.
- External references retain discoverable provenance. For example, a converted PriceCharting value can show `PriceCharting` plus `source $X.XX USD`.
- Trading, deposits, withdrawals, and offering review screens explicitly disclose that Slice settles in GBP. A USD display equivalent is informational only.
- Deposit input remains GBP because the supported Bacs rail and ledger are GBP. Withdrawal gross, fee, and net settlement remain GBP. Admin finance/accounting views remain GBP-authoritative and are not globally converted.

## SSR and persistence policy

GBP is the deterministic SSR/default snapshot. An authenticated preference is resolved from the account preference query; an anonymous explicit selection is restored from the same-site cookie/local storage after hydration. Browser locale is never consulted. The cookie is intentionally available to the SSR boundary for a future request-context bootstrap; the current TanStack root keeps the first server render deterministic in GBP and applies the anonymous selection during hydration.

## Data and API rules

- Public APIs continue returning authoritative `amountMinor` plus `currency`.
- Display projections, when present, are derived values and must not replace those fields.
- No ledger migration, FX journal, multi-currency cash account, provider conversion, or financial currency rewrite is part of this change.
- No component may add a literal exchange rate or reinterpret a collector-entered value when the user's display preference changes.

## Classified audit

| Area                                       | Authority / classification   | Rule                                                                                      |
| ------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Wallet, reservations, movements            | GBP ledger                   | Keep backend currency and settlement labels GBP; convert only presentation summaries.     |
| Trading and offering review                | GBP ledger / transaction     | Show display equivalent plus explicit GBP settlement disclosure.                          |
| Portfolio                                  | GBP backend projection       | Convert value, cash, P/L amount, and history at read time; percentages are unchanged.     |
| Marketplace and homepage                   | Source or Slice projection   | Convert through the shared formatter and retain source provenance.                        |
| PriceCharting                              | USD source reference         | Never rewrite stored observations; chart uses documented current-rate display conversion. |
| Admin finance, reconciliation, journals    | GBP authoritative accounting | Do not apply the customer selector to accounting tables.                                  |
| Tests, docs, labels such as `Amount (GBP)` | Intentional explanatory text | Retained where it describes the actual settlement/input currency.                         |

## Deliberately out of scope

This architecture does not introduce FX ledger postings, customer FX trades, USD bank funding, multi-currency balances, or automatic provider FX. Those require an explicit product and accounting decision covering source/destination amounts, rate, fee, timestamp, rounding, reversals, reconciliation, and disclosure.
