# Verification baseline

## Document 012 completion baseline (2026-08-07)

- Migrations through `20260807120000_ownership_reservations_reconciliation` are applied cleanly to `slice_test`; Prisma format, validation, client generation and migration status passed.
- Backend typecheck, lint and build passed. Document 012 changed no frontend projections.
- Real PostgreSQL/Redis ownership suites prove issuance/replay, transfer/reserve/release/correction/reconciliation, duplicate-issuance and destination-account races, reserve-vs-transfer invariants, deterministic mismatch detection and controlled transaction rollback. Final counts: 75 unit, 37 integration and 55 HTTP E2E tests.

| Area                                        | Command / directory                                                                                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Blocker                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Frontend install                            | `npm ci` / repository root                                                                                                  | Passed 2026-08-05; 0 audit vulnerabilities; deprecated Recharts warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | no                               |
| Frontend typecheck                          | `npm run typecheck` / root                                                                                                  | Passed 2026-08-05.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no                               |
| Frontend lint                               | `npm run lint` / root                                                                                                       | Failed only on pre-existing Prettier error in `server/src/modules/identity/security/password-security.spec.ts:34`; 9 existing fast-refresh warnings.                                                                                                                                                                                                                                                                                                                                                                                  | no for 002                       |
| Frontend tests                              | `npm test` / root                                                                                                           | Failed: root Vitest collects Jest server specs and root install lacks `argon2`; frontend's 12 tests passed.                                                                                                                                                                                                                                                                                                                                                                                                                           | no for 002; test-boundary defect |
| Frontend build                              | `npm run build` / root                                                                                                      | Passed 2026-08-05.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | no                               |
| Backend install                             | `npm ci` / `server`                                                                                                         | Passed 2026-08-05; audit reports 3 high vulnerabilities and deprecated transitive packages.                                                                                                                                                                                                                                                                                                                                                                                                                                           | security follow-up               |
| Backend verification                        | `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build` / `server` | Passed 2026-08-06 after the Document 006 grade-scale integrity remediation: 60 unit tests, 32 real PostgreSQL/Redis integration tests, 24 HTTP E2E tests, lint, typecheck and production build.                                                                                                                                                                                                                                                                                                                                       | no for 006                       |
| Prisma schema/client and migration          | `prisma validate`, `prisma generate`, `prisma migrate status` / `server`                                                    | Passed 2026-08-06 with real local PostgreSQL. `0001`–`0006_asset_grade_scale_relation` applied to `slice` and disposable `slice_test`; status reports schema up to date. The generated client was inspected to confirm `Asset.gradingCompanyId` is absent, and the real-service catalogue asset-create E2E now passes.                                                                                                                                                                                                                | no                               |
| Document 006 catalogue QA                   | Real `slice_test` PostgreSQL and Redis                                                                                      | Passed 2026-08-06: repeatable non-economic reference seed; public ETag/category/grade/published-metadata reads; authorized admin category/set/company/grade/asset identity maintenance; idempotent replay/conflict; invalid reference rejection; private certification excluded. No market, valuation, ownership, or generic price field was published because SD-001 remains unresolved.                                                                                                                                             | no                               |
| Document 007 market reads                   | Real `slice_test` PostgreSQL and Redis                                                                                      | Passed 2026-08-06: migration `0007_market_read_models`; public published-asset list/detail/history/similar, summary and movers return source/asOf/dataStatus and explicitly named `estimatedMarketValue` integer GBP minor units. Order-book/recent-trade endpoints return empty `NOT_AVAILABLE_UNTIL_TRADING` placeholders. 60 unit, 32 integration and 25 HTTP E2E tests pass; no generic price, Slice-unit price, ownership or trading write was introduced.                                                                       | no                               |
| Docker/Compose                              | Docker CLI, Engine, Compose v2 and `docker compose config` / `server`                                                       | Passed 2026-08-06: Docker Client/Engine 29.6.2, Compose v5.3.1; Compose configuration valid.                                                                                                                                                                                                                                                                                                                                                                                                                                          | no                               |
| PostgreSQL/Redis                            | Compose health checks, direct clients, `npm run test:integration`, live API outage/recovery / `server`                      | Passed 2026-08-06: both containers healthy; direct PostgreSQL/Redis connectivity; 28 integration tests cover runtime, identity transactions, concurrent refresh rotation, durable idempotency, and all five auth-abuse limiter operation thresholds. Redis tests prove atomic counter-plus-first-write TTL, concurrent bounded TTL, expiry reset, hashed/namespaced keys, canonical 429 with `Retry-After`, fail-closed 503 on supported disconnect, and in-app recovery.                                                             | no                               |
| Document 004 security remediation manual QA | Live Nest API on disposable `slice_test` with synthetic credentials                                                         | Passed 2026-08-06: first logout-all 204; exact replay from its revoked access session 204; a new key from that revoked session 401 while a post-logout fresh session remained 200; malformed refresh cookie 400 safe error; limiter threshold/TTL passed; supported Redis disconnect returned 503 and recovery returned signup 201. Synthetic users/idempotency records were cleaned and no credential was printed.                                                                                                                   | no                               |
| Document 005 manual QA                      | Disposable `slice_test` with a synthetic existing user and Redis/PostgreSQL services                                        | Passed 2026-08-06: one-time administrator bootstrap created exactly one global `ADMIN` assignment and `ADMIN_BOOTSTRAPPED` audit event; fixtures were then removed. HTTP E2E covered authorized/denied status administration, exact/conflicting idempotent replay, status history/audit redaction, role self-grant denial, Redis control-limit 429 and supported disconnect/recovery 503.                                                                                                                                             | no                               |
| Document 005 security remediation QA        | Real `slice_test` PostgreSQL and Redis                                                                                      | Passed 2026-08-06: restricting a user revoked sessions and blocked mutation/refresh while safe `me`, `session`, and logout requests remained available; concurrent administrator revocations/status changes retained an active global administrator; stale admin sessions returned `RECENT_AUTH_REQUIRED` while a fresh login succeeded; non-global roles had no global privilege; concurrent bootstrap established one administrator; denied privileged access was durable-audited; same-timestamp audit cursor pages were complete. | no                               |

