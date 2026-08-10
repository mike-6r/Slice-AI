# Full Slice system QA report

## Outcome

The local full-system pass found **no failing automated verification, financial invariant, or scoped-cleanup defect**. The system is not ready to claim a public production launch: host-browser/staging visual QA plus external provider and human certification gates remain.

## Scope and environment

- Authoritative workspace: `C:\\Users\\Aarons\\Documents\\Codex\\2026-08-05\\files-mentioned-by-the-user-you\\work\\slice-project`
- Services: local PostgreSQL and Redis; disposable test-schema fixtures only.
- Migration state: 40 migrations current.
- No deployment, commit, provider credential creation, or production-data operation occurred.

## Verification evidence

### Automated regressions

| Layer | Command | Result |
| --- | --- | --- |
| Frontend | `npm run typecheck` | PASS |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm test` | PASS — 11 suites / 38 tests |
| Frontend | `npm run build` | PASS |
| Backend | `npm run typecheck` | PASS |
| Backend | `npm run lint` | PASS |
| Backend | `npm test` | PASS — 29 suites / 125 tests |
| Backend | `npm run test:integration` | PASS — 27 suites / 106 tests, real PostgreSQL/Redis |
| Backend | `npm run test:e2e` | PASS — 27 suites / 71 tests, HTTP plus PostgreSQL/Redis |
| Backend | `npm run build` | PASS |
| Prisma | `format`, `validate`, `generate`, `migrate status` | PASS — schema valid and 40 migrations current |
| Dependencies | `npm audit --omit=dev --audit-level=high` at root and server | PASS — 0 production vulnerabilities |

### Real authority and data checks

- Finance lifecycle QA passed: balanced GBP journal posting, cash reservation/release, FIFO lot disposal, reconciliation and scoped cleanup.
- Community lifecycle QA passed: proposal, snapshot, vote replacement, quorum/majority, two-person verification, distribution, reconciliation and scoped cleanup.
- Provider lifecycle QA passed: deposit exactly-once completion, withdrawal reserve/complete/cancel release, compliance hold enforcement, reversal, reconciliation and scoped cleanup.
- Direct PostgreSQL assertions after QA found zero unbalanced journals, zero balance-projection mismatches, zero invalid ownership reservation states, zero invalid cash reservation states, zero invalid lot states and zero invalid order arithmetic states.
- Bounded local load check completed 80 requests at concurrency 8 with zero failures. `/health` p95 was 19.03 ms; public marketplace read p95 was 69.31 ms.

### Security and privacy audit

- Authentication-required, self-only read and cross-user isolation behavior are covered by E2E suites for finance, notifications, watchlists, submissions and reads.
- Credentialed CORS is explicit; production configuration rejects insecure wildcard/placeholder combinations according to `PRODUCTION_READINESS.md`.
- Structured logging, request IDs, health/readiness, idempotency, audits, Redis rate limits, raw-body provider webhooks, durable outbox and notification delivery are present in the active API surface.
- Source/config scan found no live hardcoded provider secret, private key, seed phrase or production token in the reviewed source and example configuration. Local/test fixtures are clearly scoped.
- Public DTOs avoid internal financial/ownership account IDs, raw journals, provider references and counterparty identity.

## Customer/API integration result

Public marketplace, asset reads, collectors, vault, watchlist, account/session, wallet/compliance, portfolio, trading, notifications/SSE and direct governance voting route through repositories and bounded API contracts. The explicit allocation route remains an honest unavailable state rather than simulating product behavior.

The in-app Browser cannot access the host loopback frontend in this execution environment despite the healthy local servers. This prevented a visual click-through run; it is recorded as a tooling limitation, not a passing browser claim. The seeded fixture was removed afterward with **0 users, 0 assets and 0 notifications** remaining.

## QA remediation #1 â€” D15 governance frontend

FSQA-001 is **CLOSED**. The authenticated `GET /v1/sale-proposals` projection is bounded,
viewer-aware and allowlisted: cursor pagination plus status, asset and immutable-snapshot relevance
filters are supported, while proposer, ownership-account, voter, financial, distribution and audit
internals are excluded. The API-mode `/governance` route discovers active, eligible and closed
proposals; eligible owners can create drafts; proposal detail supports authoritative vote replacement;
and ADMIN users alone receive controls which call the pre-existing, permission-guarded open/close
APIs. The server retains the actual authorization and recent-auth checks.

Focused governance verification passed: **7 PostgreSQL integration tests** and **3 HTTP E2E tests**.
The disposable `qa:community` lifecycle passed with zero scoped proposals, distributions, assets and
users after cleanup. The browser fixture now creates/removes a published and secured asset, active
ownership supply/position, immutable eligibility snapshot and OPEN proposal for host-browser QA.
The current remediation regression supersedes the earlier counts above: frontend **12 suites / 44
tests**, backend **29 unit suites / 125 tests**, **27 integration suites / 106 tests** and **27 HTTP
E2E suites / 72 tests**; typecheck, lint, builds and Prisma validation/status passed with 40
migrations current. The Codex in-app browser remains unable to reach the host loopback service, so
FSQA-003 remains a tooling limitation rather than a fabricated visual-QA pass.

## Findings and release posture

See [FULL_SYSTEM_QA_FINDINGS.json](FULL_SYSTEM_QA_FINDINGS.json) and [FULL_SYSTEM_QA_MATRIX.md](FULL_SYSTEM_QA_MATRIX.md).

- **BLOCKER:** none in local code, tests, migrations, or invariants.
- **HIGH:** None remaining after FSQA-002 closure.

## QA remediation #3 — legacy frontend cleanup and metadata reconciliation (2026-08-09)

FSQA-004 and FSQA-005 are **CLOSED**. The import audit removed unreachable legacy home/listing and
demo market source, including the obsolete market repository, duplicate domain model and
`DemoStateProvider`. Active API-mode routes continue to use bounded repository/HTTP contracts.
`AppServicesProvider` now loads the mock repositories dynamically only when a developer explicitly
sets `VITE_DATA_SOURCE=mock`; API mode does not import them and cannot silently fall back to
simulated market, portfolio, listing, allocation, or order authority. The market-card presentation
uses only the backend’s `market.estimatedMarketValue`, preserving missing values as unavailable.

The storage audit found no first-party `localStorage` or `sessionStorage` product authority. The
only remaining browser-storage reference is a third-party resizable-panel layout preference. Project
controls were reconciled to durable notifications/SSE, **40** migrations, frontend **12 suites / 45
tests**, backend **29 unit suites / 125 tests**, **27 integration suites / 106 tests**, and **27 HTTP
E2E suites / 73 tests**. Earlier dated counts remain historical snapshots. FSQA-003 remains the
host-browser/staging visual-QA tooling limitation and FSQA-006 remains the external provider/human
launch gate; no staging deployment or provider certification was claimed.
## QA remediation #2 â€” D10/D11 operations frontend

The API-mode frontend now exposes the real D10 owner workflow at `/list` and `/submissions/:id`:
draft create/list/detail/edit, real upload-intent/presigned-upload/checksum-completion handling, safe evidence state, removal, submit/resubmit and confirmed cancellation. The storage adapter remains authoritative; failed/unavailable uploads are shown as failures rather than completed locally. `/operations/submissions` uses the existing permission-protected reviewer queue/detail/claim/request-changes/approve/reject APIs.

For D11, `GET /v1/admin/assets/operations` is a bounded staff-safe discovery projection; it is role-authorized in the lifecycle service and exposes no provider, facility, policy, storage or review identities. `/operations/assets` uses it with the existing server-authorized handoff, custody transition, valuation, coverage, readiness and publication endpoints. The user interface only reveals operations links for current authorized roles; backend authorization remains the control.

Focused lifecycle/submission HTTP E2E passed **5 suites / 11 tests**, the disposable real-service lifecycle QA passed and cleaned its scoped rows, and the frontend gates passed at **12 suites / 45 tests**, typecheck, build and lint (nine pre-existing Fast Refresh warnings only). FSQA-002 is closed; FSQA-003, FSQA-004, FSQA-005 and FSQA-006 remain open as separately classified items.
- **MEDIUM:** host-browser/staging visual QA still needs execution.
- **LOW:** None remaining after QA remediation #3.
- **EXTERNAL:** Bridge/Plaid sandbox certification, BlockchainAnalysis.io account certification, and human launch approvals.

## Recommended fix order

1. Complete the retained host-browser/staging visual QA matrix (FSQA-003).
2. Certify providers and obtain launch approvals while production remains fail-closed.

## Final local disposition

**PARTIAL for production launch readiness; PASS for local authority, security, regression, migration and invariant verification.**

## Final full Slice system QA re-run — Documents 001–018 (2026-08-09)

The post-remediation local re-run is **PASS**. Frontend typecheck, lint, production build and
**12 Vitest suites / 45 tests** passed. Backend typecheck, lint, build, **29 unit suites / 125 tests**,
**27 real PostgreSQL/Redis integration suites / 106 tests**, and **27 HTTP E2E suites / 73 tests**
passed. Prisma format, validate, generate and migration status passed with **40** migrations current;
root and server production dependency audits each reported 0 vulnerabilities.

The real disposable finance, community/distribution and provider lifecycle QA scripts passed and
cleaned their scoped fixtures. Finance cleanup reported residual `[0,0,0,0]`; community cleanup
reported 0 proposals, distributions, assets and users; provider cleanup reported 0 users, movements,
reservations and compliance cases. A live local API bounded-load check made 20 `/health` and 20 public
marketplace requests at concurrency 4 with 0 failures. Direct PostgreSQL assertions found 0
unbalanced journals, 0 balance-projection mismatches, 0 invalid cash reservations, 0 invalid
ownership positions, 0 invalid lots, 0 invalid orders and 0 distribution mismatches.

API-mode production output contains no mock dataset markers and first-party frontend source has no
`localStorage`/`sessionStorage` product authority. The secret scan found no live-looking credential,
private-key or provider-token match outside dependencies. There are no internal BLOCKER or HIGH
findings. FSQA-003 remains host-browser/staging visual QA and FSQA-006 remains the external provider
and human launch gate. No deployment or provider certification was attempted.
