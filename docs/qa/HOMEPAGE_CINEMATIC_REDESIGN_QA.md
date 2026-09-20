# Homepage cinematic redesign — verification

Date: 2026-09-19. Scope: homepage presentation, local teaching interactions and route CSS.

## Interaction correction — 2026-09-20

- The ownership slider now covers 1–1,000 Slices rather than stopping at 100. At 100, one row still correctly represents 10%; at 1,000 all 100 tiles fill and the example shows £10,000 / 100%.
- Added quantity presets through the full supply and clearer grid/slider labels. A shared pure selection model drives the grid and portfolio example.
- Replaced decorative portfolio labels with the existing accessible tabs primitive. Positions, Activity and Insights all respond to the selection; Activity explains the example's calculations, and Insights shows selected/remaining supply. Neither represents actual transactions or market performance.
- Browser checks: full-grid End key, 500-Slice linked update, click-to-switch tabs, ArrowRight and Home tab navigation; desktop 1440×900, tablet 768×1024 and phone 360×800 layouts inspected.
- Frontend tests: 56 files / 340 tests pass, including full supply, partial tiles, range bounds and matching totals.
- Frontend typecheck, targeted lint and production client/SSR build pass. No backend or schema change is needed for these interaction fixes.

## Implemented

- Preserved the Charizard opening and the collectible → ownership → lifecycle → portfolio → catalogue story.
- Rebuilt the hero with layered slab panels, mint lighting, pointer tilt, a tighter headline and time-based introductory motion.
- Added chapter navigation, reading progress and retained existing section anchors.
- Connected the 1–100 Slice calculator to the illustrative portfolio, using the existing integer-minor-unit example.
- Replaced scroll-driven progression and the desktop pinned scene with a finite, visible-only automatic lifecycle tour. All sections now use normal document flow at every size.
- Entrance animations start once on intersection and finish without further scrolling. The scroll listener only updates navigation and reading progress.
- Added visible Pause, Play and Replay controls above the stages. Manual selection pauses playback and updates the explanatory content. Leaving the viewport or hiding the document suspends the timer. Reduced motion disables autoplay.
- Added collector discovery/listing calls to action and six native FAQ disclosures.
- Kept real catalogue reads on the existing service, with distinct loading, retry and empty states. No orders, holdings or backend records are changed.
- Removed the obsolete homepage implementation from the route. New styles load with the homepage.

## Checks

- Frontend typecheck: PASS.
- Frontend tests: PASS, 55 files / 324 tests.
- Homepage TypeScript lint: PASS.
- Production client and SSR build: PASS.
- Production SSR HTML smoke at localhost: PASS, HTTP 200, title, ownership control and FAQs present; no preview branding in staging build. Asset paths resolve to built files. The SSR-only process does not serve static assets; Apache serves them in the documented deployment.
- Revised layouts inspected at 1440×900, 768×1024, 390×844 and 360×800. The preceding revision was also inspected at 1280×720.
- Calculator: 100 Slices produces £1,000 and 10% in calculator and portfolio. Keyboard Home then ArrowRight produces 2 Slices / £20 / 0.2%.
- Mobile lifecycle selection: Verify changes the asset state, explanation and next action.
- Desktop lifecycle progressed from Reserve to Portfolio while scrollY stayed at 1622. Replay reset it to Reserve, and Pause held that stage across subsequent checks.
- Mobile lifecycle advanced while scrollY stayed at 2490 after a clean reload. Offscreen playback remained on Receive across subsequent checks, with no active progress timer.
- Verify selection paused playback and updated the persistent polite live region. Autoplay does not announce every stage.
- At 1440×900 the lifecycle is approximately 878px tall, versus the former 1935px scroll runway; its inner wrapper is static. The full story measured approximately 5.3k pixels, versus 7.1k before this revision (catalogue state affects the total). No content section pins or requires scrolling to finish its animation.
- FAQ disclosure: opened the price/example explanation and verified its content.
- No document horizontal overflow at tested sizes. Decorative slab panels are clipped locally.
- Reduced motion: implemented and reviewed in CSS and preference-change listeners; no browser preference emulation was available.
- Loading and API failure states were observed. Successful catalogue availability could not be checked against staging while its API is unavailable.

Repository-wide lint currently fails with 456 errors and 25 warnings in existing files and ignored local artifacts (including prior preview files and tmp fixtures). Homepage files pass the targeted lint command. Existing large-bundle build warnings remain.

## Initial deployment blocker and recovery

The first attempt used the non-login `slice` service account and could not deploy. The operator subsequently confirmed `ubuntu`; the existing temporary key works for that operator. No access permissions or credentials were changed.

The pre-existing API 503 was traced to an unhandled pre-sale worker rejection: `releaseCashReservationInTransaction` emitted `FINANCE_CASH_RELEASED` with a lifecycle `reason`, missing from that action's metadata allowlist. With explicit owner approval, the reason was added and the worker now contains failed background runs, logs only a safe code/phase, avoids overlapping runs, and retries at the existing interval. The audit sanitizer and domain transaction errors remain enforced. Test and preview deployments do not start this mutating worker.

Regression coverage exercises the actual cash-release method and audit adapter with stubbed persistence (no real funds), accepted/rejected audit metadata, duplicate-release protection, propagated storage failures, worker retries, concurrent ticks, shutdown and disabled environments. Backend typecheck, targeted lint/build and focused regressions passed before release preparation. No financial records were manually repaired, no provider flags were changed, and no new schema migration is required.

Full backend unit run: 106 suites / 611 tests passed, with four existing failures in two suites. The same failures were reproduced on the unmodified `26d3a6e` checkout on the VPS: three public-collector test fixtures omit `tradingExecutions`, and one session test's fixed expiry date is in the past. These unrelated fixtures were not changed. Repository-wide backend lint reports 21 existing errors; all recovery-patch files pass targeted lint.
