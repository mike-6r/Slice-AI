# 012 — Ownership ledger and issuance

## 1. Document metadata

Phase 5; **COMPLETE** (verified 2026-08-07); critical risk; requires 005 and 011. Supports ownership figures on asset/detail/buy/sell/portfolio and future trading. Affects ownership domain, PostgreSQL ledger/projections, admin issuance/reconciliation. Extra-large; never parallel with financial/trading schema work.

## 2. Project-specific context

The frontend displays availability, owners, percentages and allocation flows from mock asset values and route-local calculations (`buy.$id.tsx`, `sell.$id.tsx`, `allocate.$id.tsx`, `portfolio.tsx`). `src/domain/ownership.ts` and repository/service hooks exist but are non-authoritative. A published, vaulted asset needs an immutable supply and ownership history before money or orders can settle. 013 consumes ownership-derived positions; 014 reserves/transfers units.

## 3. Current implementation audit

No ownership server module/table exists. Do not reinterpret frontend percentages as ledger entries. Preserve 001–011 identity/asset lifecycle and use their IDs/transactions/audit. Existing mock `available` values can seed explicit demo fixtures only. Missing unit precision, supply, accounts, positions, reservations, append-only entries, sequences, issuance/transfer/correction/reconciliation, locks and invariant tests.

## 4. Files to read

Read `src/domain/ownership.ts`, portfolio/trading/common/asset types, `src/data/repositories.ts`, services/hooks/keys, mock repositories/market, asset/buy/sell/allocate/portfolio/collector routes and cards; all server identity/access/catalogue/publication/database files; Prisma; 005/011; entity/API/business/workflow/state docs.

## 5. Strict scope

- Define indivisible ownership units and immutable per-asset total supply.
- Add owner/system accounts, materialized positions, reservations and append-only ledger.
- Implement first issuance from published eligible asset, atomic transfers, reserve/release/consume and administrative correction entries.
- Provide self/public-safe position/ledger/supply reads and privileged reconciliation/rebuild.
- Guarantee sequences, conservation, nonnegative available balances, idempotency, audit and concurrency safety.
- Add full real-PostgreSQL invariant/race/rollback tests.

## 6. Out of scope

No cash ledger, payment, order matching, pricing, cost basis, governance distributions, blockchain/tokenization, deletion/edit of ledger entries, float quantities, direct frontend switch or provider claim.

## 7. Dependencies and preconditions

Require asset publication READY/PUBLISHED, secured custody/coverage per 011, active issuer/admin permission, PostgreSQL transaction/isolation/locking support and 005 controls. Product/legal must approve supply granularity and beneficial-ownership terminology. Default model: fixed `totalUnits` integer between 1 and 1,000,000; one unit is indivisible. If policy is undecided, stop before migration/issuance rather than assume tokenization.

## 8. Database specification

All quantity columns are PostgreSQL `BIGINT`; API serializes decimal strings.

