# Slice Reference History Graph QA

Date: 2026-08-23  
Route: `/asset/:slug`  
Staging: https://staging.slicecollectable.com

## Scope

This pass is limited to the reference-history graph, authoritative market-history statistics, range controls, hover interaction, and the history card sizing correction. No ownership, order, trade, wallet, ledger, offering, grading, Twilio, Resend, or Stripe data was changed.

## Root causes found

- The chart used a decorative smooth curve and exposed only a latest-value marker. It did not make persisted observations discoverable and had no point tooltip or crosshair.
- The history query filtered at the range boundary before selecting a baseline, so a range could contain observations yet lack the earlier point needed for an honest movement calculation. The frontend then had to infer summary statistics from the returned array.
- `REFERENCE VALUE` and `VALUE HISTORY` were decorative labels rather than two defined views. They could not provide a meaningful interaction.
- The history panel row sizing and range-control layout made the controls cramped in the master page.

## History source and contract

The backend selects persisted, valid PriceCharting observations for the asset. The browser never calls PriceCharting directly, on hover, or per tooltip. The response now includes the selected range, source, currency, real points, starting/latest values, absolute and percentage movement, high/low, observation counts, range boundaries, actual coverage, refresh time, availability, and an unavailable reason.

Range semantics are deterministic:

1. Range end is the latest persisted valid observation.
2. Range start is `rangeEnd - selectedWindow`.
3. The starting point is the latest observation at or before that boundary. If none exists, the earliest visible point is used and movement remains unavailable because coverage is incomplete.
4. High and low are calculated from real observations visible in the selected range.
5. Percentage movement is backend-authoritative basis points: `(latest - start) * 10000 / start`, using integer arithmetic and the persisted currency. No FX is introduced.

The current Umbreon history covers 7d 12h (648,138 seconds). The selected 30D view therefore correctly reports movement as unavailable even though eight persisted observations exist. The 7D view has a real boundary observation plus five in-range observations, six displayed points total. Downsampling, when required, keeps real latest-per-time-bucket observations, preserves endpoints, and never interpolates synthetic data.

## Graph interaction

- The line connects actual observations linearly; it does not imply a continuous traded market.
- Sparse observations have visible, subtle markers. The active marker enlarges on hover/tap.
- Desktop pointer interaction provides a vertical crosshair and HTML tooltip with price, timestamp, previous-observation change, selected-range-start change, source, and refresh time.
- The y-axis uses a padded data domain and precise dynamic labels rather than repeated `$2K` labels.
- The x-axis uses real observation dates/times appropriate to the selected range.
- Range controls query the persisted Slice history contract for each range and remain one row on desktop; mobile controls scroll horizontally rather than wrap into the chart.
- The heading is now a single `Reference value / Value history` section with `PriceCharting reference history` source context. It does not expose a fake second tab.

## Current Umbreon verification

| Metric | Verified value |
|---|---|
| Provider | PriceCharting |
| Persisted observations | 8 |
| Starting value, 30D | $2,225.00 USD |
| Latest value | $2,025.00 USD |
| 24H movement | Available, -5.89% / -$126.75 |
| 7D movement | Available, -8.98% / -$200.00 |
| 30D movement | Not available |
| 30D reason | History currently covers 7d 12h |
| Range high | $2,225.00 USD |
| Range low | $2,025.00 USD |
| Last refreshed | 23 Aug 2026, 18:55 UTC (shown as 4h ago during browser QA) |
| External Reference current value | $2,025.00 USD |

The latest history point and External Reference projection agree exactly. No provider calls or lifecycle mutations occurred during browser QA.

## Card sizing and responsive QA

The desktop history card is constrained to approximately 315px including its compact stats footer. The lower-row layout remains intact. Browser checks found no horizontal overflow at any required viewport.

| Viewport | Result | Evidence |
|---|---|---|
| 1920×1080 | PASS | `docs/qa/screenshots/asset-history-after-1920.png` |
| 1440×900 | PASS | `docs/qa/screenshots/asset-history-after-1440.png` |
| 1280×800 | PASS | `docs/qa/screenshots/asset-history-after-1280.png` |
| 768×1024 | PASS | `docs/qa/screenshots/asset-history-after-768.png` |
| 390×844 | PASS | `docs/qa/screenshots/asset-history-after-390.png` |

The final deployed DOM was rechecked at all five widths: axis labels remained visible, the history card stayed within the viewport, and mobile controls did not wrap into the chart.

## Browser/network/accessibility QA

- Console errors/warnings: none. The only earlier console output was the standard React DevTools informational message.
- Browser provider calls: 0 PriceCharting, 0 Ximilar.
- Hover/range interactions: PASS; 7D displays `-8.98% (-$200.00)` from the deployed API contract.
- Accessibility: PASS; chart has an accessible image label, range buttons are named, decorative images are hidden from assistive technology, and no duplicate IDs or unnamed buttons were found.
- Mutations: 0. No ownership, offering, market, order, execution, wallet, ledger, or collectible state changed.

## Tests and deployment

- Backend reference-metrics suite: PASS — 8 tests.
- Frontend tests: PASS — 39 files, 139 tests; adapter tests 15/15.
- Frontend typecheck: PASS.
- Frontend build: PASS.
- Backend build: PASS.
- Targeted lint for changed frontend/backend files: PASS.
- Read-only staging API contract checks: PASS.
- Full backend typecheck: existing unrelated failure in `server/src/modules/finance/application/portfolio-query.service.spec.ts:23` (`currency` literal type mismatch); no graph files are involved.

Deployed commit: `dcebda816b99030775c152531e17c82eb5993074`  
VPS release: `/opt/slice/releases/20260823-dcebda816b99030775c152531e17c82eb5993074`  
API service: PASS / active  
Web service: PASS / active  
Health: PASS  
Ready: PASS  
Public root: HTTP 200

## Final status

GO for the narrowly scoped reference-history graph and statistics pass. The unrelated pre-existing backend typecheck issue remains outside this task and should be resolved before treating the entire repository as a strict all-green release gate.
