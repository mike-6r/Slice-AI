# 009 — Frontend read API integration

## 1. Document metadata

> **Current status (2026-08-06): PARTIAL / IMPLEMENTATION COMPLETE.** The adapter and route implementation is complete. Closure is blocked only by `009a-frontend-auth-session-and-private-cache-integration.md` and unavailable browser-control runtime for responsive QA. The historical metadata below has not been rewritten.

Phase 3; **NOT STARTED**; medium risk; requires 004 and 006–008. Supports all public/read routes. Affects frontend data adapters/provider/hooks/routes only. Large; not parallel-safe with frontend repository refactors.

## 2. Project-specific context

The frontend has modern domain/repository/service/query boundaries, but most polished routes import `ASSETS`, `COLLECTORS` and helpers directly from `src/repositories/market-repository.ts`. `AppServicesProvider` defaults to `src/mocks/repositories.ts`. This document migrates reads incrementally while preserving approved visual layout and honest demo fallback behavior.

## 3. Current implementation audit

Complete: typed repository interfaces, service wrapper, TanStack Query hooks/keys, mock implementation/provider. Partial: routes use hooks inconsistently. Missing: HTTP client, DTO decoding/mappers, auth/session handling, error/loading/empty states and environment switch. Preserve mocks as explicit development/test adapter; remove route-local direct imports only after parity.

## 4. Files to read

Read every `src/routes/*.tsx`; all `src/components/market*`, marketplace, collectors, vault, chart/design/layout files; all `src/domain/**`, `src/data/**`, `src/services/**`, `src/queries/**`, `src/mocks/**`, `src/repositories/market-repository.ts`, `src/providers/AppServicesProvider.tsx`, validation, root config/package, API DTO/contracts/tests from 004/006–008, and guide maps/state.

## 5. Strict scope

Add fetch client/base URL/request ID/error decoding/credentials; runtime Zod response decoders and DTO-domain mappers; HTTP read repositories; provider selection; query hooks/keys where missing; migrate home, marketplace, asset, collectors, collector assets, Vault Live, portfolio, watchlist and notifications reads; implement accessible loading/empty/error/retry states without redesign; keep mock mode explicit.

## 6. Out of scope

No backend changes, mutation integration beyond existing watchlist/notification read-state endpoints, auth UI redesign, trading/listing/provider flows, new visual art direction or removal of mocks needed for tests/story/demo.

## 7. Dependencies and preconditions

Require stable OpenAPI-like DTO fixtures and reachable API. Variables: `VITE_API_BASE_URL`, `VITE_DATA_SOURCE=api|mock`; production build must require `api`. If an endpoint/field is absent, keep that route on mock behind one documented boundary and record blocker—never blend API and mock values in one financial view without visible authority label.

## 8. Database specification

Database work: none.

## 9. Domain types and ports

Keep existing repository interfaces as frontend ports. Add `ApiClient.request<T>(method,path,{query,body,signal,idempotencyKey})`, `ApiError`, response Zod schemas and mappers. Extend a port only when an owning backend contract proves need. Use `AbortSignal`; parse money strings safely into frontend minor-unit representation without float arithmetic.

## 10. Domain rules and invariants

One data source per query. API errors preserve code/requestId/fieldErrors. 401 attempts one coordinated refresh, never loops; 403 does not refresh; 429 honors retry-after; abort is not shown as error. Query keys include every filter/range/user dimension. Private cache is cleared on logout. Loading does not flash mock data. Demo status remains visible.

## 11. Application services

HTTP repositories map DTOs, services retain formatting-independent behavior, and query hooks own caching/invalidation. Watchlist/notification optimistic mutations snapshot, update and rollback. Root session bootstrap is coordinated, not per-component.

## 12. API specification

No new endpoints. Consume only 004, 006, 007 and 008 routes. Send credentials, Accept JSON and generated/received request IDs; only mutation methods send idempotency keys. Cursor/search/filter parameters match backend exactly. Frontend logs safe code/request ID, never response bodies/tokens.

