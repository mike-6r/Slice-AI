# 016 — Compliance, wallet providers, webhooks and reconciliation

## 1. Document metadata

Phase 7; **IMPLEMENTATION COMPLETE / PROVIDER CERTIFICATION PENDING**; critical risk; prerequisites 005 and 013–014 plus legal/provider approvals. Supports `/wallet`, trading eligibility and deposits/withdrawals. Affects compliance/provider/wallet/webhook/reconciliation. Extra-large; unsafe to parallel.

## 2. Project-specific context

`wallet.tsx` explicitly says no wallet is connected. That honesty must remain until regulated providers are contracted/certified. This prompt fully defines future KYC/KYT, custody/payment adapters, deposits, withdrawals, signed webhooks and reconciliation, but implementation must stay blocked without decisions/credentials/sandbox/counsel.

## 3. Current implementation audit

No provider abstractions, KYC/KYT, external wallet/payment records, webhook inbox or reconciliation exists. 013 is an internal ledger, not a bank balance. 014 compliance hook is only a gate. Do not transform demo wallet UI into live claims.

## 4. Files to read

Read wallet/trading/auth frontend routes/domain/validation/repositories; server access/finance/trading/audit/idempotency/outbox scaffolds; Prisma/config; 005/013/014; legal/provider sections of all guide maps/state.

## 5. Strict scope

After approvals only: provider-neutral ports/adapters; KYC cases/decisions; KYT screening; external account/customer mapping; deposit/withdrawal intents/lifecycle; signed webhook inbox/dedup/order handling; provider-vs-ledger reconciliation; incident/hold/manual review and sandbox certification.

## 6. Out of scope

No provider selection by Codex, custody of secrets in DB, card data, crypto unless explicitly approved, bypass of KYC/KYT, auto-resolution of money discrepancies, production enablement before 018, UI redesign or fabricated sandbox result.

## 7. Dependencies and preconditions

Required: named approved KYC/KYT/payment/custody providers; contracts/DPA; jurisdiction/country/product eligibility; webhook signing docs; sandbox credentials/endpoints; secret manager; AML/manual-review/retention/privacy/withdrawal limits; incident owners; approved account mapping and reconciliation tolerance. If any mandatory approval is absent, keep status DEFERRED, document blocker, and stop before provider code/migration that implies a provider.

## 8. Database specification

When unblocked: `ComplianceCase(userId,provider,externalRef private,type KYC|KYT,status NOT_STARTED|PENDING|REVIEW|APPROVED|REJECTED|EXPIRED,reasonCode safe,expiresAt,timestamps)`; append-only `ComplianceDecision`; `ExternalFinancialAccount(userId,provider,externalCustomer/account refs encrypted,status,currency)`; `MoneyMovement(id,userId,type DEPOSIT|WITHDRAWAL,amountMinor,currency,status CREATED|PENDING_PROVIDER|PROCESSING|SETTLED|FAILED|CANCELLED|REVERSED,providerRef encrypted,idempotency,ledgerTransactionId?,failureCode?,timestamps)`; `WebhookInbox(provider,eventId unique,eventType,payloadCiphertext/payloadHash,signatureVerified,receivedAt,processedAt,status,attempts,errorCode)`; `ProviderReconciliationRun` and immutable discrepancy items. Index status/time/provider refs; no cascade financial delete; field-level encryption/key version. Migration names provider-neutral `compliance_provider_wallet_foundation`.

## 9. Domain types and ports

`IdentityVerificationProvider.createSession/getDecision`; `TransactionScreeningProvider.screen`; `MoneyMovementProvider.createDeposit/createWithdrawal/getStatus/cancel`; `WebhookVerifier.verify(rawBody,headers,tolerance)`; `ProviderReconciliationPort.fetchStatement`; repositories/inbox/unit-of-work/finance posting port/clock/idempotency/audit. Provider DTOs stay inside adapter mappers.

## 10. Domain rules and invariants

