# 011 — Valuation, vault, insurance and publication

## 1. Document metadata

Phase 4; **COMPLETE (verified 2026-08-07)**; critical risk; requires 007 and 010. Supports verified marketplace/detail/Vault Live/public listing data. Affects valuation, custody, insurance and publication. Large; not parallel-safe with asset lifecycle changes.

> Completion evidence: migration `20260807064953_valuation_custody_publication` is applied to `slice_test`; provider-neutral manual/unavailable adapters, privileged lifecycle APIs, seller-safe status, durable notifications/audit/idempotency, readiness-gated publication and allowlisted public projections are verified. Ownership, ledger, balances, orders and trading remain out of scope and were not started.

## 2. Project-specific context

Frontend mocks display prices, confidence, vault status, insurance and “verified” language. 010 only approves evidence; it does not prove custody, insurance or market value. This document establishes separate evidence-backed records and a strict publication gate. 012 cannot issue supply until publication prerequisites are satisfied.

## 3. Current implementation audit

The bounded lifecycle module now owns manual/provider-neutral valuation decisions, custody records/events, active coverage, readiness and publication. Catalogue/market/submission records remain its prerequisites. Public responses expose only durable allowlisted lifecycle status/source/as-of fields; never infer insurance or custody from an approved submission alone.

## 4. Files to read

Read home/marketplace/asset/Vault Live routes and mocks/domain types, listing flow, server catalogue/market/submission modules, Prisma/access/audit, 007/010, entity/API/business/workflow guides.

## 5. Strict scope

Implement append-only valuation evidence/decisions, custody intake/status/events, insurance evidence/coverage status, publication readiness evaluation, privileged approve/publish/unpublish, public projections and event contracts.

## 6. Out of scope

No ownership issuance/trading, direct insurer/vault integration unless approved adapter exists, payment, auto-valuation claim, frontend integration or visual change.

## 7. Dependencies and preconditions

Require approved submission and reviewer separation. Legal/product must define accepted valuation evidence, custody proof, insurance wording and publication approvers. Without provider approval, use manual evidence records labelled `MANUAL_UNVERIFIED` and block production publish where policy requires verified provider status.

## 8. Database specification

`ValuationEvidence(id,assetId,sourceType,sourceRef private,observedAt,valueMinor,currency,conditionBasis,confidence,documentMediaId?,createdBy,createdAt,supersedesId?)`; `ValuationDecision(id,assetId,valueMinor,currency,confidence,methodologyCode,decidedBy,decidedAt,status ACTIVE|SUPERSEDED)`; `VaultCustodyRecord(id,assetId,providerCode,facilityCode private,status EXPECTED|RECEIVED|INSPECTED|SECURED|RELEASE_PENDING|RELEASED|EXCEPTION,providerRef private,receivedAt?,securedAt?,updatedAt)` unique active asset; `CustodyEvent` append-only; `InsuranceCoverage(id,assetId,providerCode,policyRef private,insuredValueMinor,currency,status PENDING|ACTIVE|EXPIRED|CANCELLED|EXCEPTION,effectiveAt,expiresAt,evidenceMediaId?,updatedAt)`; `AssetPublication(id,assetId unique,status BLOCKED|READY|PUBLISHED|UNPUBLISHED,readiness JSON codes,publishedAt?,publishedBy?,version)`. Index asset/status/time; restrict evidence FKs; no hard delete. Migration `valuation_custody_publication`.

## 9. Domain types and ports

Value objects `Valuation`, `Confidence`, `CustodyStatus`, `CoverageStatus`, `PublicationReadiness`. Repositories for evidence/decision/custody/events/coverage/publication with locks. Provider ports `VaultProviderPort.verifyReference/getStatus` and `InsuranceProviderPort.verifyCoverage`; manual adapters explicit. `PublicationPolicy.evaluate(asset,verification,valuation,custody,coverage)` returns blocking codes.

## 10. Domain rules and invariants

Valuations never overwrite evidence; one active decision per asset. Currency consistency required. Custody transitions follow explicit table; release is blocked after ownership issuance except authorized governance flow. Coverage is ACTIVE only within dates and verified evidence policy. Publish requires catalogue PUBLISHED-ready metadata, approved verification, active valuation, custody SECURED, active adequate insurance and no exception. Same actor cannot be sole submitter, verifier and publisher. Unpublish is monotonic history and does not delete records.

## 11. Application services

Record evidence/decision with specialist permission and audit; transition custody after provider/manual verification; record coverage; calculate readiness; publish/unpublish with asset row lock/version and transaction. Publish updates catalogue/publication/read projection atomically and returns an outbox event. Provider failure is retryable and never guessed.

## 12. API specification

Privileged: `POST /v1/admin/assets/:id/valuations/evidence`; `POST /valuations/decisions`; `POST /custody/transitions`; `POST /insurance/coverage`; `GET /publication-readiness`; `POST /publish`; `POST /unpublish`. Public asset/vault endpoints from 007/008 gain allowlisted `valuation {amount,currency,confidence,asOf,status}`, `custody {status,asOf}`, `insurance {status,insuredAmount?,expiresAt?}` and publication status. Mutations require permission/idempotency/rate/audit.