## 13. Error catalogue

Map `VALIDATION_FAILED` to field/general errors; auth required/expired to session recovery; forbidden/restricted to access state; not found to route empty/404; rate limited to retry delay; unavailable/network to retry panel; unknown malformed response to `CLIENT_CONTRACT_ERROR`. No sensitive server text is rendered.

## 14. Authorization and security

Use HttpOnly refresh cookie; access token lives in memory, not localStorage. Never interpolate server HTML. Encode query params, validate responses, clear private query cache on logout/account change, and do not log PII/tokens.

## 15. Audit and idempotency

Frontend creates UUID idempotency keys per user intent and reuses them only for retry of the same mutation. Reads have none. Audit remains server-side.

## 16. Events, realtime and jobs

No realtime/jobs. Define a centralized future invalidation map for market, portfolio, vault, watchlist and notifications but do not open sockets before 017.

## 17. Frontend alignment

Migrate exact ports/hooks: assets, market, collectors, vault, portfolio, ownership watchlist, notifications and user/session. Replace direct route imports in small vertical slices, compare mock/API fixtures, keep current layout/typography/card components. Pagination appends/replaces intentionally; empty/error/loading states preserve section dimensions.

## 18. Implementation file plan

Create `src/api/{client,schemas,mappers}.ts` and `src/data/http/*.ts`; modify provider, repositories/services/hooks/keys and listed routes. Preserve CSS/presentational markup unless required for state accessibility. Preserve mocks and backend.

## 19. Numbered implementation process

1. Inventory direct mock imports route by route.
2. Add client/error/request-ID/auth-refresh behavior and tests.
3. Add DTO schemas/mappers using backend fixtures.
4. Implement HTTP repository set and provider switch.
5. Migrate catalogue/marketplace/asset.
6. Migrate home, collectors/holdings and Vault Live.
7. Migrate portfolio authority, watchlist and notifications.
8. Add loading/empty/error/retry and cache cleanup.
9. Run contract/unit/browser/regression checks and update state.

## 20. Test plan

Unit client status/refresh/abort/idempotency; schema/mappers for every DTO and large money values; repository query serialization; hook cache/invalidation/rollback. MSW-equivalent contract tests if dependency approved. Browser/manual route states at desktop/mobile, slow network, empty, 404, 429, 503, expired session. Visual regression confirms no redesign.

## 21. Manual QA

Run API and frontend in API mode; visit each named route, exercise filters/cursors/ranges, simulate offline/slow/empty/expired auth, watch request IDs and cache behavior, toggle watchlist/read notification, then run mock mode and compare. No DB changes beyond those server mutations.

## 22. Verification commands

Root: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run dev`. Server E2E/contract tests must already pass; do not change server. Add browser command only if this document explicitly adds a supported script.

## 23. Documentation and state updates

Update state/checklist/index/order, feature/API/workflow maps, verification baseline and this prompt. List each migrated route and any explicit mock fallback.

## 24. Completion checklist

- [ ] API client decodes canonical errors/request IDs and coordinates one refresh.
- [ ] Runtime schemas/mappers cover every consumed DTO.
- [ ] Production cannot silently select mocks.
- [ ] All named read routes use ports/hooks, not direct mock imports.
- [ ] Loading/empty/error/rate/offline states are accessible.
- [ ] Private cache clears on logout/account switch.
- [ ] Watchlist/notification optimistic rollback works.
- [ ] Browser and visual checks show no redesign.
- [ ] Backend/later mutations were not changed.

## 25. Final report format

Report all 17 standard items and next document `010`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

## Closure evidence (2026-08-06)

Document 009 is COMPLETE. Its final browser dependency was discharged by the local QA fixture and browser harness; API-mode public/private reads remained real-service backed, and no mock fallback was used. Document 010 was not started.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