| Model                        | Fields, constraints and lifecycle                                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OwnershipAssetSupply`       | `assetId` PK/FK restrict; `totalUnits BIGINT >0`; `issuedUnits BIGINT >=0`; `nextSequence BIGINT default 1`; `status PENDING                                                                                         | ACTIVE   | FROZEN   | CLOSED`; `issuedAt?`; `version`; timestamps. `totalUnits` immutable after first entry; issued <= total.                                              |
| `OwnershipAccount`           | UUID `id`; `type USER                                                                                                                                                                                                | TREASURY | ESCROW   | EXTERNAL`; nullable unique `userId`for USER;`status ACTIVE                                                                                           | FROZEN              | CLOSED`; timestamps. User FK restrict; never hard delete after activity. |
| `OwnershipPosition`          | UUID; `assetId`,`accountId`; `settledUnits BIGINT >=0`; `reservedUnits BIGINT >=0`; `version`; timestamps; unique asset+account; available = settled-reserved and must be >=0. Materialized projection, rebuildable. |
| `OwnershipReservation`       | UUID; asset/account; `purposeType`,`purposeId`; `units >0`; `status ACTIVE                                                                                                                                           | CONSUMED | RELEASED | EXPIRED`; `expiresAt?`; `idempotencyRef`; timestamps; unique active purpose; indexed asset/account/status/expiry. Terminal status never reactivates. |
| `OwnershipLedgerEntry`       | UUID; asset; `sequence BIGINT`; `entryType ISSUANCE                                                                                                                                                                  | TRANSFER | RESERVE  | RELEASE                                                                                                                                              | CONSUME_RESERVATION | CORRECTION                                                               | RETIRE`; debit/credit account IDs nullable by type; `units >0`; `reservationId?`; `correlationId`; `causationId?`; `idempotencyRecordId?`; `reasonCode`; private allowlisted metadata JSON; actor; `createdAt`; unique asset+sequence and asset+correlation+entry semantic key. Append-only. |
| `OwnershipReconciliationRun` | UUID; asset/all scope; status; expected/actual hashes/counts/totals; discrepancies JSON codes; started/completed/actor timestamps. Results immutable.                                                                |

Use CHECK constraints where PostgreSQL supports them; Prisma migration SQL may add checks/partial indexes. FKs restrict deletion. Ledger and reconciliation retained permanently subject to legal policy. Migration `ownership_ledger_foundation`; seed none except explicit demo via test factories.

## 9. Domain types and ports

Branded `OwnershipAccountId`, `OwnershipReservationId`, `OwnershipLedgerEntryId`; `OwnershipUnits` bigint/string parser rejects sign, decimals, exponent and overflow policy; `AssetSupply`, `Position`, `Reservation`, `LedgerEntry`, `OwnershipMutationResult {entryIds,sequences,positions}`.

`OwnershipRepository`:

- `findSupplyForUpdate(assetId, tx)` / `createSupply` / `updateSupplySequenceAndIssued`.
- `findPositionForUpdate(assetId,accountId,tx)` / `upsertPosition` / `listPositions`.
- `findReservationForUpdate(id,tx)` / `findActiveByPurpose` / `createReservation` / `markConsumed|Released|Expired`.
- `appendLedgerEntry(entry,tx)` / `appendLedgerEntries` / `listEntriesAfterSequence(assetId,after,limit)`.
- `sumSettledByAsset`, `sumReservedByAsset`, `getLastSequence`, `replacePositionsFromRebuild` only in privileged maintenance transaction.

Ports: `OwnershipUnitOfWork`, `Clock`, `IdGenerator`, `AssetEligibilityPort`, `ActorAuthorizationPort`, `AuditWriter`, `IdempotencyService`. Repositories expose transaction-aware row-lock methods; no controller uses them directly.

## 10. Domain rules and invariants

Core invariants at every commit:

1. `sum(position.settledUnits) == supply.issuedUnits`.
2. `0 <= issuedUnits <= totalUnits` and total is immutable after issuance.
3. For every position: `0 <= reservedUnits <= settledUnits`; available is never negative.
4. For every asset: sum ACTIVE reservation units by account equals position reserved units.
5. Transfer debits equal credits and cannot mint/burn.
6. Issuance credits exactly newly issued units from no debit; only first/authorized incremental issuance within approved supply policy.
7. Retirement/correction uses explicit balancing system account/reason; never edits history.
8. Sequences start at 1, strictly increase by one per asset and are unique/gap-free for committed entries. Rollback may reuse an uncommitted sequence.
9. Same idempotency/correlation operation cannot append twice.
10. FROZEN supply/account forbids reserve/transfer/issuance except explicit admin release/correction policy.

Transitions: supply PENDING→ACTIVE after issuance; ACTIVE↔FROZEN with reason/audit; ACTIVE/FROZEN→CLOSED only when no reservations and policy permits; CLOSED terminal. Reservation ACTIVE→CONSUMED/RELEASED/EXPIRED; terminal states terminal. Transfer locks supply then positions in sorted account-ID order to avoid deadlocks. Issuance, transfer, reserve/release/consume, projection updates, audit and outbox rows share one serializable/retry-safe transaction.

## 11. Application services

- `IssueOwnership(assetId,totalUnits,treasuryAccount,actor,key)`: authorize, lock eligible asset/supply, reject existing issuance, create supply/treasury position, append ISSUANCE sequence 1, activate, audit/event.
- `TransferOwnership(assetId,from,to,units,correlation,actor,key)`: validate active, lock ordered positions, available >= units, update settled balances, append balanced TRANSFER (one logical entry with both accounts or paired entries sharing correlation), audit/event.
- `ReserveOwnership(assetId,account,units,purpose,expiry,actor,key)`: lock, available check, create reservation, increment reserved, append RESERVE.
- `ReleaseReservation` and `ExpireReservation`: lock active reservation/position, decrement exactly once, terminalize, append RELEASE; replay returns prior result.
- `ConsumeReservation(reservation,toAccount,actor,key)`: lock all sorted rows, move settled units and decrement reserved, mark consumed, append consumption/transfer semantics atomically.
- `CorrectOwnership`: PLATFORM_ADMIN + second approver; add compensating entry/system account, never edit; reason/evidence mandatory.
- `ReconcileAsset` computes supply/position/reservation/sequence/hash discrepancies read-only; `RebuildPositions` replays ledger into shadow result, compares, requires maintenance freeze/two-person approval, atomically replaces projection and audits.

## 12. API specification

Authenticated reads: `GET /v1/me/ownership?cursor&limit`; `GET /v1/me/ownership/:assetId`; `GET /v1/me/ownership/:assetId/ledger?afterSequence&limit` with self-safe entries. Public asset projection exposes total/available basis points and owner count only where policy permits. Admin: `POST /v1/admin/assets/:assetId/ownership/issue`; `/freeze`; `/unfreeze`; `/corrections`; `POST /v1/admin/ownership/reconciliation-runs`; `GET /v1/admin/ownership/reconciliation-runs/:id`. Internal service endpoints are not public; 014 calls application ports in-process. Mutations require idempotency, strict limits, recent auth, permission and audit. Cursor/sequence max 200.

## 13. Error catalogue

`OWNERSHIP_NOT_ISSUED` 409; `OWNERSHIP_ALREADY_ISSUED` 409; `ASSET_NOT_ELIGIBLE_FOR_ISSUANCE` 409; `INVALID_UNIT_QUANTITY` 422; `INSUFFICIENT_AVAILABLE_UNITS` 409; `SUPPLY_LIMIT_EXCEEDED` 409; `OWNERSHIP_FROZEN` 423; `RESERVATION_NOT_FOUND` 404; `RESERVATION_TERMINAL` 409/replay-safe; `RESERVATION_EXPIRED` 409; `POSITION_NOT_FOUND` 404; `OWNERSHIP_CONCURRENCY_CONFLICT` 409 retryable; `OWNERSHIP_INVARIANT_VIOLATION` 500 non-retry/operator alert; `RECONCILIATION_MISMATCH` 409 admin-only. Do not disclose another owner/balance.

## 14. Authorization and security

Self reads only; public aggregate only. SYSTEM/approved issuance operator issues; trading service reserves/consumes under scoped service identity; PLATFORM_ADMIN plus second approver corrects/rebuilds. No client chooses debit account/actor/system account. Lock and authorization occur inside transaction. Redact positions, reason evidence and metadata; rate-limit ledger export/reconciliation.

## 15. Audit and idempotency

Every mutation and reconciliation run is audited with actor, asset, account IDs, units, entry IDs/sequences, purpose/reason/result/request ID; prohibit user PII, token/payment data and arbitrary notes. Idempotency scopes operation+actor+asset; fingerprint includes accounts/units/purpose/version. Replay returns same entry IDs/sequences/position snapshot. Different payload conflicts. Ledger unique correlation is a second defense.

## 16. Events, realtime and jobs

Outbox event contracts: `ownership.issued.v1`, `ownership.transferred.v1`, `ownership.reserved/released/consumed.v1`, `ownership.supply_status.changed.v1`, `ownership.reconciliation.failed.v1`; payload IDs, units strings, sequence range, version, no PII. 017 dispatches. Expiry/reconciliation jobs are specified but not scheduled here; duplicate job execution is harmless. Frontend invalidates asset ownership/portfolio/order availability.

## 17. Frontend alignment

Maps asset `available`, owner count and self position/units to `src/domain/ownership.ts`; buy/sell/allocate remain simulated until 014/013 integration. Percentages are derived from units/total with documented rounding for display only. This document changes no frontend.

## 18. Implementation file plan

Create `server/src/modules/ownership/{domain,application,persistence,http}` with ledger/repository/unit-of-work/reconciliation and tests; add Prisma migration/app wiring/contracts. Preserve financial/order/frontend code and never reuse market snapshot availability as authority.

## 19. Numbered implementation process

1. Freeze approved unit/supply/legal terminology.
2. Model bigint parser, state machines and pure invariant checker.
3. Add reviewed migration with CHECKs/FKs/indexes.
4. Implement mappers/repository locks and per-asset sequence allocation.
5. Implement issuance and supply freeze lifecycle.
6. Implement transfer with deterministic lock order.
7. Implement reserve/release/expire/consume.
8. Implement correction with two-person authorization.
9. Implement reconcile and shadow replay/rebuild.
10. Add API projections/admin endpoints, audit/idempotency/outbox rows.
11. Run the complete PostgreSQL race/rollback/invariant matrix.
12. Manually reconcile a fixture and update state.

## 20. Test plan

Unit invariant matrix: zero/negative/fraction/overflow; issuance bounds; every state transition; reserve available exactly; terminal replay; balanced transfers; sequence reduction/replay; correction balancing. PostgreSQL integration: first issuance race; transfers against same position; reserve-vs-transfer; two reservations exceeding availability; consume-vs-release/expiry; sorted multi-account deadlock resistance; sequence uniqueness/gap-free commits; unique idempotency/correlation; forced rollback leaves supply/positions/reservations/ledger/audit/outbox unchanged. Rebuild from ledger matches projection; tampered fixture detects exact discrepancy. E2E permissions/private projection/idempotency/admin approval. Load test many concurrent reservations with final conservation assertion. No fake persistence.

## 21. Manual QA

On disposable DB, create eligible published asset/accounts, issue 10,000 units, transfer/reserve/release/consume, inspect sequences and position equations after each, provoke over-reserve/freeze/concurrent request, run reconciliation, corrupt only an isolated test projection, detect and rebuild under maintenance approval. Verify audits/events and remove test namespace without deleting ledger through product APIs.

## 22. Verification commands

From `server/`: Prisma format/validate/generate/migrate status; lint; unit; real integration/concurrency script added by this document; E2E; build. Run SQL invariant query/script checked into tests. Root typecheck/build for DTO compatibility only.

## 23. Documentation and state updates

Update every state/control file plus API/entity/business/workflow/feature maps and baseline. Record ownership entities/endpoints owned only by 012 and dependencies 013→012, 014→012+013.

## 24. Completion checklist

- [x] Unit quantities are bigint/string and never float.
- [x] Supply is immutable after issuance and conserved at commit.
- [x] Position available units never become negative under races.
- [x] Active reservations exactly equal reserved projection totals.
- [x] Transfers are balanced and lock accounts deterministically.
- [x] Asset sequences are unique, ordered and gap-free for commits.
- [x] Replay cannot append duplicate ledger entries.
- [x] Correction is compensating and reasoned.
- [x] Reconciliation proves projection consistency and reports mismatch without repair.
- [x] All race/rollback/invariant/HTTP tests use real PostgreSQL and pass.
- [x] API exposes no other-user balance or internal metadata.
- [x] Financial/trading/frontend work was not implemented.

## 25. Final report format

Report all 17 standard items, including invariant/race evidence, and next document `013`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

## 27. Implementation progress (2026-08-07)

- Migration `20260807110000_ownership_issuance_foundation` is applied to `slice_test`. It creates a bigint-only immutable asset supply, ownership account, materialized position and append-only quantity ledger with supply/position/ledger CHECK constraints and uniqueness constraints for per-asset sequences and issuance correlation.
- The initial admin-only issuance endpoint is implemented with recent authentication, composite idempotency, transaction-scoped asset locking, audit, owner notification and the existing Redis control limiter. It issues only a fixed total supply into a private treasury principal; it creates no customer allocation, cash, financial ledger, portfolio, order, reservation, transfer or trading state.
- A public aggregate issuance projection exposes only status, total/issued unit strings and issuance timestamp. It exposes no account, investor, allocation, percentage, ledger, provider or lifecycle-private data.
- Completion evidence: migration `20260807120000_ownership_reservations_reconciliation` applied; immutable issuance, transfer, reservation/release, compensating correction and reconciliation APIs are implemented behind permission, recent-auth, idempotency, audit and rate-limit controls. Real PostgreSQL/Redis suites prove duplicate issuance, destination-account creation, transfer/reservation races, reserve-vs-transfer invariants, deterministic reconciliation mismatch reporting and transaction rollback injection. Final verification: 75 unit, 37 integration and 55 HTTP E2E tests; backend typecheck/lint/build and Prisma format/validate/generate/migrate status pass. Disposable real-service fixtures were removed with zero ownership QA rows remaining. Document 012 is COMPLETE; Document 013 is next and not started.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.
