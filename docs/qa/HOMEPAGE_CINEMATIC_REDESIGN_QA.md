# Homepage cinematic redesign — verification

Date: 2026-09-19. Scope: homepage presentation, local teaching interactions and route CSS.

## Implemented

- Preserved the Charizard opening and the collectible → ownership → lifecycle → portfolio → catalogue story.
- Rebuilt the hero with layered card lighting, pointer tilt, scroll depth and introductory motion.
- Added chapter navigation, reading progress and retained existing section anchors.
- Connected the 1–100 Slice calculator to the illustrative portfolio, using the existing integer-minor-unit example.
- Added explicit lifecycle stage controls and scroll progression where the complete panel fits below the navigation.
- Added collector discovery/listing calls to action and six native FAQ disclosures.
- Kept real catalogue reads on the existing service, with distinct loading, retry and empty states. No orders, holdings or backend records are changed.
- Removed the obsolete homepage implementation from the route. New styles load with the homepage.

## Checks

- Frontend typecheck: PASS.
- Frontend tests: PASS, 55 files / 324 tests.
- Homepage TypeScript lint: PASS.
- Production client and SSR build: PASS.
- Production SSR HTML smoke at localhost: PASS, HTTP 200, title, ownership control and FAQs present; no preview branding in staging build. Asset paths resolve to built files. The SSR-only process does not serve static assets; Apache serves them in the documented deployment.
- Browser layouts inspected at 1440×900, 1280×720, 768×1024, 390×844 and 360×800.
- Calculator: 100 Slices produces £1,000 and 10% in calculator and portfolio. Keyboard Home then ArrowRight produces 2 Slices / £20 / 0.2%.
- Mobile lifecycle selection: Verify changes the asset state, explanation and next action.
- Desktop lifecycle: scrolling advances stages; sticky panel fits the viewport. Compact layouts disable pinning.
- Regression check at 1440×855: selecting stages keeps the section stable (901px) and unpinned; resizing to 1440×900 enables pinning. The footer reserves control space and height measurement keeps a high-water mark until resize.
- Manual Next updates a persistent polite live region with the new stage and explanation; ordinary scroll updates do not create screen-reader announcements.
- FAQ disclosure: opened the price/example explanation and verified its content.
- No document horizontal overflow at tested mobile sizes. Hero decorative orbit is clipped locally.
- Reduced motion: implemented and reviewed in CSS and preference-change listeners; no browser preference emulation was available.
- Loading and API failure states were observed. Successful catalogue availability could not be checked against staging while its API is unavailable.

Repository-wide lint currently fails with 456 errors and 25 warnings in existing files and ignored local artifacts (including prior preview files and tmp fixtures). Homepage files pass the targeted lint command. Existing large-bundle build warnings remain.

## Deployment blocker

The saved staging key authenticates to the `slice` account, but the account cannot run a shell. The same key is rejected for root. No working privileged operator access was established. The public homepage returned HTTP 200; API `/health` and `/ready` returned HTTP 503 before this release. No VPS changes were made. Deployment requires the established operator username/key or restoration of that access; use the existing immutable-release runbook after checking host readiness.
