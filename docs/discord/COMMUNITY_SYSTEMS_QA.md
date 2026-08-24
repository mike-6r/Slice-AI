# Community Systems

## Progression

`/level`, `/leaderboard`, `/reputation`, `/achievements`, and `/daily` use
guild-scoped persistence. XP excludes bot messages and applies cooldown,
minimum-length, and duplicate-message protections. It is community recognition
only and never represents money, ownership, value, or investment performance.

## Community tools

Persistent suggestions, polls, birthday preferences, notification roles,
giveaways, and meme competitions use their existing repositories and workers.
Giveaway entries are unique and auditable; meme competitions retain submission,
vote, and award history across restart.

## Safety

Community text sanitizes mass mentions. Staff management actions require
Manage Server or the system's existing scoped staff authorization. Scheduled
posts and completion workers are idempotent and do not create financial or
market records.

## Validation

Unit tests cover progression abuse controls, community permissions, giveaways,
meme competition, and scheduling. Their Prisma persistence suites require the
guarded `slice_test` database.
