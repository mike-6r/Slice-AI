# Slice Asset Detail Master Layout QA

Date: 2026-08-23  
Staging: https://staging.slicecollectable.com/asset/2021-umbreon-vmax-evolving-skies-215-203  
Layout QA route: `/asset/qa-test-initial-offering-card`  
Deployed code commit: `cf8890d7b623544a28b7492f217df8f34420ff52`  
Deployed release: `/opt/slice/releases/20260823-cf8890d7b623544a28b7492f217df8f34420ff52`

## Root cause of oversizing

The page had several historical asset-detail cascades competing for the same outer geometry. The later rules rebuilt the hero as a two-column `42% / 58%` layout, gave the media showcase `31rem`/`34rem` minimum heights, allowed identity padding and title sizing to expand, and left the readiness rail and lower panels with large internal minimums. The lower-row cascade also imposed `560px` minimum-height panels and a `330px` minimum chart region. Those child-level dimensions overrode the intended page composition and produced a hero over 600px tall, a readiness section over 1,200px tall, and lower panels around 560px tall.

The correction establishes one terminal page-level master cascade in `src/styles.css`. It owns the outer rows, columns, section heights, and desktop rail density. Child rules only fill their assigned grid cells; no transform, zoom, global font scaling, or data change is used.

## Master container

- Maximum width: `1520px`
- Horizontal padding: `24px` desktop; `16px` tablet; `10px` mobile
- Desktop gap: `16px`
- At 1920px the rendered container is `1520px` wide and centered at `x=193px` in the 1905px browser content area.

## Desktop master grid

At `>=1280px` the page uses `repeat(12, minmax(0, 1fr))` with five fixed master rows:

| Row | Content | Height |
| --- | --- | ---: |
| 1 | Hero | 430px |
| 2 | Trust strip | 52px |
| 3 | New to Slice | 200px |
| 4 | Lower data | 315px |
| 5 | Similar collectibles | 160px |

All row gaps are 16px.

## Hero

At 1920px:

- Media: 3 columns, `372px` wide
- Identity: 5 columns, `620px` wide
- Trading: 4 columns, `496px` wide
- Hero height: `430px`
- Media and identity height: `430px`
- Media image stage/footer: bounded image stage with a `56px` footer; image uses contained sizing
- Identity padding: `28px 30px`
- Identity title: `40px`, bounded rather than viewport-scaled

The 1440px and 1280px measurements preserve the same 3/5/4 relationship:

- 1440px: media `336px`, identity `560px`, trading `448px`
- 1280px: media `296px`, identity `494px`, trading `395px`

## Trading rail

- Columns: 9–12
- Grid span: `grid-row: 1 / span 3` because the trust strip occupies its own grid band between the hero and education row; visually the rail continues from the hero top through the bottom of New to Slice.
- Combined height: `714px` (`430 + 16 + 52 + 16 + 200`)
- Final desktop content measurement: `clientHeight=712px`, `scrollHeight=712px` at 1920px, so the compact rail fits without internal clipping.
- The internal spacing pass only tightened padding and gaps; it did not remove or invent trading data.

## New to Slice

- Columns: 1–8
- Height: `200px`
- Four steps remain horizontal on desktop with compact icons and bounded text.
- 768px and 390px use normal content-driven height and stacked step flow.

## Lower row

Full-width nested 12-column grid at desktop:

- History: 5 columns; `624px` at 1920px
- Details: 2 columns; `240px`
- Slice Grade: 3 columns; `368px`
- External Reference: 2 columns; `240px`
- Height: `315px` for every panel

The corresponding 1440px widths are `564 / 216 / 332 / 216px`; at 1280px they are `498 / 190 / 292 / 190px`. The history panel keeps a bounded header/chart/metrics composition and empty history does not increase the row height. External reference content fits without overflow after the compact metadata spacing pass.

## Similar collectibles

- Full width: 12 columns
- Height: `160px` desktop
- Compact horizontal item width: approximately `190–220px`
- Thumbnail height: approximately `78px`
- Tablet/mobile becomes content-driven where required rather than retaining desktop height.

## Responsive QA

Browser QA used full-page screenshots at every required viewport. No horizontal overflow was observed (`document.documentElement.scrollWidth <= viewport width` in all cases).

| Viewport | Result | Notes |
| --- | --- | --- |
| 1920×1080 | PASS | 1520px centered shell; 430px hero; 714px rail; 315px lower row; no rail overflow |
| 1440×900 | PASS | 1377px shell; same 3/5/4 geometry; no horizontal overflow |
| 1280×800 | PASS | Desktop 3/5/4 retained; compact lower row remains 315px |
| 768×1024 | PASS | Desktop grid removed; stacked hero/trading/education; lower data reflows to two columns |
| 390×844 | PASS | Single-column mobile flow; no fixed desktop heights; no horizontal overflow |

## Full-page screenshots

- Before: `docs/qa/screenshots/asset-master-before-1920.png`
- After 1920: `docs/qa/screenshots/asset-master-after-1920.png`
- After 1440: `docs/qa/screenshots/asset-master-after-1440.png`
- After 1280: `docs/qa/screenshots/asset-master-after-1280.png`
- After 768: `docs/qa/screenshots/asset-master-after-768.png`
- After 390: `docs/qa/screenshots/asset-master-after-390.png`

Full-page screenshot review: PASS. The desktop composition now reads as one premium marketplace workspace: hero, trust strip, education, lower market data, and similar assets are visible as coordinated sections rather than oversized isolated panels. The trading rail is complete within its assigned span after the final compact-spacing pass.

## QA and safety

- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm test -- --run`: 39 files / 139 tests PASS
- `git diff --check`: PASS; only existing line-ending warnings were reported for the dirty worktree
- Browser console errors: none observed at the five required widths
- Data mutation: NO
- Backend/API/domain state changed: NO
- Ownership, trades, market history, PriceCharting, valuation, grade, custody, wallet, ledger, and offering data were not changed.
- Unrelated dirty worktree files were not staged or committed.
- Staging services after deployment: API active, web active, `/health` 200/ok, `/ready` ready, root 200.

## Final acceptance

- Individual components still massive: **NO**
- Master page grid controls all outer dimensions: **YES**
- Full-page screenshot review: **PASS**
- Final status: **GO**
