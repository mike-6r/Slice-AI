# Slice Discord `slice_test` Regression QA

Date: 2026-08-18  
Scope: P0 candidate regression only. No Discord product feature, command synchronization, deployment activation, service restart, migration creation, or production/staging business data change was performed.

## Environment

| Item | Result |
| --- | --- |
| Source commit under test | `dd2c7cb` — `fix(account): connect Discord through bot handoff` |
| Live release before and after QA | `/opt/slice/releases/20260818-dd2c7cb` |
| Source/live commit match | Yes. The active release directory names the same commit as `HEAD`. |
| Test execution location | VPS, executed as the restricted `slice` account from the active release. |
| Database host class | Local PostgreSQL on the VPS (`127.0.0.1:5432`); no remote/production provider database. |
| **DATABASE NAME** | **`slice_test`** |
| Test database user | `slice_test_user` |
| Test-only environment | `/etc/slice/slice-test.env`, protected `root:slice`, mode `640`; it is not a production service environment file. Credentials are not recorded here. |

### Isolation proof

- The normal runtime database was observed as `slice_staging`, owned by `slice_staging`.
- Before provisioning, neither `slice_test` nor `slice_test_user` existed.
- The new `slice_test` database is owned by `slice_test_user`.
- `slice_test_user` has `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, and `NOINHERIT`.
- The test environment parses to host `127.0.0.1`, port `5432`, database `slice_test`, user `slice_test_user`.
- During and after QA, the test role had **0** connections to `slice_staging`.

This proves the test target is a separate database from the normal Slice runtime database. No password, URL, token, or other credential is included in this document.

## Safety Validation

| Validation | Result |
| --- | --- |
| `test-database-url.ts` guard | Preserved unchanged. It requires `TEST_DATABASE_URL`, parses it as a PostgreSQL URL, and rejects any database name other than exactly `slice_test`. |
| Test target assertion | Passed before migration and test execution: database name was explicitly checked as `slice_test`. |
| Production/staging `DATABASE_URL` | Not changed. The active bot and worker services were not restarted or reconfigured. |
| Schema initialization target | Prisma reported `slice_test` at `127.0.0.1:5432`. |
| Controlled business state | No staging records, controlled Umbreon state, controlled Charizard lifecycle state, Initial Offering execution, or provider state was touched. |
| Test fixtures | The integration suite uses only disposable `discord-test-*` Discord operational fixtures in `slice_test`; post-test residue count was `0`. |

## Schema/Test Setup

The repository’s supported Prisma schema path is `server/prisma/schema.prisma`; the Discord generator is invoked by `apps/discord-bot`’s `prisma:generate` script.

1. Created dedicated database `slice_test` and restricted owner `slice_test_user`.
2. Loaded only `TEST_DATABASE_URL` from the protected test environment and temporarily mapped it to Prisma’s `DATABASE_URL` **for the migration command only**.
3. Ran `npx prisma migrate deploy --schema ../../server/prisma/schema.prisma` from `apps/discord-bot` after asserting the target name.
4. Prisma applied and then confirmed **64 of 64 migrations** on `slice_test`.
5. Ran the candidate QA as the VPS `slice` user. The integration test itself injects `testDatabaseUrl()` into `PrismaClient`; it does not use the normal runtime database.

## Prisma Generation

| Command | Result |
| --- | --- |
| `npm run prisma:generate` | PASS — Discord Prisma client generated from `server/prisma/schema.prisma`. |

## Unit Tests

| Command | Result |
| --- | --- |
| `npm run test:unit` | PASS — **19 files / 92 tests**, 0 failures, 0 skips. |

The 92-test count is the exact committed `dd2c7cb` candidate running on the VPS. The local workstation worktree has a pre-existing, uncommitted setup-reset test change and therefore showed 93 tests during the earlier audit; that user change is not part of this deployed commit and was not folded into this release decision.

## Integration Tests

| Command | Result |
| --- | --- |
| `npm run test:integration` | PASS — **1 suite / 5 tests**, 0 failures, 0 skips. |

The full current integration directory was run, not a cherry-picked test. It contains `ticket-lifecycle-prisma.test.ts`; its Prisma client is explicitly configured with the validated `TEST_DATABASE_URL` and its fixtures were removed after execution.

## Typecheck

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |

## Lint

| Command | Result |
| --- | --- |
| `npm run lint` | PASS |

## Build

| Command | Result |
| --- | --- |
| `npm run build` | PASS — one production build only; Prisma generation and TypeScript compilation completed for the active candidate release. |

## Setup Check

| Command | Result |
| --- | --- |
| `npm run setup-check` | PASS — manifest v16: 30 roles, 7 categories, 15 channels; 13 YAML files validated. |

## Market/Collector Candidate Coverage

The shared command inventory and its unit coverage include the current public read families:

- `/asset`
- `/market`
- `/collector`
- `/vault`

`slice-backend-client.test.ts` covers safe public response projection handling, and `paginator.test.ts` covers owner-scoped pagination. The live development guild still has the exact 56 registered commands; the required market-family names are present.

## Command Inventory

| Check | Result |
| --- | --- |
| Source inventory | 56 top-level commands from shared `src/command-inventory.ts`. |
| Live development-guild inventory | 56 commands. |
| Parity | PASS — source count and registered count are both 56. |
| Required market families | PASS — `asset`, `market`, `collector`, and `vault` are registered. |

## Runtime Health

| Check | Result |
| --- | --- |
| Active release | `/opt/slice/releases/20260818-dd2c7cb` |
| `slice-discord.service` | `active` |
| `slice-discord-worker.service` | `active` |
| Gateway readiness | `http://127.0.0.1:3111/ready` → HTTP `200` |
| Worker readiness | `http://127.0.0.1:3112/ready` → HTTP `200` |
| Command count after QA | 56 |

No deployment or restart was necessary: the exact tested commit was already the active release. No Discord command sync was performed.

## Release Decision

# CONDITIONAL GO

**Automated candidate regression is cleared for `dd2c7cb`.** The real isolated `slice_test` database is provisioned, the schema is current, all required automated gates pass, the source and active release match, both services are healthy, and 56 commands remain registered. Therefore no release activation was necessary.

This is conditional rather than a full launch sign-off because the separately required real-guild interaction QA is still unrecorded. It was not attempted or marked complete during this task.

## Remaining Blockers

1. **Real-guild interaction QA remains open (separate P0):** controlled account link/unlink, human verification, cross-user component ownership, notification-role selector, ticket privacy/transcript/restart, moderation/automod, public market/Collector/Vault rendering and customer delivery behavior need manual controlled-guild evidence.
2. **Local dirty worktree is not the deployed candidate:** existing uncommitted setup-reset source/test changes were preserved and were not included in the `dd2c7cb` release regression. They require their own commit, test run, and release decision before activation.

No product features were added, no credentials were committed, no runtime configuration was changed, and no source commit was created by this task.
