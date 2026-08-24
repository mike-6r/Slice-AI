# Slice Similar Assets Mockup QA

## Scope

This pass covers only the Similar Assets rail at the bottom of the public asset
detail page. It does not create or change assets, ownership, offerings, orders,
executions, wallets, ledgers, valuations, PriceCharting records, grading, or
provider state.

## Root cause

The asset route was not using the existing backend similarity endpoint. It was
calling the general marketplace list with a category filter and rendering the
result through an older compact card. That allowed a full-asset valuation to be
shown without a price label, collapsed the one-result grid around its only item,
and inherited sizing from the lower asset-detail grid. The old implementation
also had no effective horizontal rail behavior.

## Implementation

### Frontend

- `src/routes/asset.$id.tsx`
  - calls `/market/assets/:slug/similar` through `services.market.similar`;
  - renders a full-width discovery rail with real links and controlled native
    horizontal scrolling;
  - uses explicit labels for Last sale, Initial offering, Slice valuation, and
    unavailable prices;
  - only renders movement supplied by the backend;
  - renders real market-state chips and approved public thumbnails;
  - keeps loading, error, empty, one-result, and overflow states intentional.
- `src/domain/market.ts`, `src/data/repositories.ts`,
  `src/services/app-services.ts`, and
  `src/repositories/http-repositories.ts` define and map the compact public
  SimilarAsset contract.
- `src/styles.css` contains the terminal rail cascade. The outer section spans
  the asset-page content width; cards use stable horizontal widths instead of
  flex growth; mobile uses touch scrolling without page-level overflow.

### Backend

- `server/src/modules/market/market.service.ts`
  - excludes the current asset;
  - restricts results to published, beta-eligible public assets;
  - ranks same-set results first, then same-category results from another set;
  - bounds the result count to 24;
  - returns a compact projection rather than a full asset-detail payload;
  - signs only the first approved, safe public thumbnail;
  - derives price semantics in this order: settled Slice execution, active
    Initial Offering unit price, approved Slice valuation, unavailable;
  - derives 24-hour movement only when a settled execution baseline at least 24
    hours old exists;
  - never substitutes external reference data for a Slice sale or movement.

## Data semantics

| Display | Backend authority |
| --- | --- |
| Last sale · £X / Slice | Latest settled `TradingExecution` price; current ledger currency is GBP. |
| Initial offering · £X / Slice | Active `InitialOffering.pricePerUnitMinor`. |
| Slice valuation · £X | Approved `ValuationDecision`; this is a whole-asset valuation and is never shown as `/ Slice`. |
| 24h movement | Settled execution price versus the latest settled execution at least 24 hours old; omitted when unavailable. |
| Live market / Initial offering / Market closed / Reference only | Current public trading/offering lifecycle projection. |

External PriceCharting observations are intentionally absent from this compact
rail. They remain available in the existing labelled reference surfaces.

## Layout contract

- Desktop outer panel: full assigned asset-page width, roughly 220–260px total
  height depending on content.
- Desktop card: 320px wide by roughly 140px high; four cards can fit at common
  desktop content widths and a fifth can remain partially visible when there is
  overflow.
- Tablet: two cards are visible with horizontal swipe.
- Mobile: one card is visible with a next-card hint when real overflow exists;
  no page-level horizontal scrolling is introduced.
- One real result remains a normal-width card inside a full-width panel. No fake
  filler assets are generated.

## Accessibility

- Every recommendation is a real link to the public asset route.
- Previous and next are real buttons with `Previous similar assets` and `Next
  similar assets` labels.
- Disabled carousel controls expose the disabled state and are not active when
  there is no overflow.
- Thumbnail alt text comes from the backend public projection.
- Market state uses both text and color, not color alone.
- Reduced-motion users do not receive the shimmer or smooth-scroll animation.

## Automated QA

- Frontend typecheck: PASS
- Focused HTTP repository tests: PASS — 17 tests
- Backend Similar Assets service tests: PASS — 2 tests
- Frontend production client + SSR build: PASS
- Backend production build: PASS
- Frontend focused lint: PASS
- Backend market-service lint: PASS
- `git diff --check`: PASS
- Full backend typecheck: BLOCKED by the pre-existing unrelated
  `server/src/modules/finance/application/portfolio-query.service.spec.ts` mock
  currency inference error (`string` versus the existing literal `"GBP"`).

## Browser QA / deployment

- Runtime commit: `5851e9e`
- Active deployment sync: `38d7a0a` (documentation-only)
- Release: `/opt/slice/releases/20260823-38d7a0a`
- `/opt/slice/current`: points to the release above
- `/opt/slice/app`: points to the release above
- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: PASS
- `/ready`: PASS — PostgreSQL and Redis up
- Public asset page: HTTP 200
- Similar endpoint: HTTP 200 with the truthful sparse response `{ "items": [] }`
- Browser console: only the standard React DevTools informational message; no
  application errors
- Page-level horizontal overflow at the available browser viewport (1280px):
  none

The live staging API currently returns zero similar assets for the Umbreon slug.
The page keeps the full-width panel visible and renders a truthful
“No similar assets yet” empty state rather than leaving a blank area or filling
the rail with fake cards. The full-width rail, one-result behavior, fixed card
widths, and responsive media rules remain implemented for when eligible
comparable assets exist.

The browser surface used for this pass exposes a fixed 1280×720 viewport; the
requested 1920×1080, 1440×900, 1280×800, 768×1024, and 390×844 breakpoints were
verified against the terminal CSS rules and static layout constraints, while a
live screenshot was captured at the available viewport. No application or
page-level horizontal overflow was observed.

## Mutation safety

This is a read-only recommendation projection and presentation change. No
database migration or lifecycle mutation is included. No real Umbreon or
Charizard state is changed.

## Final status

Implementation: COMPLETE.

Deployment: PASS.
