# Workflows

## Document 018 Phase 3 recovery workflow (2026-08-08)

On a dependency, provider or financial incident: preserve request/correlation IDs; use the scoped
operational pause for new risk; keep cancellation, reads, reconciliation and signed inbound recovery
available; reconcile the relevant authority; then record human approval before re-enabling a control.
PostgreSQL backup restore is isolated and forward migrations are never rolled back by deleting
historical financial, ownership, execution, provider or outbox records.

| Workflow                                        | Authoritative flow                                                                                                                                 | Documents                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Foundation/runtime                              | validate config → request/error/log contract → connect dependencies → liveness/readiness                                                           | 001–002                          |
| Signup/login/refresh/logout/profile/restriction | normalize/validate → hash/verify → persist/rotate/revoke → permission/status → audit/idempotency/rate                                              | 003–005                          |
| Browse/search/watch                             | catalogue references → market source/as-of projection → self watchlist/notification → frontend query adapter                                       | 006–009                          |
| Submit/media/verify/value/vault/insure/publish  | versioned draft → private signed upload/checksum/scan → separated review → valuation/custody/coverage evidence → readiness-gated publication          | 010–011 COMPLETE |
| Issue ownership                                 | eligible published asset → fixed integer supply → treasury position → transfer/reserve/release/correction → append-only sequence/audit → reconcile | 012 COMPLETE                     |
| Finance/portfolio                               | chart of accounts → balanced posting/reservation → FIFO lots/disposals → derived wallet/portfolio → reconcile                                      | 013 COMPLETE                     |
| Buy/sell/cancel/match/settle                    | compliance/status preview → reserve cash/units → open priority → match/partial fill → atomic ownership+cash+fee+lot settlement → release remainder | 014 COMPLETE; 016 provider gate remains future scope |
| Discussion/proposal/vote/sale/distribution      | moderated content → immutable ownership snapshot → weighted vote/time/quorum → approved external sale → exact net distribution posting             | 015                              |
| KYC/KYT/deposit/withdrawal/webhook              | approved provider → screening/hold → intent/reservation → raw signed deduped webhook → one ledger posting → provider reconciliation/incident       | 016 LOCAL IMPLEMENTATION COMPLETE / PROVIDER CERTIFICATION PENDING |
| Event/job/realtime/operations                   | business transaction+safe outbox envelope → leased at-least-once dispatch → durable idempotent delivery intent → authorized self notification/SSE → dead-letter inspection/requeue | 017 COMPLETE: stable worker/delivery identity, safe routing, authenticated realtime and audited recovery |
| Launch                                          | traceability/threat review → reconciliation/load/chaos → restore/DR → canary/rollback → frontend flags → human go/no-go                            | 018                              |

Dependencies are acyclic. Failures roll back atomic work or move to an explicit retry/hold/terminal state; no workflow silently edits immutable ledger/evidence history or invents completion.

Document 015 is COMPLETE: the discussion/proposal flow uses moderated content, immutable ownership snapshots, fail-closed weighted-voting policy, two-person external-sale evidence and exact largest-remainder finance distribution. Document 016 is locally implemented with external provider certification pending; Document 017 is STARTED / PARTIAL with transactional outbox and fenced leased-worker reliability, but no notification/realtime/Discord consumer.
