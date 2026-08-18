# Existing Features Audited

Audited the existing Discord XP/level, leaderboard, reputation, daily reward, achievement, birthday, suggestion, poll, scheduler, notification-role, customer-notification-preference, giveaway, and meme-competition paths. No product, financial, marketplace, or web application behavior was changed.

# New Automated Coverage

Added 3 command/scheduler unit tests and 8 Prisma integration tests in `apps/discord-bot/test/integration/community-progression-prisma.test.ts`. The integration suite runs only through the guarded `slice_test` URL.

# Bugs Found

Six confirmed defects were fixed:

1. `/rep` accepted a resolved Discord user who was not in the invoking guild.
2. `/suggestion` and `/poll` relied only on registration-time permissions, without a runtime Manage Server check.
3. Concurrent suggestion creation could collide on the guild-scoped reference number.
4. Poll voting accepted an out-of-range option index and concurrent scheduler scans could both report the same due poll as closed.
5. Discord notification-preference persistence passed `enabled` into a Prisma compound unique selector, causing a runtime validation error.
6. A failed scheduled community delivery could abort later jobs in that worker scan.

# XP / Levels

Verified eligible-message XP award, cooldown suppression, deterministic level reconciliation, leaderboard ordering, rank calculation, and guild isolation. No migration was required.

# Reputation

Verified self/bot/out-of-guild rejection, one concurrent grant per giver cooldown, recipient progression update, and durable `DiscordReputationGrant` audit persistence.

# Daily

Verified one claim per 24-hour window, concurrent claim idempotency, continuing streak behavior through 48 hours, and reset behavior after the continuation window.

# Achievements

Verified message, level, and reputation threshold evaluation and durable one-time unlock behavior across repeated evaluators.

# Birthdays

Verified month/day-only persistence, guild scoping, and atomic once-per-day announcement markers. No birth year is stored.

# Suggestions

Verified concurrent reference allocation retries safely, per-user vote switching, vote totals, and cross-guild reference isolation.

# Polls

Verified poll option bounds, one vote per member with replacement semantics, closed/late rejection, and exactly-one due-poll closure across concurrent scans.

# Notification Preferences

Verified managed notification-role safety remains covered by unit tests. Added Prisma durability coverage for customer notification preferences across a fresh repository instance, including the required guild configuration relationship.

# Scheduler

Added a per-job failure boundary to the worker: a failed birthday, prompt, poll announcement, giveaway, or meme job is logged as `community.scheduler_job_failed` and does not prevent later scheduled community work.

# Concurrency / Idempotency

Covered XP cooldowns, daily claims, reputation grants, achievement re-evaluation, suggestion references, suggestion votes, poll closing, birthday markers, and schedule claim markers. Existing giveaway and meme lifecycle integration tests also remained green.

# Unit QA

`npm run test:unit` passed: 23 files, 118 tests.

# Integration QA

`npm run test:integration` passed on the isolated VPS QA copy using the protected `slice_test` database: 4 files, 27 tests.

# Regression

Final full `npm test` passed on the isolated VPS QA copy: 27 files, 144 tests. `npm run typecheck`, `npm run lint`, `npm run setup-check`, `npm run prisma:generate`, and `npm run build` passed. Prisma validation passed; `slice_test` is current with 66 migrations. The shared runtime/deploy command inventory remains a single source of truth with 58 commands.

# Remaining Gaps

There is no code blocker. Community scheduled Discord sends are intentionally at-most-once: a failed send is logged and no longer starves other work, but it is not retried because the existing schema has no durable delivery lease/acknowledgement state for those posts. No deployment was performed because unrelated setup changes remain outside this focused commit.
