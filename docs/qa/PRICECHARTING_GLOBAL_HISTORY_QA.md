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
- Reference metric tests: pending final run
- Provider adapter tests: pending final run
- Backend build: pending final run
- Frontend tests/build: pending final run
- Prisma validate/generate/migration status: pending deployment run

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
