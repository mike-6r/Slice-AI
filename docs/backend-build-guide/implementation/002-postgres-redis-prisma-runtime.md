# 002 — PostgreSQL, Redis and Prisma runtime

## 1. Document metadata

| Field                        | Value                                                          |
| ---------------------------- | -------------------------------------------------------------- |
| Phase                        | 1 — local runtime                                              |
| Status                       | COMPLETE; real local runtime verification completed 2026-08-06 |
| Risk                         | High                                                           |
| Prerequisites                | 001 complete                                                   |
| Required completed documents | 001                                                            |
| Blocked by                   | None                                                           |
| Frontend routes/components   | None directly; all future durable features                     |
| Backend modules              | config, database, Redis, health, app module, Prisma            |
| Scope                        | Large                                                          |
| Parallel with frontend       | Yes if no shared contract files change                         |

## 2. Project-specific context

The frontend still runs from mocks and needs no runtime database today, but documents 003–018 require durable PostgreSQL and Redis. `server/prisma/schema.prisma`, `PrismaService`, `DatabaseModule`, `RedisStore`, Compose runtime wiring, the initial migration and dependency readiness are now in place and verified. This document made the local/test runtime real without implementing identity or product behavior.

## 3. Current implementation audit

- `compose.yaml` pins PostgreSQL 16.4 and Redis 7.4, binds both only to loopback, and passed Compose validation plus healthy container verification on 2026-08-06.
- `PrismaService`, `DatabaseModule`, `RedisCacheStore`, lifecycle wiring and readiness are connected through `AppModule` and verified against real services.
- `RedisCacheStore` enforces namespaces/TTL behavior, reconnects after a stopped client and has a no-op error listener so expected outage events do not become unhandled process errors.
- `server/prisma/schema.prisma` preserves the existing identity/control models. The existing `0001_identity_control_foundation` migration was applied and status-verified; this document did not add repository adapters.
- `DATABASE_URL` and `REDIS_URL` are required outside explicit test mode; runtime startup and readiness are dependency-safe.
- `/health` remains dependency-free liveness and `/ready` provides dependency readiness without topology or secret detail.

## 4. Files to read

Read `compose.yaml`, `.env.example`, `server/package.json`, `server/prisma/schema.prisma`, `server/src/app.module.ts`, all `server/src/config/*`, `server/src/database/*`, `server/src/infrastructure/redis/redis.store.ts`, `server/src/health/*`, `server/test/health.e2e-spec.ts`, all identity model files, `CURRENT_STATE.md`, `ENTITY_DATABASE_BLUEPRINT.md`, `VERIFICATION_BASELINE.md`, and 001.

## 5. Strict scope

- Make Compose PostgreSQL/Redis services deterministic, isolated, persistent and health-checked.
- Validate connection URLs/timeouts and require them outside explicit unit-test mode.
- Wire Prisma and Redis providers with connect/ping/disconnect lifecycle.
- Add readiness checks with bounded timeouts and dependency-safe output.
- Create/review/apply the initial Prisma migration representing the existing schema only.
- Supply test-database/reset conventions and real integration tests for connectivity/transactions/Redis TTL and atomic operations.
- Document startup/shutdown and outage behavior.

## 6. Out of scope

No identity adapters, auth controllers, catalogue/ledger/order models, hosted database, provider credentials, Kubernetes, production HA claim, frontend work, or schema redesign. Do not use SQLite/fakes to satisfy persistence tests.

## 7. Dependencies and preconditions

Require completed 001, Docker Engine plus Compose v2, free configurable ports, Node/npm, and PostgreSQL/Redis images pinned to major+minor tags. Variables: `DATABASE_URL`, `TEST_DATABASE_URL`, `REDIS_URL`, `DB_CONNECT_TIMEOUT_MS`, `REDIS_CONNECT_TIMEOUT_MS`; never log credentials. If Docker is unavailable, implement static/lifecycle work, run non-container tests, mark 002 blocked, and do not fabricate migration/integration success.

## 8. Database specification

