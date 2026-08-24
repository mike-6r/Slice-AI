# Slice Ownership Explainer Cleanup QA

Date: 2026-08-23  
Release: `20260823-b3814f4`  
Commit: `b3814f4`

## Scope

This pass changes only the existing asset-detail “New to Slice?” explainer. It does not change asset media, marketplace data, ownership, issuance, pricing, or other financial state.

## Root cause and implementation

The detached mint squares came from a stale base rule on `.asset-how-it-works__grid b` that retained a filled mint background after a later override reset the badge dimensions but not its background or margin. The final cascade now defines the number element as an intentional dark `01`–`04` badge with an explicit border, size, typography, and zero margin.

The broken connector fragments came from a late `.asset-how-it-works__step::after` rule. That connector rule was removed entirely; connectors are not merely clipped or hidden.

The four existing Lucide icons remain mapped to their existing meanings:

| Step | Icon | Meaning |
| --- | --- | --- |
| 01 | `ShieldCheck` | Slice secures the collectible |
| 02 | `Layers3` | Ownership units are issued |
| 03 | `ShoppingBag` | Buy your position |
| 04 | `PieChart` | Track & sell later |

The grid uses equal desktop columns and equal desktop/tablet row sizing. Its content is flex/grid-aligned as icon and badge, title, then description. The “Learn how Slice works” link is outside the step grid, directly below it, and points to `/how-it-works`. The existing native `details`/`summary` info control remains keyboard-accessible and functional.

## Browser QA

The deployed asset route was checked at the requested responsive modes. The browser automation surface capped the effective desktop canvas at 1430 CSS pixels when 1920px and 1440px were requested; both remained in the same four-column desktop mode. 1280px used the full requested desktop mode. 768px used 2×2 and 390px used a natural single column.

| Requested width | Effective canvas | Layout | Result |
| ---: | ---: | --- | --- |
| 1920 | 1430 (browser cap) | 4 columns; 200px section; equal 104.39px cards | PASS* |
| 1440 | 1430 (browser cap) | 4 columns; 200px section; equal 104.39px cards | PASS* |
| 1280 | 1270 | 4 columns; 200px section; equal 104.39px cards | PASS |
| 768 | 758 | 2 columns × 2 rows; 337.61px section; equal 106px cards | PASS |
| 390 | 380 | 1 column; 566.95px natural section; no clipping | PASS |

Across all checks:

- Number badges are exactly `01`, `02`, `03`, `04`; their background is the dark badge surface, not mint.
- All connector pseudo-elements compute to `none`.
- Copy `scrollHeight` fits within each card’s client height.
- No horizontal overflow was detected.
- The section remains within the existing compact footprint; it was not materially enlarged.
- Heading structure, section labelling, info summary label, tooltip role, and link text are present.
- Browser console error/warning logs were empty. The deployed route returned HTTP 200; no failed render request surfaced during the pass.

`*` Desktop widths above the browser surface’s 1430px cap were verified through the same desktop CSS mode; a true 1920px screenshot could not be captured by the browser surface in this session.

## Automated checks

- Frontend typecheck: PASS — `npm run typecheck`
- Focused marketplace tests: PASS — 2 files, 11 tests
- Production build: PASS — Vite client and SSR builds
- Lint: FAIL — existing repository-wide Prettier baseline, 4,887 errors and 9 warnings. No lint autofix was applied because it would touch unrelated files.

## Deployment

- Pushed `b3814f4` to `origin/main`.
- Deployed release: `/opt/slice/releases/20260823-b3814f4`
- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: PASS
- `/ready`: PASS (Postgres and Redis up)
- Asset route: HTTP 200

No database migration or financial mutation was made. Screenshot capture was attempted but the browser surface returned “Unable to capture screenshot”; no fake screenshot artifact is included.

## Final status

GO for this explainer cleanup. The repository lint baseline remains a separate release-quality issue and is not caused by this CSS-only change.
