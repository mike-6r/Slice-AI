# Final Status

Automated implementation and isolated `slice_test` QA complete. Production deployment verification remains pending.

# Architecture

`/schedule` stores a bot-owned schedule and durable occurrence records. It reuses the Embed Builder draft, validation, target-channel check, publication receipt, mention safety, and audit lineage; it does not introduce another embed composer.

# Embed Builder Integration

The builder has a **Schedule** action. `/schedule create` accepts the existing draft reference and validates the same payload before confirmation.

# Command Surface

`/schedule create`, `list`, `view`, `edit`, `pause`, `resume`, `cancel`, `history`, `retry`, `run-now`, and `timezone` are staff-only (`Manage Server`).

# Schedule Types

One-time, daily, weekly, monthly, and selected weekdays are structured controls. Monthly dates that do not exist are skipped, never shifted.

# Timezones / DST

IANA timezone IDs and local wall-clock intent are persisted with a UTC next-run timestamp. Spring-forward gaps advance to the first valid local time; ambiguous fall-back times choose the earlier occurrence.

# Snapshot vs Live Draft

Snapshot is the default and saves validated payload/buttons. Live Draft resolves the latest valid draft on execution. Both modes visibly state their content semantics.

# Channel Validation

Target selection validates text capability at configuration time. Execution rechecks guild availability plus View Channel, Send Messages, and Embed Links before every publication.

# Worker / Claim / Lease Model

The existing Discord worker scans at a bounded configurable interval. A compare-and-set claim takes a five-minute lease and creates one durable run. Work is bounded by configured concurrency. Expired in-flight leases become `UNKNOWN_DELIVERY_STATE` and `BLOCKED` rather than being sent again.

# Idempotency / Unknown Delivery State

The unique `(scheduleId, scheduledFor)` run key prevents concurrent worker claims. A Discord send accepted before receipt persistence becomes review-required; retry explicitly refuses unknown-delivery runs.

# Missed Runs

The default grace is 60 minutes (configurable 30–120). Older one-time runs are marked missed/completed; recurring schedules retain only the next future local occurrence—no backlog replay.

# Pause / Resume / Cancellation

Pause persists and removes the due time. Resume calculates the next future local recurrence. Cancellation is soft and retains audit/history.

# Run History / Permissions

All attempts record state, timestamps, safe code/summary, and successful Discord/publication IDs. Commands and components recheck guild ownership and `Manage Server`.

# Prisma

Migration `20260818230000_discord_announcement_scheduler` adds scheduler enums, schedules, durable runs, and append-only audit events.

# Unit QA

148 non-integration unit tests passed, including 14 timezone/recurrence/DST validation tests.

# Integration QA

The guarded VPS `slice_test` database applied both Embed Builder and scheduler migrations. All 39 integration tests passed, including schedule persistence, UTC due time, snapshot payload, concurrent claim, revision control, pause/resume, cancellation, audit, and expired-lease uncertainty.

# Full Regression

The full guarded regression passed: 33 files / 187 tests, typecheck, lint, setup-check, build, Prisma generation, and Prisma schema validation. The test database reports 70 migrations and is current.

# Manual QA

NOT RUN—no controlled guild schedule was created, so no production announcement or test message was left behind.

# Command Inventory

60 commands, including exactly one new top-level `/schedule`.

# Remaining Risks

Discord cannot provide a cross-system transaction with PostgreSQL; the implementation safely blocks ambiguous sends for staff review instead of claiming impossible exactly-once delivery.

# Git

Runtime implementation: `51b9386` (`fix(discord): apply scheduler guild timezone defaults`), following the scheduler foundation in `647cbab`.

# Deployment

Deployed to `/opt/slice/releases/20260818-51b9386`; both Embed Builder and scheduler migrations applied to the protected runtime database. Gateway and worker are active and both readiness endpoints passed. Protected command synchronization confirmed 60 commands.

# Release Decision

APPROVED. Automated regression and protected deployment checks passed; manual Discord interaction QA remains deliberately not run.
