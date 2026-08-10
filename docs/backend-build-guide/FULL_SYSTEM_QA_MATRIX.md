# Full system QA matrix

**Run:** 2026-08-09 (local PostgreSQL, Redis, and disposable test fixtures)  
**Scope:** Documents 001–018, customer API-mode frontend, backend APIs, durable authorities, workers, and operating controls.  
**Legend:** PASS = verified in the stated local scope; PARTIAL = implemented authority with a material customer/operations surface gap; DEFERRED = intentionally not offered; EXTERNAL = cannot be certified without a provider or human approval.

| Document | Authority audited | Automated/local evidence | Customer/operations result | Status |
| --- | --- | --- | --- | --- |
| 001 | Project controls and implementation sequencing | Controls and guides present; 40 forward migrations | Traceability is usable | PASS |
| 002 | PostgreSQL, Redis, Prisma runtime | Readiness verified with both dependencies; schema current | Runtime operates locally | PASS |
| 003 | Identity persistence and repositories | Unit/integration regressions green | Private data is repository-scoped | PASS |
| 004 | Authentication, sessions, profile | Auth/session E2E coverage; unauthenticated requests return canonical 401 | Sign-up, login, session, logout and profile API exist | PASS |
| 005 | Roles, audit, idempotency, rate limiting | Access-control and mutation E2E/integration coverage | Admin permissions are enforced at API boundaries | PASS |
| 006 | Shared contracts and catalogue | Catalogue/read E2E and API fixture reads | Public catalogue DTOs are bounded | PASS |
| 007 | Market/asset reads | Marketplace load check and E2E reads | Published assets return safe public details | PASS |
| 008 | Collectors, vault, watchlists, read notifications | Privacy E2E batch passed | Read APIs are self/visibility scoped | PASS |
| 009/009a | Frontend API/auth integration | Frontend typecheck, lint, 12 Vitest suites / 45 tests, production build | API mode has no silent portfolio mock fallback | PASS |
| 010 | Submission/media/review authority | Owner-scoped create/list/detail/edit, evidence intent/upload-completion path, remove, submit/resubmit/cancel plus reviewer queue/claim/decision routes are available through API-mode frontend | Storage-provider completion remains backend-authoritative; the UI never fabricates evidence success | PASS |
| 011 | Custody, valuation, coverage, publication | Staff-only lifecycle discovery, valuation, custody, coverage, readiness and publish controls are available through API-mode frontend | Server permission/recent-auth/readiness authority remains controlling | PASS |
| 012 | Ownership ledger, issuance, reservations, reconciliation | Focused ownership suites and direct invariant query | Backend-authoritative; staff actions remain API/admin-tool driven | PASS |
| 013 | Financial journal, cash, FIFO, portfolio | Finance QA passed with cleanup; direct journal/projection invariant query | Safe self portfolio/wallet reads exist | PASS |
| 014 | Orders, matching, trading | Trading integration/E2E coverage; no invalid order arithmetic | Customer buy/sell UI is honest about unavailable eligibility/funds | PASS |
| 015 | Community governance and distributions | Focused governance PostgreSQL/HTTP tests plus `qa:community` passed with zero cleanup residuals | Authenticated viewer-aware discovery, owner draft creation, proposal detail/vote replacement and ADMIN-only open/close controls are navigable through the API-mode UI | PASS |
| 016 | Compliance, wallet, providers, webhooks, reconciliation | `qa:providers` passed with zero cleanup residuals; webhook/idempotency coverage | Local deterministic adapters only; provider sandbox certification and human launch gates remain required | EXTERNAL |
| 017 | Outbox, delivery worker, notifications/SSE, operations | Worker/delivery integration and notification E2E coverage | Durable notifications and self-only SSE API are implemented; external transports remain intentionally unimplemented | PASS |
| 018 | Security, production readiness, integration | Security/readiness controls, bounded load check, Prisma checks | Local readiness passed; staging deployment, browser matrix, provider certification and human launch gates remain outside local certification | PARTIAL |

## Cross-cutting evidence

## Final QA re-run update (2026-08-09)

The complete local Documents 001–018 regression re-ran after FSQA-001, FSQA-002, FSQA-004 and
FSQA-005 closure. Frontend passed **12 suites / 45 tests**; backend passed **29 unit suites / 125
tests**, **27 integration suites / 106 tests**, and **27 HTTP E2E suites / 73 tests**. Prisma format,
validate, generate and migration status passed with **40** migrations current. The disposable finance,
community/distribution and provider lifecycle scripts passed with zero scoped residuals. Direct
PostgreSQL invariant queries found zero unbalanced journals, balance-projection mismatches, invalid
cash/ownership reservations, invalid lots, invalid order arithmetic and distribution mismatches.
Production dependency audits at root and server found 0 vulnerabilities.

FSQA-003 remains a host-browser/staging visual-QA tooling limitation; FSQA-006 remains external
provider/human launch certification. No internal BLOCKER or HIGH finding remains.

| Area | Result |
| --- | --- |
| Frontend regression | `npm run typecheck`, `npm run lint`, `npm test` (12 suites / 45 tests), `npm run build` passed. |
| Backend regression | `npm run typecheck`, `npm run lint`, `npm test` (29 suites / 125 tests), `npm run test:integration` (27 suites / 106 tests), `npm run test:e2e` (27 suites / 73 tests), and `npm run build` passed. |
| Prisma | `format`, `validate`, `generate`, and `migrate status` passed; 40 migrations current. |
| Production dependency audit | `npm audit --omit=dev --audit-level=high` passed for both root and server: 0 vulnerabilities. |
| Manual authority QA | Finance, community, and provider lifecycle scripts passed; each performs its own scoped cleanup. |
| Direct financial/trading invariants | 0 unbalanced journals; 0 projection mismatches; 0 negative/over-reserved ownership positions; 0 negative/over-reserved cash balances; 0 invalid lots; 0 invalid orders. |
| Bounded local load | 8-way concurrency, 40 requests each to `/health` and public marketplace reads; 0/80 failures. Marketplace p50 14.23 ms, p95 69.31 ms, max 73.65 ms. |
| Browser fixture cleanup | The scoped fixture applies one published/custodied asset, active ownership supply/position, immutable proposal eligibility and one OPEN proposal for frontend QA; cleanup removes all scoped governance, ownership, asset, notification and user records. |

## Explicitly deferred or external items

- `/allocate/:id` deliberately returns an unavailable state; there is no authoritative allocation product and the UI does not fabricate allocations, fills, fees, or performance.
- External provider certification is not represented as complete: Bridge and Plaid sandbox certification plus BlockchainAnalysis.io account certification remain external gates.
- Production launch remains fail-closed until human security, legal, operations and product approvals are recorded.
- The Codex in-app browser cannot reach this host's loopback Vite server (`ERR_CONNECTION_REFUSED` from its isolated browser environment). API-mode browser interaction therefore needs a human/local-browser run or a reachable staging URL; this does not invalidate the local API/frontend automated results.

## Recommended remediation order

1. Run the retained host-browser/staging visual QA matrix; the Codex in-app browser remains loopback-isolated.
2. Complete provider sandbox certifications and the human production launch gate before any real-user deployment.
