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
| Prisma migration | Pending staging deployment |

## Browser QA matrix

Run against the deployed staging commit and record screenshots in `docs/qa/screenshots/` (the directory is ignored from commits).

| Surface / width | 390×844 | 768×1024 | 1280×800 | 1440×900 | 1920×1080 | 2560×1440 |
| --- | --- | --- | --- | --- | --- | --- |
| Directory initial load | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Search result | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Specialty filter | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Empty/error state | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

## Acceptance results

- Real public data only: PASS in code review; staging runtime pending.
- Search/filter/sort/pagination are query-backed: PASS in code review; staging runtime pending.
- Featured section has no arbitrary fallback: PASS.
- Profile route remains available: PASS by route/build; staging runtime pending.
- No N+1 database fetch was added: PASS; directory uses bounded Prisma includes plus one count and one specialty projection query.
- Responsive layout and accessibility: staging browser QA pending.
- Console/network errors: staging browser QA pending.
- Collector/domain state unchanged: PASS; no data mutation was run locally.

## Release gate

Do not mark complete until staging confirms `/collectors`, one public `/collector/:slug` route, API health/readiness, the responsive matrix, and zero unexpected console/network errors. Do not seed or feature a collector merely to make the featured section appear.
