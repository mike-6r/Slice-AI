# Slice Discord Analytics + Admin Dashboard

## Final Status

Implementation is source-complete for aggregate Discord operational telemetry. Automated integration and deployment validation remain blocked until the isolated `slice_test` PostgreSQL service is reachable.

## Command Surface

`/analytics overview|engagement|community|support|commands|publishing|health|export`

Staff may view operations; `export` additionally requires Discord Manage Server. The command is registered through the shared command inventory.

## Data Sources

- Aggregate message/member/command tables for new telemetry only
- Existing tickets, suggestions, polls, giveaways, meme competitions, embed publications, and scheduled publication runs
- Durable gateway/worker heartbeat rows

No backfill is attempted for historical Discord messages, members, or command events.

## Analytics Collection Start

Message, member, command, component-participation, and heartbeat collection begins when the analytics migration is deployed. Historic domain records remain usable for their existing periods.

## Overview / Engagement / Community / Support / Publishing

Dashboards reuse authoritative bot-owned records. Message content, ticket answers, internal notes, command arguments, URLs, private account data, and financial data are not stored or displayed. Ticket detail calculations remain sourced from ticket records rather than a duplicate analytics counter.

## Command Analytics

The shared interaction dispatcher records command name, optional subcommand, duration, and bounded outcome counters. It records no arguments or modal values. Internal dispatcher failures are classified as `INTERNAL_ERROR`; operational handlers remain isolated from telemetry failure.

## Bot / Worker Health

Gateway and worker heartbeats are durable and classify freshness as HEALTHY, DEGRADED, or UNHEALTHY. The health view does not reveal infrastructure URLs, credentials, or exception text.

## Export

Admin export is a bounded CSV of daily aggregates only. It excludes raw messages, ticket content, internal notes, command inputs, member profiles, and financial data.

## Privacy / Data Minimization

One daily guild/member activity row supports unique active-member counts; it never archives messages. Channel and command data are daily aggregates. There is no financial, KYC, ownership, or portfolio telemetry.

## Performance / Concurrency

Collection uses Prisma atomic `upsert` increments and compound unique keys. Dashboard queries use aggregate/grouped reads. Telemetry writes are wrapped in `capture()` and cannot affect the source action.

## Prisma

Additive migration: `20260819100000_discord_analytics_dashboard`.

## Unit QA

- `npm run test:unit`: PASS, 28 files / 156 tests
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run setup-check`: PASS
- `npm run build`: PASS
- `npm run prisma:validate`: PASS

## Integration QA

Not run successfully: the configured guarded `slice_test` database endpoint is unreachable locally. The test database guard remains unchanged and no substitute database was used.

## Manual QA / Deployment

Not run. No migration, command sync, commit, push, or VPS deployment was performed.

## Remaining Risks

- Bring the isolated `slice_test` PostgreSQL service online, apply migrations there, and add/run persistence concurrency coverage.
- Run controlled-guild QA after the full regression is green.

## Release Decision

NO-GO until integration regression, migration application, and controlled Discord QA pass.
