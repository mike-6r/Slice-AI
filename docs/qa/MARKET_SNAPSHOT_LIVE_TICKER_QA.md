# MARKET SNAPSHOT LIVE TICKER — QA

## Old source

The global header used `useTrendingAssets()`, which reads the general
`/market/movers` projection and then displayed
`sliceValuation.amount` (falling back to `estimatedMarketValue`) as if it were
a live market quote. On the non-beta homepage it could also render the
editorial `HOMEPAGE_MARKET_TICKER` values. Neither path represented a single,
explicit market-data contract, and neither refetched a dedicated snapshot.

That is why a PriceCharting refresh could update the asset detail reference
history while the header continued to show the approved whole-asset valuation
(`£1,647.17` for Umbreon) or an illustrative/valuation amount (`£10,000.00`
for the QA offering asset).

## New source

`GET /api/v1/market/snapshot` is a public, read-only, batched projection from
the existing market service. It selects published assets only and prioritizes:

1. settled last-trade prices;
2. active Initial Offering prices;
3. persisted external references.

The frontend consumes this endpoint through the normal HTTP repository and
React Query layers. It does not call PriceCharting from the browser and does
not use the homepage showcase data for the global strip.

## Ticker semantics

- `£1.64 / Slice · Last trade` is the latest settled Slice execution price.
- `£10.00 / Slice · Initial offering` is the real active offering price per
  ownership unit.
- `PC $2,025.00` is a separately labelled PriceCharting external reference.
- An approved whole-asset Slice valuation is never rendered as a market quote.
- Public titles are used; database slugs are not shown.
- Each item links to its public asset detail route.

## PriceCharting integration

The external reference and 24-hour movement come from the same persisted
PriceCharting mapping/history projection used by asset-detail Reference Value
History. The refresh pipeline remains:

`PriceCharting → persisted snapshot/history → market reference projection →
market snapshot → ticker`

There are zero browser provider calls.

## Slice market and Initial Offering integration

Secondary-market items use a settled `TradingExecution.priceMinor` selected in
one server query for the chosen public assets. Active Initial Offerings use
`InitialOffering.pricePerUnitMinor` and its authoritative currency. The
snapshot does not derive a quote from `sliceValuation`.

## Polling and freshness

The ticker uses the existing TanStack Query architecture with a 20-second
refetch interval and a 10-second stale time. It does not build a new socket or
marquee system. Values do not animate unless the underlying projection
changes.

The old `Live source available` label is replaced with:

- `Market data current` when at least one persisted external reference is
  `FRESH`;
- `Last updated … ago` for aging/stale/delayed snapshots with a known update;
- `Market data unavailable` when no eligible public market item exists.

On a failed refetch, the last successful cached items remain visible while the
status is marked delayed.

## Tests

- Frontend HTTP adapter + marketplace focused tests: **27 passed**.
- Backend market snapshot/reference metrics tests: **11 passed**.
- Frontend typecheck: **PASS**.
- Frontend production build: **PASS**.
- Backend production build: **PASS**.
- Full API typecheck: **blocked by a pre-existing unrelated**
  `portfolio-query.service.spec.ts` GBP literal typing error.

## Staging QA

After deployment, verify:

- `GET /api/v1/market/snapshot` returns a batched response;
- Umbreon shows its settled Slice price per unit and separate PriceCharting
  reference/movement;
- QA Initial Offering Card shows its offering price per unit, not £10,000;
- header values update after a persisted backend projection change without a
  full page reload;
- no `/pricecharting` browser request is made;
- no raw slug, fake 0% movement, or `Live source available` text appears.

## Release decision

Implementation is ready for staging verification after the new release is
healthy. No wallet, cash, ownership, order matching, settlement, proceeds,
Stripe, Twilio, or Resend behavior was changed.
