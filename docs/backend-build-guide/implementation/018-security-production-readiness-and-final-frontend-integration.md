# 018 — Security, production readiness and final frontend integration

## 1. Document metadata

**Current status (2026-08-08): STARTED — Phases 1 and 2 are complete.** The remaining
production-hardening, provider-certification, load/staging and launch-gate work is Phase 3 and is
intentionally deferred.

### Phase 2 completion evidence

The customer-facing API-mode polish pass is complete. Auth, dashboard, marketplace, asset/trading,
portfolio, wallet/account and notification surfaces use bounded, responsive cards, forms, status
states, loading skeletons, actionable empty/error states and keyboard-visible focus. Customer data
tables keep their labels and scroll inside their own container on narrow screens. Real browser
checks at 375px, 768px, 1024px and 1440px found no document-level horizontal overflow; the mobile
navigation includes Notifications and authenticated Account access. The showcase runbook now has a
complete browser click path and current Vite CORS origin. The frontend passed typecheck, lint,
**11 Vitest suites / 36 tests**, and production build. Prisma validate and migrate status pass with
**40 migrations** current. No provider credentials or financial values are surfaced in the UI.

API mode now maps the safe Document 016 compliance and money-movement contracts through the existing repository and service boundaries. The Wallet route displays ledger-backed GBP cash, provider-neutral verification status and safe movement history. Deposit and withdrawal intents remain backend-authoritative; no provider reference, risk score, sanction result or financial account identifier is exposed. Shared toast feedback is emitted only after confirmed mutation success.

**Phase 2 Plaid Sandbox activation (partial, 2026-08-08):** the existing Plaid adapter now creates
server-side Link tokens, exchanges public tokens and persists encrypted Item/access-token material in
the existing `ExternalFinancialAccount` authority. The Wallet API and UI expose only a safe connected
account projection. Bank connection is explicitly distinct from Identity Verification/compliance.
UK Payment Initiation is not claimed or substituted with US Transfer. Sandbox browser certification is
pending the credentials being present in the process running the local API; production remains off and
fail-closed.

### Phase 1 evidence

The local API-mode showcase path now uses the existing repository/React Query architecture for login/session restoration, published catalogue/detail/history reads, real D14 limit-order preview/place/cancel/order history/executions, D13 portfolio and wallet projections, and D17 durable notifications plus authenticated fetch-based SSE invalidation. Public catalogue asset IDs are resolved at the trading authority boundary, so the browser never receives a database-only asset identifier. The legacy simulated buy/sell screens, legacy sample ticker and disabled wallet page are not used in API mode. Focused frontend tests and the D14 trading HTTP E2E regression pass. `docs/product/SHOWCASE_DEMO.md` records local startup and seed boundaries.

Phase 9; **NOT STARTED**; critical launch risk; requires 001–017, with 016 approved/certified for real funding/trading. Supports every frontend route and deployment. Affects security, observability, performance, recovery, feature flags and final adapters. Extra-large; no unsafe parallel launch changes.

## 2. Project-specific context

Slice is a premium React prototype with mock/demo data and a staged Nest backend plan. Completion of code is not permission to launch a collectible investment platform. This final document proves threat controls, correctness under load/races, backups/recovery, provider certification and incremental production frontend switching while preserving the approved design.

## 3. Current implementation audit

Use `VERIFICATION_BASELINE.md` and each completed prompt report. At guide creation, frontend build/typecheck passed, lint/root-test had known failures, server tests passed, Docker was unavailable and provider work deferred. Re-audit; do not carry old passes forward. Inventory remaining direct mock imports, demo/live labels, feature flags, vulnerabilities, unresolved reconciliation/dead letters and runbooks.

## 4. Files to read

Read the entire repository and all guide files; package/lock/config/env/CI/deployment files; every frontend route/component/domain/repository/hook/mock/provider; every server module/migration/test; provider certifications, threat model, runbooks and reports from 001–017.

## 5. Strict scope

Threat model/security remediation; dependency/secret/static/dynamic review; observability/SLO/alerts; performance/load/race verification; backup/restore/DR; zero-downtime migrations/deployment/rollback; feature flags/kill switches; provider certification and reconciliation launch gates; final frontend mutation/read/realtime integration; accessibility/browser/visual regression; staged launch checklist.

## 6. Out of scope

No new product features, redesign, unsupported provider, bypassed control, unresolved high/critical finding waiver by Codex, production migration/funds without explicit human authorization, or claim of regulatory compliance based solely on tests.

## 7. Dependencies and preconditions

All prior checklists, migrations, invariant/reconciliation tests, legal/provider approvals, production infrastructure/secret manager/domains/TLS, incident owners/on-call, SLOs/RPO/RTO and independent security review. If 016 remains deferred, real deposits/withdrawals/trading remain disabled; a read-only/demo launch may be separately approved and clearly labelled.

## 8. Database specification

