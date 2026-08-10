# Current state

## Final full Slice system QA re-run — Documents 001–018 (2026-08-09)

The final local re-run is **PASS** with **0 internal BLOCKER** and **0 internal HIGH** findings.
Frontend typecheck, lint, production build and **12 Vitest suites / 45 tests** passed. Backend
typecheck, lint, build, **29 unit suites / 125 tests**, **27 real PostgreSQL/Redis integration suites
/ 106 tests**, and **27 HTTP E2E suites / 73 tests** passed. Prisma format, validate, generate and
migration status passed with **40** migrations current; both root and server production dependency
audits reported **0 vulnerabilities**.

Disposable finance, community/distribution, and provider workflows passed with their own scoped
cleanup. The bounded live API load check completed 20 health and 20 marketplace requests at
concurrency 4 with 0 failures. Direct PostgreSQL invariant checks reported 0 unbalanced journals,
projection mismatches, invalid cash reservations, invalid ownership positions, invalid lots, invalid
orders, and distribution mismatches. The API-mode production bundle contains no mock dataset marker,
and no first-party storage authority exists under `src`.

FSQA-003 remains open solely for the named host-browser visual/control matrix. On 2026-08-09 the
Codex in-app browser could reach the local API-mode Vite application and completed a limited
fixture/login/session-restoration smoke check, but no Chrome, Edge or Firefox host browser is
attached to this environment. The exact host procedure is recorded in
[`FSQA-003_HOST_BROWSER_QA_RUNBOOK.md`](FSQA-003_HOST_BROWSER_QA_RUNBOOK.md). FSQA-006 remains
pending external Bridge/Plaid/BlockchainAnalysis certification and human launch approval. No
deployment, staging work, provider certification, Discord work, or new product feature was
performed.

## QA remediation #3 — legacy frontend cleanup and project metadata reconciliation (2026-08-09)

FSQA-004 and FSQA-005 are **CLOSED**. The unreachable legacy home/listing/market components,
legacy market repository, duplicate domain model, `DemoStateProvider`, and unused home fixture were
removed after an import-graph audit. The only remaining mock implementation is the explicit
`VITE_DATA_SOURCE=mock` development adapter and its tests. `AppServicesProvider` dynamically loads
that adapter only in mock mode; API mode creates HTTP repositories and does not import or fall back
to simulated market, portfolio, listing, allocation, or order authority. The active catalogue
presentation now reads only the backend-provided `market.estimatedMarketValue` field.

No first-party application source reads or writes `localStorage` or `sessionStorage` for product
authority. The sole browser-storage match is a third-party resizable-panel UI preference dependency;
cash, holdings, orders, executions, submissions, governance, compliance, notifications and bank
connections remain API-backed and server-authoritative. `project-state.json` now records durable
notifications/SSE rather than a mocked system, 40 current migrations, Document 018 as partial
because host-browser/staging and external launch gates remain, and the current verified counts:
frontend **12 suites / 45 tests**; backend **29 unit suites / 125 tests**, **27 integration suites /
106 tests**, and **27 HTTP E2E suites / 73 tests**. FSQA-003 remains open solely for host-browser or
staging visual QA; FSQA-006 remains pending external provider/human launch certification.

## QA remediation #1 â€” D15 governance frontend completion (2026-08-09)

