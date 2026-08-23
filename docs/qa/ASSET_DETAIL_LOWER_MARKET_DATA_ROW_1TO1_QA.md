# Slice lower market-data row QA

Status: complete

This pass covers only the lower four-panel asset-detail row:

1. Reference Value / Value History
2. Collectible Details
3. Slice Grade
4. External Reference

The hero/media, asset identity, ownership/trading, onboarding, similar collectibles, and footer were not redesigned.

## Implementation

Changed files:

- `src/components/Chart.tsx`
- `src/routes/asset.$id.tsx`
- `src/styles.css`
- `src/domain/market.ts`
- `src/data/repositories.ts`
- `src/repositories/http-repositories.ts`
- `src/repositories/http-repositories.test.ts`

The row uses a deliberate desktop grid rather than equal tracks:

```text
history 2.35fr | details .85fr | Slice Grade 1.12fr | external reference .98fr
```

The supplied reference is approximately a 1,950px by 565px row with the history panel as the visual anchor. The deployed 1920px viewport uses a 1,536px content row with these measured tracks:

```text
history 660px | details 239px | Slice Grade 314px | external reference 275px
gap 16px | aligned height 560px
```

At 1440px the measured tracks are 580/210/288/242px at 560px high. At narrower widths the history and external-reference panels span the full row, details and Slice Grade remain paired, and at mobile all four panels stack in the requested order.

## Data authority

- Reference history is mapped from the existing backend history response, including `source`, `movementBps`, and selected range metadata.
- The lower history panel renders persisted `PRICECHARTING` history only. It does not reinterpret Slice valuation points as external reference history.
- PriceCharting is never called from the browser. The deployed page contains no provider script or direct provider request.
- Umbreon’s staging history returned eight persisted `PRICECHARTING` points in USD; the chart and footer remain USD (`$2,225.00` to `$2,025.00`).
- Slice valuation remains a separately labelled value in the external-reference panel (`£1,647.17`) and is formatted using its authoritative backend currency.
- Slice Grade continues to use the public safe projection and signed evidence URLs. The grade emblem is CSS geometry; evidence remains behind the existing modal/lightbox CTA.
- No wallets, ledgers, ownership, orders, trades, provider refreshes, or financial records were mutated.

## Presentation contract

- Reference Value / Value History keeps all six backend-supported ranges: 24H, 7D, 30D, 90D, 1Y, and ALL.
- The empty state preserves the full chart-sized area and says `No market history yet` / `History will appear as real market snapshots are collected.`
- History footer values use actual first/latest points, point count, and backend movement; insufficient reference history is `Not available`.
- The incorrect `No trading history yet` wording is absent from the reference-history panel.
- Collectible Details shows category, set, year, card number, and condition with readable row dividers; missing values are `—`.
- Slice Grade shows the real overall estimate, qualitative label, four component scores, full safety disclaimer, and the evidence CTA only when evidence exists.
- External Reference separates the provider reference, update timestamp, informational disclaimer, and Slice valuation.

## Browser QA

The staging route was checked read-only at every required width. `document.documentElement.scrollWidth` remained within the viewport at each width, and all lower-row panel text was present without clipped component labels or the old trading-history wording.

| Viewport | Result | Lower-row geometry |
| --- | --- | --- |
| 1920×1080 | PASS | 660/239/314/275px, all 560px high |
| 1440×900 | PASS | 580/210/288/242px, all 560px high |
| 1280×800 | PASS | history 1214px; details/grade 790/409px; external 1214px; all 560px high |
| 768×1024 | PASS | history/external 721px; details/grade 353/353px; all 560px high |
| 390×844 | PASS | all panels 355px wide; stacked; no horizontal overflow |

Screenshots captured under `docs/qa/screenshots/`:

- `asset-lower-row-1920.png`
- `asset-lower-row-1440.png`
- `asset-lower-row-1280.png`
- `asset-lower-row-768.png`
- `asset-lower-row-390.png`
- `asset-lower-row-1920-focus.png`
- `asset-lower-row-390-focus.png`
- `asset-lower-row-empty-1440.png`

The focused screenshots confirm the chart, four aligned footer metrics, readable Details rows, hex grade emblem, full disclaimer, evidence CTA, and clean External Reference surface. The QA Initial Offering asset confirmed the full empty chart geometry, `No market history yet`, `Not available` metrics, no `0.00%`, and `No external reference` without introducing data.

Accessibility checks:

- Reference history has a labelled `role="img"` chart.
- All range controls are keyboard buttons with `aria-pressed` state.
- Grade and evidence information is present as text, not colour alone.
- Evidence CTA remains an accessible button and opens the existing evidence viewer only when requested.
- External-reference disclaimer remains readable text.

Console errors: none observed at all five widths and the empty-state route.
Network/provider errors: none observed.
Direct PriceCharting calls: 0.
Direct Ximilar calls: 0.
Mutations: 0.

## Automated checks

- Frontend typecheck: PASS
- Production client + SSR build: PASS
- Focused HTTP repository tests: PASS — 15 tests
- Full frontend suite: PASS — 39 files / 139 tests
- Targeted ESLint for changed TypeScript files: PASS
- Repository-wide `npm run lint`: baseline FAIL — 4,886 existing Prettier diagnostics across unrelated files; the targeted changed-file run passed.
- Backend files changed: none; existing backend history/projection contract was reused.

## Deployment

- Commit: `9b9790863814203bf2421e7373c4d44b893d522d`
- Release: `/opt/slice/releases/20260823-9b9790863814203bf2421e7373c4d44b893d522d`
- `/opt/slice/current`: `/opt/slice/releases/20260823-9b9790863814203bf2421e7373c4d44b893d522d`
- `/opt/slice/app`: `/opt/slice/releases/20260823-9b9790863814203bf2421e7373c4d44b893d522d`
- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: PASS
- `/ready`: PASS — PostgreSQL and Redis up
- staging root: HTTP 200

## Final status

GO — deployed staging screenshots match the supplied four-panel hierarchy, with backend-authoritative values and no data or financial mutations.