No new product model expected. Add operational migration only if audit proves need (e.g. feature-flag/audit retention), reviewed forward-only. Define backup scope for PostgreSQL plus encrypted provider/object-store metadata, PITR, retention, restore verification and RPO/RTO. Redis is rebuildable except queues requiring durable recovery; outbox remains authority. Test restore to isolated environment; never destructive restore production during rehearsal.

## 9. Domain types and ports

`FeatureFlagPort` with environment/actor/cohort and fail-closed financial flags; `KillSwitchPort` for trading/funding/providers/realtime; `Health/TelemetryPort`; deployment metadata; frontend production `ApiClient`/HTTP repositories/realtime adapter already designed. Flags cannot weaken authorization/invariants.

## 10. Domain rules and invariants

No launch with failed ownership/finance/trading reconciliation, unprocessed critical outbox/dead letters, high/critical security findings, unverified restore or unapproved provider. Feature flags default off and separate read, auth, listing, trading, deposits, withdrawals, realtime. Kill switch stops new risk while permitting safe cancel/read/reconciliation. Deployment preserves backward-compatible API/events for at least one frontend version. Migrations are expand→backfill→switch→contract. Demo/live status never lies.

## 11. Application services

Readiness/launch-gate evaluator gathers migration, dependency, reconciliation, queue, provider, security and flag evidence; cannot self-approve. Operational kill-switch service requires scoped/two-person authorization and audit. Final frontend adapters implement all repository mutations, coordinated auth refresh/idempotency/realtime invalidation and safe fallbacks. Rollout service/config supports canary and rollback without data rollback guesses.

## 12. API specification

No new product endpoints. Operational internal/admin endpoints may expose safe readiness, flags, kill switches and launch evidence, never public secrets; authenticated/allowlisted/recent-auth/two-person for risk switches. Freeze versioned `/v1` contracts, pagination/errors/rates/idempotency and event schemas. Generate/validate an API contract artifact if project tooling adds it. Every frontend consumer maps to exactly one primary endpoint owner.

## 13. Error catalogue

`FEATURE_DISABLED` 503 or 409 by operation; `SYSTEM_MAINTENANCE` 503; `TRADING_HALTED` 409; `LAUNCH_GATE_FAILED` admin-only; `DEPENDENCY_DEGRADED` 503; `CLIENT_VERSION_UNSUPPORTED` 426 only with published upgrade path; canonical security/rate errors. Safe status pages reveal no topology/vulnerability/provider detail.

## 14. Authorization and security

Complete STRIDE/data-flow threat model for auth, uploads, ledgers, matching, providers, webhooks, realtime and admin. Independent penetration review; dependency/license/SBOM/secret scan; TLS/HSTS/CSP/CORS/CSRF/XSS/SSRF/file/webhook controls; encryption/key rotation; least privilege DB/Redis/object store/provider; admin MFA/step-up/two-person; PII retention/DSAR/incident procedures; log redaction verification; DDoS/abuse/fraud controls. No unresolved high/critical release.

## 15. Audit and idempotency

Verify every mutation from 004–017 has documented audit/key behavior and end-to-end replay tests. Audit export/retention/integrity/access monitoring and clock sync. Launch/flag/kill/deployment/restore actions audited with approver/evidence IDs, never secret values.

## 16. Events, realtime and jobs

Verify event registry compatibility, lag SLO, queue recovery/dead letters, replay drills, notification provider status and SSE authorization/load. Test deployment with old/new producers/consumers. Reconciliation jobs run and are green immediately before enabling financial flags.

## 17. Frontend alignment

Replace remaining direct mock/route-local state with HTTP repository mutations for auth/profile/listing/review, watchlist/notifications, ownership, wallet/portfolio, orders, discussions/governance as enabled. Production `VITE_DATA_SOURCE=api`; mocks only tests/demo builds. Preserve approved layout/theme exactly; add only state/accessibility behavior. Test loading/empty/error/offline/401/403/409/422/429/503, large values, slow network, reconnect and reduced motion. Visual regression covers home/marketplace/detail/collectors/vault/portfolio/forms at target viewports.

## 18. Implementation file plan

Modify infrastructure/CI/config/tests/runbooks, server telemetry/flags/readiness, frontend API adapters/provider/hooks/routes only where integration remains. Create threat model, data map, dashboards/alerts, backup/restore/deploy/rollback/incident runbooks, load/browser/visual suites. Preserve design assets and all ledger history. Avoid new feature modules.

## 19. Numbered implementation process

1. Re-audit all source/docs/status and build a traceability matrix.
2. Close or block every prior checklist and contradiction.
3. Threat-model and remediate findings; run independent review.
4. Add telemetry/SLOs/dashboards/alerts and redaction tests.
5. Run correctness/concurrency/load/soak/chaos tests and reconciliations.
6. Configure backups and perform isolated restore/DR drill.
7. Prove expand/contract deploy/canary/rollback.
8. Implement fail-closed flags/kill switches and approval audit.
9. Finish frontend adapters route by route behind flags.
10. Run accessibility/browser/visual/contract E2E.
11. Complete provider certification and prelaunch reconciliation.
12. Produce launch evidence; require human go/no-go; update final state.