Trading/funding eligibility is server policy from current approved compliance case. Provider success alone does not credit/debit: signed/deduped event plus amount/currency/reference validation and idempotent balanced ledger posting. Withdrawal reserves internal funds before provider request; failure releases, settlement consumes; no negative funds. Deposit credits once only at provider final settlement. Webhook event IDs unique, raw bytes verified before JSON trust, timestamp/replay window enforced. Out-of-order events use monotonic transition table. Discrepancies never auto-write correction; freeze/escalate/reconcile with human approval.

## 11. Application services

Start/refresh compliance; evaluate eligibility; create deposit/withdrawal with limits/KYT/reservation; handle verified webhook through inbox state machine; poll ambiguous movement; reconcile provider statement to movement+journal; create incident/hold. External calls use request IDs/idempotency, finite timeout, retry only safe operations, circuit breaker and manual recovery.

## 12. API specification

Auth: `POST /v1/compliance/verification-sessions`, `GET /v1/me/compliance`; `POST /v1/wallet/deposits`, `POST /v1/wallet/withdrawals`, `GET /v1/wallet/movements?cursor&limit`; `POST /v1/providers/:provider/webhooks` raw body public-signature-authenticated; admin review/reconciliation/hold endpoints. Mutation keys, strict limits/audit/recent auth; webhook replies 2xx only after durable inbox acceptance, processing async/idempotent. Responses never contain provider secrets/raw reasons.

## 13. Error catalogue

`PROVIDER_NOT_CONFIGURED` 503; `COMPLIANCE_REQUIRED/PENDING/REJECTED` 403 safe; `COUNTRY_UNSUPPORTED` 403; `MOVEMENT_LIMIT_EXCEEDED` 422; `INSUFFICIENT_FUNDS` 409; `KYT_REVIEW_REQUIRED` 403; `WEBHOOK_SIGNATURE_INVALID` 401; `WEBHOOK_REPLAYED` 200 duplicate/no-op or 409 per provider contract; `PROVIDER_REFERENCE_MISMATCH` 409 incident; `RECONCILIATION_MISMATCH` 409 admin; provider unavailable/timeout 503.

## 14. Authorization and security

Self-only wallet/compliance; privileged manual reviewers with separation. Secrets only secret manager; encrypt provider refs/payloads; redact PII/AML reasons; raw-body signature with constant-time compare, timestamp tolerance/IP/mTLS if provider offers. No PAN/CVV/bank credential storage. Strong limits, step-up auth, velocity/device/risk hooks and withdrawal holds. Breach/AML incident visibility and retention/deletion policy required.

## 15. Audit and idempotency

Audit compliance state (safe code only), movement create/transition/hold/release, webhook accept/reject/process, reconciliation/incident/admin action. Prohibit documents/raw provider payload/secret/bank data. Client operation keys plus provider idempotency keys/reference and webhook event unique IDs. Store safe responses only.

## 16. Events, realtime and jobs

Outbox `compliance.status.changed.v1`, `wallet.movement.updated.v1`, `provider.webhook.accepted/failed.v1`, `reconciliation.discrepancy.v1`; BullMQ jobs for webhook processing, polling and reconciliation with exponential backoff, max attempts, dead letter and alerts. UI invalidates wallet/compliance; channels authorize self/admin.

## 17. Frontend alignment

Wallet repository maps balances/transactions/movement/compliance states; UI must retain disabled/demo messaging until feature flag/provider certification. Define pending/review/failed/reversed and no-provider states. No frontend changes in this document unless it is explicitly unblocked and coordinated after APIs.

## 18. Implementation file plan

When unblocked create server compliance/providers/wallet modules, encrypted persistence, raw webhook controller, adapters/tests/runbooks. Preserve provider-neutral finance/trading ports. Avoid frontend and vendor SDK leakage into domain.

## 19. Numbered implementation process

