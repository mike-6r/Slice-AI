# Slice Asset Detail — Mockup Correction QA

Date: 2026-08-22  
Route: `/asset/:slug`  
Reference: supplied Slice asset-detail mockup and staging screenshots

## Scope

The supplied mockup is the visual contract. The staging screenshots were treated as
failure evidence: they showed duplicate valuation/ownership sections, a sparse trading
rail, an oversized grading evidence gallery, and the education strip detached from the
hero composition.

This pass is a public read-only asset-detail correction. It does not create, approve,
issue, list, trade, value, grade, secure, or otherwise mutate an asset.

## Current implementation

The route now has one responsive workspace:

- media and identity/valuation form the left and centre of the hero;
- Ownership & Trading spans the hero's right rail;
- New to Slice is directly beneath the media and identity pair;
- the lower row groups real history, collectible details, Slice Grade, and external reference;
- Similar Collectibles is a compact horizontal rail with overflow controls;
- Slice Grade evidence is collapsed behind a clear control and remains viewable in the existing accessible lightbox.

The illustrative values in the supplied mockup are not hard-coded. Empty, pending, and
pre-issuance states remain backend-driven.

## Authority mapping

| UI area | Authoritative source |
| --- | --- |
| Identity, media, condition, publication, Slice valuation | public asset detail repository (`GET /market/assets/:id`) |
| Reference history | market history repository (`GET /market/assets/:id/history`) |
| Issuance and public pre-issuance state | ownership repository (`GET /market/assets/:slug/ownership/issuance`) |
| Current signed-in position | ownership repository (`GET /me/market/assets/:slug/ownership`) |
| Price, total supply, availability, ownership breakdown, market state | trading market summary (`GET /market/assets/:slug/ownership/market-summary`) |
| Order book | market repository (`GET /market/assets/:id/order-book`) |
| Recent executions | market repository (`GET /market/assets/:id/recent-trades`) |
| Slice Grade and evidence | public asset detail `sliceGrade` projection |
| Similar Collectibles | public marketplace asset listing projection |
| Buy / Sell | existing `/buy/:id` and `/sell/:id` workflows |

No new provider, valuation, AI, ownership, or trading authority was introduced.

## Truth and safety checks

- No mockup prices, ownership counts, percentages, market history, or trade rows were added.
- No fake `0%` movement is rendered when there is no execution/history authority.
- The Slice valuation and external reference remain visibly separate.
- Raw/Ungraded condition remains separate from Slice Grade and any official grade.
- Buy and Sell controls remain gated by real market state and settled ownership.
- Loading, error, empty, unauthenticated, and pre-issuance branches remain available.
- No Umbreon, QA Initial Offering, Charizard, wallet, Stripe, custody, issuance, order, or execution mutation was performed.

## Automated QA

- Frontend typecheck: PASS
- Full frontend tests: PASS — 38 files, 135 tests
- Asset route lint: PASS
- Production client and SSR build: PASS
- Static mock values introduced: NO
- Backend financial/business logic changes: NO

## Browser QA record

Deployed release: `/opt/slice/releases/20260822-asset-detail-a5d8d82`<br>
Browser session: guest/read-only staging session

| Check | Result |
| --- | --- |
| Marketplace → asset navigation | PASS — marketplace and Umbreon detail both loaded |
| Public asset detail loads | PASS — identity, media, valuation, market and lower panels rendered |
| Hero composition and page width | PASS — three-column desktop hero and stacked responsive workspace |
| Ownership & Trading rail | PASS — market state, price, supply, actions, position, order book and trades rendered |
| Buy / Sell workflow links | PASS — Buy is linked to `/buy/:slug`; Sell is gated for unauthenticated users |
| Ownership reconciliation display | PASS — real supply/availability shown; absent breakdown projection is omitted rather than invented |
| New to Slice strip and education link | PASS — four real explanatory steps and `/how-it-works` link |
| Real history / empty-history state | PASS — zero-point history renders the truthful empty state and no movement percentage |
| Slice Grade collapsed evidence and lightbox | PASS — collapsed by default; four evidence images open in the existing accessible lightbox |
| External reference disclaimer | PASS — reference-only copy shown; source amount is `$2,151.75 USD` |
| Similar Collectibles rail | PASS — real marketplace projection rendered with disabled arrows when there is no overflow |
| 390×844 | PASS — no horizontal overflow; captured screenshot |
| 768×1024 | PASS — no horizontal overflow |
| 1366×768 | PASS — no horizontal overflow |
| 1920×1080 | PASS — no horizontal overflow |
| 2560×1440 | PASS — no horizontal overflow |
| Keyboard focus and accessible names | PASS — skip link, named controls, labelled media, regions, and keyboard focus verified |
| Console errors/warnings | PASS — browser error/warning log empty |
| Unexpected 401/403/429/500 | PASS — none observed; expected guest position lookup returned 404 `POSITION_NOT_FOUND` |
| Duplicate provider calls | PASS — no direct provider endpoint calls observed |
| PriceCharting/Ximilar calls on render | PASS — 0 direct provider calls; persisted backend projection used |
| Mutation count | 0 |

### Browser data snapshot

The deployed Umbreon projection remained truthful to staging data during this pass:

- Slice valuation: `£1,647.17` from the authoritative GBP projection.
- External reference: `$2,151.75 USD` from the authoritative PriceCharting reference; it is not
  presented as a Slice order or completed-sale record.
- Ownership: `1,000` total units, `1,000` issued, `9` available; market `OPEN`.
- History: zero real points, so the page displays `No market history yet` and
  `No trading history yet`.
- Slice Grade: `4 — Very Good`, with the real centering/corners/edges/surface evidence.
- The guest session has no settled position, so Buy remains available and Sell is correctly
  gated with a plain-language explanation.

The API client now uses `cache: "no-store"` for JSON and stream reads. This prevents a browser
revalidation `304` from being treated as an asset-load failure when the proxy does not provide a
body for the revalidated response.

The browser QA service captured the requested mobile viewport. Desktop/tablet screenshot capture
timed out in the browser service, but DOM geometry checks passed at all requested widths. The
mobile capture is stored at `docs/qa/screenshots/asset-detail-390-staging-final.png`.

## Final status

Visual release gate: PASS with truthful data-state qualifications above. The composition is
deployed and the browser QA is complete; no domain state or provider operation was created by
this pass.