FSQA-001 is **CLOSED**. The authenticated `GET /v1/sale-proposals` read model is bounded,
viewer-aware and safe: cursor pagination plus status, asset and immutable-snapshot relevance filters
exclude proposer, ownership-account, voter, financial, distribution and audit internals. The API-mode
`/governance` route now discovers active/eligible/closed proposals, links authoritative detail,
permits eligible owners to create a draft, and exposes existing open/close lifecycle actions only to
users whose safe current-user role projection contains `ADMIN`. The server remains the authority for
permission and recent-auth checks. Focused governance evidence: **7 PostgreSQL integration tests**
and **3 HTTP E2E tests** passed; `qa:community` passed with zero scoped proposals, distributions,
assets and users after cleanup. The local browser fixture now creates/removes the scoped
published/custodied ownership snapshot and OPEN proposal needed for host-browser QA. Full regression:
frontend **12 Vitest suites / 44 tests**; backend **29 unit suites / 125 tests**, **27 integration
suites / 106 tests**, and **27 HTTP E2E suites / 72 tests**; typecheck, lint (nine existing Fast
Refresh warnings only), builds and Prisma validation/status all passed with **40 migrations** current.
The Codex in-app browser remains isolated from host loopback, so visual click-through remains FSQA-003
rather than a fabricated browser-pass claim.

## Document 018 Phase 3 completion update (2026-08-08)

Document **018 Phase 3 is COMPLETE for local implementation and verification**. It adds fail-closed
production operational controls, strict deployment configuration validation, clean dependency/secret
audits, safe headers/CORS/session boundaries, redacted structured logs, health/readiness signals,
bounded local load evidence, isolated PostgreSQL restore and fresh-migration rehearsals, and recovery
runbooks. Final evidence: **40 migrations**, backend **29 unit suites / 125 tests**, **27 real
PostgreSQL/Redis integration suites / 106 tests**, **27 HTTP E2E suites / 71 tests**, and frontend
**11 suites / 36 tests**; typecheck, lint, builds, Prisma and production dependency audits pass.

This is not a production launch approval. Bridge/Plaid sandbox certification,
BlockchainAnalysis.io account certification, independent security review, production observability,
operations/on-call, legal approval and explicit human go/no-go remain external gates. Provider and
new-risk operational flags are OFF / FAIL-CLOSED by default in production. No Phase 4 work started.

## Document 018 local frontend/backend integration sweep (2026-08-08)

Staging deployment remains **PAUSED**. The customer API-mode route inventory is recorded in
[`FRONTEND_BACKEND_INTEGRATION_MATRIX.md`](FRONTEND_BACKEND_INTEGRATION_MATRIX.md). This sweep
removed three misleading production-path behaviors: the localStorage/AI/listing-result simulator is
now a real D10 submission-draft flow, sale proposals/votes use D15 projections and mutations, and
the unsupported portfolio-allocation simulator is explicitly unavailable. Account reads now use the
shared repository boundary. API mode has no mock fallback for these routes. Frontend verification:
**11 Vitest suites / 38 tests**, typecheck, lint and production build passed; backend typecheck,
lint and unit regression passed after the small safe catalogue category-ID projection needed by the
submission flow. No provider claim, staging deployment, Discord work, or new product authority was
added.

**Local API-mode verification update (2026-08-09):** the preserved Docker PostgreSQL role was
reconciled with the existing local environment without a volume reset, drop, or credential disclosure.
Both isolated targets (`slice`/`public` and `slice_test`/`public_test`) connect successfully and run
the checked-in **40** migrations. The local API is healthy/ready; catalogue reads return authoritative
HTTP 200 responses, and the development CORS allowlist includes the local Vite origin. API-mode
browser QA verified sign-up/session restoration, dashboard, real empty-state portfolio/wallet/history,
notifications, watchlist, account state, marketplace search, real D10 category/draft creation, the
safe D15 missing-proposal state, and the intentionally unavailable allocation route. No API-mode
mock fallback was used. Full local regression is green: frontend **11 suites / 38 tests** and backend
**29 unit suites / 125 tests**, **27 integration suites / 106 tests**, and **27 HTTP E2E suites /
71 tests**. The disposable browser-QA user and its single submission draft were then removed with
zero residual scoped users or drafts.
Staging deployment remains paused.

**Document 018 Phases 1 and 2 are COMPLETE:** the API-mode showcase has real auth, catalogue,
trading, portfolio, wallet/account, notifications and Plaid Sandbox bank-linking surfaces. The
remaining Document 018 production-hardening, certification, load/staging and launch-gate work is
Phase 3 and remains intentionally not started.

