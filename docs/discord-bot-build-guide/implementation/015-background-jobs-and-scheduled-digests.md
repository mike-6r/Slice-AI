# 015 — Background jobs and scheduled digests

## 1. Metadata

- **Document number:** 015
- **Title:** Background jobs and scheduled digests
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 007 (Marketplace and asset commands), 008 (Collector and Vault
  commands)
- **Blocks (this build guide):** 016 (Observability, audit correlation and operational controls)
- **Slice backend dependency:** Slice Doc 007 (VERIFIED market data) for the `market-digest` and
  `price-alert-poll` jobs. The `ticket-inactivity-sweep`, `mute-expiry`, and `giveaway-tick` jobs
  have **no** Slice backend dependency — they depend on this build guide's own Documents 011
  (Support/ticket migration), 012 (Moderation suite migration), and 014 (Community and engagement
  features) landing first, since those documents own the persistence these jobs operate against.
- **Can start today:** Yes, for the `market-digest` and `price-alert-poll` jobs — Slice Doc 007 is
  VERIFIED and Documents 007/008 of this build guide (which this document depends on) are
  independently startable per `IMPLEMENTATION_ORDER.md`. The `ticket-inactivity-sweep`,
  `mute-expiry`, and `giveaway-tick` jobs cannot close until Documents 011, 012, and 014
  respectively have landed and defined the bot-owned tables these jobs read and write.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend; the Discord bot being built
from this guide is a **companion client** to Slice, never a second backend — it calls Slice only
through its HTTP API and otherwise owns purely Discord-operational state (`BOT_DATA_OWNERSHIP.md`).
Per `IMPLEMENTATION_ORDER.md`, this document is Track B/Track C's convergence point: it is the
background-jobs layer that sits on top of the read-only market commands built in Documents 007/008
and the bot-owned engagement features built in Documents 011, 012, and 014. It introduces the
BullMQ-based worker process referenced throughout `BOT_ARCHITECTURE.md` and implements, verbatim,
the eight scheduled jobs listed in `EVENT_AND_JOB_CATALOGUE.md`'s "Scheduled jobs" table (one of
which — `notification-delivery-consumer` — is explicitly Phase 2 and not built here). This document
does not invent any job outside that table, and it does not implement the gateway-event handlers
listed in the same catalogue's "Discord gateway events consumed" table (those belong to Document 003
and the feature documents that own each event). Document 016 (Observability, audit correlation and
operational controls) builds its job-monitoring dashboards and alerting directly on the
structured-logging and metrics hooks this document defines, so this document's job runner must expose
those hooks even though it does not build the dashboard itself.

## 3. Current implementation audit

Nothing from this document exists yet. What this document assumes is already in place, per
`IMPLEMENTATION_ORDER.md`'s dependency graph:

- Document 001 (Repository reconciliation and bot foundation) has produced the bot's `src/main.ts`
  entry point, typed config loader, and the process-lifecycle conventions (graceful shutdown,
  `/health`/`/ready`) this document's worker process reuses.
- Document 002 (Slice API client and shared contracts) has produced the typed Slice API client this
  document's market-data jobs call — including `Idempotency-Key` attachment (not needed for GET-only
  job calls, but the retry-GET-once-on-401 and `Retry-After`-honoring behavior is needed).
- Documents 007 and 008 have produced the read-only market/catalogue/collector/vault command layer
  and, critically, established the exact embed conventions (`source`/`asOf`/`dataStatus` labeling)
  this document's digest and alert jobs must reuse rather than reinvent.
- Documents 011, 012, and 014 — **required only for the bot-owned jobs in this document's scope**,
  not for the market-data jobs — will have produced the ticket, moderation, and giveaway persistence
  tables this document's corresponding jobs operate against. Until they land, this document's spec
  for those three jobs stands as design-complete but not implementable.
- No BullMQ queue, worker process, job scheduler, or job-specific persistence exists anywhere in the
  bot codebase before this document.

## 4. Old bot behavior migrated

Cited from `OLD_BOT_FEATURE_INVENTORY.md` and `OLD_TO_NEW_MIGRATION_MATRIX.md`, filtered to the
scheduling/timer logic this document's jobs replace (the surrounding feature surfaces — ticket
lifecycle, moderation commands, giveaway commands themselves — are migrated by Documents 011, 012,
and 014; this document covers only the **scheduled/timer** portion of each):

- **Row 16/17 (Ticket creation and lifecycle, `cogs/Tickets.py`)** — migration status **REWRITE**.
  The old bot had no scheduled auto-close on inactivity at all; closure was manual (`!close`) with a
  human-triggered 10-second cancel window. `OLD_TO_NEW_MIGRATION_MATRIX.md` M1 explicitly specifies
  "auto-close fires after the configured inactivity window" as a new completion criterion. This
  document's `ticket-inactivity-sweep` job is net-new scheduling behavior, not a like-for-like port.
- **Row 19 (Mute / Tempmute / Unmute, `cogs/Moderation.py`)** — migration status **REWRITE**, and
  flagged **UNKNOWN** in `OLD_TO_NEW_MIGRATION_MATRIX.md`/`OLD_BOT_FEATURE_INVENTORY.md`: "no
  auto-unmute task loop was found in any reviewed cog," meaning tempmutes may never have expired
  automatically in production. This document's `mute-expiry` job is the first verified, tested
  implementation of that missing scheduler — M2's stated completion criterion ("tempmute reliably
  auto-expires via a real job") is delivered here, not assumed to already exist.
- **Row 26 (Giveaways, `cogs/Giveaways.py`)** — migration status **REWRITE**. The old bot's 30-second
  update loop is preserved as a *cadence* only; its implementation bugs are explicitly not
  reproduced: winner selection via `message.reactions[0].users().flatten()` (the reaction-index-0
  bug) and missing permission checks on `reroll`/`end`/`delete` are both named defects this
  document's `giveaway-tick` job must regression-test against (`TEST_STRATEGY.md` unit-test section
  names this exact regression by name).
- **None** — the `market-digest`, `price-alert-poll`, `prediction-scoring`, and `news-feed-poll` jobs
  have no old-bot predecessor. Infria (the old bot) had no market-data, collectibles-pricing, or
  prediction-game feature of any kind; these four jobs are entirely new product surface enabled by
  Slice's own backend, not a migration of old-bot behavior.

## 5. Slice features supported

