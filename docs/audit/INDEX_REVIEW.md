# Prisma index review

## Scope and method

The current schema declares 328 model-level `@@index`/`@@unique` entries,
in addition to primary keys and field-level unique constraints. This review
maps the indexes supporting high-value API/worker/Discord access paths from
Prisma filters, ordering, pagination, nested relations, and raw SQL. It does
not claim table cardinality or production query plans that were not measured.

## Confirmed keep groups

| Domain/query path | Schema support | Result |
| --- | --- | --- |
| Catalogue and public reads | `Asset` status/category/set/title indexes; public collector, watchlist, and notification keys | KEEP — supports server-side lists, search/order paths, and per-user reads. |
| Submission/review queue | `AssetSubmission` owner/status/date and reviewer/status/date indexes; certification verification keys | KEEP — supports collector views and staff review queues. |
| Physical intake | `SubmissionIntake`, shipment, receipt, verification, and exception status/date/vault keys | KEEP — supports intake board and exception/verification queues. |
| Custody, valuation, publication | Asset-linked relation keys and lifecycle/date indexes | KEEP — supports canonical detail and lifecycle projections. |
| Market/portfolio | Snapshot/provider/asset/date keys | KEEP — supports refresh jobs, reference observations, and portfolio projections. |
| Ownership/offering | Supply, account, position, reservation, ledger, and offering uniqueness/indexes | KEEP — protects issuance, positions, reconciliation, and offering inventory. |
| Finance/provider | Account, journal, movement, reservation, reconciliation, provider-reference, and webhook keys | KEEP — high-risk financial and idempotency/reconciliation infrastructure. |
| Trading | Asset/order-book status/price/priority, user/order history, execution sequence keys | KEEP — matching, expiry, execution, and user history paths. |
| Outbox/delivery workers | `OutboxEvent` and `NotificationDelivery` status/availability/lease indexes | KEEP — matches raw `FOR UPDATE SKIP LOCKED` claim queries. |
| Discord | Guild/logical-key uniqueness plus ticket/community/schedule indexes | KEEP — Discord repository queries and raw schedule/progression upserts depend on these identities. |

## Constraint findings

The important concurrency and identity boundaries are database-backed:

- Canonical asset public IDs/slugs and graded identity (`gradeScaleEntryId`,
  certification number).
- One intake per submission; one shipment/receipt/verification per intake.
- Certification claims and provider-reference/idempotency paths.
- Ownership supply, offering, positions, ledger, reservation, execution, and
  market sequence identities.
- Financial/provider references, webhook and outbox/delivery idempotency.
- Discord guild/resource/panel/ticket/community logical identities.

Raw SQL uses targeted primary/business-key locks for financial, ownership,
submission, custody, provider, outbox, notification, and Discord operations.
That is evidence to preserve supporting constraints, not evidence to replace
them with speculative indexes.

## Missing-index candidates

None proposed. The static query review found matching indexes for the
high-frequency queue and list shapes, but no production `EXPLAIN (ANALYZE,
BUFFERS)`, table size, selectivity, or write-cost evidence is available. A new
index requires that evidence and a dedicated migration review.

## Redundant-index candidates

None proposed. Prefix/unique-index removal decisions require PostgreSQL catalog
information, usage statistics, and production workload evidence. A static
schema read cannot prove an index redundant, particularly for provider,
financial, audit, or Discord recovery paths.

## Follow-up required before any mutation

1. Run read-only `pg_stat_user_indexes`, table-size aggregates, and selected
   `EXPLAIN (ANALYZE, BUFFERS)` queries against an approved non-production or
   production-read-only session.
2. Characterize real catalogue/review/intake/admin pagination filters and sort
   selectivity.
3. Include write amplification and migration-lock planning for every proposed
   index.
4. Treat finance, ownership/trading, custody/intake, provider, and Discord
   indexes as owner-reviewed/high risk.

No index was added, removed, renamed, or rebuilt in Wave 5.