Documentation audit status: **EXPANDED AND RECONCILED**. **Document 018 is STARTED: Phases 1 and
2 are complete.** API mode connects the showcase path through the existing frontend
repository/React Query boundaries: session, marketplace/detail/history, D14 order
preview/place/cancel/book/executions, D13 portfolio/wallet, D16 safe provider projections and D17
notifications/SSE. The remaining D18 production-hardening, provider-certification, load/staging and
launch-gate work is Phase 3 and intentionally deferred. All 18 implementation prompts contain the
required 26 standalone sections. Implementation documents 001–005 are complete; later
implementation status remains unchanged.

| System                                           | Status                                                         | Evidence and missing work                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend overall                                 | PARTIAL                                                        | Documents 009/009A use HTTP repositories behind `AppServicesProvider`, real cookie-backed session recovery, and completed local browser-harness QA. Later product workflows remain incomplete.                                                                                                                                                                                                                                                                                                      |
| Backend overall                                  | PARTIAL                                                        | Documents 001–010 are complete: runtime, identity/access, catalogue/market reads, public/self reads and private submissions/media/review workflow are verified. Later product phases remain incomplete.                                                                                                                                                                                                                                                                                             |
| Infrastructure / Docker                          | VERIFIED                                                       | Docker Engine 29.6.2 and Compose v5.3.1 ran the pinned loopback-only PostgreSQL 16.4 and Redis 7.4 services; both health checks passed on 2026-08-06.                                                                                                                                                                                                                                                                                                                                               |
| PostgreSQL / Redis                               | VERIFIED                                                       | Direct PostgreSQL and Redis connections, lifecycle recovery, real transaction/cache integration tests, readiness degradation/recovery, and normal shutdown were verified on 2026-08-06.                                                                                                                                                                                                                                                                                                             |
| Prisma / migrations / seed                       | MIGRATED                                                       | `0001`–`20260807041334_submissions_media_verification` are applied to local `slice` and disposable `slice_test`; status reports schema up to date. `catalogue-reference-v1` is repeatable, non-economic reference data only.                                                                                                                                                                                                                                                                        |
| Identity                                         | VERIFIED                                                       | Document 004 authentication/session/profile APIs are verified with JWT access control, opaque refresh-cookie rotation/replay defense, guarded self reads, composite durable idempotency, atomic Redis abuse controls, and 11 dedicated real-service auth E2E tests. The 2026-08-06 remediation restricts revoked-token logout-all access to verified exact replays, equalizes login verification work, hardens production cookie/proxy configuration, and safely rejects malformed refresh cookies. |
| Access control                                   | VERIFIED                                                       | Document 005 adds deny-by-default permission guards, GLOBAL-only effective role resolution, transaction-serialized last-admin/bootstrap protection, restricted-account session revocation with safe-read/logout exceptions, recent-auth guards for high-impact operations, redacted write-time audited privileged reads, durable idempotency, and atomic Redis control limits.                                                                                                                      |
| Asset catalogue                                  | VERIFIED                                                       | Document 006 provides public reference reads and published metadata-only asset reads plus authorized, audited, idempotent catalogue maintenance. The post-006 integrity remediation verifies real-service asset creation against the canonical `GradeScaleEntry` relation. No price, valuation, ownership, market, or simulation economics are published while SD-001 remains unresolved.                                                                                                           |
| Collectors / Vault Live / portfolio              | PARTIAL                                                        | Documents 008–009 provide API-backed public collector/Vault reads and an explicit unavailable portfolio state; authoritative ownership/portfolio remains later work.                                                                                                                                                                                                                                                                                                                                |
| Verification / custody / insurance / valuation   | VERIFIED                                                       | Document 011 adds manual/provider-neutral valuation, custody, active coverage, readiness and publication. Publication is locked, idempotent, and exposes only approved durable public claims.                                                                                                                                                                                                                                                                                                       |
| Ownership issuance                               | VERIFIED                                                       | Document 012 provides fixed bigint supply, private accounts/positions, append-only quantity ledger, transfer/reservation/release/correction/reconciliation, real PostgreSQL race/rollback proof and aggregate-only public reads. Finance and trading remain unimplemented.                                                                                                                                                                                                                          |
| Financial ledger / orders / trading              | VERIFIED                                                       | Documents 013–014 provide authoritative GBP finance/portfolio and integer price-time trading execution. Provider settlement/compliance remains Document 016 scope.                                                                                                                                                                                                                                                                                                                                  |
| Wallet / payments / KYC / KYT / custody provider | LOCAL IMPLEMENTATION COMPLETE / PROVIDER CERTIFICATION PENDING | Document 016 provides provider-neutral local authority with Bridge money-movement, Plaid identity/Monitor and BlockchainAnalysis.io KYT adapters. Real-provider credentials are intentionally absent, production is fail-closed, and the wallet UI remains disabled pending its launch gate.                                                                                                                                                                                                        |
| Community / proposals / voting / distributions   | VERIFIED                                                       | Document 015 provides durable follows/discussions/reports, immutable ownership snapshots, configurable fail-closed weighted voting, two-person external-sale verification, exact finance-authoritative distributions and deterministic reconciliation.                                                                                                                                                                                                                                              |
| Notifications / realtime / jobs / admin          | VERIFIED                                                       | Document 017 provides transactional outbox events, fenced leased workers, durable routing, in-app notifications, authenticated SSE, safe domain event routing and privileged audited dead-letter operations. Deployment/launch work remains Document 018.                                                                                                                                                                                                                                           |
| Frontend API integration                         | COMPLETE                                                       | Documents 009/009A provide HTTP-backed routes, real login/session recovery, 401 coordination, logout/cache eviction and local browser-harness QA.                                                                                                                                                                                                                                                                                                                                                   |
| Tests                                            | VERIFIED                                                       | Document 016 local verification passed: 27 backend unit suites / 114 tests, 21 real PostgreSQL/Redis integration suites / 85 tests and 25 HTTP E2E suites / 65 tests; typecheck, lint, build and Prisma format/validate/generate/migrate-status pass. Provider sandbox/live certification remains an external launch gate.                                                                                                                                                                          |