- **Slice Doc 007 (market reads) — VERIFIED.** `GET /v1/market/summary`, `GET /v1/market/movers`,
  and `GET /v1/market/assets/:slug` back the `market-digest`, `price-alert-poll`, and
  `prediction-scoring` jobs respectively. Every value returned carries `source`, `asOf`, and
  `dataStatus` (`DEMO`/`DELAYED`/`LIVE`); per `BOT_PRODUCT_SPEC.md` §3 and §10, with no live provider
  wired today every response is expected to come back `dataStatus: DEMO`, and this document's jobs
  must render that label on every post, never silently upgrading the language to "live."
- **Slice Doc 006 (catalogue) — VERIFIED**, indirectly, as the source of asset slugs/metadata the
  `prediction-scoring` job resolves against when scoring a prediction target.
- **No other Slice backend document is touched by this scope.** The `ticket-inactivity-sweep`,
  `mute-expiry`, and `giveaway-tick` jobs make **zero** Slice API calls — per
  `BOT_DATA_OWNERSHIP.md`, tickets, moderation history, and giveaway state are pure bot-owned data
  with no Slice counterpart, and per `PERMISSION_MATRIX.md` these commands are "explicitly decoupled
  from Slice." The `news-feed-poll` job is likewise entirely external-source and Slice-independent.
  Slice Doc 017 (outbox/jobs/realtime) is **NOT STARTED** and is not a dependency of this document —
  the `notification-delivery-consumer` job that *would* depend on it is explicitly out of scope here
  (see §8).

## 6. Files to read before starting

- `EVENT_AND_JOB_CATALOGUE.md` — the authoritative list of all eight scheduled jobs; this document
  must not add, remove, or rename a job relative to that table.
- `BOT_ARCHITECTURE.md` — background-jobs paragraph, Slice API client conventions (retry-GET-once,
  `Retry-After` handling), deployment (separate gateway vs. worker process), health/readiness model.
- `BOT_API_REQUIREMENTS.md` — the "already available" table for `GET /v1/market/summary`,
  `/movers`, `/assets/:slug`; confirms no new endpoint is required for this document's Doc-007-backed
  jobs.
- `BOT_PRODUCT_SPEC.md` §3, §10, and the client-wishlist table rows for "Live Market Engine," "daily
  digest," "`#market-discussion` auto-morning summary," "`#price-alerts`," and "Daily 'Top 10
  Undervalued' scanner" — the last of these is classified **NEEDS PRODUCT DECISION** and must not be
  built here (see §8).
- `BOT_DATA_OWNERSHIP.md` — confirms ticket/moderation/giveaway state ownership and the absence of
  any Slice counterpart for those three jobs.
- `BOT_SECURITY_MODEL.md` §4–§5 — service-account credential requirement for the market-data jobs'
  Slice API calls (these are unauthenticated public reads today, but the client must be built to the
  same conventions as authenticated calls per `BOT_ARCHITECTURE.md`), idempotency and rate-limit
  obligations.
- `ERROR_CATALOGUE.md` — `MARKET_DATA_UNAVAILABLE` row and the generic-unrecognized-error row; this
  document's failure-handling section must match these exactly.
- `TEST_STRATEGY.md` — "Scheduled-job logic in isolation" bullet (mute-expiry timing, giveaway
  winner-selection regression test) and its unit/integration test split.
- `OLD_TO_NEW_MIGRATION_MATRIX.md` M1, M2, M4 — completion criteria this document's jobs must satisfy
  for ticket auto-close, mute expiry, and giveaway winner selection.
- Implementation Documents 007, 008 (once they exist) — for the exact embed conventions and Slice API
  client interface this document's market-data jobs must reuse rather than duplicate.
- Implementation Documents 011, 012, 014 (once they exist) — for the exact bot-owned schema
  (ticket/mute/giveaway tables) this document's corresponding jobs read and write; this document
  cannot finalize those three jobs' persistence queries until those schemas are fixed.

## 7. Strict scope

- A single BullMQ-based worker process (`src/worker.ts` or equivalent), deployed and scaled
  independently of the Discord gateway process, per `BOT_ARCHITECTURE.md`'s "one process for the
  Discord gateway connection, separate process(es) for background job workers" rule.
- A job-scheduling module that registers exactly the seven **buildable** jobs from
  `EVENT_AND_JOB_CATALOGUE.md`'s scheduled-jobs table, each with its own BullMQ repeatable-job
  definition (cadence per that table), queue, and worker:
  - `ticket-inactivity-sweep` (every 15 min) — bot-owned only, depends on Document 011.
  - `mute-expiry` (every 1 min) — bot-owned only, depends on Document 012.
  - `giveaway-tick` (every 30s) — bot-owned only, depends on Document 014.
  - `market-digest` (daily, configurable time) — Slice Doc 007-backed, buildable today.
  - `price-alert-poll` (every 5–15 min, configurable) — Slice Doc 007-backed, buildable today.
  - `prediction-scoring` (daily) — bot-owned prediction data scored against Slice Doc 007 data,
    buildable today (bot-owned persistence is a Document 014 concern per
    `BOT_DATA_OWNERSHIP.md`'s "Prediction-game submissions/leaderboard" row, but the *scoring job*
    itself is specified here as it is squarely a scheduled job).
  - `news-feed-poll` (every 15–30 min) — external source only, buildable today, zero Slice
    dependency.
- Idempotency (BullMQ dedup/job-ID keys) for every job so a worker restart, redeploy, or duplicate
  scheduler registration cannot double-run or double-post a job's output.
- Failure/retry policy per job family (backoff, max attempts, dead-letter handling, admin-channel
  alerting) consistent with `EVENT_AND_JOB_CATALOGUE.md`'s "Failure handling" column.
