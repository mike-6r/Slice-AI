# Wave 6 database verification

## Outcome

Wave 6 established a local disposable PostgreSQL 16 + Redis 7 environment,
replayed all 98 migrations from zero, generated both Prisma clients, validated
the schema, and executed real PostgreSQL integration suites. No general schema
cleanup was performed.

| Gate | Result |
| --- | --- |
| Local PostgreSQL / guarded `slice_test` | PASS |
| Local Redis | PASS |
| Empty database migration replay | PASS |
| Prisma generation / validation / migration status | PASS |
| Schema parity diff | FAIL — documented decision gate, no repair |
| Focused repaired backend DB integration | PASS — 4 files / 15 tests |
| Discord PostgreSQL integration | PASS — 7 files / 39 tests |
| Public staging health/ready/market reads | PASS |
| Privileged staging aggregate refresh from this host | BLOCKED — SSH alias unavailable |

## Test-contract corrections

Four integration fixtures were aligned with active, already-shipped contracts:

1. Exact wallet projection assertions include the aggregate fields now returned.
2. Withdrawal rollback expects one debit and two credits, including the
   authoritative `WITHDRAWAL_FEE_BPS` credit.
3. SMS MFA test retrieval specifies `MFA_ENROLLMENT` and `MFA_LOGIN` purposes.
4. Email verification test configuration supplies the current resend interval.

These are test-only changes; no financial, provider, auth, schema, or runtime
behaviour was changed.

## Schema parity gate

See [MIGRATION_REPLAY_REPORT.md](MIGRATION_REPLAY_REPORT.md). The non-zero
diff is a P1 decision gate, principally covering `VerificationReview.updatedAt`,
an undeclared migrated `ComplianceCase` index, and Discord update-action
declarations. Do not alter checked-in historical migrations to force parity.

## Canonicalization and controls

The staging Charizard canonicalization gap is unchanged. No canonical Asset,
submission link, controlled Umbreon/Charizard economics, custody, ownership,
or finance record was mutated.

## Future CI gate

Use the existing guarded runner and Docker services for a `migration-from-zero
→ generate → validate → backend integration → Discord integration` job. Add a
separate schema-diff assertion only after owners decide the current intended
schema contract; otherwise CI would encode an unresolved mismatch as failure.
