# 007 — Market data and asset-detail reads

## 1. Document metadata

Phase 3; **COMPLETE 2026-08-06**; high risk; requires 006. Supports `/`, `/marketplace`, `/asset/$id`; components `MarketsHeader`, `MarketAssetGrid`, `MarketAssetCard`, `Chart`. Affects market/read-model modules. Large; limited parallel safety.

## 2. Project-specific context

Market summary, assets, charts, order book, trades, similar assets and movers are generated in `src/mocks/market.ts` and `src/mocks/home.ts`, re-exported by `market-repository.ts`. The backend must become read authority without pretending mock price data is live. 009 later installs HTTP adapters; 011/014 later supply authoritative valuations/trades.

## 3. Current implementation audit

Frontend repository ports and query hooks exist, but routes still import legacy mocks directly. Backend has catalogue only after 006 and no time series/read models. Identify all mock fields and mark provisional sources. Do not create a matching engine here; order book/recent trades are empty/provisional until 014.

## 4. Files to read

Read marketplace, home and asset routes/components/helpers; `src/domain/{asset,market,models}.ts`; mocks; data repositories/services/query keys/hooks; Chart; all catalogue server files; 006 and guide blueprints/state.

## 5. Strict scope

Implement published asset list/detail, filters/sort/cursor, market summary/movers, price-history reads, similar assets, valuation-source attribution, and explicitly provisional empty order-book/recent-trade contracts until 014.

## 6. Out of scope

No ingestion/provider, valuation write (011), orders/fills (014), portfolio, frontend switch, fabricated live data or visual change.

## 7. Dependencies and preconditions

Require 006 catalogue/published assets. Approve allowed `dataStatus` values `DEMO|DELAYED|LIVE` and source attribution. If no authoritative source exists, return DEMO/empty rather than label live.

## 8. Database specification

Add `MarketSnapshot(id,asOf,currency,totalMarketValueMinor,volume24hMinor,activeAssetCount,collectorCount,source,status)`; `AssetPricePoint(id,assetId,observedAt,priceMinor,currency,source,status)` unique asset/source/time; `AssetMarketSnapshot(id,assetId,asOf,priceMinor,change24hBps,marketCapMinor?,availableBps?,ownersCount?,watchersCount?,confidence?,source,status)` with latest/filter indexes. Immutable observations; corrections append with supersedes reference if needed. Migration `market_read_models`; retention/rollup policy documented. No Order/Trade tables.

## 9. Domain types and ports

`MarketDataStatus`, `PricePoint`, `AssetMarketView`, `MarketSummary`, `MarketMover`, filters/sorts/cursor. `MarketReadRepository.listAssets/getAsset/getSummary/getMovers/getPriceHistory/getSimilarAssets`; `ValuationSourcePort` is read attribution only. Methods accept time range and stable cursor and return published projections.

## 10. Domain rules and invariants

All monetary values use minor-unit strings/currency. Time ranges map to explicit from/to/bucket. Latest point cannot be future beyond tolerance. Sort is deterministic. Private/draft assets return 404. Similar excludes current and matches category/set/price band in documented order. No order-book/trade row is invented.

## 11. Application services

List service validates filters/query/sort/limit, fetches projection and encodes opaque cursor. Detail composes catalogue+latest market+history links. Summary/movers use one as-of cut to prevent mixed snapshots. History downsamples deterministically. Cache public reads with bounded TTL and source/asOf in value.

## 12. API specification

- `GET /v1/market/assets?query&category&set&gradingCompany&gradeMin&gradeMax&priceMinMinor&priceMaxMinor&availabilityMinBps&status&sort&cursor&limit` (max 48).
- `GET /v1/market/assets/:slug`; response metadata, latest market, source/status/asOf.
- `GET /v1/market/assets/:slug/history?range=1D|7D|30D|3M|1Y|ALL&bucket?`.
- `GET /v1/market/assets/:slug/similar?limit`.
- `GET /v1/market/summary`; `GET /v1/market/movers?kind=gainers|losers|active&limit`.
- `GET /v1/market/assets/:slug/order-book` and `/recent-trades` return 200 empty plus `availability:"NOT_AVAILABLE_UNTIL_TRADING"` until 014, then ownership transfers to 014.
  Public, cacheable, rate limited, no audit/idempotency/events. Safe cursor errors are 400.

## 13. Error catalogue

`ASSET_NOT_FOUND` 404; `INVALID_FILTER` 400; `INVALID_CURSOR` 400; `UNSUPPORTED_RANGE` 400; `MARKET_DATA_UNAVAILABLE` 503 retryable; canonical rate/internal errors. Responses never expose source credentials/internal provider IDs.

## 14. Authorization and security

Public only for published assets. Allowlist filters/sorts, cap search length/page/history points, parameterize queries and rate-limit expensive history/search. Attribution is public label, not secret config.

## 15. Audit and idempotency

No mutation/audit/idempotency. Source import is not implemented. Operational errors log request/source ID only.

## 16. Events, realtime and jobs

No jobs/realtime. Define cache invalidation/query keys for later `market.snapshot.updated.v1`; 017 dispatches it.

## 17. Frontend alignment

Map to `AssetRepository.listAssets/getAsset/search/featured/trending`, `MarketRepository.getSummary/getPriceHistory/getMovers/getRecentTrades/getOrderBook` and query keys/hooks. Preserve image URLs, status labels, grade, price/change, stats and chart points. No frontend change here; 009 adds adapters/loading/empty/error handling.

## 18. Implementation file plan

Create server market domain/application/persistence/http module and tests; modify Prisma/app/contracts. Preserve mocks/frontend and trading modules.

## 19. Numbered implementation process

1. Inventory every consumed mock field.
2. Define source/status/as-of and wire DTOs.
3. Add read-model migration/repositories.
4. Implement filter/sort/cursor/search and detail composition.
5. Implement summary/movers/history/similar.
6. Add honest empty trading placeholders.
7. Add caching, query/index tests and E2E contracts.
8. Update mappings/state.

## 20. Test plan

Unit filter/cursor/range/downsample/similar/source rules; PostgreSQL filter/sort/cursor/index-boundary/as-of tests; E2E every endpoint, private asset 404, invalid inputs, empty states and no secret fields; contract fixtures against frontend types. No provider/browser visual tests.

## 21. Manual QA

Seed DEMO published/draft assets and price points, call all filters/pages/ranges/detail/similar/summary/movers and confirm `dataStatus`; verify draft hidden and order/trade endpoints honestly empty. Inspect no writes/audits.

## 22. Verification commands

Server Prisma validate/generate/status, lint, unit, integration, E2E, build; root typecheck/build contract regression. Use curl requests documented in API blueprint.

## 23. Documentation and state updates

Update state/checklist/index/order, API/entity/business/feature/workflow maps, verification baseline and this prompt. Mark order-book endpoint ownership as placeholder here and authoritative replacement in 014.

## 24. Completion checklist

- [x] Every exposed marketplace/detail value has an explicit source or omission; generic prices and Slice-unit economics are omitted.
- [x] Filters, limits and cursor input are bounded; public rows use explicit database ordering.
- [x] Estimated market values use integer GBP minor-unit strings with source, asOf, confidence and dataStatus.
- [x] Draft/private assets never leak.
- [x] History and summary carry their own observation as-of values.
- [x] Order/trade placeholders never claim live data.
- [x] DB/E2E/contract tests pass.
- [x] No frontend/trading/valuation write was implemented.

## 25. Final report format

Report all 17 standard items and next document `008`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
