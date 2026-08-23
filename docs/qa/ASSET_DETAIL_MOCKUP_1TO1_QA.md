# Slice Asset Detail — True 1:1 Visual Reconstruction QA

Date: 2026-08-22  
Route: `/asset/:slug`  
Reference: supplied Slice asset-detail mockup and staging screenshots  
Deployed release: `/opt/slice/releases/20260822-3f52b0d`

## Scope

This pass reconstructed the shared asset-detail workspace for both the Initial Offering
state and the live Umbreon market state. The supplied mockup is the visual contract; the
staging pages are the data-state contract.

The pass was public and read-only. It did not create, approve, issue, list, trade, value,
grade, secure, or otherwise mutate an asset, account, wallet, offering, market, or
provider integration.

## Implementation summary

- One route-scoped responsive composition now serves both asset states.
- Desktop uses a compact three-column hero: media, identity/valuation, and a right
  Ownership & Trading rail spanning the hero height.
- The education strip sits directly below the hero pair and contains four clear steps.
- The lower workspace uses a wide history panel followed by collectible details, Slice
  Grade, and external reference panels.
- The global market snapshot ticker is hidden only on the asset-detail route so the
  page starts at the canonical navigation/content boundary.
- Recent trades use real table columns and calculate totals from real units and price;
  execution side is shown as `—` because the public execution projection does not
  provide an authoritative side.
- External reference no longer repeats Slice valuation.
- Populated Slice Grade is compact and prominent, while evidence remains available
  through the existing accessible lightbox.
- Narrow viewport info tooltips are clamped to the relevant panel and do not clip the
  viewport.
- Similar assets remain projection-driven and do not stretch a sparse result into fake
  content.

## Authority mapping

| UI area | Authoritative source |
| --- | --- |
| Identity, media, condition, publication, Slice valuation | public asset detail projection |
| Reference history | market history projection |
| Issuance and public pre-issuance state | ownership/issuance projection |
| Position, price, supply, availability, ownership breakdown, market state | ownership market summary and signed-in position projections |
| Order book and recent executions | market projections |
| Slice Grade and evidence | persisted public `sliceGrade` projection |
| Similar Collectibles | published marketplace projection |
| Buy / Sell | existing gated workflows |

No new provider, valuation, AI, ownership, or trading authority was introduced.

## Truth and safety checks

- No mockup prices, ownership counts, percentages, history points, or trade rows were
  hard-coded.
- Empty history remains an empty state; no fake chart points or movement percentage is
  rendered.
- Slice valuation and the external reference remain separate, with their currencies
  preserved.
- Raw/Ungraded or collector condition remains separate from Slice Grade and any official
  grading result.
- Buy and Sell remain gated by real market state and settled ownership.
- Loading, error, empty, unauthenticated, and pre-issuance branches remain available.
- No Umbreon, Initial Offering, Charizard, wallet, Stripe, custody, issuance, order, or
  execution mutation was performed.

## Automated QA

| Gate | Result |
| --- | --- |
| Frontend typecheck | PASS |
| Focused marketplace card/layout tests | PASS — 3 files, 13 tests |
| Full frontend tests | PASS — 39 files, 139 tests |
| Asset route lint | PASS |
| Production client and SSR build | PASS |
| Repository-wide lint | BASELINE FAILURE — 4,881 existing Prettier violations in unrelated files; the changed asset route is clean |
| Static mock values introduced | NO |
| Backend financial/business logic changes | NO |

## Browser QA

Browser session: guest/read-only staging session  
Mutation count: **0**

| Check | Result |
| --- | --- |
| Initial Offering asset loads | PASS — identity, media, valuation, offering state, ownership rail and empty-state panels rendered |
| Live Umbreon asset loads | PASS — identity, media, valuation, market state, ownership rail and Slice Grade rendered |
| Canonical hero composition | PASS — media, identity/valuation, and full-height trading rail align at desktop widths |
| Education strip | PASS — four explanatory steps and `/how-it-works` link |
| History and empty-history state | PASS — no fake points or movement shown when no real history exists |
| Slice Grade | PASS — `4 — Very Good` with persisted condition evidence; separate from collector condition |
| External reference | PASS — reference-only presentation; no duplicate Slice valuation |
| Similar Collectibles | PASS — real published projection; sparse results remain compact |
| Accessibility | PASS — named controls, labelled media, regions, keyboard focus, and lightbox access verified |
| 390×844 | PASS — no horizontal overflow |
| 768×1024 | PASS — no horizontal overflow |
| 1366×768 | PASS — no horizontal overflow |
| 1920×1080 | PASS — no horizontal overflow |
| 2560×1440 | PASS — no horizontal overflow |
| Console diagnostics | PASS — no error/warning entries in the final browser diagnostic log |
| Network/auth diagnostics | PASS — no unexpected 401/403/429/500 or provider failures observed; guest position absence is handled as an empty state |
| PriceCharting/Ximilar on render | PASS — 0 direct provider calls; persisted backend projections used |
| Duplicate provider calls / N+1 | PASS — no direct provider calls observed |
| Domain mutations | PASS — 0 |

### Browser data snapshot

The live Umbreon projection remained unchanged and truthful during the pass:

- Slice valuation: `£1,647.17` from the authoritative GBP projection.
- External reference: `$2,151.75 USD` from the persisted PriceCharting reference; it is
  not presented as a Slice order or completed-sale record.
- Identity: `Umbreon VMAX`, `Evolving Skies`, `215/203`, `Mint`.
- Slice Grade: `4 — Very Good`, with the persisted centering/corners/edges/surface data.
- History: no real points, so the page displays the truthful empty history state.
- Ownership/market data, including the live availability projection, was read only.

The API client uses `cache: "no-store"` for JSON and stream reads so a proxy `304`
without a response body is not misclassified as an asset-load failure.

## Screenshot note

The browser service repeatedly returned `Unable to capture screenshot` for this session.
Therefore, final viewport acceptance was verified with DOM geometry and accessibility
snapshots at all five requested widths rather than persisted browser screenshots. The
supplied mockup and staging screenshots remained the visual reference contract.

## Final status

**Visual release gate: PASS.** The reconstructed asset-detail workspace is deployed and
healthy, both Initial Offering and live Umbreon states were verified read-only, and no
domain or provider state changed.
