# PriceCharting Market Refresh, History & Movement QA

## Scope

This document covers the server-side PriceCharting reference pipeline and its
public/admin projections. PriceCharting data is informational external market
reference data. It is not Slice valuation, an executable order, completed-sale
data, ownership supply, or trading history.

## Current architecture

- `MarketProviderRegistry` is the server-only adapter. The browser never calls
  PriceCharting directly.
- `MarketProviderMapping` stores the approved provider/product mapping, refresh
  state, retry state, and the current PriceCharting projection.
- `MarketObservation` is append-only normalized provider history. A source
  fingerprint prevents an unchanged provider value from creating duplicate
  snapshots.
- `MarketRefreshJob` is the durable queue record. Unique idempotency keys,
  claim leases, attempts, and retry timestamps protect against duplicate work
  across worker instances.
- The existing API process starts `MarketRefreshWorker` when enabled. It polls
  the queue on the configured interval; it does not issue an immediate
  refresh burst on process restart.

## Trigger and eligibility

Automatic refresh is queued only for published, non-beta-fixture assets with an
eligible PriceCharting mapping. The schedule remains mapping-status driven:

| Mapping status | Base refresh interval |
| --- | ---: |
| Auto matched | 24 hours |
| Strong | 12 hours |
| Verified / staff confirmed | 6 hours |

Deterministic per-asset jitter spreads work. The default worker poll interval
is five minutes and the default batch size is ten; both are configuration
controls. Manual admin refresh uses the same durable queue and has a 15-minute
cooldown. It never mutates Slice valuation, issuance, ownership, orders, or
executions.

Provider request spacing is configuration controlled and enforced through the
process request chain plus the Redis global throttle key when Redis is
available. Product responses use the configured Redis TTL cache; cache failure
is non-fatal and cannot prevent a provider refresh.

## Current projection and history

On a successful refresh the worker:

1. accepts only a positive exact/strong `PRICE_GUIDE` observation;
2. persists normalized observations with `skipDuplicates` and provenance;
3. updates the mapping’s current reference amount, currency, observed time,
   history start, and movement windows;
4. schedules the next refresh and marks the job complete.

Movement is integer minor-unit arithmetic. For each window, the comparison
point is the latest stored observation at or before the real window boundary.
If that boundary does not exist, the movement is `Unavailable`; the system does
not substitute a newer point or display a fabricated zero.

The history endpoint prefers PriceCharting `PRICE_GUIDE` observations and
returns `source: PRICECHARTING`. It deterministically downsamples long ranges
to at most 240 real points, retains the first and last points, and does not
interpolate. Legacy Slice valuation points remain a compatibility fallback for
older non-provider fixtures and are labeled `SLICE_VALUATION`.

The UI exposes PriceCharting reference movement separately from Slice trading
movement. It does not label a guide value as a completed sale or show a 24-hour
change until a real comparison observation exists.

## Freshness and failure behavior

Freshness is derived from the last successful provider refresh:

- `FRESH`: up to 24 hours
- `AGING`: over 24 hours through 72 hours
- `STALE`: over 72 hours through 7 days
- `UNAVAILABLE`: older than 7 days or no successful projection

Transient provider errors return to the queue with exponential backoff bounded
by `MARKET_REFRESH_RETRY_BASE_MS`, `MARKET_REFRESH_RETRY_MAX_MS`, and
`MARKET_REFRESH_MAX_ATTEMPTS`. Rate limiting uses a provider-safe delay.
Authentication, invalid response, missing configuration, unsupported category,
missing asset, and no usable reference are terminal mapping failures requiring
admin review. Failed jobs retain their error code and timestamps.

## Admin observability

The admin collectible market-data panel can queue a controlled refresh and now
shows the provider mapping status, current reference, next refresh, last
successful refresh, history-point count, 30-day movement, and the latest
provider failure code. Integration health remains separate and never exposes
provider secrets.

## QA matrix

| Area | Result |
| --- | --- |
| Movement boundary / negative / flat arithmetic | PASS — deterministic unit tests |
| History downsampling and endpoint retention | PASS — deterministic unit tests |
| Exact reference selection | PASS — deterministic unit test |
| Existing provider adapter tests | PASS |
| Existing market history compatibility test | PASS |
| Frontend typecheck | PASS |
| Server typecheck | BLOCKED by pre-existing unrelated `portfolio-query.service.spec.ts` literal-widening error |
| Production build | Pending final deployment run |
| Controlled staging refresh | Pending authenticated staging operation |

## Controlled staging QA protocol

For the existing published Umbreon asset, use the supported admin “Refresh
market data” action. Verify that it creates one queued PriceCharting job, that
the worker completes it, and that the mapping projection and public detail show
the same provider amount/currency. Repeat the action inside the cooldown to
verify it does not enqueue a second provider call. Do not create ownership,
offering, market, order, execution, or Slice valuation records.

A second provider snapshot should only be assessed after the configured
provider-safe refresh interval. An immediate repeated request is not evidence
of a new market observation, because unchanged values are intentionally
deduplicated.

## Release gate

Release only after the final production build, migration deployment, worker
health, authenticated controlled refresh, public history response, admin
observability, and browser checks pass. A provider outage, stale mapping,
missing history boundary, or absent authentication is reported truthfully; no
static market value is substituted.
