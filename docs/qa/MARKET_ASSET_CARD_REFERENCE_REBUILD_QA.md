# Marketplace Asset Card Reference Rebuild QA

Date: 2026-08-22  
Target: Slice marketplace asset card  
Reference: supplied premium Umbreon VMAX marketplace composition

## Reference goals

The card was rebuilt as a reusable Slice marketplace surface: near-black premium background, restrained emerald glow, collectible-first imagery, clear identity and condition, authoritative Slice valuation, compact market state, simple fractional-ownership explanation, and one obvious `View collectible` action.

The implementation is data-driven. Umbreon is used only as the current staging fixture; no Umbreon-specific values were added to the component.

## Before / after

Before, the card mixed legacy art-direction layers with the new projection, causing the identity and valuation columns to compress inside narrow marketplace cards. The card also did not expose the authoritative sell-side listing aggregate.

After, the card has one cohesive visual object with:

- a centered front-first hero image and deterministic gallery dots for additional public media;
- a truthful market-status pill and backend-derived active listing count/units;
- identity, official grading state, and collector condition in separate visual groups;
- Slice valuation separated from the external market reference;
- a compact ownership explanation that does not imply immediate purchase when no listings exist;
- a full-width detail CTA and account-aware watchlist behavior;
- a card-width container query that stacks valuation/reference content when a desktop grid makes the card narrow;
- a reusable loading skeleton matching the final card layout.

## Component architecture

- `MarketAssetCard` owns the reusable discovery-card composition and watchlist interaction.
- `AssetVisual` owns front-first public media selection, gallery navigation, status, and image accessibility.
- `ValuationBlock` owns Slice valuation/reference semantics and currency formatting.
- `MarketAvailability` owns lifecycle status, listing count, and available listing units.
- `OwnershipPrompt` owns the truthful fractional-ownership explanation.
- `MarketAssetCardSkeleton` and `MarketAssetGridSkeleton` provide the loading surface without fake asset data.
- `MarketDetailedRow` reuses the same `MarketplaceAsset` projection and semantics for detailed view mode.

## Backend authority mapping

The public market service now projects `activeListings` as an aggregate of real secondary-market SELL orders with status `OPEN` or `PARTIALLY_FILLED` across list, detail, similar-assets, and movers projections. It returns only count and remaining units; order IDs, owner data, prices, and private fields remain private.

The frontend mapper preserves the projection as `activeListingsCount` and `availableListingUnits`. Existing lifecycle, valuation, reference, grading, condition, media, ownership, and execution-history fields remain backend authoritative.

## Mapping and truth rules

| Surface | Source / behavior |
| --- | --- |
| Market state | `marketLifecycle` phase/badge/status pill; live phase renders `Market Open` and `Trading enabled` |
| Active listings | real public aggregate from open/partially-filled SELL orders |
| Available units | sum of remaining units on those sell orders |
| Slice valuation | authoritative Slice valuation amount and currency |
| Market reference | external reference amount/currency plus provider/context; informational tooltip |
| Official grade | actual official grade, otherwise `Raw / Ungraded` |
| Condition | authoritative collector condition, shown separately from official grade |
| Image | public approved media, front-first; no generated fallback media |
| Watchlist | existing account-scoped API and cache; logged-out users are routed to login |
| Market history | no fabricated chart or movement; execution-history semantics remain separate |

## Responsive visual QA

All required local renders were captured from the running frontend against the read-only staging API bridge. At every size, the page had no horizontal overflow and the Umbreon card rendered its title, valuation, market state, and CTA.

| Viewport | Result | Notes |
| --- | --- | --- |
| 1920 × 1080 | PASS | premium card proportions and restrained glow |
| 1440 × 900 | PASS | valuation remains prominent; narrow grid cards stack reference cleanly |
| 1280 × 800 | PASS | filter/sidebar layout remains usable |
| 1366 × 768 | PASS | no clipping; card-width valuation stack applied |
| 768 × 1024 | PASS | single wide card layout remains readable |
| 390 × 844 | PASS | single column, full-width CTA, no horizontal overflow |
| 2560 × 1440 | PASS | balanced card width; no uncontrolled expansion |

Screenshots:

