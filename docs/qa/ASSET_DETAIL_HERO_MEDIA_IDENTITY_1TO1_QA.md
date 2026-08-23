# Slice Asset Hero — Media + Identity 1:1 QA

## Scope

This pass reconstructs only the public asset-detail hero from the supplied
mockup: media viewer, identity/status, watchlist, valuation/reference, and the
single trust/information strip directly beneath those panels. Ownership &
Trading, New to Slice, history, Slice Grade, Similar Collectibles, Portfolio,
wallet, ledger, orders, and provider integrations remain separate sections.

## Files

- Route: `src/routes/asset.$id.tsx`
- Public presentation: `src/components/marketplace/market-api-presentation.ts`
- Public response mapping: `src/repositories/http-repositories.ts`
- Public asset domain: `src/domain/asset.ts`
- Hero styling: `src/styles.css`
- Backend projection: `server/src/modules/market/market.service.ts`

## Root cause of the old layout

The route placed media, identity, and the full Ownership & Trading/readiness
rail in a three-column grid. Later CSS passes added competing grid templates,
fixed row heights, and narrow card-stage widths. That made the media and
identity surfaces materially smaller than the reference and caused the hero to
read like a dashboard rather than one premium two-panel asset surface.

## New composition and measurements

- Desktop hero: deliberate `0.88fr / 1.12fr` media-to-identity grid.
- Desktop hero panel height: minimum `39rem`, with aligned media and identity.
- Desktop canvas: maximum `96rem` with controlled viewport margins.
- Media viewer: full-height portrait stage, `object-fit: contain`, no crop.
- Identity panel: one status/valuation divider and two aligned valuation columns.
- Trust strip: one full-width panel with four logical columns and internal
  dividers; it is not four separate cards.
- At 900px and below: intentional single-column hero and 2×2 trust layout.
- At 520px and below: one-column trust rows and stacked valuation columns.

## Data and safety

The existing public `/market/assets/:slug` projection already supplied safe
media, lifecycle, valuation, external reference, ownership, and trading data.
This pass minimally exposes/maps the already-safe publication, custody,
insurance, and coarse verification state needed by the trust strip. It does
not expose review records, staff notes, custody locations, provider IDs,
object-storage keys, collector identity, or valuation reasoning.

The hero uses the approved Slice valuation only for `SLICE VALUATION`; it does
not fall back to a provider reference for that value. PriceCharting remains an
informational external reference and is not called from the browser.

## Trust mapping

- Collector Verified: shown only when the public asset has an approved
  submission-backed `VERIFIED` projection.
- Custodial Security: shown as secured only for public `SECURED` custody; the
  copy uses Slice's approved custody process and does not claim insurance.
- Fractional Ownership: shows issued Slices only when the public ownership
  projection has a safe integer issued count; otherwise it explains that
  issuance is not yet complete.
- Trade Freely: promises marketplace buying/selling only when lifecycle state
  is `LIVE` with both buy and sell enabled; otherwise it uses readiness copy.

## Functional behavior

- Front/back media is sourced from approved public-safe media only.
- Flip uses the real back image, accessible button, keyboard state, and reduced
  motion rules already present in the page stylesheet.
- Media dots select the real front/back state.
- Watchlist continues to use the persisted watchlist repository and shows a
  visible retry message on mutation failure; guest behavior remains sign-in.
- Initial Offering info remains the existing keyboard-accessible disclosure.

## Automated checks

- Frontend typecheck: PASS.
- Frontend tests: PASS — 39 files / 138 tests.
- Focused marketplace card test: PASS — 6 tests.
- Frontend production client + SSR build: PASS.
- Prisma validation: PASS.
- Backend production build: PASS.
- Full frontend lint: existing repository-wide Prettier failures outside this
  pass; touched frontend files pass targeted ESLint/Prettier checks.
- Backend typecheck: existing finance fixture literal-type failure outside this
  pass (`portfolio-query.service.spec.ts`).

## Browser screenshot QA

Required routes: live Umbreon and the QA Initial Offering asset.

Required viewports: 1920×1080, 1440×900, 1280×800, 768×1024, 390×844.

Status: pending deployment and final browser capture. Record screenshot paths,
console/network results, flip, watchlist, info disclosure, and refresh-state
results here after the staging pass. No economic mutation is required.

## Release gate

The implementation is ready for staging deployment. Final visual verdict is
not claimed until the deployed screenshots are compared directly with the
supplied mockup at the primary desktop size and checked at all required
responsive widths.
