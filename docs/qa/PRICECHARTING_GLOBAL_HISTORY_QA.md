# PriceCharting Global History QA

## Scope

This QA covers the global persisted PriceCharting reference-history pipeline,
grade-aware history selection, scheduled collection, public graph projection,
Market Snapshot unification, and admin refresh observability. It does not create
or alter Slice ownership, valuation, offering, order, execution, cash, or
portfolio state.

## Audit result

| Area | Result | Evidence |
| --- | --- | --- |
| Server-only PriceCharting adapter | PASS | `MarketProviderRegistry` and provider tests |
| Stable mapping reuse | PASS | `MarketProviderMapping` and research-promotion path |
| Durable scheduled queue | PASS | `MarketRefreshJob`, lease, retry, idempotency code |
| Real observations only | PASS | `MarketObservation`; no website chart scraping |
| Unchanged-value heartbeat | PASS | cadence-bucketed source fingerprint test |
| Currency preservation | PASS | provider currency is stored unchanged; integer minor units |
| Grade-aware default series | PASS | series selection tests and history API |
| Missing exact grade | PASS | unavailable state; no grade substitution |
| Current mapping lineage | PASS | history reads scope to current provider product ID |
| Slice valuation separation | PASS | external history no longer falls back to valuation points |
| Market Snapshot authority | PASS | same `assetView` persisted reference projection |
| Admin bounded refresh | PASS | permissioned queue endpoint and cooldown |

## API matrix

| Range | Status | Rule |
| --- | --- | --- |
| `24H` | PASS | movement only with a real boundary observation |
| `7D` | PASS | real boundary and in-range high/low |
| `30D` | PASS | real boundary and in-range high/low |
| `90D` | PASS | real boundary and in-range high/low |
| `1Y` | PASS | real boundary and in-range high/low |
| `ALL` | PASS | earliest real observation through latest |
| insufficient coverage | PASS | explicit unavailable reason |
| one observation | PASS | current value only; no fake movement |
| empty history | PASS | collection-started state; no fake line |

## Series matrix

| Series | Result |
| --- | --- |
| Ungraded | PASS when provider returns exact raw guide |
| Grade 7 | PASS/UNAVAILABLE according to provider response |
| Grade 8 | PASS/UNAVAILABLE according to provider response |
| Grade 9 | PASS/UNAVAILABLE according to provider response |
| Grade 9.5 | PASS/UNAVAILABLE according to provider response |
| PSA 10 | PASS when exact PSA 10 is returned |
| BGS 10 | PASS when exact BGS 10 is returned |

Only provider-returned observations are eligible. No synthetic series, FX
conversion, historical scraping, or backfill is used.

## Automated validation

- Backend typecheck: PASS
- Frontend typecheck: PASS
- Backend full suite: PASS — 72 suites, 317 tests
- Focused market/reference suites: PASS — 3 suites, 19 tests
- Frontend tests: PASS — 39 files, 153 tests
- Backend build: PASS
- Frontend client and SSR builds: PASS
- Prisma validate/generate: PASS
- VPS migration status: PASS — 91 migrations found, none pending
- Frontend repo-wide lint: EXISTING DEBT — 4,895 unrelated Prettier violations;
  no scoped lint regression was introduced

## Browser QA matrix

The asset-detail reference chart must be checked at:

- 1920×1080
- 1440×900
- 1280×800
- 390×844

Check each with empty history, one point, two or more points, insufficient
coverage, and a graded asset where staging has a genuine exact series. Confirm
the range controls change the API range, tooltips expose date/time/currency/
source, the y-axis retains useful precision, and there is no clipping on mobile.

### Staging run

| Viewport | Result | Evidence |
| --- | --- | --- |
| 1920×1080 | PASS | Established Umbreon history, metadata fully visible |
| 1440×900 | PASS | Established Umbreon history, responsive panel layout |
| 1280×800 | PASS | Established Umbreon history, no lower-row overlap |
| 390×844 | PASS | Stacked layout; execution table fits without horizontal clipping |

Additional browser checks:

- Range controls `24H`, `7D`, `30D`, `90D`, `1Y`, and `ALL`: PASS
- Real persisted graph points and PriceCharting attribution: PASS
- Chart axis precision and insufficient-coverage state: PASS
- Console warnings/errors across the final viewport pass: none observed
- Browser render provider calls: none observed; the page consumes Slice API
  projections and does not invoke PriceCharting or Ximilar directly

## Economic safety checks

- Slice valuation automatically changed: NO
- Orders changed: NO
- Executions changed: NO
- Price per Slice changed: NO
- Ownership changed: NO
- Offering economics changed: NO
- Provider calls from browser render: NO
- Website graph scraped: NO
- Historical fake backfill: NO

## Release gate

Release only after automated validation, migration status, staging HTTP checks,
worker health, admin observability, and responsive browser QA are green. A
provider outage or missing boundary remains visible as unavailable/stale state;
the system never substitutes a static market value.

## Deployment record

- Commit: `4847508`
- VPS release: `/opt/slice/releases/20260824-4847508-git`
- `/opt/slice/current`: verified at the same release
- `/opt/slice/app`: verified at the same release
- `slice-api.service`: active
- `slice-web.service`: active
- Staging home and Umbreon asset page: HTTP 200
- Deploy health checks: PASS

Runtime status is GO for staging. Production remains gated by the existing
repo-wide frontend formatting debt until that separate cleanup is completed.
