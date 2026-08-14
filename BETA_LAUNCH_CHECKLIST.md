# Slice Live Beta Phase 2 Checklist

Date: 2026-08-14  
Environment: https://staging.slicecollectable.com  
Scope: controlled demo accounts only; no direct database publish or fixture reseed.

## Deployment

- Git main / VPS: `bbf879e` (checklist commit; production code was built from `a2d0989` immediately before this doc-only sync)
- API `/health` and `/ready`: PASS
- API runtime version: `staging`
- Frontend build/version endpoint: NOT EXPOSED

## Fresh lifecycle record

- Submission: `054e7773-87ad-4b5e-9701-916a3aa5144d`
- Item: 2024 Pokémon Charizard ex Special Illustration Rare (Obsidian Flames, 223/197)
- Created through the real collector `/list` flow: PASS
- Current state: APPROVED (review decision `EVIDENCE_COMPLETE` at 2026-08-14T16:04:31Z)

## Controlled workflow evidence

- Collector authentication and role boundary: PASS
- Details saved through `/list`: PASS
- Market check performed once: PASS
- Market provider result: DEFERRED — no approved external provider configured; result recorded as `UNAVAILABLE` with zero comps
- Front/back uploads through the submission UI: PASS (both media `SAFE`)
- Ximilar pre-grade: DEFERRED — Ximilar configuration is not present; no provider call made
- Submit for review: PASS
- Admin review queue visibility: PASS
- Admin claim review: PASS
- Request changes: PASS
- Collector edit and resubmit: PASS
- Final admin acceptance: PASS

## Intentionally gated until physical authority exists

- Physical receipt/intake and custody: DEFERRED — no physical card was received in this controlled test
- Verification, valuation, market-ready, publish, issuance, D13 funding, D14 execution: NOT TESTABLE without the accepted physical item and approved market data
- Investor portfolio/orders/activity/performance and sell: NOT TESTABLE until a real published/issued market asset exists

## Provider and security notes

- PriceCharting / approved external market provider: DEFERRED (not configured in staging)
- Ximilar: DEFERRED (not configured in staging)
- Plaid/Bridge/SMS/email/2FA: OUT OF SCOPE for this pass; no fake verification was introduced
- Existing demo fixtures were not deleted or republished; the new lifecycle record is retained for review.

## Deployment-blocking fixes made during this pass

- `0a1ec4e` allow market research audit metadata
- `cc501a0` allow review change-request audit metadata
- `2157ec3` allow decision audit item metadata
- `af60a05` map review decisions to backend routes
- `a2d0989` map frontend approval to `/approve`

## Phase 3 provider readiness and intake preparation

Audit date: 2026-08-14  
Deployed commit after this pass: `3d6a6a9`

### PriceCharting

- Implementation: REAL server-side adapter (`/api/products`, `/api/product`)
- Token variables: `PRICECHARTING_API_TOKEN` (preferred) or legacy `PRICECHARTING_API_KEY`
- Enable flag: `PRICECHARTING_ENABLED=true`
- Optional base URL: `PRICECHARTING_BASE_URL` (default `https://www.pricecharting.com`)
- Legacy API base variable: `PRICECHARTING_API_BASE_URL` (parsed for compatibility)
- Request spacing: `PRICECHARTING_MIN_REQUEST_INTERVAL_MS` (default 1000 ms)
- Cache setting: `PRICECHARTING_CACHE_TTL_SECONDS` (default 21600 seconds)
- Timeout: `PRICECHARTING_REQUEST_TIMEOUT_MS` (default 10000 ms)
- Refresh worker: `MARKET_REFRESH_WORKER_ENABLED`, `MARKET_REFRESH_POLL_INTERVAL_MS`, `MARKET_REFRESH_BATCH_SIZE`, `MARKET_REFRESH_LEASE_MS`, `MARKET_REFRESH_MAX_ATTEMPTS`, `MARKET_REFRESH_RETRY_BASE_MS`, `MARKET_REFRESH_RETRY_MAX_MS`
- Persistent mapping, observation history, refresh jobs, and market snapshots: IMPLEMENTED
- Distributed one-request-per-second guard: IMPLEMENTED through Redis plus in-process serialization
- Staging token/config: MISSING; no paid provider call was made
- Approved Charizard mapping: NONE (the approved submission has no Asset/provider mapping yet)
- Current Charizard reference/snapshot/history: NOT CONFIGURED / 0 / INSUFFICIENT
- Admin-wide provider telemetry at verification: 3 mapped assets, 0 fresh, 3 stale, 0 needing mapping; 24 persisted snapshots overall

