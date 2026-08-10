# 008 — Collectors, Vault Live, public portfolio, watchlist and notification reads

## 1. Document metadata

Phase 3; **COMPLETE 2026-08-06**; high risk; prerequisites 004 and 006–007. Supports `/collectors`, `/collector/$id`, `/collector/$id/assets`, `/vault-live`, `/portfolio`, `/watchlist`, `/notifications`. Affects read/projection and user-preference modules. Large; limited parallel safety.

## 2. Project-specific context

These routes use `COLLECTORS`, `ASSETS` and route-local arrays/state. Modern repository interfaces/hooks exist for collectors, portfolio, watchlist, notifications and vault but default to mock repositories. This document supplies honest read models before financial ledgers exist; personal portfolio values remain explicitly demo/provisional until 013.

## 3. Current implementation audit

Collectors and vault activity are mock-backed; follow/watchlist are local toggles; notifications are local; portfolio is calculated from mock assets. Backend has no corresponding entities except User/Profile. Avoid inventing verified/public/follower/ownership claims. Separate five response domains rather than one dashboard payload.

## 4. Files to read

Read all named routes, collector/market/layout components, `src/domain/{collector,portfolio,ownership,vault,notifications,user}.ts`, mocks, repositories/services/hooks/keys/provider, validation schemas, server identity/catalogue/market modules, 004/006/007 and guide maps.

## 5. Strict scope

Implement public collector directory/detail/holdings projections; Vault Live public custody-event feed; provisional authenticated portfolio summary/performance read; durable watchlist list/toggle; notification list/read-state endpoints. Clearly label unavailable/provisional authority.

## 6. Out of scope

No ownership issuance (012), financial ledger/cost basis (013), custody writes (011), follow graph/community (015), notification delivery jobs (017), frontend integration (009), or UI redesign.

## 7. Dependencies and preconditions

Require auth, catalogue/market reads and approved public-profile privacy. A public collector must explicitly opt in; verification badge must derive from approved status, not UI mock. If authoritative portfolio/holdings are absent, return `authority:"DEMO"|"UNAVAILABLE"`, never production-looking fiction.

## 8. Database specification

Add `PublicCollectorProfile(userId unique,slug unique,headline?,specialism?,isPublic default false,publishedAt?,createdAt,updatedAt)`; `WatchlistItem(userId,assetId,createdAt)` unique pair/cascade user/restrict asset; `Notification(id,userId,type,title,body,resourceType?,resourceId?,createdAt,readAt?)` indexed user/time/unread; `VaultPublicEvent(id,assetId,type,occurredAt,publicSummary,status PUBLISHED|RETRACTED,sourceRef private)` immutable except retraction. Public holdings/portfolio are projections over later authority; do not create fake position tables. Migration `public_reads_watchlist_notifications`.

## 9. Domain types and ports

`CollectorDirectoryEntry/Detail/HoldingPreview`, `VaultEvent`, `PortfolioRead {authority,asOf,...}`, `WatchlistItem`, `Notification`. Repositories: `CollectorReadRepository.list/get/listHoldings`; `VaultReadRepository.listEvents/getSummary`; `PortfolioReadRepository.getSummary/getPerformance`; `WatchlistRepository.list/add/remove`; `NotificationRepository.list/markRead/markAllRead`. Cursor pages and explicit self/public projections.

## 10. Domain rules and invariants

Only opted-in public profiles appear. Private holdings/percentages never leak; public holding fields require publication policy. Watchlist and notifications are self-only, unique and idempotent. Notification content is server-authored allowlisted plain text. Vault feed exposes public summaries only. Provisional portfolio never claims settled value/cost basis/P&L.

## 11. Application services

Directory/detail/holdings validate visibility and compose catalogue/market fields at one as-of. Vault reads filter retracted events. Portfolio returns source authority. Watchlist add/remove and notification mark actions authenticate self, transact mutation+audit where required, and are replay-safe.

## 12. API specification

