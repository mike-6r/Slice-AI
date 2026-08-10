# Prompt index

## Latest status (2026-08-08)

`018-security-production-readiness-and-final-frontend-integration.md` is complete through its local
Phase 3 pass. It has no successor implementation document. External provider certification and the
human production launch gate are deliberately pending; no Phase 4 work has started.

Run exactly one prompt at a time. Each file is a standalone Codex implementation prompt with 26 required sections, concrete completion evidence and an explicit stop condition.

| #   | Prompt                                                                                 | Status                      | Primary ownership                                                                                | Next |
| --- | -------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 001 | `implementation/001-project-controls-and-foundation-reconciliation.md`                 | COMPLETE                    | bootstrap, config, HTTP envelope/request IDs, logging, health                                    | 002  |
| 002 | `implementation/002-postgres-redis-prisma-runtime.md`                                  | COMPLETE                    | Compose, PostgreSQL, Redis, Prisma lifecycle/readiness                                           | 003  |
| 003 | `implementation/003-identity-persistence-and-repositories.md`                          | COMPLETE                    | identity Prisma adapters/unit of work                                                            | 004  |
| 004 | `implementation/004-authentication-sessions-and-profile-api.md`                        | COMPLETE                    | signup/login/session/profile; post-review security remediation verified                          | 005  |
| 005 | `implementation/005-access-audit-idempotency-rate-limits.md`                           | COMPLETE                    | global scoped roles/status, privileged audit, durable idempotency and distributed control limits | 006  |
| 006 | `implementation/006-shared-api-contracts-and-catalogue.md`                             | COMPLETE                    | shared wire types and catalogue/reference data; price/ownership intentionally deferred           | 007  |
| 007 | `implementation/007-market-data-and-asset-detail-reads.md`                             | COMPLETE                    | discovery, market and asset read models                                                          | 008  |
| 008 | `implementation/008-collectors-vault-public-portfolio-watchlist-notification-reads.md` | COMPLETE                    | public/self read projections                                                                     | 009  |
| 009 | `implementation/009-frontend-read-api-integration.md`                                  | COMPLETE                    | incremental frontend read adapters                                                               | 009A |
| 009A | `implementation/009a-frontend-auth-session-and-private-cache-integration.md`           | COMPLETE                    | frontend session/private-cache integration                                                        | 010  |
| 010 | `implementation/010-media-submissions-and-verification.md`                             | COMPLETE                    | drafts, secure media, reviewer workflow                                                          | 011  |
| 011 | `implementation/011-valuation-vault-insurance-and-publication.md`                      | COMPLETE                    | evidence, custody, coverage and publish gates                                                   | 012  |
| 012 | `implementation/012-ownership-ledger-and-issuance.md`                                  | COMPLETE                    | bigint issuance, ownership operations, reconciliation and real-service invariant proof           | 013  |
| 013 | `implementation/013-financial-ledger-and-portfolio-authority.md`                       | COMPLETE                    | double-entry money ledger, lots/disposals, reversal, reconciliation and portfolio                | 014  |
| 014 | `implementation/014-orders-matching-and-trading-api.md`                                | COMPLETE                    | orders, price-time matching and atomic internal settlement                                      | 015  |
| 015 | `implementation/015-community-governance-and-distributions.md`                         | COMPLETE                    | discussions, voting snapshots and distributions                                                  | 016  |
| 016 | `implementation/016-compliance-wallet-providers-webhooks-and-reconciliation.md`        | IMPLEMENTATION COMPLETE / PROVIDER CERTIFICATION PENDING | KYC/KYT, providers, movements, webhooks and reconciliation | 017 |
| 017 | `implementation/017-outbox-jobs-realtime-notifications-and-admin-operations.md`        | IMPLEMENTATION COMPLETE     | transactional outbox, leased-worker reliability, routing, notification/SSE and audited dead-letter operations | 018 |
| 018 | `implementation/018-security-production-readiness-and-final-frontend-integration.md`   | NOT STARTED                 | launch evidence, recovery and final integration                                                  | none |

Statuses intentionally match `CURRENT_STATE.md` and `project-state.json`; documentation expansion does not complete implementation work.

## 009 compatibility exception

## Historical closure update (2026-08-06)

**009** and **009A** are COMPLETE following local browser-harness verification. **010** is NEXT APPROVED — NOT STARTED.

009 is **PARTIAL / IMPLEMENTATION COMPLETE**. 009A (`implementation/009a-frontend-auth-session-and-private-cache-integration.md`) is PARTIAL and must close before 010.

## Historical prompt update (2026-08-06)

009A is **PARTIAL**: real login, cookie-backed refresh recovery, single-flight GET retry, explicit logout actions, private-cache eviction and optimistic rollback are implemented and covered by frontend tests. It cannot close until browser QA is run with a callable browser-control runtime. Document 010 remains NOT STARTED.

## Current completion update (2026-08-07)

Documents **009** through **013** are COMPLETE. Document **014** is NEXT and NOT STARTED. Fourteen migrations are applied.

## Document 014 closure update (2026-08-08)

Documents **001** through **017** are implementation complete. Document **016** remains provider-certification pending; `018-security-production-readiness-and-final-frontend-integration.md` is NEXT / NOT STARTED. Thirty-seven migrations are current.
