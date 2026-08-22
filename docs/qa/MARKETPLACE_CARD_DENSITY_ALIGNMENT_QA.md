# Marketplace Card Density & Alignment QA

Date: 2026-08-22  
Scope: public `/marketplace` grid and `MarketAssetCard` presentation  
Deployment: pending final staging verification

## Change summary

- Capped normal cards at a readable maximum width and let the results column add
  columns naturally: four on a wide desktop, three on standard desktop, two on
  tablet, and one on mobile.
- Kept a small catalogue intentionally left-aligned instead of stretching two
  cards across the entire results column.
- Reserved stable card zones for title/identity, condition, valuation/reference,
  market/listings, ownership, and the primary action so optional content does
  not change the row rhythm.
- Reduced the media stage and supporting-data spacing without changing media
  selection or valuation logic.
- Kept the hover treatment transform-only and explicitly returns the card to
  its idle transform when the pointer leaves. Reduced-motion users receive no
  card movement.
- Changed the identity separator to `Set · card number`, made missing identity
  data explicit, and fixed singular listing/unit grammar.
- Preserved the existing bookmark mutation and public media gallery.
- Changed the existing cursor page request from 48 to 12. The backend remains
  the pagination authority; “Load more” is shown only when `hasMore` is true.

## Acceptance matrix

| Check | Result | Evidence |
|---|---|---|
| Card alignment zones | PASS | `MarketAssetCard` focused tests and staging geometry checks |
| Title max two lines | PASS | CSS clamp/height and staging screenshots |
| Media containment/no distortion | PASS | `object-fit: contain`, responsive screenshots |
| Missing reference placeholder | PASS | Structural `Market reference / Unavailable` block |
| Singular/plural listing grammar | PASS | `MarketAssetCard.test.tsx` |
| Ownership CTA rhythm | PASS | Stable body flex column and bottom-anchored primary CTA |
| Hover reset | PASS | CSS hover-only transform with idle override |
| Grid density | PASS | 4/3/3/2/1 column geometry at required widths |
| Cursor pagination | PASS | 12-item request and guarded “Load more” |
| Watchlist control | PASS | Existing mutation path preserved; no API changes |
| Accessibility | PASS | Existing semantic links/buttons, image alt text, labels, and focus checks |
| Console/network | PASS | No marketplace console errors or unexpected failures in staging |

## Responsive evidence

Required widths: 390×844, 768×1024, 1280×800, 1440×900, 1920×1080.

Screenshots are stored beside this document under `docs/qa/screenshots/`.
The current controlled-beta catalogue contains two published assets, so the
four-plus-card visual state is validated from the deterministic grid geometry
and card component tests without creating catalogue records or fake data.

## Release gates

- Focused marketplace-card tests: PASS
- Full frontend test suite: PASS
- Frontend typecheck: PASS
- Touched frontend lint: PASS
- Production client build: PASS
- Production SSR build: PASS
- Backend changes: NONE; backend test suite not required for this presentation-only change
- Mutation count during QA: 0
