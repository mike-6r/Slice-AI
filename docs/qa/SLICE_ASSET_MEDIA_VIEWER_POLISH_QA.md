# Slice Asset Media Viewer Polish QA

Date: 2026-08-23  
Release: `f69bea4` / `/opt/slice/releases/20260823-f69bea4`  
Route: `/asset/2021-umbreon-vmax-evolving-skies-215-203`

## Scope

This pass changed only the asset media viewer internals. The outer asset-detail hero footprint, identity, valuation, ownership/trading panel, education section, history, Slice Grade, External Reference, and Similar Collectibles sections were left unchanged.

## Implementation

- Removed the extra visual face frame, inner border, image padding, and heavy decorative layering around the approved collectible.
- Kept the authoritative public media projection and front/back URLs unchanged.
- Made flipping explicit through the upper-right control and footer indicators; pointer hover no longer changes the side unexpectedly.
- Added a restrained 220ms rotate transition, a subtle hover scale, and a reduced-motion override.
- Kept the footer as three stable zones: category, side indicators, and `Viewing front/back` state.
- Added a graceful fallback state for missing or failed approved media instead of a broken-image icon.
- Preserved accessible labels, pressed states, alt text, keyboard buttons, and state text that is not color-only.

## Browser QA

The deployed staging page was loaded with the current backend media projection. Both approved media images loaded successfully and remained native public projections; no private media was introduced.

| Width | Outer viewer | Media stage | Footer | Horizontal overflow | Result |
| --- | ---: | ---: | ---: | --- | --- |
| 1920 | 370×428 | 248×348 | 52px | No | PASS |
| 1440 | 335.5×428 | 248×348 | 52px | No | PASS |
| 1280 | 295.5×428 | 224.6×348 | 52px | No | PASS |
| 768 | 724×448 | 248×368 | 52px | No | PASS |
| 390 | 358×384 | 232×304 | 48px | No | PASS |

At each width the flip control stayed inside the media stage, category and viewing state stayed inside the footer, and the footer stayed inside the outer viewer.

Front/back interaction was verified in the browser:

- Front state: `aria-pressed=false`, footer `Viewing front`.
- After clicking Flip card: `aria-pressed=true`, stage `is-flipped`, footer `Viewing back`.
- After selecting the front indicator: front state restored and control text returned to `Flip card`.

Accessibility and runtime checks:

- PASS — front/back buttons have accessible labels and pressed states.
- PASS — approved media has safe descriptive alt text.
- PASS — no console warnings or errors were reported.
- PASS — zero PriceCharting/Ximilar/grading provider resources were requested by viewer render.
- PASS — no API mutation was issued; the only interaction was client-side flipping.

## Screenshots

Baseline screenshot captured before the change:

- [asset-media-before-1440.png](screenshots/asset-media-before-1440.png)

The in-app browser screenshot command timed out while capturing the post-deploy page, although DOM geometry, media loading, interaction, accessibility, and console checks completed successfully at all five widths. No final screenshot artifact is claimed where capture did not complete.

## Automated checks

- Frontend typecheck: PASS
- Focused media/gallery tests: PASS — 11 tests
- Client build: PASS
- SSR build: PASS
- Repository lint: FAIL — existing repository-wide Prettier violations (4,887 errors) unrelated to this pass; no lint autofix was applied to avoid rewriting unrelated work.

## Deployment

- Git commit: `f69bea4` (`Polish asset media viewer`)
- Pushed to `origin/main`: PASS
- Active release: `/opt/slice/releases/20260823-f69bea4`
- `/opt/slice/current`: PASS
- `/opt/slice/app`: PASS
- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: PASS
- `/ready`: PASS (Postgres and Redis up)
- Public asset route: HTTP 200

## Data safety

- Backend data changed: NO
- Asset lifecycle state changed: NO
- Private media exposed: NO
- Market, valuation, ownership, or provider data changed: NO