1. Verify every approval/precondition and keep DEFERRED if any fail.
2. Threat-model/data-map provider flow.
3. Finalize ports/state/account mappings and migration.
4. Implement encrypted repositories and sandbox adapters.
5. Implement KYC/KYT eligibility.
6. Implement deposit/withdrawal reservation+provider lifecycle.
7. Implement raw signed webhook inbox/processor.
8. Implement reconciliation/holds/incidents.
9. Run sandbox/security/replay/outage/race/ledger tests.
10. Obtain certification evidence, update state, stop before production launch.

## 20. Test plan

Unit transitions/limits/signatures/out-of-order/account mapping/redaction. PostgreSQL/Redis races and rollback. Provider sandbox success/failure/timeout/duplicate/out-of-order/unknown event/cancel/reversal. HTTP raw-signature/replay/size/rate/auth. Reconciliation exact/missing/duplicate/amount/currency discrepancies with no auto-correction. Finance balance tests after every movement. Security secret/PII log scans. Browser only after frontend unblocked.

## 21. Manual QA

In provider sandbox and disposable DB, complete KYC paths, create deposit/withdrawal, replay/tamper/reorder webhooks, induce timeout/reversal/discrepancy, verify reservations/journal/inbox/audit/alerts and manual resolution. Rotate sandbox secret and prove old signature rejection. Never use real funds/data.

## 22. Verification commands

Only commands added by the approved provider implementation: server Prisma/lint/unit/integration/E2E/build, provider sandbox certification and reconciliation scripts. If not approved, run no provider commands and report DEFERRED blockers.

## 23. Documentation and state updates

Update all state/control/API/entity/business/workflow/feature/baseline docs, provider decision record, data map, threat model, runbooks and certification evidence. Never change DEFERRED to complete without approvals/results.

## 24. Completion checklist

- [ ] All legal/provider/security prerequisites are documented and approved.
- [ ] Domain remains provider-neutral; adapters isolate SDK DTOs.
- [ ] KYC/KYT gates are authoritative and non-leaking.
- [ ] Deposit/withdrawal ledger posting occurs once at correct state.
- [ ] Webhooks verify raw signatures and deduplicate/reorder safely.
- [ ] Withdrawal failure releases exact reservation.
- [ ] Reconciliation detects every mismatch and never auto-corrects.
- [ ] Secrets/PII/provider payloads are encrypted/redacted.
- [ ] Sandbox/outage/replay/race/security tests pass.
- [ ] UI/production remains disabled until 018 launch gate.

## 25. Final report format

Report all 17 standard items, approvals/certification/blockers, and next document `017` only if unblocked/completed.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

## 27. Local implementation closure evidence (2026-08-08)

- Local provider-neutral implementation is complete: Bridge external-money movements, Plaid Identity Verification/Monitor, BlockchainAnalysis.io explicit-chain KYT, encrypted provider references/raw inbox payloads, compliance gates/holds/incidents, money-movement reservation/cancellation/reversal lifecycles, raw-body webhook verification/deduplication, and non-repairing reconciliation.
- Provider outbound adapters share the bounded resilience authority: three immediate attempts, exponential backoff with jitter, CLOSED/OPEN/HALF_OPEN circuit states, and no fallback from configured real-provider mode to `LOCAL_TEST`. Configuration fails closed when any real-provider credential is absent.
- Local evidence: 27 migrations are applied/current; 27 unit suites / 114 tests; 21 real PostgreSQL/Redis integration suites / 85 tests; 25 HTTP E2E suites / 65 tests; and `qa:providers` disposable real-local service QA with zero scoped users, movements, reservations and compliance cases after cleanup.
- External blockers are explicit and not faked: Bridge and Plaid sandbox certification, plus BlockchainAnalysis.io live/account certification. Provider credentials are not committed, the frontend wallet remains disabled, production remains OFF / FAIL-CLOSED, and Document 017 is STARTED / PARTIAL solely because its independently-created Discord persistence migration exists.