## Current document status (2026-08-07)

Documents **001–012** are COMPLETE. Document **013** is PARTIAL: financial persistence plus a closed-loop journal-posting primitive and self-only balance projection are applied, while reservations, lots, reconciliation and portfolio projections remain unimplemented. Fourteen migrations are applied.

## Contradictions to preserve and resolve

- `server/package.json` says Phase 1 contains no identity workflows, while the source and
  `server/docs/phase-2-completion-checklist.md` correctly show offline Phase 2A identity work.
- `server/prisma/schema.prisma` permits USD/EUR in profile data while shared server public contracts
  emit GBP only; resolve before persistent profile APIs.
- The frontend has duplicate legacy types in `src/domain/models.ts` beside the preferred modular
  `src/domain/*.ts`; no API may silently adopt the legacy shapes.
- Frontend legacy routes use GBP floating-point display calculations. Backend financial values must
  use integer GBP minor units and decimal strings for USDC.
- Frontend route files directly import legacy mock helpers while newer `src/data/repositories.ts`,
  `src/services`, `src/queries` and `src/providers` exist. Read integration must migrate through
  those boundaries, not add another client architecture.

## NEXT IMPLEMENTATION DOCUMENT

> Documents 009 and 009A are complete following local browser-harness verification. No browser-QA exception remains for the current Document 012 planning state.

`implementation/017-outbox-jobs-realtime-notifications-and-admin-operations.md` is **STARTED / PARTIAL** with independently-created Discord persistence migrations, transactional outbox, leased worker reliability and durable provider-neutral delivery routing. Discord delivery/realtime/notification-consumer work remains absent.

## Historical Document 011 start update (2026-08-07)