- `docs/qa/screenshots/market-asset-card-local-1920x1080.png`
- `docs/qa/screenshots/market-asset-card-local-1440x900.png`
- `docs/qa/screenshots/market-asset-card-local-1280x800.png`
- `docs/qa/screenshots/market-asset-card-local-1366x768.png`
- `docs/qa/screenshots/market-asset-card-local-768x1024.png`
- `docs/qa/screenshots/market-asset-card-local-390x844.png`
- `docs/qa/screenshots/market-asset-card-local-2560x1440.png`

## Accessibility

- Semantic links and buttons are retained for CTA, gallery, and watchlist controls.
- Watchlist labels include the asset name and saved/unsaved action.
- Gallery controls expose the image being selected and current state.
- Images use public media alt text; decorative glow/vignette elements are hidden.
- External-reference info is keyboard focusable with an explanatory label/title.
- Status is communicated by text as well as color.
- Focus-visible behavior remains provided by the Slice theme.
- Skeleton loading uses `aria-busy` and the shimmer is disabled under `prefers-reduced-motion: reduce`.

## Automated QA

PASS:

- Frontend focused marketplace card/layout tests: 4/4.
- Frontend full tests: 38 files, 133 tests.
- Frontend typecheck.
- Frontend client and SSR build.
- Backend Prisma validate.
- Backend Prisma generate.
- Backend typecheck.
- Backend build.
- Backend unit tests: 63 suites, 263 tests.
- Touched frontend/backend lint.
- `git diff --check`.

BLOCKED BY LOCAL ENVIRONMENT:

- Backend integration tests could not start because PostgreSQL test database `slice_test` at `127.0.0.1:55432` is unavailable.
- Backend E2E tests could not start for the same reason.
- Docker Desktop is not installed/running in this workspace, so the isolated test services could not be brought up.

This is an execution-environment blocker, not a passing result. The release gate remains open until integration and E2E run against the repository's test services.

## Deployment and staging retest

The requested staging deployment completed after the local frontend/backend gates and the source archive was verified. The local integration/E2E blocker remains documented above, but the user explicitly requested deployment for visual review.

- Commit: `ce8fc8d` (`feat: rebuild marketplace asset cards`)
- Push: `origin/main` successful
- VPS release: `/opt/slice/releases/20260822-ce8fc8d`
- `/opt/slice/current`: `/opt/slice/releases/20260822-ce8fc8d`
- `/opt/slice/app`: `/opt/slice/releases/20260822-ce8fc8d`
- API service: active
- Web service: active
- `/health`: 200
- `/ready`: 200
- local SSR: 200
- public homepage: 200
- public marketplace: 200
- public Umbreon detail: 200
- discovered deployed JS/CSS assets: all 200

The release script ran frontend client/SSR builds, backend build, Prisma generate/validate, and `prisma migrate deploy` with no pending migrations. No financial or lifecycle mutation was performed.

### Deployed staging card QA

PASS. The deployed marketplace card rendered the authoritative staging values:

- `Umbreon VMAX`
- `Evolving Skies • #215/203`
- `Raw / Ungraded`
- `Mint`
- `£1,647.17` Slice valuation
- `$2,151.75` PriceCharting reference
- `Market Open`
- `1 active listings`
- `9 Slices currently offered`
- `Own available Slices`
- `View collectible`

The deployed browser render had no horizontal overflow, no console errors/warnings, and no hardcoded Umbreon-specific values. The marketplace response matched the backend listing projection.

## Known differences from the supplied reference

- The reference image includes a mini market line. The card does not render one because the public projection does not provide sufficient historical observations for a truthful chart.
- The staging market projection currently has no active sell listings, so the card correctly shows `No active listings` and `Nothing currently offered`.
- The current implementation uses the existing Slice navigation/footer and market controls around the card; only the collectible card surface and its supporting projection were rebuilt.

## Regression notes

The change does not create trades, listings, ownership, issuance, valuation records, grading records, watchlist records for unauthenticated users, or other economic state. It does not alter Umbreon or Charizard data. The backend addition is a read-only aggregate in the public market projection.

## Release gate

**DEPLOYED TO STAGING FOR VISUAL REVIEW.** Local integration/E2E execution remains a follow-up gate because the workspace still lacks Docker/PostgreSQL test services.
