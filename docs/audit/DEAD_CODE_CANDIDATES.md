# Dead-code candidates

This list is deliberately conservative. A candidate is not a deletion recommendation until runtime, route, import, migration, script, and deployment usage are traced.

## High-confidence cleanup candidates after confirmation

| Candidate                                   | Evidence                                                                                                      | Required confirmation                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Root release archives (`*.tar.gz`, `*.zip`) | Nine ignored bundles, about 114 MB; `.gitignore` and deployment docs say local bundles should not be retained | Confirm no local rollback/recovery requirement; move to operator archive/trash in a later cleanup prompt |
| Stale narrative docs                        | Older state/phase docs conflict with 98 current migrations and current modules                                | Mark superseded or regenerate; do not delete historical implementation docs without index review         |

## Medium-confidence candidates

| Candidate                                                        | Evidence                                                                                                     | Why not safe yet                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `src/mocks/repositories.ts` and mock-only domain fields          | Explicit mock mode and tests import mocks; production API mode is separate                                   | Mock mode is still documented and tested; preserve until mock-mode retirement is explicit |
| `src/routes/operations.submissions.tsx` and `/operations/assets` | Active staff route links and backend consumers exist; overlaps `/admin`                                      | Could serve a different role audience; compare permissions and staging navigation first   |
| Legacy presentation helpers                                      | `src/routes/-portfolio-presentation.ts` and `OwnershipService.percentageForUnits` contain derived transforms | Some are imported by active pages or tests; trace each export individually                |
| Discord schema models with no direct `server/src` Prisma call    | Discord models are consumed by `apps/discord-bot` generated client/repositories and integration tests        | Direct server-only grep falsely labels them unused; preserve                              |

## Low-confidence / unknown

- Prisma models or fields that appear only through nested relation includes, raw SQL, generated clients, or migrations.
- Route files reachable only from role-gated navigation or direct deep links.
- Provider adapters whose activation is environment-gated.
- Scripts invoked by deployment operators rather than package scripts.

No files were deleted in this audit.