No command is recorded as passed merely because a package script exists. This baseline records the date,
output summary and known boundary for each verification run.

## Document 013 completion verification (2026-08-07)

- Canonical local PostgreSQL and Redis were used. Prisma format, validate, generate and migrate status passed; `slice_test` is current with **14 migrations**.
- Backend passed typecheck, lint and build; `npm test` passed **20 suites / 89 tests**, `npm run test:integration` passed **10 suites / 43 real PostgreSQL/Redis tests**, and `npm run test:e2e` passed **22 suites / 59 tests**.
- Focused financial integration proves balanced/unbalanced posting, projection replay, reservation limits, FIFO partial/full remainder conservation, one compensating reversal, clean/mismatch reconciliation, injected transaction rollbacks, and actual concurrent journal/reservation/FIFO/reversal state checks.
- Root frontend passed typecheck, `npm test` (**11 suites / 31 tests**) and build. Lint has zero errors and the nine pre-existing Fast Refresh warnings.
- Manual `qa:finance` passed on disposable local data and returned residual `[0,0,0,0]` after cleanup. Document 014 was not started.

## Document 014 completion verification (2026-08-08)

- Canonical local PostgreSQL and Redis were used. Prisma format, validate, client generation and migration status passed; `slice_test` is current with **18 migrations**.
- Backend passed typecheck, lint and build; `npm test` passed **22 suites / 94 tests**, `npm run test:integration` passed **11 suites / 60 real PostgreSQL/Redis tests**, and `npm run test:e2e` passed **23 suites / 61 tests** in 35.8 seconds.
- Focused trading PostgreSQL proof passed **17/17**. It includes reserve, matcher, cancellation/expiry, self-trade, price-time, replay, conflict and fault-injection rollback state checks. Maker `0` bps and taker `100` bps fees persist in executions, seller FIFO disposal and the balanced platform-fee journal; replay does not duplicate fee state.
- Manual `src/scripts/manual-trading-qa.ts` passed with funding, GTC maker-price match/replay, insufficient-funds rejection, cancellation/release, safe reads and 100-bps taker fee. Scoped cleanup recorded zero orders, executions, cash reservations, lots, financial accounts, journal transactions, ownership accounts/positions, users and assets.
- Document 014 owns no frontend work, so no frontend contract/UI was changed. Document 015 remains NOT STARTED.

## Document 015 completion verification (2026-08-08)