Own the initial migration only. Preserve `User`, `UserProfile`, `Session`, `AccountStatusHistory`, `RoleAssignment`, `AuditEvent`, and `IdempotencyRecord` exactly as reviewed for 003/005. Migration name: `0001_identity_control_foundation`. Review generated SQL for UUID/default compatibility, unique normalized email, session token/family indexes, FK actions and audit/idempotency indexes. No destructive drift/reset against non-test DB. PostgreSQL data persists via named volume; test DB uses a distinct database/schema and is reset only with an explicit test command. Redis gets a named volume only if persistence is intentionally tested; otherwise document ephemeral local cache semantics.

## 9. Domain types and ports

- `DatabaseHealthPort.check(timeoutMs): Promise<{status:"up";latencyMs:number}>`.
- `CacheStore`: `get`, `set(value,{ttlSeconds,nx?})`, `delete`, `increment`, `expire`, `compareAndDelete`, `ping`, `quit`; keys are namespaced `slice:{environment}:{purpose}:...`.
- `RuntimeReadiness`: `{status:"ready"|"not_ready", checks:{postgres,redis}, timestamp}` with per-check `up|down`, latency, no host/error detail.
- Prisma transaction callback type must allow later adapters to share one transaction client.

## 10. Domain rules and invariants

- API does not listen as ready until required configuration validates; it may start with `/health` while `/ready` reports 503 during transient dependency recovery only if explicitly designed/tested.
- Every Prisma/Redis operation has a finite timeout; shutdown closes listeners, queueing, Redis, then Prisma without hanging.
- Redis keys always carry environment and purpose prefixes; TTL-required records cannot be written without TTL.
- Readiness is 200 only when both dependencies respond; otherwise 503 and generic check state.
- Migrations are forward-only, reviewed, repeatable from an empty DB and never auto-reset production.

## 11. Application services

`RuntimeLifecycleService` connects dependencies on module init and closes them on shutdown. `ReadinessService.check()` concurrently probes PostgreSQL (`SELECT 1`) and Redis (`PING`) with timeouts, returns 503-safe results, and logs private causes once per state change rather than per request. Retry uses capped exponential backoff with jitter during startup only; application requests fail fast when a dependency is unavailable.

## 12. API specification

- `GET /health`: contract from 001, no dependency calls.
- `GET /ready`: public infrastructure endpoint; 200 ready or 503 not ready; response `{status,checks:{postgres:{status,latencyMs?},redis:{status,latencyMs?}},timestamp}`. No URLs, versions, database names or raw errors. No audit/event/idempotency; strict low-cost infrastructure rate limit may be added by 005. Frontend does not consume it.

## 13. Error catalogue

`CONFIG_INVALID` (startup, no HTTP), `DATABASE_UNAVAILABLE` (503, retryable, generic), `CACHE_UNAVAILABLE` (503, retryable), `DEPENDENCY_TIMEOUT` (503), `MIGRATION_DRIFT` (operator failure, not HTTP), `RUNTIME_SHUTTING_DOWN` (503). Log private causes redacted; no durable audit.

## 14. Authorization and security

Readiness is public but reveals only up/down. Secrets stay in environment/secret manager, never committed or returned. Compose binds database/cache to loopback by default and uses non-default development credentials from `.env`. Unit tests cannot connect to a developer/production URL; assert the test database marker before reset.

## 15. Audit and idempotency

No product mutation. Migration history is Prisma’s migration ledger. Operational connect/outage/recovery logs include service and state but no URL/credential. Redis NX/compare-delete primitives are infrastructure capabilities, not HTTP idempotency records.

## 16. Events, realtime and jobs

None. Do not add BullMQ/outbox. Dependency state transitions may emit structured operational logs only.

## 17. Frontend alignment

No frontend code changes. Later HTTP adapters can distinguish liveness/readiness in deployment checks, but React routes, mocks, query keys and visual states remain unchanged.

## 18. Implementation file plan

Modify `compose.yaml`, `.env.example`, config, `app.module.ts`, database/Redis/health modules and tests. Create `server/prisma/migrations/0001_identity_control_foundation/migration.sql`, integration-test helpers and readiness E2E tests. Preserve identity domain/DTO/ports for 003/004 and avoid `src/**`.

## 19. Numbered implementation process

