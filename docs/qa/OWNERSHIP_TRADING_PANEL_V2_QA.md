# Slice Ownership & Trading Panel V2 QA

Date: 2026-08-23  
Deployment: `07b9335`  
VPS release: `/opt/slice/releases/20260823-07b9335b451f3a249aa14484b0f02f1a7ed2d5c6`

## Scope

This pass implements the requested Ownership & Trading Panel V2 composition on the public asset page. The active route uses the V2 layout: a large Price per Slice card, stacked Slices Available and Total Supply cards, Buy/Sell actions, reconciled supply breakdown, position, order book, and recent public trades.

The V1 brief remains the shared visual and data contract for the three-metric alternative composition. No second public variant selector was introduced. Both briefs use the same backend-authoritative market summary, settled ownership positions, listed liquidity, market state, and public execution projection.

Unrelated Discord bot, README, Stripe, Twilio, Resend, PriceCharting, and marketplace-wide work was not included in this release.

## Shared backend contract

`GET /api/v1/market/assets/:slug/ownership/market-summary` now returns:

- issued supply from `OwnershipAssetSupply.issuedUnits`, never the planned cap;
- listed units from open/partially-filled asks;
- a `SETTLED_OWNERSHIP` breakdown with explicit categories;
- reconciliation status and categorized/issued totals;
- listed availability with its relationship to ownership buckets.

Only active ownership accounts are included in the public settled-position query. Listed orders are not added to ownership totals.

The pure projection helper is covered by focused tests and handles Initial Offering inventory separately from secondary platform inventory.

Observed staging projections:

| Asset | Settled ownership categories | Listed availability | Reconciles |
| --- | --- | --- | --- |
| QA Initial Offering | Collector retained 400; Investor owned 100; Offering inventory 500 | 500, separate offering inventory | PASS |
| Umbreon VMAX | Investor owned 1; Platform inventory 999 | 9, subset of platform inventory | PASS |

## UI acceptance

| Requirement | Result |
| --- | --- |
| Large price card | PASS |
| Stacked supply cards on desktop | PASS |
| Three-metric responsive composition at tablet widths | PASS |
| Listed percentage | PASS |
| Buy action uses the real buy route | PASS |
| Sell action enabled only for authenticated settled units available to sell | PASS |
| Supply bar uses reconciled category tones | PASS |
| Initial Offering ownership semantics | PASS |
| Umbreon secondary-inventory semantics | PASS |
| Issued supply reconciles | PASS |
| Guest position prompt | PASS in code path; not exercised by logging out of the authenticated session |
| Signed-in zero position | PASS; staging settled to `0 Slices` |
| Sign-in prompt while authenticated | NO |
| Order book | PASS; native accessible disclosure with real order rows |
| Recent trades | PASS; semantic table and singular `1 Slice` formatting |
| Private counterparty exposure | NO |
| Fake supply, ownership, or trades | NO |

The public execution view intentionally keeps side as `—`; the public endpoint does not safely define the viewer's side or expose a private counterparty.

## Responsive QA

Tested on both the QA Initial Offering and Umbreon public asset pages at:

- 390x844
- 768x1024
- 1366x768
- 1920x1080
- 2560x1440

Result: PASS. The panel stacks at mobile widths, uses the large-left/stacked-right V2 grid at desktop widths, and had no horizontal document overflow or clipping at any requested size. Semantic table overflow is contained inside its responsive wrapper.

Screenshots:

- `docs/qa/screenshots/ownership-trading-v2-qa-390x844.png`
- `docs/qa/screenshots/ownership-trading-v2-qa-768x1024.png`
- `docs/qa/screenshots/ownership-trading-v2-qa-1366x768.png`
- `docs/qa/screenshots/ownership-trading-v2-qa-1920x1080.png`
- `docs/qa/screenshots/ownership-trading-v2-qa-2560x1440.png`
- `docs/qa/screenshots/ownership-trading-v2-umbreon-390x844.png`
- `docs/qa/screenshots/ownership-trading-v2-umbreon-768x1024.png`
- `docs/qa/screenshots/ownership-trading-v2-umbreon-1366x768.png`
- `docs/qa/screenshots/ownership-trading-v2-umbreon-1920x1080.png`
- `docs/qa/screenshots/ownership-trading-v2-umbreon-2560x1440.png`

## Accessibility and runtime checks

- PASS: section headings, table headings, and table scopes are semantic.
- PASS: order book is a native `details`/`summary` disclosure.
- PASS: info icon is marked decorative where its adjacent copy supplies the meaning.
- PASS: disabled Sell state is exposed with `aria-disabled` and truthful supporting copy.
- PASS: no console errors at any tested viewport.
- PASS: no unexpected 401/500 observed during the authenticated staging pass.
- PASS: the panel render path makes no PriceCharting or Ximilar provider calls; those remain separate backend data workflows.
- PASS: no mutation controls were submitted. No orders, trades, ownership, supply, or lifecycle records were created.

The first authenticated fresh-page position check briefly displayed its loading state while session-backed data restored, then resolved to the correct zero-position projection. It did not show a guest sign-in prompt or change domain state.

## Verification commands

- Frontend typecheck: PASS.
- Frontend focused lint for touched files: PASS.
- Frontend tests: PASS, 39 files / 138 tests.
- Frontend production build: PASS.
- Server build: PASS.
- Focused server trading tests: PASS, 2 suites / 5 tests.
- `git diff --check`: PASS.
- VPS health: `/health` OK; `/ready` PostgreSQL and Redis up; web root HTTP 200.

## Release result

`slice-api.service` and `slice-web.service` are active, and both `/opt/slice/current` and `/opt/slice/app` resolve to the V2 release above. Umbreon and the QA Initial Offering domain state remained unchanged. Charizard was not touched.

Final status: **GO**