- Migration `20260807064953_valuation_custody_publication` is applied to `slice_test`, adding append-only valuation evidence/decisions, custody records/events, insurance coverage and publication-readiness persistence.
- Initial domain policy enforces custody transitions and blocks publication until catalogue, verification, valuation, custody, coverage and exception gates are satisfied.
- This is foundation work only: services, APIs, projections, provider/manual adapters, integration/E2E coverage and publication actions remain incomplete. Document 012 was not started.

## Current verification update (2026-08-06)

- Migrations `0001` through `0009_public_read_pagination_indexes` are applied; `prisma migrate status` reports the `slice_test` schema up to date.
- Frontend: 25 unit tests, typecheck and production build pass. Lint has zero errors and nine pre-existing Fast Refresh warnings.
- Backend: 60 unit tests, 34 PostgreSQL/Redis integration tests and 28 HTTP E2E tests pass, together with typecheck, lint, build, Prisma validation and client generation.
- No browser QA was run or claimed: `mcp__node_repl__js` is not available in this environment.

## Current closure update (2026-08-06)

- Documents **009** and **009A** are **COMPLETE**. The local-only QA harness exposed only five safe counters; production bundles contain no QA-harness code.
- Browser QA used a disposable seeded account with real PostgreSQL and Redis: single-flight refresh (`refreshCalls: 1`), parallel safe-GET recovery, no mutation retry, and watchlist/notification rollback paths passed. The fixture was removed afterwards.
- Frontend: 27 tests passed; typecheck and build passed; lint has zero errors and nine pre-existing Fast Refresh warnings.
- Backend: 60 unit, 34 integration and 28 HTTP E2E tests passed. Prisma validation and migration status passed with migrations `0001`–`0009` applied. A running local API held the Windows Prisma engine file during a later `prisma generate` attempt; this did not affect schema status or test results.
- **010** is next approved and remains **NOT STARTED**.

## Document 013 completion update (2026-08-07)

- Document **013** is **COMPLETE**. It provides closed-loop GBP double-entry journals, append-only reversal, replayable projections, internal cash reservations, FIFO lots/disposals, safe self portfolio projections and deterministic reconciliation without auto-repair.
- The portfolio UI is API-backed through the established service/repository/query boundaries and does not fabricate P&L, allocation, returns, performance or missing marks.
- Final real-service evidence: 89 backend unit, 43 integration and 59 HTTP E2E tests; 31 frontend tests; typecheck, lint, builds and Prisma checks passed. Disposable finance QA cleaned all scoped records with zero residual rows.
- Document **014** is NEXT and remains **NOT STARTED**.

## Document 014 partial implementation update (2026-08-07)

- User-authorized production-shaped initial trading policy variables are recorded in the decision register: market-configurable GBP tick/lot/minimum-notional, bounded maker/taker basis points, `REJECT_TAKER` self-trade prevention, OPEN/HALTED/CLOSED state and provider-neutral ACTIVE-user eligibility.
- Migrations `20260807212923_orders_matching_execution` and `20260807213458_trading_market_policy_variables` add markets, durable orders/status history, executions and constrained policy fields. Limit GTC/IOC placement, reservations, cancellation, public aggregate book/trades, maker-price matching and internal ownership/cash/FIFO settlement are present.
- Focused proof currently passes: 93 backend unit tests, 48 real PostgreSQL integration tests and 61 HTTP E2E tests. Broader Document 014 concurrency/rollback/manual QA remains required; Document 014 is **PARTIAL** and Document 015 is not started.

## Document 014 completion update (2026-08-08)

