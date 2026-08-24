# PriceCharting Global History System

## Purpose

PriceCharting is Slice's external current-reference provider. Slice owns the
persisted observation history, range calculations, freshness state, and graph
projection. PriceCharting's website graph is never scraped and no historical
points are synthesized.

The three money authorities remain separate:

1. PriceCharting external reference value, preserved in the provider currency.
2. Slice-approved valuation, controlled by staff.
3. Slice market price, produced by offerings, orders, and settled executions.

PriceCharting observations do not change valuation, ownership, offerings,
orders, executions, or the price of a Slice.

## Provider mapping and eligibility

`MarketProviderMapping` is the stable provider identity for an Asset. It stores
the provider code, canonical PriceCharting product identifier, approved source
URL, mapping status, identity hash, refresh state, current projection, and
movement projections.

The current product policy enrolls published, non-fixture Assets with an
approved PriceCharting mapping. Submission market research remains private and
separate until staff promotes the mapping to the canonical published Asset.
Deleted, rejected, archived, unsupported, unmapped, and beta-fixture Assets are
not scheduled. A mapping correction resets the current projection and refreshes
from the new product identity; historical observations retain their original
provider product identifier and public history reads are scoped to the current
mapping identity.

## Observation model

`MarketObservation` is append-only normalized provider data. It stores:

- Asset and mapping identity;
- provider and provider product ID;
- observation type (`PRICE_GUIDE` for the PriceCharting adapter);
- integer minor-unit amount and source currency;
- grader/grade series metadata;
- provider URL, observation time, server-observed time, quality, and provenance.

The unique provider/source fingerprint is deterministic. Its server-observation
time is bucketed by the mapping cadence, so an unchanged provider value creates
at most one real heartbeat per cadence while retries in the same cadence remain
idempotent. A value change creates a new observation immediately. Provider
failure never removes the last successful observation.

## Series selection

Supported normalized series are:

- `UNGRADED`
- `GRADE_7`, `GRADE_8`, `GRADE_9`, `GRADE_9_5`
- `PSA_10`
- `BGS_10`

The public history endpoint defaults to the Asset's actual grade/status. It
filters to the current mapping's provider product and selected series. If the
provider has no exact/strong observation for that series, the API returns an
unavailable history state; it does not silently substitute another grade.

The provider adapter only normalizes values actually returned by PriceCharting.
Missing grades are not created.

## Collection schedule and resilience

The durable `MarketRefreshJob` queue uses leases, attempts, unique idempotency
keys, bounded batches, and retry timestamps:

| Mapping status | Base cadence |
| --- | ---: |
| `AUTO_MATCHED` | 24 hours |
| `STRONG` | 12 hours |
| `VERIFIED` | 6 hours |
| `STAFF_CONFIRMED` | 6 hours |

Deterministic jitter spreads requests. The worker poll interval, batch size,
lease, retry ceiling, retry base, and retry maximum are deployment configuration
(`MARKET_REFRESH_*`). Provider requests are serialized per process and use a
Redis global throttle when available. The provider response cache is bounded
by `PRICECHARTING_CACHE_TTL_SECONDS`.

HTTP 429 responses use a provider-safe delay. Transient failures use bounded
exponential backoff. Authentication, invalid response, missing configuration,
unsupported category, missing Asset, and no usable reference are terminal
mapping failures requiring review. Jobs and mappings retain failure code/time.

## History API and calculations

`GET /api/v1/market/assets/:slug/history` reads only persisted Slice data.
Supported ranges are `24H`, `7D`, `30D`, `90D`, `1Y`, and `ALL` (the legacy
`1D`/`3M` aliases are accepted and normalized). Optional `series` selects a
real available grade series.

The response includes provider, selected/available series, currency, points,
starting/latest values, absolute and percentage movement, high/low,
observation counts, coverage, last refresh, and an explicit movement-unavailable
reason.

Movement uses the latest real observation at or before the requested boundary.
If the boundary does not exist, movement is unavailable. High and low use only
observations inside the selected range. `ALL` spans the earliest real point.
Downsampling retains real observations only, with deterministic endpoints and a
bounded response. The frontend may connect points visually but cannot invent
values.

An empty history says collection has just started. One point shows the current
reference but no movement. Two or more points can render a graph, subject to
range coverage.

## Frontend and Market Snapshot

Asset detail uses the history endpoint and never calls PriceCharting from the
browser. The chart exposes real observation points, crosshair/hover tooltip,
source, timestamp, previous change, range change, currency, freshness, high,
low, and coverage. The selected range controls are `24H`, `7D`, `30D`, `90D`,
`1Y`, and `ALL`.

Market Snapshot consumes the same persisted external-reference projection as
asset detail. A Slice offering or settled execution is shown as Slice market
price; a PriceCharting amount is separately labelled external reference. A
stale reference is never labelled live.

## Admin operations

Admin market-data observability includes mapping identity/status, current
reference and currency, available observation count, last successful refresh,
last failure, next refresh, freshness, and movement projections. The bounded
`POST /api/v1/admin/market-data/refresh/:assetId` operation queues a controlled
refresh subject to cooldown and permission checks. It does not directly call the
provider from a public request and does not mutate financial state.

## Retention, privacy, and safety

Observations are not destructively pruned. No fake historical backfill is
performed. Provider payload provenance remains server-side; public responses
expose source attribution and safe reference metadata only. PriceCharting
movement is called reference movement, never Slice return, profit, or trading
performance.

No schema change was required for this correction pass: the existing additive
mapping, observation, and durable refresh-job tables already provide the
authority and indexes needed for current history reads.
