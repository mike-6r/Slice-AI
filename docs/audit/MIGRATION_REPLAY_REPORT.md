# Migration replay report — Wave 6

## Disposable environment and safety boundary

The replay used a new, local-only Docker PostgreSQL 16 container bound to
`127.0.0.1:55432` and the database `slice_test`. The runner's existing
fail-closed guard accepts only PostgreSQL URLs on `localhost`/`127.0.0.1` whose
database name is exactly `slice_test`; it overwrites inherited deployment
`DATABASE_URL` and `REDIS_URL` before reset/test operations. No staging or
production URL was used.

Docker Redis 7 was separately bound to `127.0.0.1:56379`. Both containers are
labelled disposable for this Wave 6 exercise.

## Replay result

| Check | Result |
| --- | --- |
| Empty-database replay | PASS |
| Checked-in migrations | 98 |
| First migration | `0001_identity_control_foundation` |
| Last migration | `20260826110000_physical_intake_authority` |
| `prisma migrate deploy` | PASS — all 98 applied |
| Repeated `prisma migrate reset` | PASS |
| `prisma migrate status` after deploy | PASS — database schema up to date |
| Prisma API client generation | PASS |
| Discord Prisma client generation | PASS |
| `prisma validate` | PASS |

No extensions, non-default collation, seed, or manual prerequisite was needed
for the disposable replay. Historical migrations were not edited, squashed, or
reordered.

## Schema comparison decision gate

`prisma migrate diff --from-url <migrated slice_test> --to-schema-datamodel
prisma/schema.prisma --exit-code` returned a non-empty diff. This is a
**recorded discrepancy, not a permission to rewrite migration history**.

The diff contains three classes:

1. PostgreSQL identifier truncation/name normalisation for generated
   constraints and indexes.
2. A substantive missing index in the current Prisma schema:
   `ComplianceCase(provider, identityState, updatedAt)` exists in the migrated
   database but is not declared in `schema.prisma`.
3. Default/referential-action drift: migrated `VerificationReview.updatedAt`
   has a `now()` default whereas the current Prisma model has only `@updatedAt`;
   several Discord relations differ by explicit `ON UPDATE CASCADE` versus the
   migrated database's default update action.

The local catalog confirmed the migrated Discord constraints and their delete
actions exist. Neither test data nor an empty local database establishes which
of these declared-vs-migrated behaviours is the intended production contract.
The correct next action is a separately reviewed forward migration/model
alignment decision, with migration history preserved. Wave 6 made no schema,
migration, or index change.

## Golden maintenance gate

The existing command is the reusable baseline:

```powershell
$env:TEST_DATABASE_URL='postgresql://slice_test:slice_test_only@127.0.0.1:55432/slice_test?schema=public'
$env:TEST_REDIS_URL='redis://127.0.0.1:56379'
Set-Location server
npm run test:integration
Set-Location ../apps/discord-bot
npm run test:integration
```

Each backend invocation resets only the guarded `slice_test` database,
replays every migration, generates both Prisma clients, and executes the
selected integration suite. CI already provisions PostgreSQL 16 and Redis 7
for backend/Discord integration. A dedicated CI assertion for migration
diff/parity remains deferred until owners decide the documented drift.
