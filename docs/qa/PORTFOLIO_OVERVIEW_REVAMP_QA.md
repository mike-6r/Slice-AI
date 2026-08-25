# Slice Portfolio Overview Revamp QA

## Scope

Portfolio overview redesign for `/portfolio`, using the supplied premium portfolio mockup as the visual direction while keeping all account, holding, valuation, and market data backend-authoritative.

## Old data issues

- The overview presented five equally weighted KPI cards, including a visually dominant zero reserved-cash card.
- Holdings were rendered as a wide seven-column table even when a customer owned one asset, creating unnecessary empty space and weak hierarchy.
- The allocation panel used a donut for a single category, which added visual weight without adding information.
- The overview placed activity, orders, and discovery at the same visual level instead of making the market rail secondary.
- The chart was titled `Account value history` but exposed a period change that was actually cash-flow-adjusted performance, making account value and investment performance easy to confuse.
- The discovery rail previously called every value a `Market guide`, even when the backend value was a Slice valuation or an external reference.

## P/L root cause and authority

The backend portfolio projection marks holdings from an active GBP Slice valuation when available, otherwise the persisted non-external market snapshot. It computes each holding's marked value from the user's settled units and the asset's total supply. Cost basis comes from the user's remaining portfolio lots after allocated disposals. Portfolio unrealised P/L is:

`marked holdings value - remaining settled cost basis`

The P/L percentage uses that same numerator and remaining cost basis, so amount and percentage share one sign convention. Deposits and withdrawals do not participate in this calculation.

The UI now consumes the projected `unrealisedPnlMinor` and `unrealisedPnlPercent` values and labels the metric `Unrealised P/L` / `settled cost`; it does not recalculate financial P/L from browser-only values.

## History root cause and fix

Snapshots are persisted by the existing portfolio snapshot worker from the ledger-owned cash aggregate, settled holdings, persisted marks, and lot cost basis. No synthetic points are generated.

The prior cash-flow adjustment reduced all journal entries with a transaction-type sign and then applied a second debit/credit sign. That made a deposit posted as a debit to a customer cash asset appear negative. The corrected projection uses each customer financial account's normal side: a posting on the normal side is positive cash flow and the opposite side is negative. Therefore deposits are positive and withdrawals are negative.

The performance response now includes, for each real snapshot point:

- `cashValueMinor`: total ledger cash, including reservations
- `availableCashMinor`: total cash less active reservations
- `holdingsValueMinor`
- `reservedValueMinor`
- `netExternalCashFlowMinor`: cumulative external cash flow since the first selected point
- `cashFlowAdjustedChangeMinor`: account-value change after removing that cumulative external cash flow

The selected-range `periodChangeMinor` is the final cash-flow-adjusted change. A deposit therefore does not appear as investment gain.

## New information hierarchy

- Three summary cards: Total portfolio value, Holdings value, and Unrealised P/L.
- Cash and reserved cash remain immediately visible inside the total-value card and performance breakdown without promoting zero reserved cash to a KPI.
- Holdings and performance form the primary two-column workspace on desktop.
- Recent activity and recent orders are compact secondary panels.
- Explore the market is a full-width discovery rail with source-labelled values.

## Holding valuation authority

Holding values are projected server-side by `PortfolioQueryService`. Active GBP Slice valuation decisions take precedence over persisted non-external market marks. PriceCharting/external reference values are not substituted for portfolio value.

## Cost-basis authority

The server aggregates remaining `PortfolioLot.totalCostMinor` and subtracts allocated disposal cost. The frontend uses the projected holding and summary P/L fields and only uses the existing presentation helper as a compatibility fallback for older responses.

## Performance calculations

The chart plots real persisted portfolio snapshots only. Tooltip values include timestamp, total account value, holdings value, available cash, reserved cash, and cash-flow-adjusted change when provided. Range controls remain `1D`, `1W`, `1M`, `3M`, `1Y`, and `ALL`.

Allocation is marked holdings-only and uses a compact horizontal bar. Cash is intentionally excluded and explicitly described as such.

## Responsive behavior

- Desktop: compact three-card summary, holdings on the left, performance/allocation stacked on the right, then activity/orders and a full-width market rail.
- Tablet: primary panels stack without fixed-height empty regions; compact holding rows wrap their action safely.
- Mobile: summary cards use one or two columns, holding metrics remain readable, the performance breakdown wraps, and discovery cards stack.

## Tests and validation

- Frontend portfolio route/presentation tests: PASS (`1` file, `1` test).
- Frontend full suite: PASS (`39` files, `154` tests).
- Backend full suite: PASS (`74` files, `321` tests).
- Backend cash-flow sign test: PASS (deposit positive, withdrawal negative, adjusted change excludes cash flow).
- Frontend typecheck: PASS.
- Backend typecheck: PASS.
- Frontend touched-file lint: PASS.
- Backend touched-file lint: PASS.
- Production client/SSR build: PASS locally and during VPS deployment.
- Prisma generate, schema validation, and migration check: PASS; no pending migrations.

## Screenshots

The supplied portfolio mockup is the visual reference. Pre-deployment captures exist at
`C:\Users\Aarons\AppData\Local\Temp\slice-portfolio-qa\portfolio-1920x1080.png`,
`portfolio-1440x900.png`, `portfolio-1280x800.png`, `portfolio-768x1024.png`, and
`portfolio-390x844.png`; those captures are not acceptance evidence for the final grid correction.

Final authenticated browser QA is BLOCKED: after the corrected release was deployed, the existing
staging browser session entered the Secure Session restore screen. One non-destructive `Retry restore`
attempt failed and the browser remained unauthenticated. No sign-in credentials were guessed and no
state-changing workaround was attempted. Therefore responsive, accessibility, console, and network
PASS results for the final release are intentionally not asserted here.

## Deployment

The corrected implementation is commit `4a7f6d6`, pushed to `origin/main`, and deployed to:

- `/opt/slice/releases/20260824-4a7f6d6`
- `/opt/slice/current` → `/opt/slice/releases/20260824-4a7f6d6`
- `/opt/slice/app` → `/opt/slice/releases/20260824-4a7f6d6`

Both `slice-api.service` and `slice-web.service` are active. API health and readiness passed with
PostgreSQL and Redis up, and the local web root returned HTTP 200. No ownership, trading, order,
ledger, wallet, PriceCharting, or initial-offering state was mutated.

Release status: DEPLOYED; authenticated visual QA: BLOCKED by session restore failure.