- Documents **001–014** are COMPLETE. Document **015** is NEXT / NOT STARTED.
- Document 014 provides configurable market policy, GTC/IOC limit orders, reservation-backed placement/cancel/expiry, price-time maker-price matching, atomic ownership/cash/FIFO/fee execution and safe private/public read models. Maker fee is `0` bps and taker fee is `100` bps; fees persist in execution rows and balanced internal journal entries without external settlement/provider scope.
- Final authoritative verification: **18** migrations current; backend **94** unit, **60** integration and **61** HTTP E2E tests passed; typecheck, lint, build and all Prisma checks passed. Full E2E completed in 35.8 seconds after scoped trading cleanup was corrected to reverse its shared platform-fee projection before deleting scoped journal entries.
- Disposable manual trading QA passed on real local PostgreSQL/Redis and cleaned its scoped orders, executions, cash reservations, lots, financial accounts, journal transactions, ownership accounts/positions, users and assets to zero. No Document 015 implementation was started.

## Document 015 partial implementation update (2026-08-08)

- User-authorized SD-015 variables are recorded: weighted voting is legal-gate fail-closed by default; the seven-day window, 20% quorum, strict-majority threshold, bounded 0 bps fee and largest-remainder allocation are configurable.
- Migrations `20260808034441_community_governance_distributions` and `20260808040000_distribution_proceeds_authority` add durable community, snapshot/vote, external-sale, distribution and reconciliation persistence. Prisma reports **20 migrations** and schema current.
- Focused PostgreSQL evidence: 5 Document 015 tests pass; focused HTTP evidence: 2 tests pass. Full regression passes **23 unit suites / 96 tests**, **12 integration suites / 65 tests** and **24 HTTP E2E suites / 63 tests**. Document 015 remains **PARTIAL** pending the remaining lifecycle hardening and manual QA. Document 016 remains **NOT STARTED**.

## Document 015 completion update (2026-08-08)

- Document **015** is **COMPLETE**. Migration `20260808052000_external_sale_two_person_approval` brings the local `slice_test` schema to **21** current migrations and makes two distinct non-proposer external-sale approvals durable before verification/final distribution.
- Real PostgreSQL proof covers immutable snapshots, proposal-open and vote races, replacement/close rollback, two-person verifier concurrency, largest-remainder conservation, exactly-once balanced journal distribution with post-journal recovery, and deterministic reconciliation mismatches without repair.
- Final backend evidence: **23 unit suites / 98 tests**, **12 integration suites / 67 tests**, **24 HTTP E2E suites / 63 tests**; typecheck, lint, build and Prisma format/validate/generate/migrate status pass. `qa:community` passed on real PostgreSQL/Redis and cleaned scoped proposals, distributions, assets and users to zero.
- Document **016** is NEXT / NOT STARTED. No provider, KYC/KYT, wallet, bank or crypto integration was begun.

## Document 010 completion update (2026-08-07)

- Document **010** is **COMPLETE**: real PostgreSQL/Redis submissions/media/review workflow with draft versioning, owner isolation, local-test storage/scanner adapters, verified media completion, explicit review lifecycle, durable idempotency, audit and owner notifications.
- `20260807041334_submissions_media_verification` is the tenth applied migration. `prisma validate`, generation and migration status are green against `slice_test`.
- Verification passed: 27 frontend tests; 63 backend unit tests; 35 real PostgreSQL/Redis integration tests; 34 HTTP E2E tests. Root and backend typecheck/build pass. Root lint has zero errors and the pre-existing nine Fast Refresh warnings; backend lint passes.
- Manual real-service workflow was exercised through the disposable E2E harness: draft, private upload intent/completion/removal, rejected type/signature/size/scan cases, submit, reviewer claim race, changes/resubmit, approve, reject, cancel, replay/conflict, audit, notification, and cleanup. No Document 011 behavior was implemented.

## Document 011 completion update (2026-08-07)