- Observability hooks (structured log fields, job-run metrics, a per-job "last successful run"
  timestamp queryable by Document 016) — the hooks only, not the dashboard/alerting UI itself (that
  is Document 016's scope).
- Explicit DEMO labeling on every market-data-derived job output (`market-digest`, `price-alert-poll`,
  `prediction-scoring`), matching Documents 007/008's existing embed conventions exactly.

## 8. Out of scope

- The `notification-delivery-consumer` job — `EVENT_AND_JOB_CATALOGUE.md` marks it **"Phase 2, not
  built"** explicitly, blocked on Slice Doc 017 (NOT STARTED) and a not-yet-defined `DISCORD`
  notification channel (`BOT_API_REQUIREMENTS.md` §4). This document records its design dependency
  only; it does not implement a queue, worker, or dedup table for it.
- Any of the Discord gateway event handlers from `EVENT_AND_JOB_CATALOGUE.md`'s first table
  (`interactionCreate`, `guildMemberAdd`, `messageCreate` auto-mod, `guildCreate`/`guildDelete`) —
  those are Document 003's and the relevant feature documents' scope, not scheduled jobs.
- The ticket, moderation, and giveaway **command surfaces** themselves (`/support open`, `/mod mute`,
  `/giveaway start`, etc.) and their persistence schemas — those are Documents 011, 012, and 014's
  scope. This document only adds the *scheduled sweep* that operates on tables those documents
  create; it does not define those tables' full schema (it cites the columns it reads/writes as a
  consumer, not as the schema's owner).
- A "Daily 'Top 10 Undervalued' scanner with confidence rating" — `BOT_PRODUCT_SPEC.md`'s
  client-wishlist table classifies this **NEEDS PRODUCT DECISION**: "No 'undervalued'/expected-ROI
  scoring model exists anywhere in Slice's documented backend... this is new data-science/analytics
  work, not a wiring task." This document's `market-digest` and `price-alert-poll` jobs surface only
  what Slice's `GET /v1/market/summary`/`/movers` actually return (movers, summary stats) — they must
  never compute or fabricate an "undervalued" or "confidence" score client-side.
- News items "predicting potential market impact" — the same product spec table classifies
  AI-generated market-impact commentary as **NEEDS PRODUCT/LEGAL REVIEW**. The `news-feed-poll` job
  posts aggregated external news items only, with no generated commentary of any kind.
- A real-time/push notification pipeline — every job in this document's scope is **poll-based**
  (`BOT_PRODUCT_SPEC.md`: "'real-time' must mean scheduled polling, not live push" until Slice Doc
  017 ships). This document does not build a websocket/streaming consumer.
- Any job that mutates Slice data. Every Slice API call this document's jobs make is a `GET` — no job
  in this scope writes to Slice, consistent with `BOT_ARCHITECTURE.md`'s "never re-implement a Slice
  business rule" and this build guide's read-first principle.
- The observability dashboard, alert routing, and audit-correlation UI that consumes this document's
  hooks — that is Document 016's scope; this document only emits the data.

## 9. Dependencies

- **BullMQ** — the queue/worker library, matching the technology choice `BOT_ARCHITECTURE.md`
  documents as shared with Slice's own planned Doc 017 design ("Can reuse the same BullMQ technology
  Slice's own Doc 017 design already specifies").
- **Redis** — BullMQ's required backing store; this is the same "Redis/DB connection strings for
  bot-owned state" dependency `BOT_ARCHITECTURE.md`'s configuration section already names, reused
  here rather than introduced fresh. `/ready` must reflect Redis reachability, per
  `DEPLOYMENT_PLAN.md`'s "`/ready` returns 200 only when Discord gateway + Slice API + bot DB/Redis
  are all reachable" convention.
- **The typed Slice API client** from Document 002 — reused as-is by the `market-digest`,
  `price-alert-poll`, and `prediction-scoring` jobs; this document introduces no second HTTP client.
- **A cron-expression or repeatable-job scheduler** — BullMQ's own built-in repeatable-job feature
  (cron-pattern or `every`-millisecond), no separate scheduling library.
- **An external news source client** for `news-feed-poll` — a lightweight HTTP fetch against a
  Pokémon TCG news source (`BOT_PRODUCT_SPEC.md` client-wishlist row); no new runtime dependency
  beyond what Document 002's HTTP tooling already provides.
- **discord.js's channel/message-send API** — every job that posts an embed (digest, alert,
  countdown update, news item) uses the same bot client instance's `channel.send`, not a second
  Discord connection; the worker process therefore needs a lightweight, read-mostly discord.js client
  instance solely for posting (it does not process gateway interactions — that stays the gateway
  process's job per `BOT_ARCHITECTURE.md`).

## 10. Bot-owned persistence

This document introduces one new table plus three columns/read paths against tables Documents 011,
012, and 014 own. Per `BOT_DATA_OWNERSHIP.md`, all of it is pure Discord-operational or job-metadata
state with no Slice counterpart.

- **New table: `JobRun`** (bot-owned, this document's own) — one row per job execution, the
  observability substrate Document 016 will build on:
  - `id` (PK), `jobName` (one of the seven job names in §7), `startedAt`, `finishedAt`,
    `status` (`SUCCESS` / `FAILED` / `SKIPPED`), `failureReason` (redacted, no raw exception text —
    same rule as `ERROR_CATALOGUE.md`'s generic-error branch), `itemsProcessed` (nullable integer,
    e.g., tickets closed / mutes lifted / alerts posted), `slicePartial` (boolean — true if a
    Slice-backed job partially failed and skipped posting rather than posting stale data).
  - Indexed on `(jobName, startedAt)` for "last successful run per job" queries.
- **New table: `MarketAlertState`** (bot-owned) — dedup/watermark state for `price-alert-poll` so the
  same move isn't re-alerted every poll cycle:
  - `assetSlug` (PK part), `lastAlertedMovePercent`, `lastAlertedAt`, `dataAsOf` (the Slice `asOf`
    value of the data that triggered the last alert, so a re-poll of the same underlying Slice
    snapshot never re-fires).
- **New table: `PredictionScore`** — bot-owned prediction-game leaderboard rows the
  `prediction-scoring` job writes to. Per `BOT_DATA_OWNERSHIP.md`'s "Prediction-game
  submissions/leaderboard" row, the *submission* schema itself is owned by Document 014 (the command
  surface that creates predictions); this document only adds the columns the scoring job needs to
  read (`predictionId`, `assetSlug`, `targetValue`, `targetDirection`, `resolvesAt`) and write
  (`scoredAt`, `outcome`, `pointsAwarded`, `sliceAsOf` — the Slice data timestamp used to score it,
  so a scored prediction always carries proof of which DEMO-labeled snapshot decided it).
- **Read-only consumption of Document 011's ticket table** — `ticket-inactivity-sweep` reads
  `lastActivityAt`/`status`/`channelId` and writes `status = CLOSED` plus a closure-reason row; exact
  column names are fixed by Document 011, not this document.
- **Read-only consumption of Document 012's mute table** — `mute-expiry` reads `expiresAt`/`active`
  and writes `active = false` plus a removal audit row; exact column names are fixed by Document 012.
- **Read-only consumption of Document 014's giveaway table** — `giveaway-tick` reads
  `endsAt`/`status`/`entries` and writes `status = ENDED` plus winner selection; exact column names
  are fixed by Document 014.
- **No new persistence for `news-feed-poll`** beyond a `lastSeenItemId`/`lastPolledAt` watermark
  (part of `JobRun` or a small `NewsFeedWatermark` table) to avoid re-posting the same external item.

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Used by | Notes |
|---|---|---|---|
| `GET /v1/market/summary` | Already available (VERIFIED, public, no auth) | `market-digest` | Renders `source`/`asOf`/`dataStatus` on every digest line, per `BOT_PRODUCT_SPEC.md` §3/§10 |
| `GET /v1/market/movers` | Already available (VERIFIED, public, no auth) | `market-digest`, `price-alert-poll` | Same labeling rule; `price-alert-poll` diffs against `MarketAlertState` watermark, never re-alerts the same `asOf` snapshot |
| `GET /v1/market/assets/:slug` | Already available (VERIFIED, public, no auth) | `prediction-scoring` | Resolves the specific asset a bot-owned prediction targets; scoring never writes back to Slice |
| `GET /v1/bot/notifications/outbox` | New endpoint, **not built** (bot-only service endpoint, proposed only, `BOT_API_REQUIREMENTS.md` §4) | `notification-delivery-consumer` only | Out of scope for this document (§8); listed here only so the dependency is traceable, not because this document calls it |

No mutating Slice endpoint is called by any job in this document's scope. No new Slice endpoint is
required for the seven jobs actually built here — all three market-data-consuming jobs use
endpoints already tagged VERIFIED/already-available in `BOT_API_REQUIREMENTS.md`.

## 12. Commands / events / jobs delivered

Pulled directly from `EVENT_AND_JOB_CATALOGUE.md`'s "Scheduled jobs" table, filtered to this
document's scope (all eight rows shown; the eighth is explicitly out of scope per §8 and included
only for completeness against the catalogue):

