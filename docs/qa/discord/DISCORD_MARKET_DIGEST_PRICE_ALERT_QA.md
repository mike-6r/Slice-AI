# Backend Authority Contract

This contract was audited from the current Slice backend implementation before the Discord bot implementation began. Discord consumes these read-only projections; it does not calculate market authority.

| Use | Endpoint | Auth | Authoritative response fields | Source / as-of / status | Pagination | Failure behavior | Public Discord safe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Market digest summary | `GET /market/summary` | None | `totalEstimatedMarketValue`, `volume24h`, `activeAssetCount`, `collectorCount`, `currency` | `source`, `asOf`, `dataStatus` | None | Returns `UNAVAILABLE`/`NO_MARKET_DATA` when no snapshot; normal API errors are not safe to display | Yes, only when `asOf`, `source`, and `dataStatus` are retained |
| Gainers / losers | `GET /market/movers?kind=gainers|losers&limit=1..48` | None | Published public assets; title, slug, public ID, authoritative value, `change24hBps`, lifecycle | Per asset: `source`, `asOf`, `dataStatus`, freshness | Bounded `limit`, no cursor | HTTP failure or invalid projection means no digest output | Yes, with retained metadata |
| Current price for a personal alert | `GET /market/assets/:slug` | None | Public asset identity, `estimatedMarketValue`, approved Slice valuation where present, `change24hBps`, currency | `source`, `asOf`, `dataStatus`, freshness | None | `404` asset absent; invalid/unavailable response must not trigger | Yes for the requesting member's private DM |
| Price history | `GET /market/assets/:slug/history?range=...` | None | Historical estimated values | Each point has `source`, `observedAt`, `dataStatus` | Bounded range | Unavailable/invalid response | Not used for alerts or digest; no ATH is derived |

`/market/movers?kind=active` is ordered by backend watcher count and does not return an authoritative activity/volume metric for a public digest. It is not used as “most active” or “highest volume.” Existing bot delivery outbox endpoints are authenticated but contain only order, collector-action, and shipping events; they do not provide market-alert events.

# Supported Fields

Supported: market summary totals and 24-hour volume; gainers and losers ordered by backend `change24hBps`; current authoritative asset value in integer minor units and currency; the existing generic Slice marketplace link; `source`; `asOf`; and `LIVE`, `DELAYED`, or `DEMO` data status.

# Explicitly Unsupported Fields

Intentionally omitted: per-asset trading volume, most-active ranking, market cap, ATH, historical-sales claims, ROI, expected ROI, confidence ratings, investment recommendations, predictions, and broad market-event rules.

# Market Digest

`MarketDigestWorker` runs on the existing worker interval and publishes at the configurable UTC hour (`MARKET_DIGEST_HOUR`, default `9`) when `MARKET_DIGEST_ENABLED=true`. It uses the existing managed `market-feed` resource (`#📈・market`), posts only the supported market summary plus non-empty gainer/loser sections, and preserves source, as-of time, and data status on every data-derived output. Unsupported activity/volume sections are omitted.

# Personal Price Alerts

The existing `/pricealert add`, `list`, and `remove` UX remains the entry point. It supports only persisted `PRICE_ABOVE` and `PRICE_BELOW` conditions, evaluated with backend integer minor units and the asset currency. New alerts establish an authoritative baseline, so an already-met target does not generate an immediate DM.

# Broad Market Alerts

No broad role-based movement alert is sent. The existing `Market Brief` notification preference may be mentioned for a digest only when `MARKET_DIGEST_MENTION_OPT_IN_ROLE=true`; it is disabled by default. No personal threshold, portfolio, or account data is posted publicly.

# Data Status Policy

`LIVE` data may publish a digest and may trigger a personal price alert. `DELAYED` and `DEMO` are visibly labelled in digest output but do not trigger personal price alerts. `UNAVAILABLE`, missing source/as-of/value, or invalid backend data skip the cycle; stale data is never reused as current.

# Delivery

Personal alerts are delivered only by Discord DM to the alert owner. They include the authoritative target/current amount, source, data status, as-of time, and the existing generic Slice marketplace link. They contain no investment advice or private account data. Known DM failures are recorded for retry; a successful Discord send with failed persistence acknowledgement is left uncertain rather than replayed automatically.

# Idempotency

Alert evaluation persists last observed integer value, condition result, source/status/as-of, and a delivery idempotency key. A delivery is created only on a false-to-true threshold crossing; repeated value/as-of or an already-met condition does not create another delivery. Digest claims use `guildId + UTC date`, claim before send, and only retry an explicitly known send failure. An uncertain receipt is not automatically replayed.

# Worker

One price-alert scan runs at `PRICE_ALERT_SCAN_INTERVAL_MS` (default ten minutes; bounded 5–15 minutes). It loads a bounded batch, groups alerts by asset, fetches each asset once, and evaluates with bounded concurrency (`PRICE_ALERT_CONCURRENCY`, default 4). A failed backend asset request, persistence operation, or Discord delivery is contained to that item/batch and logged with a safe category. The existing backend client cache/rate gate remains in use; it does not currently expose `Retry-After`, so no unsupported retry interpretation was added.

# Privacy

The digest is public market information only. Personal alert DMs do not disclose portfolio, balances, ownership, linked email, internal user IDs, or transaction history. Discord allowed mentions are explicitly empty for DMs; digest role mentions are allowlisted to the opted-in managed role only.

# Unit QA

`npm run test:unit` passed: 24 files, 128 tests. Market-focused coverage includes authoritative payload ordering and source/as-of/status preservation, omitted unsupported sections, DEMO/DELAYED labeling, unavailable and raw backend exception no-post behavior, duplicate digest claim suppression, managed channel resolution, opt-in-only role mention, integer-minor threshold evaluation, missing authoritative price rejection, DEMO/DELAYED alert suppression, grouped fetches, bounded per-asset error isolation, private-only DM payloads, and known-failure retry/uncertain-send behavior.

# Integration QA

The protected `slice_test` configuration was used without changing its guard. `npm run test:integration` passed: 5 files, 31 tests. New Prisma coverage verifies alert evaluation state, false-to-true fire-once behavior, same-as-of suppression, reset/re-crossing, delivery claim/retry/receipt state, currency mismatch rejection, disabled/removed alert suppression, and per-guild/date digest claims. Full `npm test` then passed: 29 files, 158 tests. `prisma validate` passed and `prisma migrate status` reported 67 migrations current.

# Manual QA

NOT RUN. There is no controlled authoritative market-price fixture in the production Discord guild, and no real market data was manipulated. Scheduled execution and delivery behavior were covered by unit/integration seams only.

# Remaining Backend Gaps

The backend does not expose a price-alert event outbox, per-asset authoritative volume/activity ranking, an approved asset-detail web route contract for Discord, or a `Retry-After` signal through the bot client. Broad movement alerts therefore remain preference-only, and the DM button links to the existing generic marketplace route.

# Release Decision

APPROVED FOR DEPLOYMENT after the isolated `slice_test` full suite, typecheck, lint, setup check, build, Prisma generation/validation, and current migration status all passed. This change adds no top-level Discord command; the checked command inventory remains 58.