1. Verify 001 and inventory schema/runtime scaffolds.
2. Harden Compose image pins, ports, health checks, networks, volumes and stop grace periods.
3. Add strict config parsing and test-environment safeguards.
4. Complete Prisma/Redis lifecycle providers and app wiring.
5. Generate the initial migration from the reviewed schema; inspect SQL before applying.
6. Bring up dependencies, apply migration, validate status and generate Prisma client.
7. Implement readiness probes and bounded failure mapping.
8. Add real PostgreSQL/Redis integration fixtures with safe reset.
9. Test clean startup, one-dependency outages, recovery and shutdown.
10. Record exact verification and state; stop if container verification is unavailable.

## 20. Test plan

- Unit: URL/config requirements, timeouts, readiness aggregation, redacted failure logs, key namespace/TTL enforcement.
- PostgreSQL integration: connect, transaction commit/rollback, uniqueness/FK behavior in existing schema, disconnect.
- Redis integration: ping, set/get TTL expiry, NX contention, increment, compare-delete, namespace.
- E2E: health remains 200 during dependency outage; ready changes 200→503→200; no sensitive detail.
- Migration: apply from empty test DB, `prisma migrate status`, schema validation/generation, no drift.
- No browser/provider tests.

## 21. Manual QA

Create local env, start Compose, wait for healthy, run migration/status, start API, call `/health` and `/ready`. Stop Redis then PostgreSQL separately and confirm 503 safe readiness and recovery. Stop API with Ctrl+C and confirm clean client disconnect. Inspect DB tables/migration ledger and Redis keys; cleanup with Compose stop, not destructive volume removal unless explicitly approved for the test environment.

## 22. Verification commands

From repository root: `docker compose config`, `docker compose up -d`, `docker compose ps`. From `server/`: `npx prisma format`, `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy`, `npx prisma migrate status`, `npm run test:integration`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`. Use only a confirmed disposable `TEST_DATABASE_URL` for integration resets.

## 23. Documentation and state updates

Update `CURRENT_STATE.md`, `project-state.json`, `MASTER_CHECKLIST.md`, `PROMPT_INDEX.md`, `IMPLEMENTATION_ORDER.md`, `ENTITY_DATABASE_BLUEPRINT.md`, `API_BLUEPRINT.md`, `VERIFICATION_BASELINE.md`, `.env.example` documentation and this prompt. Mark complete only with container/migration/integration evidence.

## 24. Completion checklist

- [x] Compose config is valid and both services become healthy.
- [x] Runtime refuses missing/unsafe configuration.
- [x] Prisma and Redis connect, recover and close cleanly.
- [x] Initial migration applies from an empty test DB with no drift.
- [x] Test reset configuration rejects unmarked non-test database URLs.
- [x] Redis TTL/NX/atomic delete behavior is proven against Redis.
- [x] `/ready` returns correct 200/503 states without secrets.
- [x] Outage/recovery/shutdown tests pass.
- [x] No product model or frontend feature was implemented.

## 24A. Implementation evidence (2026-08-06)

- Docker Client/Engine 29.6.2 and Docker Compose v5.3.1 passed version checks; `docker compose config` passed. PostgreSQL 16.4 and Redis 7.4 became healthy on loopback-only ports.
- Direct PostgreSQL connectivity and Redis `PING` passed. `prisma migrate deploy` applied `0001_identity_control_foundation`; `prisma migrate status` reported the schema up to date. The same existing migration applied cleanly to the disposable `slice_test` database.
- `npm run test:integration` passed 3 real-service tests covering PostgreSQL transaction commit/rollback and constraint behavior, plus Redis lifecycle, namespacing, TTL, NX, increment and compare-delete behavior. Server typecheck, lint, 53 unit tests, 7 HTTP E2E tests and production build passed.
- Manual QA started the API with real dependency URLs. `/health` returned 200 independently and `/ready` returned 200 while healthy. Stopping Redis and PostgreSQL separately produced safe 503 readiness while liveness remained 200; restoring each service returned readiness to 200. The Redis recovery path emitted no unhandled-error event after the final client listener adjustment. Application SIGTERM and normal `docker compose stop` shutdown were completed after verification.

## 25. Final report format

Report the 17 standard items: assigned document; checklist; created/modified files; migration; models; endpoints; services; adapters; events/jobs; tests; manual QA; guide updates; frontend changes; limitations; blockers; and next document `003`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