Public: `GET /v1/collectors?focus&query&sort&cursor&limit`; `GET /v1/collectors/:slug`; `GET /v1/collectors/:slug/assets?category&offeredOnly&sort&cursor&limit`; `GET /v1/vault/events?type&assetId&cursor&limit`; `GET /v1/vault/summary`. Authenticated: `GET /v1/me/portfolio?range`; `GET /v1/me/watchlist?cursor&limit`; `PUT/DELETE /v1/me/watchlist/:assetId`; `GET /v1/me/notifications?unreadOnly&cursor&limit`; `PATCH /v1/me/notifications/:id/read`; `POST /v1/me/notifications/read-all`. Mutations require idempotency, rate, self-auth and audit; reads cursor max 100.

## 13. Error catalogue

`COLLECTOR_NOT_FOUND` 404; `PROFILE_NOT_PUBLIC` 404; `PORTFOLIO_AUTHORITY_UNAVAILABLE` 503; `ASSET_NOT_FOUND` 404; `NOTIFICATION_NOT_FOUND` 404; validation/cursor/auth/rate/idempotency errors. Unauthorized notification/watchlist IDs do not enumerate another user.

## 14. Authorization and security

Public projection allowlist and opt-in are mandatory. Self-only records query by actor in SQL, not fetch-then-check. Escape/sanitize profile and notification text. Rate expensive directory searches. No ownership/custody private metadata.

## 15. Audit and idempotency

Audit public-profile publication changes (if internally exposed), watchlist changes optional product audit, notification read not durable security audit unless policy requires. All mutations accept keys; store resource IDs and result only, not text/body.

## 16. Events, realtime and jobs

Define future invalidations `vault.public_event.published.v1`, `portfolio.changed.v1`, `notification.created/read.v1`, `watchlist.changed.v1`; do not dispatch. No jobs.

## 17. Frontend alignment

Map exact repository methods in `src/data/repositories.ts` and hooks/keys. Portfolio route must show explicit unavailable/demo state until 013. Watchlist/notification optimistic updates roll back on error in 009. This document changes no frontend.

## 18. Implementation file plan

Create server collector/vault/read-projection/watchlist/notification modules or cohesive bounded modules and tests; modify Prisma/app/contracts. Preserve frontend and later ledger/custody/community code.

## 19. Numbered implementation process

1. Inventory route fields and privacy classification.
2. Define five separate DTO families and authority labels.
3. Add migration/repositories/indexes.
4. Implement public collector/vault reads.
5. Implement honest portfolio projection.
6. Implement self-only watchlist/notifications.
7. Add DB/E2E/privacy/contract tests.
8. Update guide mappings/state.

## 20. Test plan

Unit visibility/authority/DTO rules; DB unique watchlist, unread cursors, retraction, deterministic directory/holdings; E2E public/private profiles, self isolation, idempotent toggle/read, portfolio unavailable, cursor/filter; contract tests against frontend domain types. No provider/browser visual tests.

## 21. Manual QA

Create public/private profiles and two users; verify directory privacy, holdings projections, vault retraction, portfolio authority label, cross-user watchlist/notification denial and idempotent actions. Inspect DB/audits; frontend remains unchanged.

## 22. Verification commands

Server Prisma validate/generate/status, lint, unit, integration, E2E, build; root typecheck/build for contract regression.

## 23. Documentation and state updates

Update all state/control documents plus feature/API/entity/business/workflow maps and baseline. Identify 013 as portfolio authority replacement and 017 as delivery/realtime owner.

## 24. Completion checklist

- [x] Public collector visibility is explicit and non-enumerating.
- [x] Holdings/portfolio projections expose no ownership authority.
- [x] Vault responses omit private source evidence.
- [x] Portfolio response truthfully labels authority unavailable until 013.
- [x] Watchlist uniqueness/idempotency/self isolation pass.
- [x] Notification unread/cursor/self isolation pass.
- [x] Contract/DB/E2E tests pass.
- [x] No ownership/finance/frontend integration was started.

## 25. Final report format

Report all 17 standard items and next document `009`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
