# Homepage cinematic redesign — verification

Date: 2026-09-19. Scope: homepage presentation, local teaching interactions and route CSS.

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

## Deployment blocker

The saved staging key authenticates to the `slice` account, but the account cannot run a shell. The same key is rejected for root. No working privileged operator access was established. The public homepage returned HTTP 200; API `/health` and `/ready` returned HTTP 503 before this release. No VPS changes were made. Deployment requires the established operator username/key or restoration of that access; use the existing immutable-release runbook after checking host readiness.