| Job | Cadence | Purpose | Backend calls | Failure handling | In scope here? |
|---|---|---|---|---|---|
| `ticket-inactivity-sweep` | every 15 min | Auto-close tickets past the configured inactivity window | none (bot-owned) | retry with backoff, dead-letter after N failures, alert admin channel | Yes — spec complete, implementation blocked on Document 011 |
| `mute-expiry` | every 1 min | Remove the muted role once a mute's duration elapses | none (bot-owned) | retry with backoff, dead-letter after N failures, alert admin channel | Yes — spec complete, implementation blocked on Document 012 |
| `giveaway-tick` | every 30s (mirrors old bot's cadence, reimplemented safely) | Update countdown embeds, end expired giveaways, pick winners | none (bot-owned) | retry with backoff, dead-letter after N failures, alert admin channel | Yes — spec complete, implementation blocked on Document 014 |
| `market-digest` | daily, configurable time | Post a DEMO-labeled market summary/movers digest | `GET /v1/market/summary`, `/movers` | skip and log on Slice API failure, do not post partial/stale data as if current | Yes — buildable today |
| `price-alert-poll` | every 5–15 min (configurable) | Poll DEMO-labeled market data for large moves, ping the opt-in role | `GET /v1/market/movers` | same; clearly labeled DEMO in every alert | Yes — buildable today |
| `prediction-scoring` | daily | Score open predictions against real (DEMO-labeled) market data, update leaderboard | `GET /v1/market/assets/:slug` | same | Yes — buildable today (depends on Document 014's prediction submission schema existing to have anything to score, but the job itself is spec'd here) |
| `news-feed-poll` | every 15–30 min | Pull external Pokémon TCG news source, post new items | external source only | independent of Slice; failures don't affect any Slice-backed feature | Yes — buildable today |
| `notification-delivery-consumer` | **Phase 2, not built** | Would consume Slice's outbox once Doc 017 + a Discord channel type exist | `GET /v1/bot/notifications/outbox` (not built) | documented only, `BOT_API_REQUIREMENTS.md` §4 | **No — explicitly out of scope, §8** |

No job outside this eight-row table is introduced. No command or Discord gateway event is delivered
by this document.

## 13. Permission rules

None of this document's jobs are Discord slash commands, so `PERMISSION_MATRIX.md`'s per-command
rows do not directly apply. The relevant permission concerns are:

- **Posting permissions**: each job posts to a specific, admin-configured channel (digest channel,
  price-alert channel, ticket admin-alert channel, mod-log channel, giveaway channel, news channel).
  Channel IDs are bot-owned per-guild configuration (`BOT_DATA_OWNERSHIP.md`: "Guild configuration...
  channel IDs — Bot"), not a Slice permission concept. A job that cannot resolve or post to its
  configured channel (deleted channel, missing bot permission) logs the failure and alerts the admin
  channel — it does not silently retry forever.
- **`price-alert-poll`'s opt-in role ping**: pinging a role is a Discord-side action gated only by
  the role being configured as the designated "market alerts" opt-in role (`BOT_PRODUCT_SPEC.md`
  client-wishlist row: "Ship opt-in roles now"); this is unrelated to any Slice permission and must
  never be confused with Slice `ADMIN`/`SUPPORT` authorization.
- **Explicit statement per the template's requirement**: none of this document's jobs perform a
  Slice mutation, so the "Discord role/permission checks are a UX gate only and never a substitute
  for the Slice API's own authorization response" rule (§13's mandated statement) is satisfied
  trivially here — there is no Slice-side authorization response in this document's call path at
  all, since every Slice call is an unauthenticated public `GET`. If a future document adds a
  Slice-authenticated job, that job must add its own fresh permission check per
  `BOT_SECURITY_MODEL.md` §6 rather than relying on this document's pattern.
- **`ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick`**: these mutate bot-owned state only
  (ticket status, mute-role membership, giveaway status/winner) — the same `PERMISSION_MATRIX.md`
  rows that gate the *manual* equivalents of these actions (`/support` lifecycle = bot support/admin
  role; `/mod mute`/`unmute` = Discord kick/ban/administrator permission; `/giveaway *` = bot admin
  role) do **not** apply to the scheduled job itself, because the job acts as the bot's own service
  identity performing a previously-configured, time-based action, not a live user-initiated command.
  The job's authority to act comes from the configuration set when the ticket/mute/giveaway was
  created (by a permission-checked command in Documents 011/012/014), not from a fresh permission
  check at sweep time.

## 14. Security requirements

Cited from `BOT_SECURITY_MODEL.md`:

- **§4 (Bot token and Slice credential safety)** — the worker process's Slice API calls in this
  document are all unauthenticated public reads (`GET /v1/market/*`), so no Slice access token or
  service-account credential is attached to any call in this document's scope today. If Slice Doc
  007's market endpoints ever require authentication, the worker must use the **service-account
  credential** path (§4.1), never a per-user delegated token — these jobs never act on behalf of a
  specific Discord/Slice user.
- **§5 (Idempotency, rate limits, audit)** — "the bot never bypasses Slice's own rate limiting by
  fanning out parallel retries; it honors `Retry-After` and applies its own local cooldown on top."
  This document's polling jobs (`price-alert-poll`, `market-digest`) must never poll faster than
  their configured cadence regardless of a manual trigger, and must back off entirely (skip the
  cycle, log, retry next scheduled run — not immediately) on a 429.
- **§10 (Logging redaction)** — `JobRun.failureReason` and any structured log line this document's
  jobs emit must never contain a raw Slice error body, stack trace, or internal identifier, matching
  the same redaction rule applied to user-facing Discord error messages.
- **No new credential type is introduced by this document.** The worker process's Discord client
  instance reuses the same bot token already provisioned in Document 001 — a job worker posting to a
  channel is not a materially different trust boundary from the gateway process doing so, and
  `BOT_ARCHITECTURE.md`'s "never `Intents.all()`" rule applies equally: the worker's discord.js
  client requests only the intents it needs to send messages/embeds (typically `Guilds` only — it
  does not need message-content or member intents since it never reads user messages).
- **Bot-owned mutations performed by `ticket-inactivity-sweep`, `mute-expiry`, and `giveaway-tick`
  never touch Slice** (§5's cited data-ownership rule), so no Slice `AuditEvent` is written by these
  three jobs — see §16 for what *is* logged.

## 15. Idempotency and rate limits

- **BullMQ dedup keys.** Every repeatable job is registered with a deterministic `jobId` derived from
  `(jobName, scheduledWindowStart)` — e.g., `market-digest:2026-08-07` for the daily digest,
  `price-alert-poll:2026-08-07T14:15` for a 15-minute-bucketed poll window. BullMQ's repeatable-job
  scheduler already prevents duplicate scheduling of the same cron tick, but this explicit `jobId`
  scheme additionally protects against a worker redeploy mid-cycle re-enqueuing the same logical run,
  and against two worker replicas (if ever scaled beyond one) both picking up the same tick — BullMQ
  rejects a second job with an already-used `jobId` for jobs not yet completed/removed.
- **Sweep jobs (`ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick`) are naturally idempotent at
  the row level**, independent of the `jobId` scheme above: each sweep queries "rows past their
  threshold and not yet closed/expired/ended," and an accidental double-run finds zero matching rows
  the second time (the state transition itself — `status = CLOSED`, `active = false`,
  `status = ENDED` — is the dedup mechanism, matching the pattern `BOT_PRODUCT_SPEC.md` §4 already
  established for Slice's own watchlist add/remove: "add-twice and remove-twice both no-op to
  success").
- **`price-alert-poll` dedup** — `MarketAlertState.lastAlertedMovePercent` /
  `MarketAlertState.dataAsOf` prevent re-alerting the same underlying Slice snapshot on every poll
  cycle; an alert only fires when the current poll's `asOf` differs from the last-alerted `asOf` for
  that asset **and** the move crosses the configured threshold again.
- **`prediction-scoring` dedup** — `PredictionScore.scoredAt` is set exactly once per prediction; the
  job's query is scoped to `resolvesAt <= now() AND scoredAt IS NULL`, so a re-run cannot double-award
  points.
- **`news-feed-poll` dedup** — the `lastSeenItemId`/`lastPolledAt` watermark ensures a re-poll of the
  same external feed window never re-posts an already-posted item, mirroring the same
  watermark-based idempotency pattern used for the market-alert state above.
- **Rate limits:**
  - Slice-facing: no bot-side rate limit is imposed beyond the cadence itself, since every call is a
    public read; the client (from Document 002) still honors Slice's own `Retry-After` per
    `BOT_ARCHITECTURE.md` and `ERROR_CATALOGUE.md`'s `RATE_LIMITED`/`MARKET_DATA_UNAVAILABLE` rows.
  - Discord-facing: each job's channel-post step is subject to BullMQ's own per-job concurrency limit
    of 1 (a job never runs two instances concurrently) plus discord.js's built-in Discord API
    rate-limit handling; `giveaway-tick`'s 30-second cadence is deliberately not tightened further
    even though old-bot precedent used the same interval, to avoid unnecessary Discord API pressure
    across many concurrent giveaways.

## 16. Audit requirements

- **Slice-side:** none of this document's jobs write a Slice `AuditEvent`, because none of them
  perform a Slice mutation (§11 — every Slice call is a `GET`). This is consistent with
  `BOT_SECURITY_MODEL.md` §5's "the bot never duplicates Slice's audit record as a second source of
  truth" — there is no Slice mutation here to audit.
  - **Exception, forward-looking note only:** if a future job in this family (not in this document's
    scope) ever performed a Slice mutation, it would need its own row here; today none do.
- **Bot-side (`JobRun` table, §10):** every job run — success, failure, or skip — writes one
  `JobRun` row: `jobName`, `startedAt`, `finishedAt`, `status`, `itemsProcessed`,
  `failureReason` (redacted), `slicePartial`. This is the exact substrate Document 016's
  "observability, audit correlation and operational controls" work builds its per-job dashboards and
  alerting on — this document's obligation is to write these rows reliably and redact them correctly,
  not to build the dashboard.
- **Ticket/mute/giveaway sweep actions** additionally get a bot-owned lifecycle log entry consistent
  with each owning document's own audit convention: `OLD_TO_NEW_MIGRATION_MATRIX.md` M1 requires
  "every lifecycle transition (open/claim/close/blacklist) logged to a private bot audit channel with
  actor, target, reason, timestamp" — for a sweep-triggered close, `actor` is recorded as the job
  itself (e.g., `system:ticket-inactivity-sweep`), not a Discord user, so support staff can
  distinguish a human close from an automatic one. The same pattern applies to `mute-expiry` (M2's
  mod-log) and `giveaway-tick` (M4's "start/end/reroll/delete logged with actor").
- **Correlation:** every structured log line this document's jobs emit includes the `JobRun.id` so a
  support engineer can trace a specific Discord post (digest embed, alert ping, sweep closure) back
  to the exact job execution that produced it — the same "audit correlation" pattern
  `BOT_ARCHITECTURE.md` describes for interaction-triggered Slice calls, applied here to
  job-triggered ones.

## 17. Error behavior

Cited from `ERROR_CATALOGUE.md`, plus job-specific cases not already covered there:

- **`MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` (503)** — per
  the catalogue, "retried once automatically for GET-only calls." For `market-digest` and
  `price-alert-poll`, if the single retry also fails, the job **skips that cycle entirely** — per
  `EVENT_AND_JOB_CATALOGUE.md`'s explicit failure-handling note, "skip and log on Slice API failure,
  do not post partial/stale data as if current." The `JobRun` row is marked `status: FAILED`,
  `slicePartial: false` (nothing was posted), and no Discord message is sent for that cycle. This is
  a hard rule: a digest or alert job must never post using data from a previous successful poll and
  present it as current.
- **`RATE_LIMITED` (429)** — the job reads Slice's `Retry-After` header, does not retry within the
  current cycle, logs the deferral, and waits for its next scheduled tick (not a busy-retry loop).
- **Unrecognized/unexpected error** — per the catalogue's rule, "the generic/unrecognized branch must
  never interpolate the raw exception object into a user-facing string"; here there is no
  user-facing string at all (jobs have no interactive requester), but the same rule applies to the
  `JobRun.failureReason` field and any admin-channel alert text — both get a generic
  "job failed, see logs (ref: `{JobRun.id}`)" message, with full detail server-side only.
- **Job-specific cases not in `ERROR_CATALOGUE.md` (that table covers Slice API error codes, not job
  runtime failures):**
  - **Ticket/mute/giveaway channel deleted or bot lacks permission to post** — the sweep still
    performs its underlying state mutation (ticket closed, mute lifted, giveaway ended) since that is
    the correctness-critical action; the *notification* of that action is best-effort and its
    failure is logged but does not roll back the state change, mirroring `BOT_SECURITY_MODEL.md`
    §10's "a failed DM is handled gracefully with a one-time in-channel notice, not a repeated retry
    loop" principle applied to channel posts.
  - **Repeated job failure (dead-letter)** — per `EVENT_AND_JOB_CATALOGUE.md`'s failure-handling
    column for the three bot-owned sweep jobs, "retry with backoff, dead-letter after N failures,
    alert admin channel." N is fixed at 3 consecutive failed attempts (BullMQ's own attempt counter);
    on the 3rd failure the job is moved to BullMQ's failed/dead-letter state, a single admin-channel
    alert is posted (not one per attempt, to avoid alert spam), and the job is **not** auto-resumed —
    an operator must investigate and manually re-trigger via the same mechanism Document 016's
    operational controls expose.
  - **`prediction-scoring` referencing a Slice asset slug that no longer resolves** — treated as
    `ASSET_NOT_FOUND` (404, per `ERROR_CATALOGUE.md`'s existing row), the specific prediction is
    marked `outcome: VOID` (not silently dropped, not force-scored against missing data) and the job
    continues scoring the rest of the batch rather than failing the whole run.

## 18. Interaction UX

None of this document's jobs are interactive Discord commands — there is no slash command, button,
select, or modal introduced here. The "interaction UX" for this document is instead the **posted
output** of each job, which must follow `COMMAND_CATALOGUE.md`'s UI standards exactly:

- **`market-digest`** — a public embed in the configured digest channel. Fields: top movers (gainers
  and losers, per `/movers`), summary stat line (per `/summary`). Footer carries the `asOf` timestamp
  and a visible `DEMO` badge on every field sourced from `dataStatus: DEMO` data (expected to be
  every field, per §5) — never a bare number with no data-status label. No confirmation flow (it is
  a scheduled post, not a user action); not ephemeral (it is a public channel post, not an
  interaction response).
- **`price-alert-poll`** — a public embed in the configured alerts channel, pinging the opt-in
  "market alerts" role (§13). Fields: asset name/slug, move percent, direction, `asOf`, and the same
  visible `DEMO` badge. One embed per triggering asset per cycle (not batched into a single wall of
  text), to keep each alert individually legible and pingable.
- **`prediction-scoring`** — updates a persistent leaderboard embed/message (edited in place, not
  reposted every day, to avoid channel spam) plus, if the prediction game supports it per Document
  014's design, an individual outcome note. Always carries an entertainment disclaimer
  ("for entertainment, not investment advice," per `BOT_PRODUCT_SPEC.md`'s client-wishlist
  recommendation for the prediction market) and the `sliceAsOf` value used to score it.
- **`ticket-inactivity-sweep`** — posts a closure notice in the ticket channel/thread itself before
  archiving/deleting it (exact transcript/closure UX is Document 011's to define; this job only
  triggers that flow on a timer) plus a one-line entry in the admin audit channel.
- **`mute-expiry`** — removes the muted role and posts a one-line confirmation in the mod-log channel
  (`@user unmuted — mute duration elapsed`), no public channel post, no ping.
- **`giveaway-tick`** — edits the existing giveaway embed in place (countdown field) every 30 seconds
  while active; on end, edits the embed to a final "ended" state and posts a separate winner
  announcement message with `@winner` mention, matching M4's button-based (not reaction-index-based)
  entry-count source.
- **`news-feed-poll`** — a public embed per new external item in the configured news channel: title,
  source link, publish date. No AI-generated commentary field (§8).
- All embeds use the shared embed-builder module from `BOT_ARCHITECTURE.md` (not a bespoke per-job
  formatter), so digest/alert styling stays visually consistent with the rest of the bot's command
  output.

## 19. Implementation file plan

- `src/worker.ts` — worker process entry point: config load, Redis connection, BullMQ queue/worker
  registration, lightweight discord.js posting client, `/health`/`/ready` HTTP endpoints for this
  process.
- `src/jobs/registry.ts` — declarative registration of all seven in-scope jobs (name, cadence,
  handler module, retry policy), the single place that must match `EVENT_AND_JOB_CATALOGUE.md`'s
  table.
- `src/jobs/marketDigest.ts` — `market-digest` handler: calls Slice API client, builds digest embed,
  posts, writes `JobRun`.
- `src/jobs/priceAlertPoll.ts` — `price-alert-poll` handler: calls Slice API client, diffs against
  `MarketAlertState`, posts alert embeds, writes `JobRun`.
- `src/jobs/predictionScoring.ts` — `prediction-scoring` handler: reads unscored predictions, calls
  Slice API client per asset, writes `PredictionScore` rows, updates leaderboard embed, writes
  `JobRun`.
- `src/jobs/newsFeedPoll.ts` — `news-feed-poll` handler: fetches external source, dedups against
  watermark, posts new items, writes `JobRun`.
- `src/jobs/ticketInactivitySweep.ts` — reads Document 011's ticket table, closes past-threshold
  tickets, writes `JobRun` (implementation blocked on Document 011's schema landing).
- `src/jobs/muteExpiry.ts` — reads Document 012's mute table, lifts expired mutes, writes `JobRun`
  (implementation blocked on Document 012's schema landing).
- `src/jobs/giveawayTick.ts` — reads Document 014's giveaway table, updates countdowns, ends expired
  giveaways, selects winners, writes `JobRun` (implementation blocked on Document 014's schema
  landing).
- `src/jobs/shared/jobRun.ts` — shared `JobRun` persistence helper (start/complete/fail) used by
  every handler above, so the observability shape is identical across jobs.
- `src/db/migrations/xxx_add_job_tables.ts` — creates `JobRun`, `MarketAlertState`, and the
  `PredictionScore` columns owned by this document (per §10).
- `src/config/jobConfig.ts` — typed config for per-job cadence overrides, target channel IDs per
  guild, and the price-alert move-percent threshold — extends Document 001's config loader, does not
  replace it.

## 20. Numbered implementation steps

1. Confirm Documents 007 and 008 have closed (their command handlers and Slice API client usage
   patterns are the reference this document's market-data jobs must match).
2. Add the `JobRun`, `MarketAlertState`, and `PredictionScore`-column migrations (§10) to the bot's
   own database, alongside the bot DB conventions Document 001 established.
3. Stand up `src/worker.ts` as a second entry point, sharing the config loader and Slice API client
   from Documents 001/002 but running as its own process per `BOT_ARCHITECTURE.md`/`DEPLOYMENT_PLAN.md`.
4. Implement `src/jobs/shared/jobRun.ts` first, since every other handler depends on it for
   observability (§16).
5. Implement `market-digest` (§19), reusing Document 007's embed-building conventions; verify DEMO
   labeling matches exactly.
6. Implement `price-alert-poll`, including the `MarketAlertState` dedup logic (§15).
7. Implement `prediction-scoring` against whatever prediction-submission schema Document 014 defines
   (coordinate with that document; if 014 has not yet landed, this step is spec-complete but blocked).
8. Implement `news-feed-poll` against the chosen external news source, with its watermark dedup.
9. Register all four Slice/external-data jobs in `src/jobs/registry.ts` with their BullMQ `jobId`
   schemes (§15) and cadences (§12); deploy to the dev guild per `DEPLOYMENT_PLAN.md`'s rollout
   sequence step 1.
10. Once Document 011 closes, implement `ticket-inactivity-sweep` against its ticket table and add it
    to the registry.
11. Once Document 012 closes, implement `mute-expiry` against its mute table and add it to the
    registry.
12. Once Document 014 closes, implement `giveaway-tick` against its giveaway table and add it to the
    registry (this also unblocks step 7's prediction-submission dependency if not already resolved).
13. Wire the failure/retry/dead-letter policy (§17) uniformly across all seven jobs via the shared
    BullMQ worker options, not per-job bespoke retry code.
14. Confirm `/ready` on the worker process reflects Redis and Slice API reachability, per
    `DEPLOYMENT_PLAN.md`.
15. Run the full verification suite (§25) before considering this document's completion checklist
    (§26) satisfiable.

## 21. Unit tests

- **Idempotency-key/`jobId` derivation** — deterministic per `(jobName, scheduledWindowStart)`,
  unchanged across repeated calls with the same window, per §15.
- **`market-digest` embed construction** — given a fixed `GET /v1/market/summary`/`/movers` fixture
  response, the built embed always renders `dataStatus: DEMO` visibly on every field; given a
  `dataStatus: LIVE` fixture (future-proofing), the DEMO badge is correctly omitted and replaced with
  the live label instead — regression-testing that the labeling logic is data-driven, not hardcoded.
- **`price-alert-poll` dedup logic** — given a sequence of poll fixtures with the same `asOf`, only
  the first alert fires; given a new `asOf` crossing the threshold again, a second alert fires.
- **`prediction-scoring` outcome logic** — given a fixed set of predictions and a fixed Slice asset
  fixture, correct `outcome`/`pointsAwarded` assignment; a prediction already `scoredAt`-set is never
  re-scored.
- **`giveaway-tick` winner selection** — explicitly regression-tests the old bot's reaction-index-0
  bug per `TEST_STRATEGY.md`: given an arbitrary, out-of-order entry set, winner selection is correct
  regardless of entry order and never assumes index 0.
- **`mute-expiry` timing logic** — given a mute with `expiresAt` in the past, the job selects it for
  expiry; given `expiresAt` in the future, it is correctly excluded (boundary-tested at exactly
  `now()`).
- **`ticket-inactivity-sweep` threshold logic** — given a per-guild-configured inactivity window and
  a ticket's `lastActivityAt`, correct inclusion/exclusion at the boundary.
- **Failure/dead-letter counting** — given N consecutive simulated failures, the job is marked
  dead-lettered exactly at the configured threshold, not before or after, and the admin-channel alert
  fires exactly once (not once per attempt).
- **DEMO-label redaction/error-message construction** — `JobRun.failureReason` never contains an
  interpolated raw exception string, mirroring `ERROR_CATALOGUE.md`'s generic-branch rule.

## 22. Integration tests

- Every Slice-data-consuming job (`market-digest`, `price-alert-poll`, `prediction-scoring`) run
  against a **disposable local Slice instance** (per `TEST_STRATEGY.md`'s integration-test
  convention), exercising the real `GET /v1/market/summary`/`/movers`/`/assets/:slug` endpoints
  end-to-end, confirming the DEMO label present in the real API response survives unmodified into
  the posted embed.
- `market-digest`/`price-alert-poll` against a disposable Slice instance configured to return a 503
  (`MARKET_DATA_UNAVAILABLE`) — confirm the job skips posting entirely and writes `JobRun.status =
  FAILED`, never posting stale/partial data.
- `ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick` run against a real disposable bot
  database (per `TEST_STRATEGY.md`'s "Bot-owned persistence... tested against a real disposable bot
  database") seeded with fixture rows from Documents 011/012/014's schemas, confirming the correct
  subset of rows transitions state and the rest are left untouched.
- BullMQ `jobId` dedup integration test: enqueue the same logical job twice with the same computed
  `jobId` against a real (disposable) Redis instance, confirm the second enqueue is rejected/no-op.
- End-to-end dead-letter test: force N consecutive failures against a disposable Redis + fake Slice
  client, confirm the job reaches BullMQ's failed state and exactly one admin-channel alert message
  is captured by a test double for the posting client.

## 23. Discord interaction tests

This document delivers no slash command, button, select, or modal, so the interaction-simulation
tooling `TEST_STRATEGY.md` describes for command parsing/component handlers/permission gates does not
apply to new surface here. The one relevant carry-over is:

- **Posted-message shape tests** — using discord.js's message-builder types (not a live gateway
  connection), assert the exact embed shape (fields, footer, DEMO badge presence, winner-mention
  format, countdown-field update-in-place behavior) each job produces, matching
  `COMMAND_CATALOGUE.md`'s UI standards — this is the same category of test `TEST_STRATEGY.md`
  describes for interaction responses, applied to job-originated posts instead of command responses.
- **Persistent-component round-trip** — `giveaway-tick`'s entry buttons (owned by Document 014, only
  *read* by this document's tick job) are confirmed recoverable from bot-owned persistence after a
  simulated bot restart, per `TEST_STRATEGY.md`'s persistent-component test pattern — this test
  belongs primarily to Document 014, but this document's tick job must pass it against Document 014's
  fixture data as a consumer.

## 24. Manual QA checklist

- In a real (non-production) Slice environment and a test guild, let `market-digest` fire on its
  configured schedule and confirm: the digest posts at the configured time, every value is visibly
  DEMO-labeled, and no unlabeled bare number appears anywhere in the embed.
- Manually trigger a large simulated market move (via a controllable non-production Slice fixture, if
  available) and confirm `price-alert-poll` fires exactly once per crossing, pings the correct
  opt-in role, and does not re-fire on the next poll cycle for the same `asOf`.
- Open a test ticket, artificially age its `lastActivityAt` past the configured threshold (or wait
  out the real window in a dev guild with a shortened test threshold), confirm
  `ticket-inactivity-sweep` closes it, posts the closure notice, and the audit-channel entry shows
  `actor: system:ticket-inactivity-sweep`.
- Issue a short test mute, confirm `mute-expiry` removes the role automatically at expiry (not late,
  not early) and posts the mod-log confirmation.
- Start a short test giveaway, confirm the countdown embed updates roughly every 30 seconds, confirm
  it ends automatically at expiry, and confirm winner selection with multiple entries submitted
  out-of-order still selects correctly (manual regression check for the reaction-index-0 class of
  bug, even though entry is now button-based).
- Force a Slice API outage (point the dev Slice API base URL at an unreachable host) during a
  scheduled `market-digest`/`price-alert-poll` run and confirm no message is posted and the admin
  channel is not spammed with a raw error.
- Force three consecutive failures of a bot-owned sweep job (e.g., point its DB connection string at
  an unreachable host temporarily) and confirm exactly one dead-letter admin alert fires, not three.
- Confirm `/ready` on the worker process returns non-200 when Redis is unreachable, and 200 once
  restored.
- Security QA carry-over from `TEST_STRATEGY.md`: grep the test guild's job-posted messages and the
  bot's structured logs for this run, confirming no Slice token/secret/raw exception text appears
  anywhere in a digest, alert, sweep-closure, or dead-letter alert message.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance and a disposable Redis instance
npm run build
```

## 26. Completion checklist

- [ ] `src/worker.ts` runs as an independent process from the gateway, per `BOT_ARCHITECTURE.md` and
      `DEPLOYMENT_PLAN.md`.
- [ ] All seven in-scope jobs from `EVENT_AND_JOB_CATALOGUE.md` are registered with the correct
      cadence, and the eighth (`notification-delivery-consumer`) is confirmed absent from the
      registry.
- [ ] `market-digest`, `price-alert-poll`, `prediction-scoring` are implemented and verified against a
      disposable Slice instance; every posted embed carries visible `source`/`asOf`/`dataStatus`
      labeling with no bare unlabeled numbers.
- [ ] `news-feed-poll` is implemented with a working dedup watermark.
- [ ] `ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick` are implemented **only after**
      Documents 011, 012, 014 have respectively closed; if any of those documents has not closed,
      this document's completion checklist explicitly notes which sweep job(s) remain blocked rather
      than marking this document fully complete.
- [ ] BullMQ `jobId` dedup scheme is in place and integration-tested for every job.
- [ ] Failure/retry/dead-letter policy (3-attempt threshold, single admin-channel alert) is uniform
      across all jobs and integration-tested.
- [ ] `JobRun` rows are written for every execution (success, failure, skip), with redacted failure
      reasons — this is the substrate Document 016 depends on; confirm the schema is stable before
      closing this document.
- [ ] No job in this document's scope calls a Slice mutating endpoint.
- [ ] No job fabricates an "undervalued"/confidence score or AI-generated market commentary (§8).
- [ ] All items in §21–§24 (unit, integration, Discord-post-shape, manual QA) pass.
- [ ] `npm run lint`, `typecheck`, `test:unit`, `test:integration`, `build` all pass (§25).

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md` — flip Document 015's status row from NOT STARTED
  to the appropriate closed state once this document's work actually lands (noting, per §26, that
  full closure requires Documents 011/012/014 to have landed first for the bot-owned sweep jobs —
  partial closure of only the market-data jobs should be reflected honestly if that is what actually
  ships first).
- `CURRENT_STATE.md` — update once any part of this document's scope is implemented, since it
  currently states "No Discord bot code exists anywhere."
- `EVENT_AND_JOB_CATALOGUE.md` — no content change expected (this document implements exactly what
  that catalogue already specifies), but if implementation reveals a cadence or failure-handling
  detail that must change, that catalogue is the source of truth to update, not this document.
- `MASTER_CHECKLIST.md`'s "Production readiness" section — check off "Discord bot implementation
  begun (Document 001)" only in the context of the overall build's progress, not specific to this
  document alone; this document does not independently own any row in that checklist.

## 28. Final report format

On completion (or partial completion, per §26's honesty requirement about the three blocked sweep
jobs), the implementer's report must state:

1. Which of the seven in-scope jobs were fully implemented and verified, and which remain blocked
   (naming the exact blocking document — 011, 012, or 014 — for each blocked job).
2. Confirmation that every implemented job's Slice calls are read-only and DEMO-labeling is correct,
   with a link/reference to the integration test run that verified it.
3. Confirmation that the `JobRun` observability substrate is in place and stable, since Document 016
   depends on its shape.
4. Any deviation from this document's job list, cadence, or failure-handling policy, with an explicit
   justification (per this build guide's rule that nothing is silently omitted or altered).
5. The exact verification-command output (§25) or a summary of pass/fail per command.
6. Confirmation that no Slice source, Prisma schema, or migration was touched, consistent with this
   entire build guide's scope boundaries.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
