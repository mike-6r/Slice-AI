# Wave 3 decomposition report

Audit date: 2026-08-26
Starting commit: `80d8201`

Wave 3 extracts the stable, side-effect-free seams that were previously mixed
into the two largest administration files. Transactional submission mutations,
financial/ownership/custody authority, and the HTTP repository's public object
shape remain deliberately intact: their dependencies are not safe to move
without a dedicated contract suite and an API-domain extraction pass.

## Completed extractions

| Source | Before | After | Extracted responsibility |
| --- | ---: | ---: | --- |
| `server/src/modules/admin/admin.service.ts` | 6,342 | 6,142 | Intake stage, issue, allowed-action, summary-count, fixture, and admin-attention projections moved to `admin-intake-projections.ts`. |
| `src/routes/admin.tsx` | 6,817 | 6,672 | Search parsing, legacy deep-link compatibility, section normalization, and pipeline target mapping moved to `-admin-route-state.ts`. |

`admin-intake-projections.ts` has no database, authorization, storage, or
transaction dependency. `AdminService` remains the only orchestrator of its
queries and mutations. `-admin-route-state.ts` is likewise pure and retains
the existing `/admin` search contract.

## Contract and behavior evidence

- API contracts: none changed.
- Route URLs and legacy `/admin?section=...` mappings: unchanged; covered by
  `admin-route-state.test.ts`.
- Authorization: unchanged; controller guards and service authorization calls
  remain in the existing orchestration layer.
- Transactions and idempotency: unchanged; no mutation method was moved.
- Query behavior: unchanged; this pass does not alter Prisma includes, filters,
  ordering, counts, pagination, or index definitions.

## Performance and bundle baseline

The prior build already emits the admin workspace as a separate client chunk;
the public entry does not absorb the admin implementation. No lazy-loading
change was made in this extraction-only pass, so SSR/hydration semantics remain
unchanged. There are no query or bundle claims beyond the measured build output.

## Deliberately deferred

| Target | Reason |
| --- | --- |
| `submission.service.ts` | Its remaining large sections coordinate lifecycle decisions, outbox work, and canonical linking. Moving them without dedicated transaction/permission characterization would be risky. |
| `collector-workspace.tsx` | Presentation sections share extensive local types and state. A future extraction should move one rendered workspace at a time with route-level visual characterization. |
| `http-repositories.ts` | The factory is the public compatibility seam for every frontend domain. Domain splitting needs contract coverage for each mapper and response shape first. |
| Query/index changes | No observed N+1, full-table read, or unbounded-list evidence was sufficient to justify changing database behavior. Index candidates remain a schema/index-wave concern. |

No schema, migration, financial, ownership, custody, provider, submission-policy,
or controlled-asset behavior changed in this wave.
