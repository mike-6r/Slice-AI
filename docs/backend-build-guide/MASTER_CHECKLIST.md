# Master checklist

## Document 018 Phase 3 closure update (2026-08-08)

- [x] Local production-readiness hardening: strict deployment configuration, secret/example audit,
  Helmet/CORS/cookie/session boundaries, request/log redaction, fail-closed operational controls and
  safe health/readiness verification.
- [x] Local recovery/performance: bounded load check, real PostgreSQL concurrency/rollback regression,
  isolated backup restore and clean empty-database migration bootstrap at 40 migrations.
- [x] Full local quality gates: backend 125 unit, 106 integration and 71 HTTP E2E tests; frontend 36
  tests; typecheck, lint, builds, Prisma and production dependency audits.
- [ ] External launch gates: Bridge/Plaid sandbox certification, BlockchainAnalysis.io account
  certification, independent security review, production monitoring/on-call, legal approval and
  explicit human launch go/no-go.

- [x] 001 canonical HTTP/config/logging/health foundation verified (2026-08-05: 41 unit tests, 6 HTTP E2E tests, server lint/typecheck/build and manual local QA passed).
- [x] 002 PostgreSQL, Redis, migration and readiness verified with real containers (2026-08-06: Docker Engine 29.6.2, Compose v5.3.1, healthy PostgreSQL/Redis, migration applied/status clean, 3 real integration tests and live outage/recovery/shutdown QA passed).
- [x] 003 durable identity adapters and transaction races verified (2026-08-06: Prisma repositories/unit of work, forward migration constraints, and 4 real identity persistence integration tests passed).
- [x] 004 auth/session/profile flows, refresh replay and HTTP contracts verified (2026-08-06: 55 unit, 28 real PostgreSQL/Redis integration, 18 HTTP E2E tests, and live manual QA passed; revoked-token logout-all is limited to verified exact replays, limiter counters are atomic with TTL, production cookie/proxy configuration is fail-safe, and no frontend changes).
- [x] 005 permission matrix, status administration, audit, idempotency and Redis limits verified (2026-08-06: security hardening migration, restricted-session policy, recent-auth control, serialized global-admin/bootstrap invariant, write-time audit allowlist, stable cursors, 58 unit, 30 real PostgreSQL/Redis integration and 23 HTTP E2E tests passed; no frontend changes).
- [x] 006 shared wire conventions and catalogue/reference schema/API verified (2026-08-06: metadata-only public DTOs, ETags/cursors, admin maintenance, repeatable reference seed, migrations 0005 and 0006 canonical grade-scale integrity, 60 unit/32 integration/24 E2E tests; no price or ownership contract published).
- [x] 007 market/asset reads, source status and honest trading placeholders verified (2026-08-06: migration 0007, attributed DEMO estimated-market-value reads, bounded public filters/history, and empty non-trading placeholders; no generic price/unit-price/ownership contract).
- [x] 008 collectors/Vault/public portfolio/watchlist/notification reads and privacy verified (2026-08-06: migration 0008, opt-in public profiles, source-safe vault events, explicit unavailable portfolio, self-only cursor-paginated watchlist/notifications, durable idempotency/audit mutations, 60 unit/33 integration/27 E2E tests).
- [ ] 009 frontend read adapters replace direct mocks incrementally without redesign.
- [x] 009 frontend read API integration verified (closure update 2026-08-06).
- [x] 009A frontend auth/session/private-cache integration and browser QA verified (closure update 2026-08-06).
- [-] 009 implementation is complete but closure is blocked on 009A frontend auth/private-cache integration and browser-control runtime QA.
- [-] 009A frontend auth/session/private-cache integration is implemented and automated-tested; real authenticated/responsive browser QA is blocked by unavailable browser-control runtime.
- [x] 010 secure uploads, submission transitions and reviewer separation verified (2026-08-07: tenth migration, owner/media/reviewer/transition real-service E2E suites, 63 unit/35 integration/34 E2E tests; local adapter only and production uploads remain disabled until provider approval).
- [x] 011 valuation/custody/insurance evidence and publication gates verified (2026-08-07: manual provider-labelled lifecycle, permission/recent-auth boundaries, composite idempotency, safe projections, lifecycle notifications, publication locking/no-op replay, 67 unit/37 real PostgreSQL-Redis integration/38 HTTP E2E tests, and disposable live HTTP QA passed; no ownership, ledger or trading state was created).
- [x] 012 ownership issuance, positions, reservations, compensating correction and reconciliation verified (2026-08-07: 13 migrations, real PostgreSQL races/rollback, 75 unit/37 integration/55 HTTP E2E tests, aggregate-only public projection and disposable-fixture cleanup).
- [x] 013 double-entry finance, reservations, FIFO lots/disposals, compensating reversals and reconciliation verified (2026-08-07: 14 migrations; 89 unit/43 real PostgreSQL-Redis integration/59 HTTP E2E tests; 31 frontend tests; disposable finance QA and cleanup passed).
- [x] 014 orders, priority, partial fills and atomic ownership/cash/FIFO/fee settlement verified (2026-08-08: 18 migrations; 94 unit/60 real PostgreSQL-Redis integration/61 HTTP E2E tests; fee accounting, race/rollback proofs and disposable manual QA cleanup passed; no Document 015 scope started).
- [x] 015 community moderation, immutable voting snapshots, two-person external-sale approval and exact finance-authoritative distributions verified (2026-08-08: 21 migrations; 98 unit/67 real PostgreSQL-Redis integration/63 HTTP E2E tests; rollback/recovery, concurrency, reconciliation and scoped manual QA cleanup passed).
- [x] 016 local provider-neutral implementation: encrypted compliance/KYC-KYT boundaries, movements, webhook security, holds/incidents and reconciliation verified (2026-08-08: 26 migrations; 114 unit/85 real PostgreSQL-Redis integration/65 HTTP E2E tests; sandbox/live provider certification remains pending and production is fail-closed).
- [x] 017 transactional outbox, leased worker reliability, delivery routing, authenticated notification/SSE and privileged dead-letter recovery verified.
- [ ] 018 threat review, load/race/restore/rollback, final adapters and human launch gate verified.

## Documentation quality gate

- [x] All 18 prompts contain the required 26 sections.
- [x] Each prompt identifies exact source paths, ownership, prerequisites, tests, QA, commands and stop condition.
- [x] API/entity/document ownership uses only 001–018.
- [x] Current implementation statuses remain unchanged by this documentation pass.

## Production readiness

- [ ] No unresolved high/critical security finding.
- [x] Ownership, finance, trading and local provider reconciliation pass; provider discrepancies are immutable and never auto-repair.
- [ ] Monitoring, incidents, backup restore and disaster-recovery drills pass.
- [x] All real-money provider flags remain disabled until external provider/legal certification is recorded.
- [ ] Accessibility, browser and visual regression pass without redesign.
- [ ] No mock, simulated or unapproved provider state is presented as live.
