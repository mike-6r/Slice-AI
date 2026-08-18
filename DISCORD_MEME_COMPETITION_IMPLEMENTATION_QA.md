# Implementation Summary

Slice now has a bounded, Discord-only weekly meme competition. It uses the existing community scheduler, the existing bot-owned `DiscordMemberProgression` XP state, and the existing community channel surface. No Slice financial, ownership, trading, wallet, KYC, Collector, valuation, or provider state is read or changed.

# Competition Lifecycle

The existing weekly community schedule opens one competition per guild/week in the managed `general` community channel. Its durable lifecycle is `OPEN`, `CLOSING`, `CLOSED`, `AWARDED`, or `CANCELLED`. A unique guild/period key prevents duplicate weekly competitions. The existing 15-minute community scan opens, closes, awards, and announces it; no additional scheduler or permanent channel was introduced.

# Submission Model

Members post one image/GIF/media-like message in the active competition channel, then run `/meme submit message:<message-id>`. The bot fetches and validates the real Discord message, owner, channel, and media before persisting only its Discord IDs and timestamp. Plain text, bots, restricted members, wrong-channel messages, duplicate messages, repeat member entries, and closed competitions are rejected.

# Voting Contract

Votes use one configured Discord reaction, `MEME_COMPETITION_VOTE_EMOJI` (default `🔥`). Tallying finds that exact emoji by key/name; it never relies on reaction array position. Each reacting Discord member is unique by Discord itself, and bot/self votes are excluded. Deleted or no-longer-valid media submissions are invalidated at close.

# Winner Selection

The highest valid explicit-reaction tally wins. Equal totals are resolved by secure randomness among a stable, sorted tied set; insertion order is never a tie-breaker. The winner, winning submission reference, final vote tally, and audit events are persisted. An empty valid set closes cleanly with no invented winner or XP award.

# XP Integration

The configurable `MEME_COMPETITION_REWARD_XP` default is 100 XP. The award marker and the increment to the existing `DiscordMemberProgression` row occur in one transaction. `DiscordMemeAward.competitionId` is unique, so worker/manual retries cannot double-award XP or create a second XP ledger.

# Worker

The existing worker's 15-minute community scan creates weekly competitions, retries missing opening announcements, processes due/stale-closing competitions, and retries result announcements. A close claim, final state transition, award marker, and announcement claim keep worker retries idempotent. Results are persisted before Discord message updates.

# Persistence

Additive migration `20260818170000_discord_meme_competitions` adds `DiscordMemeCompetition`, `DiscordMemeSubmission`, `DiscordMemeAward`, and `DiscordMemeCompetitionAuditEvent`, with lifecycle/audit enums and uniqueness/index constraints. It was applied only to isolated `slice_test`; Prisma reports 66 migrations current.

# Authorization

`/meme submit` and `/meme status` are member-facing. `/meme end` and `/meme cancel` have a runtime Discord `ManageGuild` check. No Discord role is treated as Slice financial, Collector, ownership, or account authority.

# Idempotency

One competition exists per guild/week, one submission per member/competition, and one record per Discord message. Close claiming prevents duplicate worker/manual closing, stale claims are retryable, one award record protects XP, and result announcement claims prevent duplicate result posts where Discord retries occur.

# Unit QA

Passed in the isolated VPS QA candidate: **21 files / 113 tests**. Focused coverage includes command surface, authorization, media validation, exact reaction lookup, bot/self-vote exclusion, highest-tally selection, secure tie contract, result rendering, and worker retry/publish behaviour.

# Integration QA

Passed against the real isolated `slice_test` database: **3 suites / 19 tests**. Coverage includes durable weekly creation/restart lookup, submission uniqueness, ownership/channel validation, cancellation, highest-tally award, invalid/deleted exclusion, audit history, XP exactly-once behaviour, worker close claim, and fixture cleanup.

# Manual Discord QA

NOT RUN. No controlled guild competition, submission, reaction, result, XP, command synchronization, service restart, or deployment was performed.

# Command Inventory

Source inventory is **58** commands and includes `/meme`. The live guild remains at 56 because command synchronization was intentionally not run.

# Remaining Risks

Controlled Discord guild QA is still needed for live reaction pagination/visibility, media rendering, command registration, message permissions, worker timing, and level/leaderboard presentation after an award. Reaction-based voting intentionally follows the requested “most reactions” model; it is not an anti-cheat or identity system.

# Release Decision

Conditional GO for source and isolated automated QA. Deployment and command synchronization are intentionally withheld because unrelated, pre-existing local setup changes remain uncommitted and manual live Discord QA is not recorded.