## 13. Error catalogue

`VALUATION_EVIDENCE_INVALID` 422; `VALUATION_CONFLICT` 409; `CUSTODY_TRANSITION_INVALID` 409; `CUSTODY_PROOF_REQUIRED` 422; `COVERAGE_INVALID/EXPIRED` 422/409; `PUBLICATION_BLOCKED` 409 with safe blocking codes; `SEPARATION_OF_DUTIES_REQUIRED` 403; provider/unavailable 503; version conflict 409.

## 14. Authorization and security

VALUATION_ANALYST (or approved role), VAULT_OPERATOR, COMPLIANCE/insurance reviewer and PLATFORM_ADMIN have scoped actions; publisher is separate. Provider refs/facilities/policies/documents private. Webhooks wait for 016. Validate evidence media access and all amounts. Never advertise “insured/secured/verified” unless current status proves it.

## 15. Audit and idempotency

Audit every evidence/decision/status/publication action with IDs, codes, amounts and currency where policy allows; never provider secrets/full policy refs/doc URLs/notes. Idempotency required for all mutations; provider operation/reference participates in fingerprint.

## 16. Events, realtime and jobs

Return versioned `valuation.decided.v1`, `custody.status.changed.v1`, `insurance.status.changed.v1`, `asset.published/unpublished.v1`; 017 persists/delivers. Define expiry/readiness recheck jobs but do not schedule. Public events invalidate asset/market/vault queries.

## 17. Frontend alignment

Maps to price/confidence, asset verification/custody/insurance labels and Vault Live feed. Every field includes source/status/asOf so UI can avoid false live claims. No frontend modification; 009 may consume only after backend contract lands.

## 18. Implementation file plan

Create valuation/custody/insurance/publication server modules or bounded submodules, provider ports/manual adapters, migration/tests. Modify catalogue/market projections narrowly. Preserve ownership/trading/frontend.

## 19. Numbered implementation process

1. Approve evidence/status/publish policy.
2. Add entities/migration/transitions.
3. Implement repositories and provider ports.
4. Implement valuation/custody/coverage services.
5. Implement readiness/separation rules.
6. Implement publish/unpublish transaction and projections.
7. Add controllers/audit/idempotency/events.
8. Add DB/provider/E2E/race tests and QA.
9. Update state; do not begin issuance.

## 20. Test plan

Unit all transition/readiness combinations, currency/confidence/date/separation. DB append-only evidence, active decision race, custody transition race, publication version/rollback. Provider sandbox/manual adapter success/outage/mismatch. E2E permissions/idempotency/private projection/blocking codes/publish/unpublish. Contract tests for public fields.

## 21. Manual QA

For an approved submission, record evidence/decision, attempt premature publish, progress custody and insurance, publish, inspect public asset/Vault event, expire/cancel coverage and verify readiness/unpublish behavior. Inspect audit/history and private field exclusion.

## 22. Verification commands

Server Prisma, lint, unit, integration, E2E, build; provider sandbox command only if an approved adapter/script is added. Root typecheck/build contract regression.

## 23. Documentation and state updates

Update state/control/API/entity/business/workflow/feature/baseline documents and this prompt. Record provider/manual verification limitations and 012 issuance prerequisite.

## 24. Completion checklist

- [x] Evidence is append-only and decisions are versioned.
- [x] Custody/insurance transitions and dates are enforced.
- [x] Provider/manual status is truthfully labelled.
- [x] Publication evaluates the implemented required gates and is row-locked.
- [x] Publish/projection transaction is atomic; repeat publication is a stable no-op.
- [x] Public responses exclude provider refs/private documents.
- [x] DB/provider/E2E/race tests pass.
- [x] No ownership/trading/frontend work was started.

## 25. Final report format

Report all 17 standard items and next document `012`.

## Completion evidence (2026-08-07)

- Implemented manual/provider-neutral valuation, custody, insurance, readiness and publication services behind existing authorization, recent-auth, composite idempotency, audit, notifications and Redis control limits.
- Added lifecycle HTTP E2E coverage for seller isolation, permission denial, stale recent authentication, custody transition validation, blocked and ready publication, exact replay/conflict, safe market projection and concurrent initial publication.
- Live disposable HTTP QA passed using real PostgreSQL and Redis: approved handoff, blocked publication, custody progression, valuation, active coverage, readiness, publication/replay, market visibility, seller-safe read, cross-user denial, stale-session rejection, audit/notification assertions and cleanup.
- Final checks passed: 67 backend unit tests, 37 PostgreSQL/Redis integration tests, 38 HTTP E2E tests, backend typecheck/lint/build and Prisma format/validate/generate/migrate status; root typecheck/lint/test/build passed with 27 frontend tests and only nine existing Fast Refresh warnings.
- Document **012** is next approved and remains **NOT STARTED**.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
