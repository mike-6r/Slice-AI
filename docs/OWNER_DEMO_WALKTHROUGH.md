# Slice Staging Owner Walkthrough

Run the safe refresh and verifier first, as documented in
[`DEMO_MARKET_INTERACTION_MATRIX.md`](DEMO_MARKET_INTERACTION_MATRIX.md).

1. Open the static homepage. Its Featured Asset module is marketing-only and
   intentionally separate from the live market fixture.
2. Open **Markets**. Search for `Charizard`, filter a category, and open a
   published Slice Demo Collector card.
3. On the Asset Detail page, inspect persisted valuation history, real public
   market snapshot values, supply/availability aggregates, the order book and
   real recent executions when the D14 staging gate is active.
4. Sign in as the Investor Demo account. Add and remove a published asset from
   the watchlist; sign out and back in to demonstrate persistence.
5. When the D14 local staging gate is active, place a LIMIT GTC buy below the
   best ask, inspect its reserved cash on Portfolio/Orders, then cancel it and
   confirm the release. Use the Charizard/Pikachu fixture for an executable
   limit order; D14 produces the execution and D13 applies its internal cash
   and FIFO authority.
6. Open Portfolio, Transactions, Orders and Notifications. Only demonstrate
   values and events returned by their respective APIs; unavailable panels are
   deliberately shown as unavailable.
7. Open **Collectors**, select `slice-demo-collector`, and open its actual
   published market cards.
8. Sign in as the Collector Demo account to show the same investor market,
   portfolio, orders and watchlist capabilities.
9. Open the Collector Workspace to inspect the separate private draft,
   submitted, changes-requested, custody and review-queue records.

## Deliberate staging boundaries

- No demo flow invokes Plaid, Bridge, real bank transfers, production KYC/KYT,
  or external settlement.
- D14 seed liquidity is the clearly named `demo-market-maker` staging user,
  never a customer account.
- The order book is created with real D14 orders and the fixture creates no
  frontend-only price, position or settlement records.
- Staging must remain on the same explicit config gates used by the application.
  If the trading gate is disabled, show browsing, charts, collector workflows
  and watchlists rather than representing buy/sell as operational.
