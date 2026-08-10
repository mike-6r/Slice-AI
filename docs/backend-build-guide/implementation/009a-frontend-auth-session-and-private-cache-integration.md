# 009A — Frontend auth, session and private-cache integration

**Status: PARTIAL.** This dependency follow-up must complete before Document 009 can close. The implementation and automated checks below are complete; browser QA remains blocked by the unavailable browser-control runtime.

## Scope

- Real frontend login, logout and logout-all against Document 004 APIs.
- Session bootstrap, in-memory access credentials and HttpOnly-cookie refresh recovery.
- Single-flight 401 refresh, with no localStorage token persistence.
- Private React Query cache clearing on logout, expiry and account change.
- Real-session watchlist/notification mutations with optimistic rollback.
- Authenticated responsive browser QA at 375px, 768px and 1440px.

## Out of scope

No backend redesign, visual redesign, ownership/trading work or Document 010 implementation.

## Completion evidence

Frontend unit/component coverage for refresh, cache clearing and rollback; backend auth regression; real signed-in browser QA. Browser QA requires a callable browser-control runtime.

## Implementation evidence (2026-08-06)

- `src/auth/session.ts` holds access credentials only in memory and performs a single cookie-backed refresh request for concurrent recovery.
- `src/api/http-client.ts` attaches the memory-only bearer credential and retries a failed **GET** once after refresh. It deliberately does not retry mutations.
- `src/auth/SessionBoundary.tsx` performs session bootstrap in API mode and clears the watchlist, notifications, portfolio and wallet React Query caches after session loss.
- `/login` calls the real backend endpoint; navigation exposes logout and logout-all actions. Watchlist removal and notification read mutations use optimistic updates with rollback.
- Frontend automated checks pass: 25 unit tests, typecheck, lint (zero errors; nine pre-existing Fast Refresh warnings) and production build.
- Backend auth regression passes: 60 unit tests, 34 real PostgreSQL/Redis integration tests and 28 HTTP E2E tests; Prisma reports nine migrations applied and schema up to date.

## Remaining blocker

No callable browser-control runtime (`mcp__node_repl__js`) is available in this environment. Real signed-in and responsive browser QA at 375px, 768px and 1440px was **not run** and is not claimed. Document 010 remains NOT STARTED.

## Closure evidence (2026-08-06)

Document 009A is COMPLETE. Real local browser QA proved a real login and refresh-cookie recovery; a forced expired access credential triggered one shared refresh for parallel safe GETs. Forced watchlist, notification mark-one and notification mark-all failures each rolled optimistic UI state back exactly once. The local fixture was cleaned up. Document 010 remains NOT STARTED.
