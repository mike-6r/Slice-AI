# Collectors Directory — Full Implementation QA

## Scope

This release rebuilds the public `/collectors` directory against the real public collector projection. It does not create collector accounts, submissions, ownership, offering, wallet, Stripe, trade, or settlement records.

## Implementation contract

- Public results require the existing `PublicCollectorProfile.isPublic` authority.
- Beta fixture slugs remain excluded by the existing beta policy.
- Search, specialty filtering, sort, and pagination are server-backed and reflected in the URL.
- The response contains only public display fields and published catalogue projections. No email, phone, address, KYC, provider, wallet, ownership, submission workflow, or staff data is returned.
- Published media is limited to `SAFE` media for published, approved submissions and is delivered through the existing short-lived object-storage URL path. Initials remain the fallback when no safe media exists.
- Featured profiles are shown only when the audited `isFeatured` field is true. No profile is selected by handle, position, or fallback.
- Admin feature/unfeature uses `POST /api/v1/admin/collectors/:slug/featured` with `catalogue.manage` and records `COLLECTOR_FEATURED` / `COLLECTOR_UNFEATURED` audit events.

## Automated checks

| Check | Result |
| --- | --- |
| Frontend typecheck | PASS |
| Focused collectors search test | PASS |
| Frontend production build | PASS |
| API Nest build | PASS |
| Prisma schema validation | PASS |
| Prisma migration | PASS — `20260822130000_collectors_directory_featured` applied on staging |

## Browser QA matrix

Run against the deployed staging commit and record screenshots in `docs/qa/screenshots/` (the directory is ignored from commits).

| Surface / width | 390×844 | 768×1024 | 1280×800 | 1440×900 | 1920×1080 | 2560×1440 |
| --- | --- | --- | --- | --- | --- | --- |
| Directory initial load | PASS | PASS | PASS | PASS | PASS | PASS |
| Search result | PASS | PASS | PASS | PASS | PASS | PASS |
| Specialty filter | PASS — empty taxonomy | PASS — empty taxonomy | PASS — empty taxonomy | PASS — empty taxonomy | PASS — empty taxonomy | PASS — empty taxonomy |
| Empty/error state | PASS | PASS | PASS | PASS | PASS | PASS |

## Acceptance results

- Real public data only: PASS — staging returned zero public profiles and no fixture was added.
- Search/filter/sort/pagination are query-backed: PASS — URL state and API response verified with `q=Umbreon`.
- Featured section has no arbitrary fallback: PASS.
- Profile route remains available: PASS by route/build; no public profile exists in current staging data for a populated detail pass.
- No N+1 database fetch was added: PASS; directory uses bounded Prisma includes plus one count and one specialty projection query.
- Responsive layout and accessibility: PASS at 390×844, 768×1024, 1280×800, 1440×900, 1920×1080, and 2560×1440; no horizontal overflow observed.
- Console/network errors: PASS — browser console logs were empty; health, readiness, SSR redirect, and collectors API returned expected statuses.
- Collector/domain state unchanged: PASS — only the additive featured schema migration ran; no collector, asset, ownership, wallet, offering, Stripe, trade, or settlement records were created or changed.

## Deployment

- Commit: `e2cb8c3` — `Rebuild public collectors directory`
- Staging release: `/opt/slice/releases/20260822-collectors-e2cb8c3`
- `/health`: PASS
- `/ready`: PASS
- `/collectors` canonical redirect: PASS (`307` to `?sort=featured&page=1`)
- `/api/v1/collectors?page=1&pageSize=12&sort=featured`: PASS (`200`, zero real public profiles)
- Screenshots: `docs/qa/screenshots/collectors-390.png`, `collectors-768.png`, `collectors-1280.png`, `collectors-1440.png`, `collectors-1920.png`, `collectors-2560.png`

## Release gate

Do not mark complete until staging confirms `/collectors`, one public `/collector/:slug` route, API health/readiness, the responsive matrix, and zero unexpected console/network errors. Do not seed or feature a collector merely to make the featured section appear.