- Document **011** is **COMPLETE**: manual/provider-neutral valuation, custody, active coverage, readiness and publication workflow using migration `20260807064953_valuation_custody_publication`.
- Publication is row-locked and readiness-gated. Exact replay returns the original safe result; repeat/concurrent publication is a stable no-op preserving `publishedAt`, version, audit and notification counts. It only makes the existing asset visible to market reads and creates no ownership, ledger, balance, order or trade state.
- Public and seller-safe projections expose only allowlisted lifecycle status. Provider references, facility/location data, policy references, certification identifiers and internal evidence remain private.
- Verification passed against real PostgreSQL and Redis: 67 backend unit tests, 37 integration tests, 38 HTTP E2E tests, server typecheck/lint/build, Prisma format/validate/generate/migrate status, and 27 frontend tests plus root typecheck/lint/build. Root lint has zero errors and the nine pre-existing Fast Refresh warnings.
- Disposable live HTTP QA covered approved handoff, blocked publication, invalid custody rejection, custody progression, valuation, active coverage, readiness, publication/replay, market visibility, seller isolation, permission denial, recent-auth denial, audit/notification counts and fixture cleanup. **012** is next approved and remains **NOT STARTED**.

## Document 016 local closure update (2026-08-08)

- Document **016** is **IMPLEMENTATION COMPLETE / PROVIDER CERTIFICATION PENDING**. It adds encrypted provider references/payload persistence, compliance cases/decisions/holds/incidents, external financial-account and money-movement lifecycles, raw signed webhook inbox/deduplication, and immutable provider reconciliation discrepancies without automatic repair.
- The active provider-neutral adapters are **Bridge** (external GBP movements), **Plaid** (Identity Verification and Monitor), and **BlockchainAnalysis.io** (explicit-chain/address or transaction-pair KYT). Bridge and Plaid webhook verification occurs against the preserved raw request body before mutation; BlockchainAnalysis.io has no undocumented webhook surface. Provider outage classification is wired through the shared bounded retry/circuit policy (three immediate attempts, exponential backoff with jitter, CLOSED/OPEN/HALF_OPEN).
- Production configuration fails closed when Bridge, Plaid, or BlockchainAnalysis.io credentials are absent. Deterministic `LOCAL_TEST` mode is development/test-only and no external credential, provider response, PAN/CVV, identity document, selfie, raw AML response, or provider secret is persisted or exposed through safe DTOs/audit metadata.
- Local evidence: **27 migrations** are applied/current; **27 unit suites / 114 tests**, **21 integration suites / 85 tests**, and **25 HTTP E2E suites / 65 tests** pass. Focused provider PostgreSQL concurrency/rollback/manual lifecycle evidence covers exactly-once deposit completion, withdrawal reserve/hold/cancel/complete, duplicate reversal, compensated recovery, reconciliation non-repair, and zero scoped QA residual users/movements/reservations/compliance cases.
- Bridge and Plaid sandbox certification, and BlockchainAnalysis.io live/account certification, remain external launch gates. The frontend wallet remains disabled; production provider mode is OFF / FAIL-CLOSED. Document **017** is **STARTED / PARTIAL** solely because its independently-created Discord persistence migration exists; no further Document 017 implementation was performed in this pass.

## Document 017 transactional outbox phase-1/2 update (2026-08-08)

- Document **017** remains **STARTED / PARTIAL**. Migration `20260808140000_transactional_outbox_foundation` adds the durable `OutboxEvent` envelope and PENDING delivery state foundation. `OutboxWriter` appends only through an existing Prisma transaction, so a committed Document 014 execution creates exactly one `trade.completed` event and a rollback after append leaves neither execution nor event.
- `trade.completed` uses `trade.completed:<executionId>` and exposes only execution ID, asset ID, units, GBP price/gross minor units and currency. It does not contain users, account/reservation IDs, journals, KYC/KYT, provider payloads, secrets or Discord-specific content. Pending claims are deterministic by availability, creation time and ID; PostgreSQL `FOR UPDATE SKIP LOCKED` leases, unique opaque claim tokens, stale-lease recovery, configurable exponential jitter/backoff and durable dead letters provide at-least-once internal dispatch. Discord, BullMQ, realtime and notification delivery remain future work.
- Verification: **30** migrations current; **28 unit suites / 116 tests**, **23 integration suites / 93 tests**, **25 HTTP E2E suites / 65 tests**, typecheck, lint, build and Prisma checks pass. The separate Slice AI Discord bot was not modified in this phase.