Operator action required: obtain an approved PriceCharting API token from the PriceCharting account/API area, place it only in `/etc/slice/slice.env` as `PRICECHARTING_API_TOKEN`, set `PRICECHARTING_ENABLED=true`, and restart `slice-api.service`. Never put the token in Vite env, browser code, logs, or customer-visible payloads.

### Ximilar

- Implementation: REAL optional raw-card pre-grade adapter
- Variables: `XIMILAR_API_TOKEN`, `XIMILAR_ENABLED`, `XIMILAR_CARD_GRADING_ENABLED`, `XIMILAR_TIMEOUT_MS`, `XIMILAR_MAX_RETRIES`
- Token/config: MISSING
- Raw Pre-Grade: DEFERRED / NOT CONFIGURED
- The approved Charizard is not blocked by the optional AI step.

### Physical intake

- Active controlled destinations: 2 (`staging-gb-intake`, `staging-us-intake`)
- Customer-safe instructions/address projection: PASS
- Initial vault selection attempt exposed a bug where an empty `acceptedCategories` list rejected every category; the code now treats an empty list as “all categories.”
- Charizard vault selection: PASS — `staging-gb-intake`, persisted as `SHIPPING_REQUIRED`, intake reference `SLICE-3AA5144D`
- Invalid destination guard: PASS — returns `VAULT_NOT_AVAILABLE`
- Current shipment/receipt state: no shipment, no delivery, no Slice receipt
- Shipment states and staff-only receipt command are implemented.
- Carrier `DELIVERED` remains separate from Slice receipt confirmation.
- Current Charizard receipt: NOT EXECUTED.

### Provider/admin observability

- Admin now exposes a dedicated PriceCharting status summary with configured state, last success/failure, mapped count, fresh count, stale count, and needs-mapping count.
- Missing PriceCharting is reported as `NOT_CONFIGURED`; Ximilar remains unavailable/optional. No provider is reported operational without configuration.
- Admin Platform Operations exposes `NOT_CONFIGURED` and `BETA_DISABLED` filters for these states.
- Marketplace, Asset Detail, Portfolio, and Collector Workspace continue to read persisted market data; provider calls remain explicit research/refresh operations.

### First real market asset

- [ ] PriceCharting configured
- [ ] PriceCharting mapping confirmed
- [ ] First real market snapshot
- [ ] Intake destination chosen
- [ ] Physical shipment created
- [ ] Carrier delivered
- [ ] Slice receipt confirmed
- [ ] Verification complete
- [ ] D11 valuation complete
- [ ] Custody ready
- [ ] Market ready
- [ ] Published
- [ ] Issuance configured
- [ ] Beta test liquidity available
- [ ] Investor test funded through audited D13 mechanism
- [ ] First Buy execution
- [ ] Portfolio cost basis
- [ ] First Sell execution

### Configure next

Required next: PriceCharting API token and enable flag; any production object storage/FX values only if the operator’s final environment requires them.  
Optional next: Ximilar token plus both enable flags.  
Deferred: Plaid, Bridge, SMS, email verification, and 2FA provider work.

No direct wallet balance mutation, fake receipt, fixture reseed, database reset, or publication was performed.

## Phase 4 PriceCharting and first physical Beta asset readiness

Audit date: 2026-08-14  
Code commit: `067f2e5`  
Final VPS/checklist commit: `bc43f10`

### Deployment and provider gate

- Main/VPS before this pass: `0c5e890`
- API and web services: active; `/health` and `/ready` pass
- `PRICECHARTING_API_TOKEN` / legacy key: **MISSING** (not printed or exposed)
- `PRICECHARTING_ENABLED`: **FALSE/unset**
- Real lookup: **NOT RUN** — the server correctly refuses provider execution without a token
- Adapter, provider queue, Redis/in-process rate limit, cache, mapping, observation, snapshot, and D17 refresh implementations: READY by source and targeted tests
- Current PriceCharting observations: `0`
- Current persisted snapshots: demo/staging records only; no legitimate PriceCharting snapshot exists for the approved Charizard
- PriceCharting refresh jobs: existing jobs are safely failed as `PRICECHARTING_NOT_CONFIGURED`; no retry storm was triggered
- Redaction and no-N+1 behavior remain server-side; ordinary page rendering uses persisted data and does not call PriceCharting

### Beta telemetry correction

- Admin Platform Operations now excludes `slice-demo-*` and non-published assets from active Beta PriceCharting coverage.
- Current audit: `0` active Beta mappings, `3` retired/demo mappings, `0` active fresh, `0` active stale, and `0` active assets needing mapping.
- Retired/demo mappings remain visible as a separate count and no longer inflate live Beta provider health.

