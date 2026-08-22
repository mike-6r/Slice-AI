# Slice Portfolio Full Area Rebuild QA

## Scope

This release rebuilds `/portfolio` as one customer financial and ownership workspace:
Overview, Holdings, Orders, and Activity share the same backend projections and URL-safe view state.
The screenshots supplied for this task were treated as current runtime evidence, not as a final visual target.

## Architecture audit

| UI element | Frontend source | API endpoint | Backend authority |
| --- | --- | --- | --- |
| Portfolio value | `PortfolioKpis` | `GET /api/v1/me/portfolio` | `PortfolioQueryService.portfolioForUser` |
| Available / reserved cash | `PortfolioKpis` | `GET /api/v1/me/portfolio` | `FinancialLedgerService.walletForUser` and active cash reservations |
| Holdings value | `PortfolioKpis`, Holdings | `GET /api/v1/me/portfolio` / `/assets/page` | settled ownership positions plus Slice valuation / eligible market mark |
| Ownership / sellable slices | Holdings rows | `/api/v1/me/portfolio/assets/page` | `OwnershipPosition.settledUnits` and reservations |
| Cost basis / P&L | Holdings and performance panels | `/me/portfolio`, `/assets/page` | portfolio lots, disposals, and backend marks |
| Order state / fill state | Orders | `GET /api/v1/trading/orders` | `TradingOrder` and execution settlement state |
| Activity | Activity | wallet history, account activity, trading executions/orders | journal, customer-safe audit projection, and settled executions |
| Performance history | performance chart | `GET /api/v1/me/portfolio/performance` | persisted `PortfolioSnapshot` buckets |
| Allocation | allocation panel | portfolio summary holdings | marked settled holdings only; cash is not mixed into collectible allocation |
| Market discovery | Explore the market | public assets/trending projection | published public catalogue only |

## Financial authority and reconciliation

The current product ledger is GBP. Amounts remain decimal-free minor-unit strings in the API and are formatted only at the presentation boundary.

The current authoritative equation is:

```text
Portfolio Value = posted cash total + sum of currently marked settled holdings
Available Cash = posted cash total - active cash reservations
Reserved Cash = active cash reservations
Holdings Value = sum of marked settled positions
```

Reserved cash is a subset of posted cash; it is not added a second time to Portfolio Value.
Open-order, withdrawal, and collector-proceeds reservations are surfaced by the wallet projection where present.
The UI exposes a complete total only when the backend marks the required holdings. Missing marks or cost basis remain `Partial` / `Unavailable` and are never converted to zero in the browser.

Collector-retained ownership is included only when it has settled into the user ownership projection. Submission metadata, order intent, and collector configuration do not create a holding.
Cost basis remains backend-projected from portfolio lots and disposals; the frontend does not recalculate it.

## Overview

- Broader Slice workspace width with a primary Portfolio Value treatment.
- Holdings preview, performance, allocation, recent orders/activity, and market discovery now have a deliberate hierarchy rather than nine equal dashboard boxes.
- Performance uses persisted snapshot points only. Zero, one, and sparse-point states remain truthful.
- Allocation is collectible-only and remains empty when marked holding data is unavailable.
- Market discovery uses the public asset projection. Browser-side demo slug suppression and fixture-specific portfolio recomputation were removed.

## Holdings

- Search, asset-class filter, sort, page, and page size are URL state.
- `/api/v1/me/portfolio/assets/page` is a self-scoped backend projection with server-side filtering, sorting, and pagination.
- Customer language uses Slices and sellable Slices; internal “ownership units” wording was removed from the main experience.
- Empty, no-match, loading, and partial valuation states are distinct.
- The existing list/grid control uses the same backend page data; no decorative alternative data source was added.

## Orders

- Orders retain backend status, side, price, fills, cancellation authority, and safe detail dialog.
- Search, side, asset class, date range, and paged status reads are sent to the self-scoped trading endpoint.
- Paginated order reads expose `page`, `pageSize`, `total`, and `totalPages`; cancellation remains a backend mutation with loading/error handling.
- Filled value and fill progress are derived from returned executions/order fields; the UI does not invent fills.

## Activity

- Default Activity excludes repeated sign-in/security noise without deleting audit history.
- Account is an explicit filter for security/session events.
- Trading, cash, ownership, distribution, and account categories remain backed by their corresponding real projections.
- Raw activity references are not prominent in the main row; safe detail remains available.
- Module failures are localized so a failed account-history read does not erase valid cash/trading rows.

## Responsive and accessibility contract

The final CSS pass uses the shared Slice dark/teal/emerald language, a wider desktop reading width, readable tables, larger performance treatment, and mobile card/row layouts.

Required QA widths:

- 390×844 — stacked cards, no desktop table squeeze, compact order/activity rows
- 768×1024 — tablet two-column summaries and readable content
- 1280×800, 1440×900, 1920×1080 — full-width workspace and expanded performance area

The Portfolio uses semantic navigation/tabs, real table markup for desktop tables, labelled filters, focusable actions, visible focus states, non-color status/P&L labels, chart summaries, and reduced-motion overrides.

## Safety / privacy

All Portfolio, Holdings, Orders, Activity, and Performance endpoints are authenticated and self-scoped by `req.actor.userId`. No client route parameter controls the account being queried. No Umbreon, Charizard, controlled offering, wallet ledger, ownership, settlement, or Stripe state is mutated by this rebuild.

## Automated validation

The release gate is:

- frontend typecheck
- backend typecheck
- focused frontend Portfolio/presentation/finance adapter tests
- focused backend holdings-page projection test
- full frontend test suite
- full backend unit test suite
- frontend production build
- backend production build
- Prisma validate/generate when required
- touched-file lint / `git diff --check`

## Deployment and visual QA

Deployment details and screenshots are appended after the staging release and browser pass. A browser-only visual PASS is not inferred from automated tests.

## Known limitations

1. Portfolio summary intentionally remains a compact summary projection and includes its holdings preview source for current compatibility; dedicated Holdings reads use the paged endpoint.
2. Activity is assembled from the existing customer-safe wallet, execution, and account projections; those domain boundaries remain separate for safety.
3. Market discovery remains secondary to owned holdings and performance and does not create portfolio positions.
