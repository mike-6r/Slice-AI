# Data integrity report — Wave 6

## Scope and safety

This report separates disposable-database evidence from staging evidence. The
local `slice_test` database was intentionally reset and populated only by
tests. Staging was not mutated. A direct read-only public staging check on
2026-08-26 returned HTTP 200 for `/health`, `/ready`, and the public market
asset endpoint (two items). The previously recorded privileged aggregate
evidence remains in [STAGING_AUTHORITY_EVIDENCE.md](STAGING_AUTHORITY_EVIDENCE.md).
The documented `slice_staging` SSH alias is not configured on this host, so no
new privileged staging SQL was attempted after the fail-closed SSH lookup.

## Established staging aggregates

The retained read-only aggregate run reports 21 canonical assets, 12 approved
submissions, 11 linked approved submissions, and one approved but unlinked
Charizard intake. It also reports 16 published assets, issued ownership supply,
active staff valuations, secured custody rows, and trading markets. It found no
reported duplicate certification, ownership, offering, publication, provider,
or financial structural anomaly.

The single unlinked Charizard is an explicitly recorded owner-decision gap: it
is not an orphan or a data repair candidate. Its `submission.assetId` remains
unchanged.

## Disposable integration evidence

The guarded reset/replay plus integration fixtures exercised referential and
concurrency boundaries for identity, roles/sessions, catalogue/submission,
intake, custody, valuation, ownership, offerings, finance, providers, outbox,
notifications, memberships, and Discord persistence. The repaired affected
backend group passed 4 files / 15 tests; Discord PostgreSQL integration passed
7 files / 39 tests. Redis was local-only and exercised by the backend
integration harness.

The initial full backend integration run exposed four stale test contracts,
not production mutations: expanded wallet projection fields, the current
withdrawal-fee journal shape, provider-owned MFA challenge purposes, and the
email resend configuration. Their exact assertions/configuration were updated
and the focused replayed group passed.

## Severity and findings

| Severity | Finding | Action |
| --- | --- | --- |
| P0 | None found in disposable constraints/tests or recorded staging aggregates. | No financial/ownership repair. |
| P1 | Prisma model/migrated-schema parity is non-zero for the documented default, index, and Discord update-action differences. | Owner-reviewed forward alignment; no automatic repair. |
| P2 | No new staging aggregate query was possible from this host because the documented SSH alias is unavailable. | Re-run the listed aggregates using approved staging access. |
| P3 | CI does not yet have a standalone parity-diff gate. | Add after resolving the parity decision. |

## Explicit non-actions

- No staging data changed.
- No finance, ownership, custody, provider, or controlled-asset records changed.
- No canonical Asset was created or linked.
- No migration, schema, or index was changed.
