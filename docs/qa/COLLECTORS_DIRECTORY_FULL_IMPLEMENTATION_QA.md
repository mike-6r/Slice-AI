# Collectors Directory — Full Implementation QA

## Scope

This release rebuilds the public `/collectors` directory against the real public collector projection. It does not create collector accounts, submissions, ownership, offering, wallet, Stripe, trade, or settlement records.

## Implementation contract

- Directory membership is authoritative from an active user with an active `COLLECTOR` role assignment and an eligible account status. A `PublicCollectorProfile` row is optional and controls optional public details only; `isPublic` does not silently remove a legitimate Collector from the directory.
- Beta fixture slugs remain excluded by the existing beta policy.
- Search, specialty filtering, sort, and pagination are server-backed and reflected in the URL.
- The response contains only public display fields and published catalogue projections. No email, phone, address, KYC, provider, wallet, ownership, submission workflow, or staff data is returned.
- Published media is limited to `SAFE` media for published, approved submissions and is delivered through the existing short-lived object-storage URL path. Initials remain the fallback when no safe media exists.
- Featured profiles are shown only when the audited `isFeatured` field is true on an otherwise eligible Collector. No profile is selected by handle, position, or fallback; role eligibility always wins.
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
| Collector-directory role/projection tests | PASS — active, revoked, disabled, no-profile, zero-listing, private-media, featured, search, filter, pagination, and privacy fixtures updated |

## Browser QA matrix

Run against the deployed staging commit and record screenshots in `docs/qa/screenshots/` (the directory is ignored from commits).

| Surface / width | 390×844 | 768×1024 | 1280×800 | 1440×900 | 1920×1080 | 2560×1440 |
| --- | --- | --- | --- | --- | --- | --- |
| Directory initial load | PASS — one active Collector | PASS — one active Collector | PASS — one active Collector | PASS — one active Collector | PASS — one active Collector | PASS — one active Collector |
| Search result | PASS — server-backed URL state | PASS — server-backed URL state | PASS — server-backed URL state | PASS — server-backed URL state | PASS — server-backed URL state | PASS — server-backed URL state |
| Specialty filter | PASS — empty taxonomy is intentional | PASS — empty taxonomy is intentional | PASS — empty taxonomy is intentional | PASS — empty taxonomy is intentional | PASS — empty taxonomy is intentional | PASS — empty taxonomy is intentional |
| Empty/error state | PASS — only after a real zero-result query | PASS | PASS | PASS | PASS | PASS |

## Acceptance results

- Root cause: the previous implementation started from `PublicCollectorProfile` and required `isPublic`, so active role-backed Collectors without a separately published profile were excluded.
- Real public data only: PASS — staging returned one active role-backed Collector with zero published collectibles; no fixture or profile was added.
- Search/filter/sort/pagination are query-backed: PASS — URL state and API response verified with `q=Umbreon`; the response exposes real `pagination` totals.
- Featured section has no arbitrary fallback: PASS.
- Profile route remains available: PASS — the eligible zero-asset Collector resolves to a real public profile route.
- No N+1 database fetch was added: PASS; directory uses bounded Prisma includes plus one count and one specialty projection query.
- Responsive layout and accessibility: PASS at 390×844, 768×1024, 1280×800, 1440×900, 1920×1080, and 2560×1440; the final narrow-header/footer overflow fix was included in the follow-up release.
- Console/network errors: PASS — browser console logs were empty; health, readiness, SSR redirect, and collectors API returned expected statuses.
- Collector/domain state unchanged: PASS — no collector, asset, role, ownership, wallet, offering, Stripe, trade, or settlement records were created or changed during verification.

## Deployment

- Commit: `c96de2a` — `Fix collectors directory data contract`; responsive follow-up release pending this QA-doc update
- Staging release: `/opt/slice/releases/20260822-collectors-c96de2a`
- `/health`: PASS
- `/ready`: PASS
- `/collectors` canonical redirect: PASS (`307` to `?sort=featured&page=1`)
- `/api/v1/collectors?page=1&pageSize=12&sort=featured`: PASS (`200`, one eligible Collector, zero featured, zero published listings)
- `/collector/collector-8cdab657-e484-4dfa-b4cc-1f8e1841ece4`: PASS (`200`, zero-asset public profile)
- Screenshots remain local/ignored; responsive DOM checks and console checks were captured against staging.

## Release gate

Do not mark complete until the responsive follow-up release is active and staging confirms `/collectors`, one public `/collector/:slug` route, API health/readiness, the responsive matrix, and zero unexpected console/network errors. Do not seed or feature a collector merely to make the featured section appear.
