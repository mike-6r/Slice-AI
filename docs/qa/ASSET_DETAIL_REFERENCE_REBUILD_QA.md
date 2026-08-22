# Asset Detail Reference Rebuild QA

## Scope

Public `/asset/:slug` detail-page composition rebuilt from the supplied Slice reference. The page remains read-only for catalogue, valuation, ownership projection, history, evidence, and related assets. No fixture lifecycle, ownership, trade, provider, or financial records were created.

## Implemented

- Three-part hero: verified card media, collectible identity/valuation, and ownership & trading.
- Watchlist control beside the title. Logged-out use routes to login instead of silently doing nothing.
- Front/back flip remains real media-backed interaction with hover and keyboard/button fallback.
- Slice valuation, market currency, market status, supply, listings, order book, current position, and recent trades remain API-backed.
- Public ownership summary now includes authoritative currency and anonymous aggregate buckets for collector-retained, investor-owned, and treasury units.
- Guided “New to Slice” flow explains secure, issue, buy, and track/sell steps.
- Slice Grade displays either real AI evidence with enlarged client-side viewing or a truthful unavailable state.
- Reference history uses returned snapshots only and stays empty when the API returns no points.
- Missing fields render as unavailable rather than invented values; external references remain separate from Slice valuation.
- Responsive layout rules cover desktop, tablet, and mobile widths with reduced-motion support.

## Automated gates

| Gate | Result |
| --- | --- |
| Frontend typecheck | PASS |
| Backend typecheck | PASS |
| Frontend tests | PASS — 38 files / 133 tests |
| Backend tests | PASS — 63 suites / 263 tests |
| Targeted lint | PASS |
| Frontend production build | PASS |
| Backend production build | PASS |

## Browser QA

Final release was deployed to staging release `/opt/slice/releases/20260822-final` and verified at 390×844, 768×1024, 1280×900, 1440×900, and 1920×1080.

| Check | Result |
| --- | --- |
| Responsive layout / horizontal overflow | PASS at all five widths |
| Public asset detail, real media, flip control | PASS |
| Ownership breakdown / GBP projection | PASS — 400 retained / 100 investor / 500 available |
| Truthful empty reference history | PASS |
| Console warnings/errors | PASS — none observed |
| Public API smoke: root, marketplace, asset detail | PASS — HTTP 200 |
| Provider calls on render | PASS — no PriceCharting/Ximilar request observed |
| Mutations during QA | 0 |

Screenshots:

- `docs/qa/screenshots/asset-detail-390.png`
- `docs/qa/screenshots/asset-detail-768.png`
- `docs/qa/screenshots/asset-detail-1280.png`
- `docs/qa/screenshots/asset-detail-1440.png`
- `docs/qa/screenshots/asset-detail-1920.png`

## Data-safety acceptance

- No hardcoded collectible-specific price, supply, ownership, trade, or grade values were added.
- No PriceCharting/Ximilar call is initiated by the detail-page render; the page consumes stored public projections.
- Ownership breakdown is aggregate-only and does not expose account IDs or private ownership identities.
- Existing Discord changes in the worktree are intentionally outside this release.
