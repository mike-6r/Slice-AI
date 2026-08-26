# Wave 5: Prisma schema forensics

## Scope and evidence

This is a read-only forensic audit of the shared Prisma schema at commit
`19ac240`. No schema, migration, index, data, financial, ownership, custody,
or controlled-asset state was changed.

The current schema contains 175 models, 108 enums, 328 model-level
`@@index`/`@@unique` declarations, and 98 ordered migrations. It is consumed
by the Nest API, Discord's separately generated client, background workers,
scripts, tests, raw SQL, and staging data. The complete static usage grouping
is in [SCHEMA_USAGE_MATRIX.md](SCHEMA_USAGE_MATRIX.md).

Static evidence included direct delegates, Prisma type references, nested
relations, migrations, raw SQL, test helpers, seed/demo scripts, and Discord
persistence repositories. The API has 1,696 delegate-operation call sites and
629 explicit sort/pagination references. Raw SQL is used intentionally for
transactional locking, queue claims, and Discord concurrency paths; it is not
a bypass that makes affected tables removable.

## Authoritative boundary checks

- `AssetSubmission` remains distinct from canonical `Asset`; the nullable
  `AssetSubmission.assetId` is lineage only.
- Review approval does not create an `Asset`. The staging evidence records one
  approved, unlinked Charizard intake, confirming the owner decision on explicit
  staff canonicalization remains unresolved.
- Finance, ownership/trading, intake/custody, provider, and Discord models
  were audited only. No lifecycle or authority boundary was changed.

## Model results

All models have direct, relation, migration, raw-SQL, or active-capability
evidence. Classification is summarized below; the matrix names every model.

| Classification | Result |
| --- | --- |
| Active core/admin/lifecycle | Identity, catalogue, submission, intake, custody, valuation, publication, membership, market, ownership, finance, provider, outbox, and community models have active API/test/script or relation usage. |
| Active Discord | All Discord-prefixed models have direct Discord repository/worker references, including models with no Nest API delegate calls. |
| Audit/history/infrastructure | Audit events, status history, ledger, reconciliation, outbox, notification delivery, webhook, provider, and Discord audit tables remain required for audit, idempotency, reconciliation, or recovery. |
| Legacy but required | `FinancialConnectionSession`, `PhoneVerificationChallenge.codeHash`, selected `ProviderCode` values, and Bacs legacy reference fields have explicit compatibility/history evidence. |
| Potential unused | No Tier A model, field, enum, or index candidate was proven. |

`PlatformRevenueSettlementLine` has no standalone delegate call, but is an
active relation-only finance line model (`PlatformRevenueSettlement.lines`) and
is not a cleanup candidate. `FinancialConnectionSession` has no active
delegate use, but its schema commentary and provider tests establish it as
retained Financial Connections history; it is Tier B only, requiring provider
and retention-owner approval before any future change.

## Field and enum findings

| Element | Classification | Evidence and action |
| --- | --- | --- |
| `PhoneVerificationChallenge.codeHash` | MIGRATION_COMPATIBILITY / Tier B | Schema explicitly states new challenges never persist local OTPs. Do not drop until retained rows, migration compatibility, and provider rollback requirements are assessed. |
| `BacsSetupSession.externalSetupIntentId` | MIGRATION_COMPATIBILITY / Tier C | Explicit additive compatibility field for legacy setup intent references; new code uses encrypted/hashed references. Financial/provider owner review required. |
| `GradeScaleEntry.legacy` | READ_AND_WRITTEN | Read and written by catalogue services and catalogue seed tooling. Keep. |
| `ProviderCode.SUMSUB`, `TRM`, `BVNK` | AUDIT/HISTORICAL / Tier C | Explicitly marked historical compatibility values. No active adapter selects them, but historic rows/payloads can require enum preservation. |
| `FinancialConnectionSession` | LEGACY_ACTIVE / Tier B | Retained provider-history model; not safe to remove based on zero delegate count. |
| `PlatformRevenueSettlementLine` | RELATION_ONLY | Nested through active financial settlement operations; keep. |

No enum was proven unused. No duplicate state representation was proven
incorrect: apparent pairs such as provider/internal status, verification/status,
publication/ownership, and membership/billing state are distinct authorities
documented in the source-of-truth matrix.

## Index and constraint result

The high-traffic queues and transactional paths have matching indexes or
primary/unique constraints:

- `OutboxEvent` and `NotificationDelivery` queue-claim indexes match the
  `status`/availability/lease raw queries using `FOR UPDATE SKIP LOCKED`.
- Review, intake, catalogue, market, ownership, trading, and notification
  lists expose status/actor/date or asset/date composite indexes matching their
  server-side filters and sorting.
- Certification, provider, idempotency, offering, ownership, market-sequence,
  webhook, and Discord logical-identity uniqueness are database-backed.
- Raw row-lock queries target primary keys or existing business keys and do not
  reveal an unindexed production scan from static evidence.

No index add/remove is proposed. A production `EXPLAIN (ANALYZE, BUFFERS)` and
aggregate workload evidence are required before claiming a missing or
redundant index. See [INDEX_REVIEW.md](INDEX_REVIEW.md).

## Staging and migration evidence

Read-only staging evidence already captured on 2026-08-26 reports 21 canonical
assets, 12 approved submissions, and one approved but unlinked intake. It also
records active systemd API/web/Discord/worker units. No staging query was run
in this wave, and no sensitive values are included here.

Local `prisma migrate status` could not reach its configured PostgreSQL at
`127.0.0.1:5432`; Docker is installed but its daemon is unavailable. Therefore
a migration-from-zero exercise and local aggregate data-quality checks are
**PREREQUISITE BLOCKED**, not skipped or altered. Existing generated-client,
validate, typecheck, test, and build checks remain the validation baseline.

## Owner decisions and next step

No cleanup is authorised. Future work needs separate owner approval for:

1. Financial Connections historical retention and any `FinancialConnectionSession`
   retirement plan.
2. Local OTP-hash and Bacs legacy-reference retention/migration policy.
3. The explicit staff canonicalization trigger (Model C remains recommended).
4. Any index addition/removal after production query-plan and write-cost review.

See [SCHEMA_CLEANUP_CANDIDATES.md](SCHEMA_CLEANUP_CANDIDATES.md) and
[DATA_RETENTION_CANDIDATES.md](DATA_RETENTION_CANDIDATES.md) for non-executable
future proposals.
