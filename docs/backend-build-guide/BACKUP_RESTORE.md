# Backup and restore runbook

## PostgreSQL

Back up PostgreSQL with a version-compatible `pg_dump` custom-format archive. Restore only into a
new, isolated database; never restore over an active environment. After restore run `npx prisma
migrate status` against the isolated URL and make a safe readiness/query check before declaring the
drill successful. Production RPO, RTO, retention, encryption and off-site storage require human
operations approval before launch.

Phase 3 local rehearsal used the Docker PostgreSQL 16.4 runtime: a custom-format dump of `slice_test`
was restored to isolated `slice_phase3_restore_20260808`, Prisma reported all 40 migrations current,
and a safe user-count query completed. The isolated database and dump were then removed; residual
temporary database count was zero.

## Redis

Redis is configured with `--save '' --appendonly no` for local runtime. It is disposable cache/rate
limit/SSE coordination state, not financial or notification-delivery authority. Rebuild Redis after
loss; PostgreSQL outbox and delivery rows drive durable retry/dead-letter recovery. Do not use this
local Redis configuration as a production durability policy without an approved managed Redis and
recovery design.

## Migration and rollback

Use forward-only Prisma migrations. Validate and inspect generated SQL before application, apply to
a staging clone first, then run `npx prisma migrate status`. Application rollback must be compatible
with the expanded schema; never attempt a data rollback by deleting financial, ownership, execution,
provider or outbox history.
