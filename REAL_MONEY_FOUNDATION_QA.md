# Real money foundation — Phase 3 QA

## Scope

This QA uses disposable local/test fixtures only. Umbreon, Charizard, the Phase
2 Initial Offering execution, and all existing staging financial state are
read-only and unchanged.

## Implemented checks

- Deposit request is pending before settlement and does not credit available
  cash.
- One confirmed deposit posts one balanced journal; duplicate completion is
  replay-safe.
- Withdrawal reservations are created before payout settlement.
- Collector proceeds can be the withdrawal source when the proceeds account has
  sufficient authority.
- Successful withdrawals consume reservations; failed and cancelled
  withdrawals release them.
- Provider returns create an explicit reversal while preserving the original
  journal; repeated return events are replay-safe.
- Returned-funds deficits create an account hold instead of fabricated money.
- Provider reconciliation checks missing journals, amount/currency/status,
  reversals, reservations, and duplicate postings without silently repairing
  balances.
- `LOCAL_TEST` is provider-neutral and has deterministic create, lookup,
  cancellation, webhook parsing, signature, and status-normalization seams.
- Wallet projections expose available cash, pending deposits, pending
  withdrawals, order reservations, withdrawal reservations, and collector
  proceeds separately.
- Admin finance projections expose movement outcomes, reservations, proceeds,
  fee revenue, external clearing, and reconciliation mismatch totals.

## Validation commands

Run from the repository root unless noted:

```text
cd server
npm run prisma:generate
npm run typecheck
npm test -- src/modules/providers/domain/money-movement-provider.spec.ts src/modules/providers/application/bridge.adapter.spec.ts src/modules/finance/domain/journal.spec.ts
npm run qa:providers
npm run build

cd ..
npm run typecheck
npm test -- --run src/repositories/finance-api-repository.test.ts src/routes/wallet.test.tsx
npm run build
```

`qa:providers` requires `TEST_DATABASE_URL` (or `DATABASE_URL`) to point to a
database or schema ending in `_test`; it refuses non-test targets. The fixture
cleans up its generated records.

## Provider and domain safety

```text
PROVIDER_MODE=local
External deposits: disabled
External withdrawals: disabled
Plaid calls: 0
Bridge calls: 0
PriceCharting calls: 0
Ximilar calls: 0
Umbreon changed: NO
Charizard changed: NO
Phase 2 execution changed: NO
```

The final command results and commit/deployment identifiers are recorded below
after the release-gate validation run.

## Validation results

| Gate | Result |
| --- | --- |
| Prisma schema validation | PASS |
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Backend unit/integration test suites | PASS — 59 suites, 247 tests |
| Frontend test suites | PASS — 36 files, 126 tests |
| Backend production build | PASS |
| Frontend production build | PASS |
| Focused backend lint | PASS |
| Focused frontend lint | PASS |
| Disposable provider lifecycle QA | BLOCKED — local PostgreSQL was not running at `127.0.0.1:5432`; the guarded script exited before creating fixtures |

## Release-gate status

Implementation status: COMPLETE

Phase 3 release status: BLOCKED pending a rerun of `npm run qa:providers` with a
test database available. No staging, Phase 2, Umbreon, Charizard, or real-money
records were changed during the blocked run.

## Final database-backed runtime QA — 17 August 2026

The earlier local-PostgreSQL blocker was resolved using the supported VPS
PostgreSQL instance with a uniquely named disposable schema. No staging schema
was reset, dropped, truncated, or reseeded.

```text
Environment: VPS PostgreSQL on 51.38.81.9 / database slice_staging
Schema: phase3_qa_20260817130408_test
Migrations: 64 applied, including 20260817100000_phase3_returned_money_movement
Provider mode: local
External providers: disabled
Destructive operations: NONE
```

### Runtime results

```text
£500 pending deposit: PASS
Settlement exactly once: PASS
Duplicate settlement replay: PASS
Collector proceeds withdrawal source: PASS
Cash fallback withdrawal source: PASS
Withdrawal success: PASS
Withdrawal failure release: PASS
Withdrawal cancellation release: PASS
Returned deposit: PASS
Append-only reversal and replay safety: PASS
Deficit hold: PASS
Concurrent withdrawals: PASS
Order / withdrawal race: PASS
Initial Offering internal £100 purchase: PASS
Initial Offering collector proceeds: PASS — £100.00
Initial Offering fee: PASS — £0.00
Initial Offering provider movement: 0
Secondary market regression: PASS
Reconciliation: PASS — zero mismatches
Customer / company money separation: PASS
Admin finance projections: PASS
Wallet projections: PASS
Security / authorization / webhook denial: PASS
```

Initial Offering fixture result: investor started with £500.00, purchased one
£100.00 unit, retained £400.00 available cash, received one ownership unit,
and produced £100.00 collector proceeds with no provider movement.

The disposable offering/race fixture cleaned to zero users, assets, offerings,
orders, executions, movements, reservations, and compliance cases. The final
provider QA fixture also cleaned to zero users, movements, reservations, and
compliance cases.

### Final provider QA identifiers

```text
Run: provider-qa-1786988839340
Deposit: aaa7ae60-0115-4925-bcff-c9b73c809c64
Proceeds withdrawal: 35297da1-6cd6-4281-abeb-82837627aa81
Cash withdrawal: e3ed822a-b9da-4663-9bbb-a8f65bbcd950
Failed withdrawal: 681592df-30d5-4b1c-bfc0-603ba7e7e7ff
Cancelled withdrawal: 9cf8ab77-e21e-4ce5-b27b-4260f2abcede
Returned deposit: 67fde790-bb13-4ce7-90c2-3361b28b95cc
Return original journal: 08877ef8-9bb7-406c-aa95-26c9227e2661
Return reversal journal: 76c3fe28-1256-4a9e-9149-0ee0da206267
```

### Final validation

```text
Backend unit tests: PASS — 59 suites / 247 tests
Phase 3 integration suites: PASS — 11 suites / 26 tests
Phase 3 finance/admin E2E suites: PASS — 4 suites / 11 tests
Frontend focused tests: PASS — 2 files / 9 tests
Backend typecheck: PASS
Frontend typecheck: PASS
Focused lint: PASS on changed finance/wallet paths
Backend build: PASS
Frontend build: PASS
Plaid calls: 0
Bridge calls: 0
PriceCharting calls: 0
Ximilar calls: 0
Real money: DISABLED
Umbreon changed: NO
Charizard changed: NO
Phase 2 offering changed: NO
Phase 2 execution changed: NO
```

### Release-gate status

Implementation status: COMPLETE

Phase 3 release status: COMPLETE pending the final main-branch push and staging
health smoke. Phase 4 sandbox remains blocked because provider sandbox
credentials are not available.