## Document 017 delivery-routing phase-3 update (2026-08-08)

- `NotificationDelivery` records represent durable downstream work, not a Discord/email/push send. `NotificationPreference` is product-owned and distinct from the separate bot role model. Routing `trade.completed` creates one idempotent public logical intent for `discord.market_feed`; the safe v1 payload has no party, account, journal, reservation, KYC or provider data.
- Verification: **31** migrations current; **28 unit suites / 116 tests**, **24 integration suites / 97 tests**, **25 HTTP E2E suites / 65 tests**, typecheck, lint, build and Prisma checks pass. No Discord bot file was modified.

## Document 017 completion update (2026-08-08)

- Documents **001–017** are **COMPLETE**. Document **018** is **NEXT / NOT STARTED**.
- Privileged `admin.access` operations expose safe queue status, dead-letter lists and bounded detail for `OutboxEvent` and `NotificationDelivery`. Requeue is recent-auth protected, admin-rate-limited, transactionally idempotent and audited; it transitions only the original `DEAD_LETTER` row back to `PENDING` and never changes Document 012–016 authority.
- Focused operations evidence: **3** real PostgreSQL tests and **1** HTTP E2E test pass, covering stable identity, worker eligibility, concurrent fencing, exact replay, audit, invalid-state refusal, permission denial, canonical conflict and safe DTOs. Final backend verification: **28 unit suites / 116 tests**, **26 integration suites / 105 tests**, **27 HTTP E2E suites / 70 tests**; typecheck, lint, build, Prisma format/validate/generate and status pass with **37 migrations** current.
- The external provider certification launch gates recorded for Document 016 remain pending.

## Document 017 shared migration verification hold (2026-08-08)

- The Document 017 implementation and its focused/full test evidence remain valid, but final shared-schema closure is paused: `20260808230000_discord_investor_profile_preferences` appeared after the 37-migration verification and has not been applied to `slice_test`.
- The migration creates only the separate Discord `DiscordInvestorProfilePreference` table. It was not created or modified in this Document 017 operations pass, so it requires its owning workstream's explicit application authorization. Document 018 remains **NOT STARTED**.

## Document 017 final shared migration verification (2026-08-08)

- The authorized Discord-only migrations are now applied and Prisma reports **39 migrations** with `slice_test` schema up to date. Document **017** is **IMPLEMENTATION COMPLETE** and Document **018** is **NEXT / NOT STARTED**.
- Final backend evidence: 28 unit suites / 116 tests, 26 real PostgreSQL/Redis integration suites / 105 tests and 27 HTTP E2E suites / 70 tests; typecheck, lint, build and Prisma validation/status all pass.
## QA remediation #2 â€” D10/D11 operations frontend completion (2026-08-09)

FSQA-002 is CLOSED. The API-mode customer submission surface now supports owner-scoped create/list/detail/edit, safe media state with real upload-intent/presigned-upload/checksum completion handling, removal, submit/resubmit and confirmed cancellation. Authorized staff receive dedicated D10 reviewer queue/claim/decision and D11 asset operations routes. `GET /v1/admin/assets/operations` is a new bounded staff-safe lifecycle discovery projection; it contains no provider, facility, policy, evidence-storage or reviewer identities. Existing D11 mutation/readiness guards remain authoritative.

Focused D10/D11 HTTP E2E passed **5 suites / 11 tests**; disposable real-service lifecycle QA passed. Post-cleanup counts for its run were **0 assets, 0 submissions, 0 custody records, 0 valuations, 0 coverage rows, 0 publications, 0 custody events, 0 notifications and 0 users**. Frontend verification passed: **12 Vitest suites / 45 tests**, typecheck, build, and lint with the existing nine Fast Refresh warnings only. The Codex browser loopback limitation remains FSQA-003; no browser click-through was claimed.