## 20. Test plan

Unit/security/static scans; full server/frontend tests; real PostgreSQL/Redis race/property/reconciliation suites; API contract/backward compatibility; provider sandbox certification; webhook replay; queue crash/replay; load/soak for reads/orders/SSE; chaos dependency outage/recovery; backup restore/PITR; canary/rollback; browser E2E for every route/state; WCAG keyboard/screen reader/contrast; visual regression at approved viewports. Record versions/config/durations, no unsupported pass claims.

## 21. Manual QA

Use staging with synthetic data: execute full user signup→listing→verification→publication→issuance→funding (sandbox)→trade→portfolio→proposal/distribution; force 401/limits/conflicts/outages/kill switches; verify reconciliation/audit/alerts/status labels. Restore backup into isolated environment, replay outbox, canary old/new clients, rollback. Human security/legal/ops/product sign the launch gate.

## 22. Verification commands

Run every supported root/server/Prisma/Compose/integration/E2E/load/browser/visual/security/backup script present after implementation; list exact commands and working directories in final evidence. Minimum existing commands: root `npm ci && npm run typecheck && npm run lint && npm test && npm run build`; server `npm ci`, Prisma validate/generate/status, lint/test/E2E/build; Compose config/ps. Never claim unavailable tooling passed.

## 23. Documentation and state updates

Update every backend-build-guide file, project-state, baseline, API/entity/business/workflow/feature/checklist/index/order, README/env/deployment docs, threat model, data map, runbooks, certification and launch decision. Archive no unresolved blocker as complete.

## 24. Completion checklist

- [ ] Every frontend feature/API/entity has exactly one primary owner and verified implementation status.
- [ ] No production route silently uses mock/demo data.
- [ ] All high/critical security findings are resolved and independently verified.
- [ ] Ownership/finance/trading/provider reconciliations are green.
- [ ] Load/race/soak/chaos tests meet approved SLOs.
- [ ] Backup restore/PITR and DR meet RPO/RTO.
- [ ] Deploy/canary/rollback and API/event compatibility pass.
- [ ] Feature flags/kill switches fail closed and are audited/two-person controlled.
- [ ] Provider sandbox/certification/legal approvals are recorded or financial flags remain off.
- [ ] Full browser/accessibility/visual suite passes without redesign.
- [ ] Alerts, incident ownership and runbooks are exercised.
- [ ] Human launch gate records explicit go/no-go; Codex does not self-authorize production.

## 25. Final report format

Report all 17 standard items, plus security findings, SLO/load results, reconciliation, restore/DR, deployment rollback, provider certification, feature-flag state and human launch decision. Next document: none.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

## Phase 3 completion evidence (2026-08-08)

This latest status supersedes the earlier Phase 3 planning text: **Phase 3 local implementation and
verification are complete.** It is not a production launch approval.

- Production config rejects wildcard/malformed CORS, insecure production cookies, loopback hosts,
  placeholder deployment secrets and incomplete provider-production configuration. Environment
  examples contain placeholders only. Server dependency audit is clean after Prisma 6.19.3; root
  production dependency audit is clean.
- `OPERATIONAL_*_ENABLED` controls are explicit and fail closed for new trading, deposit, withdrawal,
  realtime and listing risk in production. Safe reads, cancellation, reconciliation and inbound
  signed webhooks remain available for recovery. Focused config/control proof is 2 suites / 30 tests.
- HTTP liveness/readiness, request IDs, structured redacted logging, Helmet headers and exact
  credentialed CORS are verified. The provider-webhook E2E harness explicitly uses deterministic
  local provider mode, avoiding developer sandbox configuration leakage.
- Bounded local load: four concurrent clients made 20 health and 20 market-list requests with zero
  failures; health p95 was 56.13 ms and market-list p95 was 160.74 ms. Existing PostgreSQL race,
  rollback, provider exactly-once, worker fencing/retry/dead-letter and SSE isolation suites remain
  part of the full regression.
- PostgreSQL custom-format backup was restored to an isolated database, validated at 40 migrations,
  queried safely and deleted. A separate empty isolated database applied all 40 forward migrations
  with `prisma migrate deploy`, was validated with `migrate status`, and was deleted.
- Final local regression: backend 29 unit suites / 125 tests, 27 PostgreSQL/Redis integration suites
  / 106 tests, 27 HTTP E2E suites / 71 tests; frontend 11 Vitest suites / 36 tests. Typecheck, lint,
  builds, Prisma format/validate/generate/status and root/server production dependency audits pass.

External launch gates remain Bridge and Plaid sandbox certification, BlockchainAnalysis.io account
certification, production infrastructure/secrets/monitoring/on-call setup, independent security
review, legal approval and an explicit human go/no-go decision. Production financial/provider flags
remain off/fail-closed until those gates are satisfied. No Phase 4 work started.
