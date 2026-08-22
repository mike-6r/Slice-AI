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

To be completed against the deployed staging release:

| Check | Result |
| --- | --- |
| Marketplace → asset navigation | PENDING |
| Public asset detail loads | PENDING |
| Hero composition and page width | PENDING |
| Ownership & Trading rail | PENDING |
| Buy / Sell workflow links | PENDING |
| Ownership reconciliation display | PENDING |
| New to Slice strip and education link | PENDING |
| Real history / empty-history state | PENDING |
| Slice Grade collapsed evidence and lightbox | PENDING |
| External reference disclaimer | PENDING |
| Similar Collectibles rail | PENDING |
| 390×844 | PENDING |
| 768×1024 | PENDING |
| 1366×768 | PENDING |
| 1920×1080 | PENDING |
| 2560×1440 | PENDING |
| Keyboard focus and accessible names | PENDING |
| Console errors/warnings | PENDING |
| Unexpected 401/403/429/500 | PENDING |
| Duplicate provider calls | PENDING |
| PriceCharting/Ximilar calls on render | PENDING |
| Mutation count | 0 |

## Final status

Implementation and automated QA are complete. Deployment/browser results must be recorded
above before calling the visual release gate complete.