### Current Charizard and intake state

- Submission `054e7773-87ad-4b5e-9701-916a3aa5144d`: `APPROVED`
- Intake: `SHIPPING_REQUIRED`, destination `staging-gb-intake`, reference `SLICE-3AA5144D`
- Physical shipment: not recorded
- Receipt: not recorded
- Marketplace, market-ready, issuance, orders, and D14 execution: not permitted
- Controlled intake UI and destination selection remain available; shipment form must not be submitted until a real operator-approved receiving address and physical package exist.

### Phase 4 remaining checklist

- [ ] Operator configures `PRICECHARTING_API_TOKEN` and `PRICECHARTING_ENABLED=true`
- [ ] One exact Charizard lookup and Staff-confirmed provider mapping
- [ ] First legitimate PriceCharting observation and snapshot
- [ ] Scheduled refresh/cache/last-known-good verified with real provider data
- [ ] Real Beta intake destination approved by operator
- [ ] Physical package sent and tracking recorded
- [ ] Carrier delivered
- [ ] Slice receipt confirmed by Staff
- [ ] Verification, D11 valuation, custody, market readiness, publication, issuance, and D14 gates completed

### Storage and deferred providers

- Current Beta storage: local submission storage
- Production durable object storage: **NOT READY**
- Ximilar: not configured; optional and not a Phase 4 blocker
- Plaid, Bridge, SMS, email verification, and 2FA: deferred

Phase 4 status: **WAITING FOR PRICECHARTING CONFIG**. No fake provider response, shipment, receipt, publication, issuance, or trading was created.

### Operator configuration update

- `PRICECHARTING_API_TOKEN`: **CONFIGURED** on VPS; token value is never stored in Git or exposed here.
- `PRICECHARTING_ENABLED`: **true**
- `XIMILAR_API_TOKEN`: **CONFIGURED** on VPS
- `XIMILAR_ENABLED` / `XIMILAR_CARD_GRADING_ENABLED`: **true**
- API restart and `/health`/`/ready`: PASS
- Admin Platform Operations: PriceCharting **OPERATIONAL**; Ximilar **OPERATIONAL**
- Controlled real Charizard research request: executed once, research `8750e5de-39fa-4107-8982-420ff707a7b2`, result `NO_MATCHES`
- Exact provider candidate/mapping: **NOT CONFIRMED**; no global mapping, observation, or snapshot was persisted
- No additional provider lookup was made after the no-match result

Phase 4 status after configuration: **PROVIDER CONFIGURED — WAITING FOR EXACT STAFF-CONFIRMED MAPPING**.

### Exact PriceCharting confirmation — 2026-08-14

- Submission `054e7773-87ad-4b5e-9701-916a3aa5144d` was audited before lookup. The stored year was already `2023`; the pre-correction title carried the stale `2024 Pokémon` wording.
- Staff/admin correction path: `POST /v1/reviews/submissions/:id/correct-identity`; audit events `SUBMISSION_IDENTITY_CORRECTED` are preserved. Final submission version: `12`; status remains `APPROVED`; intake remains `SHIPPING_REQUIRED`.
- Exactly one provider product request was made with the explicit PriceCharting Product ID `5605741`; no fuzzy search was used. The provider response returned `Charizard ex #223` and the raw/ungraded `loose-price` guide (`10969` USD minor units), observed `2026-08-14T18:13:26.367Z`, as `PRICE_GUIDE` provenance.
- The stored research observation is preserved with provider ID `5605741:loose-price`, source URL, currency, integer amount, and timestamp. A staff-only reclassification (no provider call) now accepts the canonical `223/197` identity against the provider title token `#223`; research `e284b7a3-4ce2-4b26-ad53-879b4ceecf89` is `LIMITED` with one included raw `PRICE_GUIDE` and no rejected observations.
- The same persisted research record is visible from the collector owner submission projection and the staff/admin review projection. Ordinary market/collector page requests completed with no new PriceCharting refresh jobs or provider observations.
- Global `MarketProviderMapping` / `AssetMarketSnapshot` persistence remains blocked by the existing workflow: the approved submission has no canonical `Asset`, and no authorized asset-create/link/mapping operation was available without beginning the lifecycle. The three existing PriceCharting mappings remain retired/demo records.
- No D11 valuation, publication, issuance, D14 order, funding, shipment, delivery, or receipt state changed. Ordinary page loads were not used to trigger provider calls.