- Canonical local PostgreSQL and Redis were used. Prisma format, validation, client generation and migration status passed; `slice_test` is current with **21 migrations**.
- Backend passed typecheck, lint and build; `npm test` passed **23 suites / 98 tests**, `npm run test:integration` passed **12 suites / 67 real PostgreSQL/Redis tests**, and `npm run test:e2e` passed **24 suites / 63 tests**.
- Focused community/governance integration passed **7/7** and unit policy proof passed **4/4**. It covers fail-closed policy gating, immutable snapshots, concurrent opens/votes/verifiers, vote/close/reconciliation rollback, deterministic largest-remainder allocation, balanced finance journal posting and exactly-once post-journal recovery.
- Disposable `npm run qa:community` passed against real local PostgreSQL/Redis. Its cleanup recorded zero scoped proposals, distributions, assets and users. Document 015 owns no frontend changes; Document 016 remains NOT STARTED.

## Document 016 local verification update (2026-08-08)

- `npm test`: 27 suites / 114 tests; `npm run test:integration`: 21 suites / 85 real PostgreSQL/Redis tests; `npm run test:e2e`: 25 suites / 65 HTTP tests. Typecheck, lint, build, Prisma format/validate/generate and migration status pass with 27 migrations current.
- `npm run qa:providers` exercised the deterministic local provider lifecycle against PostgreSQL/Redis: deposit/replay credit once, withdrawal KYT-before-reservation/complete, cancellation release, hold enforcement/release, append-only reversal and clean reconciliation. Cleanup reported zero scoped users, movements, reservations and compliance cases.
- Bridge/Plaid sandbox and BlockchainAnalysis.io live/account certification are intentionally not represented as passed. Production provider mode remains OFF / FAIL-CLOSED; Document 017 is STARTED / PARTIAL solely because its independently-created Discord persistence migration exists.

## Document 017 transactional outbox phase-1/2 verification (2026-08-08)

- Focused outbox proof: 2 envelope unit tests, 19 pre-worker outbox/trading PostgreSQL tests and 6 PostgreSQL worker tests. Worker evidence covers bounded concurrent `SKIP LOCKED` claims, deterministic eligible order, fenced stale-token rejection, success, retry/backoff, max-attempt and schema dead letter, and recovery after an injected finalization crash.
- Full backend regression: 28 unit suites / 116 tests, 23 integration suites / 93 tests, 25 HTTP E2E suites / 65 tests; typecheck, lint, build, Prisma validation and migration status pass with 30 migrations current.
- No Discord, queue platform, realtime, notification delivery, email or push consumer was introduced.

## Document 017 delivery-routing phase-3 verification (2026-08-08)

- Focused real PostgreSQL proof: 4 delivery-routing tests verify deterministic delivery reuse, atomic multi-intent rollback, optional/mandatory policy behavior and outbox reprocessing after injected finalization failure without a duplicate delivery row.
- Full backend regression: 28 unit suites / 116 tests, 24 integration suites / 97 tests, 25 HTTP E2E suites / 65 tests; typecheck, lint, build, Prisma validation and migration status pass with 31 migrations current.
- No Discord/email/push transport, realtime, queue platform or `apps/discord-bot` change was introduced.

## Document 010 completion verification (2026-08-07)

- Real local PostgreSQL and Redis: `20260807041334_submissions_media_verification` applied; Prisma format/validate/generate/migrate-status passed with ten migrations and an up-to-date `slice_test` schema.
- Backend: typecheck, lint, build, unit, integration and full E2E passed: **63 unit**, **35 integration**, **34 HTTP E2E**. Focused submissions owner/media/reviewer/transition E2E suites passed independently using bounded real-service fixtures and unique forwarded IPs.
- Root frontend regression: typecheck, test (**27 tests**) and production build passed. Lint had zero errors and only the nine existing Fast Refresh warnings.
- Local deterministic storage/scanner doubles verified media intent/completion/removal, invalid declared type, oversize, mismatched magic signature, rejected scan, duplicate checksum, private projections and safe object keys. Production uploads remain disabled until an approved provider adapter exists.

## Document 011 completion verification (2026-08-07)

- Real local PostgreSQL and Redis: `20260807064953_valuation_custody_publication` applied; Prisma format/validate/generate/migrate-status passed with eleven migrations and an up-to-date `slice_test` schema.
- Backend: typecheck, lint, build, unit, integration and full E2E passed: **67 unit**, **37 integration**, **38 HTTP E2E**. The lifecycle suite proved seller isolation, permission/recent-auth denial, readiness blocking, custody validation, exact replay/conflict, safe projection and concurrent initial publication.
- Root regression: typecheck, test (**27 tests**) and production build passed. Lint had zero errors and only the nine existing Fast Refresh warnings.
- Disposable live HTTP QA exercised approved handoff, blocked-to-ready progression, custody/valuation/coverage, publication/replay, market visibility, seller-safe status, private-field exclusion, audit/notification counts and cleanup.

## Document 009 boundary

- Automated frontend checks and focused public pagination integration/E2E checks passed.
- Responsive public browser QA was not executed: callable browser-control runtime `mcp__node_repl__js` is unavailable.
- Real authenticated browser QA was not executed: 009A frontend session implementation is automated-tested, but browser control is unavailable.

## Document 009A update (2026-08-06)

## 009 / 009A closure evidence (2026-08-06)

- Local browser harness proved one refresh for parallel safe GET recovery and one rollback for each forced watchlist/notification mutation failure.
- Frontend: 27 tests passed; typecheck, lint (zero errors; nine pre-existing warnings) and production build passed with no QA-harness code in the output.
- Backend: 60 unit, 34 integration and 28 HTTP E2E tests passed; Prisma validation and migration status passed with migrations 0001–0009 applied.
- Documents 009 and 009A are COMPLETE. Document 010 remains NOT STARTED.

- Frontend session implementation: 25 unit tests, typecheck, lint (zero errors; nine pre-existing warnings) and production build pass.
- Backend regression: 60 unit tests, 34 real PostgreSQL/Redis integration tests and 28 HTTP E2E tests pass; Prisma validation, generation and migration status report success with nine migrations.
- Browser QA remains unexecuted and blocked because `mcp__node_repl__js` is unavailable. No visual or authenticated browser-session claim is made.

## Documentation-expansion verification

- 18 implementation files were found and each contains numbered sections 1-26 exactly once.
- Every prompt contains the required stop condition.
- `project-state.json` parses as JSON and retains the implementation statuses above.
- No obsolete out-of-range implementation document numbers remain in the guide.
- Document 001 implementation changed backend foundation files only.
- Document 002 implementation changed backend runtime/configuration, migration, integration-test and documentation files only; no frontend visual files were changed.

## Document 017 final verification (2026-08-08)

- Focused dead-letter operations: 1 PostgreSQL suite / 3 tests and 1 HTTP E2E suite / 1 test passed.
- Full backend: 28 unit suites / 116 tests, 26 PostgreSQL/Redis integration suites / 105 tests and 27 HTTP E2E suites / 70 tests passed. Typecheck, lint, build, Prisma format/validate/generate and migration status passed with 37 migrations current.

## Document 017 shared-chain closure verification (2026-08-08)

- Additive Discord-only profile, delivery-receipt and price-alert persistence migrations were inspected under explicit authorization. Prisma reports 39 migrations and an up-to-date `slice_test` schema.
- Re-run evidence: dead-letter operations 1 PostgreSQL suite / 3 tests and 1 HTTP E2E suite / 1 test; full backend 28 unit suites / 116 tests, 26 PostgreSQL/Redis integration suites / 105 tests and 27 HTTP E2E suites / 70 tests. Typecheck, lint, build and Prisma validation/status pass.

## Document 018 Phase 3 production-readiness verification (2026-08-08)

- Backend: **29 unit suites / 125 tests**, **27 real PostgreSQL/Redis integration suites / 106
  tests**, and **27 HTTP E2E suites / 71 tests**. Frontend: **11 Vitest suites / 36 tests**.
  Root/server typecheck, lint and builds pass.
- Prisma format, validate, generate and status pass with **40 migrations**. A custom-format
  PostgreSQL backup restored to isolated `slice_phase3_restore_20260808`, and an empty isolated
  database applied all 40 migrations with `prisma migrate deploy`; both temporary databases were
  removed with zero residual temporary database counts.
- A four-client/40-request local load check recorded zero errors, health p95 56.13 ms and market
  list p95 160.74 ms. Existing trading/provider/outbox integration suites provide bounded race,
  exactly-once, rollback, fencing and dead-letter proof.
- Root and server production dependency audits report zero vulnerabilities. External provider
  certification and an independent/human launch gate are deliberately not claimed as passed.
