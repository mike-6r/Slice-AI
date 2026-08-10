# 012 — Moderation suite migration

## 1. Metadata

- **Document number:** 012
- **Title:** Moderation suite migration
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 001 (Repository reconciliation and bot foundation), 003
  (Discord interaction framework and command registry)
- **Blocks (this build guide):** 015 (Background jobs and scheduled digests) — Doc 015 schedules the
  recurring `mute-expiry` BullMQ job as a live worker, but it cannot do so until this document
  defines the domain logic, persistence schema, and idempotent expiry-processing function that job
  invokes. Until 012 closes, 015's mute-expiry track has nothing to schedule.
- **Slice backend dependency:** none — this document is Track C in `IMPLEMENTATION_ORDER.md`
  ("fully bot-owned, no Slice dependency at all"), alongside 011 and 014.
- **Can start today:** Yes.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`) that this Discord
bot never duplicates, queries directly, or treats as a second source of truth for. The bot is a
**companion client to Slice**: it reads and writes Slice data only through Slice's own HTTP API, and
everything it owns outright is Discord-operational state with no Slice counterpart
(`BOT_DATA_OWNERSHIP.md`). This document sits in Track C of `IMPLEMENTATION_ORDER.md` — the group of
implementation documents (011 Support/ticket migration, 012 this document, 014 Community and
engagement features) that can proceed in full parallel with Tracks A (account linking) and B
(marketplace/collector commands) because none of them touch Slice's backend at all. Per
`OLD_TO_NEW_MIGRATION_MATRIX.md` M2 and M3, this document rebuilds the old bot's
`cogs/Moderation.py` and the URL-filtering portion of `cogs/AutoModerator.py` as a modern,
slash-command-based moderation suite with real, tested, scheduler-backed mute expiry and no blanket
link deletion — explicitly not a code port, a behavioral rebuild (`BOT_ARCHITECTURE.md`,
"Behavioral migration, not code migration").

## 3. Current implementation audit

Nothing in the new bot codebase touches moderation yet. Per `IMPLEMENTATION_ORDER.md`, Document 001
delivers repository scaffolding, the typed config loader, the Discord client bootstrap (scoped
intents, graceful shutdown, `/health`/`/ready`), and the bot's own persistence connection
(`BOT_ARCHITECTURE.md`). Document 003 delivers the interaction router, the declarative command
registry, permission pre-check plumbing, the shared embed-builder module, the button-based
confirmation component with mandatory timeout, and the shared paginator. This document assumes both
of those exist and builds directly on top of them: no bootstrap, no interaction router, no
confirmation component, and no persistence connection exists before this document starts.

## 4. Old bot behavior migrated

From `OLD_BOT_FEATURE_INVENTORY.md` and `OLD_TO_NEW_MIGRATION_MATRIX.md` M2/M3:

| Old bot row | Feature | Old command(s) | Migration status | What this document fixes |
|---|---|---|---|---|
| #18 | Kick / Ban (incl. hackban) | `!kick`, `!ban` | REWRITE | Slash commands, structured reason logging, no code reuse |
| #19 | Mute / Tempmute / Unmute | `!mute`, `!tempmute`, `!unmute` | REWRITE | **Flagged UNKNOWN in the inventory** — "no auto-unmute task loop was found in any reviewed cog... tempmutes may never expire automatically." This document explicitly closes that gap: real, persisted mute expiry with a defined consumer function, not a dangling DB row. |
| #20 | Ban list | `!banlist` | REWRITE | Modern component-based pagination, replacing the legacy `discord.ext.buttons` reaction paginator |
| #21 | Lockdown / Unlock channel | `!lockdown`, `!unlock` | PRESERVE (concept) / REWRITE (implementation) | Same behavior (toggle `send_messages` overwrite), rebuilt on slash commands with explicit state persistence so a bot restart doesn't lose lockdown status |
| #22 | Purge / Slowmode | `!clear`/`!purge`, `!slowmode` | PRESERVE (concept) / REWRITE (implementation) | `/mod purge` only in this document's scope (see §8 Out of scope for `/slowmode`); explicit 14-day bulk-delete-age handling the old bot never checked |
| #23 | Unban | `!unban <name#discriminator>` | REWRITE | **Named security finding.** The old bot matches against `guild.bans()` by formatted `name#discriminator` string — a format Discord has deprecated in favor of unique usernames, meaning exact-string matching silently fails against every modern Discord account. Fixed by accepting a stable Discord user ID (or `@username` resolved to an ID via Discord's own resolution, never string-matched against the ban list) |
| #24 | Warn / Warns / Remove warn | `!warn`, `!warns`, `!removewarn` | PRESERVE (concept) / REWRITE (implementation) | `/mod warn` and `/mod warns` only (see §8 — `removewarn` is out of scope for this document, not silently dropped) |
| #25 | Auto-moderation (invite/link filter) | `on_message` in `cogs/AutoModerator.py` | REWRITE | **Named security finding.** The old bot deletes **any** message containing a generic URL from non-moderators, with a single hardcoded exempt channel ID and no allowlist, no appeal path, no logging beyond a DM on invite-links specifically — flagged as "would block legitimate links (e.g., a Slice asset page URL)." Fixed by an explicit per-guild allow/deny domain list; non-listed links are flagged to the mod-log channel for a moderator delete/allow decision, never silently deleted. |

**Explicitly out of scope from the old bot's `Moderation.py`/`AutoModerator.py`:** invite-spam-specific
auto-mute wiring beyond reusing this document's mute infrastructure (see §8), and `!slowmode` (not
named in this document's assignment or in `COMMAND_CATALOGUE.md`'s `/mod` row).

## 5. Slice features supported

None. Per `PERMISSION_MATRIX.md`: "`/mod *` (kick/ban/mute/purge/warn/lockdown/unlock/banlist/unban)
| Discord kick/ban/administrator permission (native) | none — explicitly decoupled from Slice |
`BOT_SECURITY_MODEL.md` §6." Per `BOT_DATA_OWNERSHIP.md`: "Moderation history (kicks/bans/mutes/warns)
| **Bot** | Explicitly decoupled from Slice `AccountStatusHistory` — a Discord ban is not a Slice
account action and vice versa." This document calls zero Slice API endpoints, uses no Slice DTOs,
and requires no Slice backend document (VERIFIED, PARTIAL, NOT STARTED, or otherwise) to close.

## 6. Files to read before starting

- `OLD_BOT_FEATURE_INVENTORY.md` — rows 18–25 (Moderation.py, AutoModerator.py), plus the two named
  security findings in the "Critical security findings" section (item 6: blanket URL deletion) and
  row 23 (deprecated `name#discriminator` matching).
- `OLD_TO_NEW_MIGRATION_MATRIX.md` — M2 (Moderation suite) and M3 (Auto-moderation) in full.
- `COMMAND_CATALOGUE.md` — the `/mod kick/ban/mute/unmute/purge/warn/warns/lockdown/unlock/banlist/unban`
  row, and the "UI standards" section (confirmation dialogs, destructive-action type-to-confirm,
  ephemeral defaults, error embed style).
- `BOT_ARCHITECTURE.md` — command registry pattern, interaction response helpers (defer-then-respond),
  background jobs section (BullMQ, mirrors Slice's own Doc 017 technology choice), "Bot must never do."
- `BOT_SECURITY_MODEL.md` §6 (Discord role possession ≠ Slice permission), §11 (admin action
  confirmation), §10 (logging redaction).
- `BOT_DATA_OWNERSHIP.md` — the "Moderation history" and "Guild configuration ... auto-mod domain
  lists" rows, and the table's closing "Rule."
- `PERMISSION_MATRIX.md` — the `/mod *` row.
- `ERROR_CATALOGUE.md` — the generic-error rule and the "Discord-side failure" row (this document's
  errors are almost entirely Discord-side, not Slice-side).
- `EVENT_AND_JOB_CATALOGUE.md` — `messageCreate (scoped)` gateway event row and the `mute-expiry`
  scheduled-job row (cadence: every 1 minute, purpose: "Remove the muted role once a mute's duration
  elapses," failure handling: "retry with backoff, dead-letter after N failures, alert admin channel").
- `TEST_STRATEGY.md` — "Scheduled-job logic in isolation (mute-expiry timing...)" under unit tests.
- `implementation/001-repository-reconciliation-and-bot-foundation.md` and
  `implementation/003-discord-interaction-framework-and-command-registry.md` — for the exact
  persistence connection, command-registration pattern, and confirmation-component API this document
  builds on (read their own completion state before starting, per §3 of this document).

## 7. Strict scope

- `/mod kick <member> <reason>` — removes a member from the guild, best-effort DM of the reason first.
- `/mod ban <user> <reason> [deleteMessageDays]` — bans a member or a raw Discord user ID for users
  who already left ("hackban" equivalent), best-effort DM of the reason first.
- `/mod mute <member> <duration> <reason>` and `/mod unmute <member> [reason]` — role-based mute with
  a real, persisted, scheduler-consumed expiry (fixing the old bot's UNKNOWN/possibly-missing
  tempmute expiry).
- `/mod purge <count> [filter]` — bulk-deletes up to Discord's 100-message ceiling, with an explicit
  "cannot delete messages older than 14 days" notice and a count of messages actually removed.
- `/mod warn <member> <reason>` and `/mod warns <member>` — bot-owned warning history, CRUD-create
  and paginated read (not delete — see §8).
- `/mod lockdown <channel?> <reason>` and `/mod unlock <channel?>` — toggles `send_messages` for
  `@everyone` (and the configured member role, if any) on the current or a specified channel, with
  bot-owned state so a restart doesn't lose lockdown status.
- `/mod banlist <page?>` — paginated view of the guild's ban list via a modern component paginator.
- `/mod unban <userId>` — reverses a ban by stable Discord user ID (never `name#discriminator`
  matching).
- The bot-owned persistence schema for all of the above: moderation case history, active mute
  expiries, lockdown state, per-guild moderation configuration (muted role, mod-log channel).
- The `MuteExpiryService.processExpiredMutes()` domain function: idempotent, testable, callable by a
  scheduler — the concrete recurring registration is Doc 015's job (see §12), but the function this
  document delivers is what makes that registration meaningful, fixing the old bot's gap for real.
- Auto-moderation URL-filtering rebuild: a scoped `messageCreate` listener, a per-guild allow/deny
  domain list (bot-owned config, per `BOT_DATA_OWNERSHIP.md`), and a moderator-review flow (flag to
  mod-log with delete/allow buttons) replacing the old bot's blanket delete-any-URL behavior.
- `/mod automod allow <domain>`, `/mod automod deny <domain>`, `/mod automod list` — admin
  configuration commands for the allow/deny domain list, additive to `COMMAND_CATALOGUE.md`'s `/mod`
  row (that row names the command family; this document is the design authority for the specific
  automod-configuration subcommands within it, grounded in `BOT_DATA_OWNERSHIP.md`'s "auto-mod domain
  lists" bot-owned config line item).
- A private mod-log channel convention (per-guild configurable channel ID) that every command in
  this document's scope, plus every auto-mod action, writes to.

## 8. Out of scope

- `/mod removewarn` or any warning-deletion/edit command. The old bot's `!removewarn` (row 24)
  deleted by numeric ID with no confirmation — this document does not carry that forward, and does
  not invent a replacement without an explicit product decision on confirmation UX for warning
  deletion. `/mod warn` and `/mod warns` (create + list) are in scope; deletion is not.
- `!slowmode` (rate-limit-a-channel) — not named in `COMMAND_CATALOGUE.md`'s `/mod` row or in this
  document's assignment; not built here.
- Invite-link-specific auto-mute policy wiring beyond reusing the mute infrastructure this document
  builds (i.e., this document does not design a separate invite-detection regex/config surface — that
  remains a candidate for Doc 014's community/engagement scope if a client requirement surfaces it,
  since `EVENT_AND_JOB_CATALOGUE.md`'s `messageCreate (scoped)` row covers auto-moderation generally
  without assigning invite-detection specifically to this document).
- Actually scheduling the `mute-expiry` job as a live, recurring BullMQ worker. This document defines
  and unit-tests the domain function the job calls; Doc 015 ("Background jobs and scheduled digests")
  owns the BullMQ queue/worker registration, cron cadence wiring, retry/backoff, and dead-letter
  configuration, per `IMPLEMENTATION_ORDER.md` ("ticket/mute/giveaway jobs depend on 011/012/014").
- Any tie between a Discord moderation action and a Slice account action. Per
  `BOT_SECURITY_MODEL.md` §6, a Discord ban/kick/mute never triggers a Slice-side account status
  change, and a Slice account status change never automatically triggers a Discord-side action,
  "unless a future, explicitly-designed and product-approved policy says so" — no such policy exists,
  so this document builds none.
- Any Slice API call of any kind (see §5, §11).
- Gang/faction "strikes" moderation (`cogs/Gangs.py` rows 10–11 in the inventory) — marked REMOVE,
  no Slice concept exists, not touched by this document.
- Any raw MySQL access pattern, hardcoded credential, or the old bot's `SQL.py` connection pool
  (row 31, REMOVE) — this document's persistence goes through the bot's own ORM-backed connection
  from Document 001, never a bespoke direct connection.

## 9. Dependencies

- The bot's ORM/persistence layer and database connection, established in Document 001
  (`BOT_ARCHITECTURE.md`: "Postgres/SQLite via an ORM, or a managed KV store").
- BullMQ, as a library dependency for defining the mute-expiry processing function's shape even
  though this document does not itself register the recurring job (`BOT_ARCHITECTURE.md`: "BullMQ
  ... matching Slice's own Doc 017 technology choice").
- discord.js v14+'s bulk-delete, ban-list, and permission-overwrite APIs (`guild.bans`,
  `channel.bulkDelete`, `PermissionOverwrites`) — no new third-party Discord library beyond what
  Document 001/003 already establish.
- The shared confirmation component and embed-builder module from Document 003 — no new UI
  dependency introduced here.
- No new Slice-facing dependency (no Slice SDK/client call, per §5).

## 10. Bot-owned persistence

All tables below are bot-owned per `BOT_DATA_OWNERSHIP.md` ("Moderation history (kicks/bans/mutes/warns)
| Bot" and "Guild configuration ... auto-mod domain lists | Bot"). None of this data is ever sent to
Slice or treated as a Slice audit record (`BOT_SECURITY_MODEL.md` §5: "never duplicates Slice's audit
record as a second source of truth" — inapplicable duplication risk here since Slice has no
equivalent record at all, per §6 above).

```text
ModerationCase
  id                 (pk, bot-generated)
  guildId            (Discord guild ID)
  targetDiscordId    (Discord user ID — never name#discriminator)
  actorDiscordId     (Discord user ID of the moderator)
  type               (KICK | BAN | MUTE | WARN | LOCKDOWN | UNLOCK | UNBAN | UNMUTE)
  reason             (text, required for kick/ban/mute/warn/lockdown)
  createdAt          (timestamp)
  expiresAt          (nullable timestamp — set only for MUTE)
  active             (bool — true for an in-effect MUTE or LOCKDOWN; flips false on expiry/unmute/unlock)
  resolvedAt         (nullable timestamp — when active flipped to false, and by what: expiry vs. manual)
  resolvedBy         (nullable — "SYSTEM_EXPIRY" or a Discord actor ID, for MUTE/LOCKDOWN rows)

GuildModerationConfig
  guildId            (pk)
  mutedRoleId         (nullable — configured muted role; mute commands error clearly if unset)
  modLogChannelId     (nullable — configured mod-log channel; every action in this doc's scope no-ops
                        the log write with a warning, not a crash, if unset)
  autoModEnabled      (bool, default false — matches BOT_ARCHITECTURE.md's "new bot features ship
                        flagged off by default in production")

AutoModDomainRule
  id                 (pk)
  guildId            (fk to GuildModerationConfig)
  domain             (text, normalized lowercase host)
  listType           (ALLOW | DENY)
  addedBy            (Discord user ID)
  addedAt            (timestamp)

AutoModFlaggedMessage
  id                 (pk)
  guildId            (Discord guild ID)
  channelId          (Discord channel ID)
  authorDiscordId    (Discord user ID)
  urlSnapshot        (the flagged URL(s), truncated/redacted of any token-like query string per
                        BOT_SECURITY_MODEL.md §10)
  contentSnapshot    (truncated message text at time of flag, since the original message may later be
                        deleted by moderator action)
  status             (PENDING | ALLOWED | DELETED)
  reviewedBy         (nullable Discord user ID)
  reviewedAt         (nullable timestamp)
  createdAt          (timestamp)
```

Indexes: `ModerationCase(guildId, targetDiscordId, type)` for `/mod warns` lookups;
`ModerationCase(type, active, expiresAt)` for the mute-expiry consumer's query;
`AutoModDomainRule(guildId, domain, listType)` unique for allow/deny lookups.

## 11. Slice API dependencies

None. Per `BOT_API_REQUIREMENTS.md`, no endpoint in "Already available," "New endpoint required," or
"Bot-only service endpoints" is called by this document — the moderation suite is explicitly
decoupled from Slice (§5, §8). This section is intentionally empty of any endpoint row; a future
document must not add one here without an explicit product decision reversing
`BOT_SECURITY_MODEL.md` §6.

## 12. Commands / events / jobs delivered

Pulled and filtered from `COMMAND_CATALOGUE.md`'s "Support / community (bot-owned, no Slice
dependency)" table and `EVENT_AND_JOB_CATALOGUE.md`:

| Command/event/job | Purpose | Permission | Ephemeral/public | Bot persistence | Rate limit | Audit | Old-bot predecessor |
|---|---|---|---|---|---|---|---|
| `/mod kick` | Remove a member | native `kick_members` | ephemeral confirmation, public mod-log entry | `ModerationCase` (KICK) | none beyond Discord API limits | mod-log channel | `!kick` (row 18) |
| `/mod ban` | Ban a member or raw ID | native `ban_members` | ephemeral confirmation, public mod-log entry | `ModerationCase` (BAN) | none | mod-log channel | `!ban` (row 18) |
| `/mod mute` | Timed or indefinite mute | native `ban_members` (mirrors old bot's gate) | ephemeral confirmation, public mod-log entry | `ModerationCase` (MUTE, `expiresAt` set) | none | mod-log channel | `!mute`/`!tempmute` (row 19) |
| `/mod unmute` | Manual early unmute | native `kick_members` (mirrors old bot's gate) | ephemeral confirmation, public mod-log entry | `ModerationCase` (MUTE row flips `active=false`, `resolvedBy=actor`) | none | mod-log channel | `!unmute` (row 19) |
| `/mod purge` | Bulk-delete messages | native `ban_members` | ephemeral result summary | none (no history retained per message) | Discord's own bulk-delete rate limit | mod-log channel (count + channel + actor, not message content) | `!clear`/`!purge` (row 22) |
| `/mod warn` | Record a warning | bot admin/support role (`administrator`, mirrors old bot) | ephemeral confirmation, public mod-log entry | `ModerationCase` (WARN) | none | mod-log channel | `!warn` (row 24) |
| `/mod warns` | List a member's warnings | bot admin/support role | ephemeral | reads `ModerationCase` (WARN) | none | n/a (read) | `!warns` (row 24) |
| `/mod lockdown` | Freeze a channel | `administrator` | ephemeral confirmation, public mod-log entry | `ModerationCase` (LOCKDOWN, `active=true`) | none | mod-log channel | `!lockdown` (row 21) |
| `/mod unlock` | Unfreeze a channel | `administrator` | ephemeral confirmation, public mod-log entry | `ModerationCase` (LOCKDOWN row flips `active=false`) | none | mod-log channel | `!unlock` (row 21) |
| `/mod banlist` | Paginated ban list | native `ban_members` | ephemeral | reads Discord's own ban list (not bot-persisted) | standard pagination | n/a (read) | `!banlist` (row 20) |
| `/mod unban` | Reverse a ban by user ID | native `ban_members` | ephemeral confirmation, public mod-log entry | `ModerationCase` (UNBAN) | none | mod-log channel | `!unban <name#discriminator>` (row 23) — fixed |
| `/mod automod allow` | Add a domain to the allowlist | `administrator` | ephemeral | `AutoModDomainRule` (ALLOW) | none | mod-log channel | new (config surface for M3) |
| `/mod automod deny` | Add a domain to the denylist | `administrator` | ephemeral | `AutoModDomainRule` (DENY) | none | mod-log channel | new (config surface for M3) |
| `/mod automod list` | View the current allow/deny list | `administrator` | ephemeral | reads `AutoModDomainRule` | none | n/a (read) | new (config surface for M3) |
| `messageCreate` (scoped, autoModEnabled guilds only) | Flags non-allowlisted URLs for review instead of deleting them | n/a (listener) | posts to mod-log with buttons | writes `AutoModFlaggedMessage` (PENDING) | per-user cooldown to avoid mod-log spam from a single flooding user | mod-log channel | `on_message` in `AutoModerator.py` (row 25) — fixed |
| `mute-expiry` (job contract defined here; scheduled by Doc 015) | Removes the muted role once a mute's `expiresAt` elapses | n/a (system) | n/a | reads/writes `ModerationCase` (MUTE rows) | cadence: every 1 minute (`EVENT_AND_JOB_CATALOGUE.md`) | mod-log channel (`resolvedBy=SYSTEM_EXPIRY`) | `!tempmute`'s unmute-at row (row 19) — the actual missing consumer, now built |

## 13. Permission rules

Per `PERMISSION_MATRIX.md`: "`/mod *` (kick/ban/mute/purge/warn/lockdown/unlock/banlist/unban) |
Discord kick/ban/administrator permission (native) | none — explicitly decoupled from Slice |
`BOT_SECURITY_MODEL.md` §6." Concretely, this document's commands use Discord's own native
permission flags as the *only* gate, mirroring (not exceeding) the old bot's own gating per feature
(`kick_members` for kick, `ban_members` for ban/mute/purge/banlist/unban, `administrator` for
lockdown/unlock/warn/automod-config, per `OLD_BOT_FEATURE_INVENTORY.md` rows 18–25). Discord role
possession is a **UX gate only**: since this document makes zero Slice API calls, there is no
Slice-side authorization response to defer to for any command in this document's scope — this is the
one command family in the whole build guide where "Discord role = sufficient authority" is
intentional and documented, not an oversight (`BOT_SECURITY_MODEL.md` §6: "a Discord `ADMIN`/moderator
role never implies Slice `ADMIN` permission" — irrelevant here because no Slice permission is ever
checked in the first place). The old bot's `isModerator` helper (row 30, "has `ban_members`" as a
coarse proxy for staff) is not reused as code; this document uses discord.js's own per-command
`defaultMemberPermissions` declaration on each slash command, enforced by Discord itself before the
interaction even reaches the bot, which is a stronger guarantee than the old bot's in-handler check.

## 14. Security requirements

Per `BOT_SECURITY_MODEL.md`:

- **§6 (Discord role ≠ Slice permission):** inapplicable here in the "don't over-trust Discord roles
  for Slice access" direction (no Slice access exists to over-trust into), but the *reverse* clause
  applies fully: "a Slice account status change... does not automatically trigger a Discord-side
  action... unless a future, explicitly-designed and product-approved policy says so." No such policy
  exists; this document's kick/ban/mute logic never reads or reacts to Slice account state.
- **§11 (Admin action confirmation):** "Every destructive or high-impact bot command (ban, ...)
  requires an explicit type-to-confirm or button-confirm step with a visible summary of the action
  before execution." `/mod ban` and `/mod purge` (irreversible for message content) require the
  type-to-confirm pattern (`COMMAND_CATALOGUE.md` UI standards: "additionally requires typing the
  target's name/ID for the highest-impact actions (ban, force-delete ticket)"); `/mod kick`,
  `/mod mute`, `/mod lockdown`, `/mod unlock`, `/mod unban` use the standard button Confirm/Cancel
  with visible summary and timeout.
- **§10 (Logging redaction):** `AutoModFlaggedMessage.contentSnapshot` and `urlSnapshot` are stored
  with any token-like query-string fragment stripped before persistence — directly addressing
  `OLD_TO_NEW_MIGRATION_MATRIX.md` M3's redaction requirement ("triggering message content (redacted
  of any token-like strings)"). No warning reason, mute reason, or mod-log entry ever contains a
  Slice token, email, or session identifier, because this document never handles any (§5).
- **Named security fix — deprecated identity matching (old bot row 23):** `/mod unban` accepts only a
  Discord user ID (or an `@username` mention/autocomplete resolved by Discord itself to a stable ID
  before the command handler ever sees it) — the handler never performs string matching against a
  `name#discriminator`-formatted value, and never iterates `guild.bans()` looking for a formatted-name
  match. It looks up the exact ID directly.
- **Named security fix — blanket URL deletion (old bot's `AutoModerator.on_message`):** the
  `messageCreate` auto-mod listener never silently deletes a message. A URL against a domain not on
  the guild's `AutoModDomainRule` ALLOW list is flagged to `AutoModFlaggedMessage` (status `PENDING`)
  and posted to the mod-log channel with Delete/Allow buttons for a human moderator decision; a URL
  against a DENY-listed domain is deleted immediately with a mod-log entry (this is the one
  auto-action retained, and it is explicit-list-driven, not blanket). The guild's own web app domain
  is seeded into every new guild's ALLOW list by default at config-creation time, directly closing the
  old bot's flagged gap ("would block legitimate links (e.g., a Slice asset page URL)").
- **Named reliability fix — tempmute expiry (old bot row 19, UNKNOWN):** `MuteExpiryService` is a
  pure, idempotent function operating over `ModerationCase` rows — re-running it against an
  already-resolved mute is a safe no-op (checked via `active=false`), so a scheduler mis-firing twice
  in the same minute cannot double-process or error. Its unit tests (§21) explicitly assert this.

## 15. Idempotency and rate limits

- **No Slice mutation exists in this document's scope**, so `BOT_ARCHITECTURE.md`'s
  `Idempotency-Key` scheme (derived from `(discordUserId, command, targetResourceId, nonce)` for
  Slice API calls) does not apply here — there is no Slice call to key.
- **Bot-owned mutation idempotency:** every command in this document's scope is naturally idempotent
  at the persistence layer by construction — `/mod mute` on an already-muted member updates the
  existing `active=true` `ModerationCase` row's `expiresAt` rather than creating a duplicate active
  mute; `/mod unmute`/`/mod unban`/`/mod unlock` on a target with no active case return a clear
  "not currently muted/banned/locked" response rather than erroring; the `mute-expiry` job's
  `processExpiredMutes()` function only acts on rows where `active=true AND expiresAt <= now()`, and
  flips `active=false` in the same transaction it removes the Discord role, so a retried/duplicate job
  invocation finds nothing left to do.
- **Rate limits:** per `PERMISSION_MATRIX.md`/`COMMAND_CATALOGUE.md`, this command family has "none
  beyond Discord's own API limits" for kick/ban/mute/unmute/warn/lockdown/unlock/banlist/unban.
  `/mod purge` is additionally capped at Discord's 100-message bulk-delete ceiling per call, with the
  explicit "cannot delete messages older than 14 days" notice fixing the old bot's silent gap (row 22:
  "Bulk delete affects messages >14 days old inconsistently across discord.py versions (age not
  checked here)"). The auto-mod `messageCreate` listener applies a per-user cooldown on flagging (not
  a hard block) purely to prevent one flooding user from spamming the mod-log review queue — this is a
  bot-local UX safeguard, not a Slice-facing rate limit.

## 16. Audit requirements

Per `OLD_TO_NEW_MIGRATION_MATRIX.md` M2: "every action to a private mod-log channel; warn/unwarn
additionally queryable via `/mod warns <user>`." Concretely:

- Every `ModerationCase` write (kick, ban, mute, unmute, warn, lockdown, unlock, unban) posts an embed
  to the guild's configured `modLogChannelId` with: action type, target (Discord mention + ID, never a
  bare display name, so it survives a future username change), actor, reason, timestamp
  (`<t:unix:R>` per `COMMAND_CATALOGUE.md` UI standards), and — for mutes — the expiry time.
- Every `mute-expiry` system-driven resolution posts the same embed shape with `resolvedBy` shown as
  "System (mute expired)" rather than a Discord actor, so the log is unambiguous about human vs.
  automated action.
- Every auto-mod action (flag-for-review or deny-list delete) posts to the same mod-log channel with
  the redacted content/URL snapshot (§14) and, for flagged messages, Delete/Allow buttons whose
  resulting decision is itself logged (`reviewedBy`, `reviewedAt`, final `status`).
- This is the bot's **own** operational log, not a Slice `AuditEvent` — per `BOT_DATA_OWNERSHIP.md`,
  moderation history has no Slice counterpart to audit against, so there is no "duplicate audit
  record" risk to guard against here (contrast with `BOT_SECURITY_MODEL.md` §5's warning about
  Slice-mutation-adjacent bot actions, which is inapplicable to this document per §5/§11).
- If `modLogChannelId` is unset for a guild, the command still succeeds (moderation itself is never
  blocked by a missing log channel) but the response includes a one-time admin-visible warning that
  no mod-log channel is configured, and the write is skipped with a structured log line on the bot's
  own side (never silently dropped without any trace).

## 17. Error behavior

Per `ERROR_CATALOGUE.md`, the rows relevant to this document are entirely the "Discord-side failure"
row ("missing permissions to act, channel deleted, DM closed | n/a | Specific, context-aware message
per case (never the generic bot-error message for a Discord-side, not Slice-side, failure)") and the
generic unrecognized-error fallback, since this document makes no Slice calls and therefore never
maps a Slice error code. Cases specific to this document, not already itemized in the catalogue:

- **Target outranks the bot / bot lacks permission to act** (Discord's own hierarchy check fails on
  kick/ban/mute-role-add) → "I don't have permission to do that to this member — check role
  hierarchy." Never a generic error.
- **Target already has an active mute/lockdown** → not an error; `/mod mute` updates the existing
  case's expiry (§15) and the response says so explicitly ("Updated existing mute, new expiry: ...").
- **`/mod unmute`/`/mod unban`/`/mod unlock` with no matching active case** → "That member/user/channel
  isn't currently muted/banned/locked." Not a generic error, not a crash.
- **Muted role not configured (`GuildModerationConfig.mutedRoleId` unset)** → "This server hasn't set
  up a muted role yet — an admin needs to run `/mod automod config` [or equivalent setup step] first."
  Never silently no-ops.
- **`/mod purge` requested count exceeds Discord's 100-message ceiling, or targets messages older than
  14 days** → explicit message stating exactly how many were actually deleted and why the rest were
  skipped, never a silent partial success.
- **DM to target fails (closed DMs) before kick/ban/mute** → the action still proceeds (mirrors old
  bot's "best-effort" DM), with a one-time in-channel/ephemeral notice that the DM could not be
  delivered, per `BOT_SECURITY_MODEL.md` §10 ("a failed DM... is handled gracefully with a one-time
  in-channel notice, not a repeated retry loop").
- **Unrecognized/unexpected error** (any uncaught exception in a handler) → the catalogue's standard
  "Something went wrong on our end — we've logged it (ref: `{requestId}`)." Full detail logged
  server-side only; this document introduces no exception to that rule (directly fixing the old bot's
  `ErrorHandler.py` generic-branch leak, M6).

## 18. Interaction UX

- **`/mod kick <member> <reason>`:** immediate defer, then a button Confirm/Cancel embed showing
  target, reason, and "this cannot be undone by the bot" note; on confirm, best-effort DM, then kick,
  then public mod-log post; ephemeral success/failure response to the invoking moderator.
- **`/mod ban <user> <reason> [deleteMessageDays]`:** same flow, plus the type-to-confirm step
  (moderator must type the target's username or ID into a modal) before the ban executes, per
  `COMMAND_CATALOGUE.md`'s "highest-impact actions" rule. `deleteMessageDays` defaults to 0 (Discord's
  own default), shown explicitly in the confirmation summary so a moderator never accidentally
  deletes message history without meaning to.
- **`/mod mute <member> <duration> <reason>`:** duration accepts a bounded set of human-readable
  values (e.g. `10m`, `1h`, `1d`, `7d`) validated client-side before defer; confirmation embed shows
  the computed absolute expiry timestamp (`<t:unix:F>` and `<t:unix:R>` together) so the moderator
  sees exactly when it resolves, not just the relative duration.
- **`/mod unmute <member> [reason]`:** confirmation embed, then role removal + `ModerationCase` update;
  if no active mute exists, skips confirmation and returns the "not currently muted" message directly
  (§17).
- **`/mod purge <count> [filter]`:** ephemeral-only result ("Deleted N of {count} requested messages"
  plus a note on any skipped for the 14-day-age reason); no public mod-log embed reproduces deleted
  message content (only count/channel/actor), per the redaction posture in §14/§16.
- **`/mod warn <member> <reason>`:** confirmation embed, then ephemeral success; public mod-log entry.
- **`/mod warns <member>`:** ephemeral, paginated (shared paginator component from Document 003) list
  of that member's `ModerationCase` (WARN) rows, newest first, each showing reason/actor/timestamp.
- **`/mod lockdown [channel] [reason]` / `/mod unlock [channel]`:** confirmation embed naming the
  target channel (defaults to the invoking channel) and the exact overwrite being toggled; public
  mod-log entry.
- **`/mod banlist [page]`:** ephemeral, shared paginator over Discord's own ban list (fetched live,
  not bot-persisted), Previous/Next buttons disabled at bounds per `COMMAND_CATALOGUE.md` UI
  standards.
- **`/mod unban <userId>`:** confirmation embed showing the resolved Discord user (username + ID,
  fetched via Discord's API from the ID, never assumed from unverified input) before executing; public
  mod-log entry.
- **`/mod automod allow|deny <domain>` / `/mod automod list`:** `allow`/`deny` are simple ephemeral
  confirm-then-apply (no type-to-confirm needed — reversible, low-impact); `list` is a plain ephemeral
  embed of current rules, paginated if long.
- **Auto-mod flag review (mod-log post, not a slash command):** embed shows the redacted URL/content
  snapshot, author, channel, timestamp, and two buttons — "Delete message" and "Allow (adds domain to
  allowlist)" — either button is restricted to users holding the same `administrator`/`ban_members`
  gate as the rest of this document's commands (button handlers re-verify the clicking user's Discord
  permissions server-side, never trusting that only staff can see the mod-log channel).

## 19. Implementation file plan

```text
src/commands/mod/
  kick.ts            — /mod kick handler
  ban.ts             — /mod ban handler (incl. hackban-by-ID path)
  mute.ts            — /mod mute handler
  unmute.ts          — /mod unmute handler
  purge.ts           — /mod purge handler
  warn.ts            — /mod warn handler
  warns.ts           — /mod warns handler (paginated read)
  lockdown.ts        — /mod lockdown handler
  unlock.ts          — /mod unlock handler
  banlist.ts         — /mod banlist handler (paginated read)
  unban.ts           — /mod unban handler
  automod-config.ts  — /mod automod allow|deny|list handlers

src/domain/moderation/
  moderationCase.repository.ts   — persistence access for ModerationCase
  guildModerationConfig.repository.ts — persistence access for GuildModerationConfig
  autoModDomainRule.repository.ts — persistence access for AutoModDomainRule
  autoModFlaggedMessage.repository.ts — persistence access for AutoModFlaggedMessage
  muteExpiryService.ts           — processExpiredMutes(): the domain function Doc 015 schedules
  lockdownService.ts             — shared lockdown/unlock overwrite logic (used by both commands)
  modLog.ts                      — shared "post an embed to the configured mod-log channel" helper

src/events/
  autoModerationMessageListener.ts — scoped messageCreate handler (URL allow/deny/flag logic)

src/components/mod/
  confirmModAction.ts   — thin wrapper around Document 003's shared confirmation component,
                           pre-configured with this document's destructive-action copy
  autoModFlagButtons.ts — Delete/Allow button handlers for flagged-message mod-log posts

test/unit/moderation/     — unit tests per §21
test/integration/moderation/ — integration tests per §22
test/discord-interaction/moderation/ — interaction-simulation tests per §23
```

## 20. Numbered implementation steps

1. Add the four bot-owned tables from §10 to the bot's persistence schema/migration set established
   in Document 001; write and run the migration against a local dev database.
2. Implement the four repository modules (`moderationCase`, `guildModerationConfig`,
   `autoModDomainRule`, `autoModFlaggedMessage`) with typed CRUD methods, no raw string interpolation
   of any Discord-supplied value (directly avoiding the old bot's raw-MySQL pattern, row 4/31 of the
   inventory).
3. Implement `modLog.ts`: a single function `postModLogEntry(guildId, embed)` that no-ops with a
   structured warning log if `modLogChannelId` is unset, used by every command below.
4. Implement `/mod kick` and `/mod ban` using Document 003's command-registration pattern and shared
   confirmation component; `/mod ban` additionally wires the type-to-confirm modal step.
5. Implement `/mod mute` and `/mod unmute`, including duration parsing/validation and the
   `ModerationCase` upsert-on-already-muted behavior from §15.
6. Implement `muteExpiryService.processExpiredMutes()` as a pure function taking a persistence handle
   and a Discord client reference, returning a summary of how many mutes it resolved; write it so it
   is directly callable both by a unit test harness and by whatever scheduler Doc 015 wires around it.
7. Implement `/mod purge`, including the 14-day-age filtering and the exact-count-deleted reporting.
8. Implement `/mod warn` and `/mod warns`, including the shared paginator wiring for `warns`.
9. Implement `lockdownService.ts` (shared toggle logic) and the `/mod lockdown`/`/mod unlock` command
   handlers on top of it.
10. Implement `/mod banlist` (live Discord ban-list fetch + shared paginator) and `/mod unban`
    (ID-only resolution, confirmation, ban removal, `ModerationCase` write) — verify by manual test
    that no code path in `unban.ts` ever calls `.split('#')` or otherwise parses a
    `name#discriminator` string.
11. Implement `/mod automod allow|deny|list` and seed each new `GuildModerationConfig` row's default
    ALLOW list with the guild's own configured Slice-web-app domain at config-creation time.
12. Implement `autoModerationMessageListener.ts`: scoped to guilds with `autoModEnabled=true`, checks
    each URL's domain against `AutoModDomainRule`, deletes immediately only for DENY matches, else
    writes a `PENDING` `AutoModFlaggedMessage` and posts the review embed with buttons for anything
    not on the ALLOW list; ALLOW-listed domains are left untouched with no message written at all.
13. Implement `autoModFlagButtons.ts` handlers for the Delete/Allow buttons, including the
    server-side permission re-check on the clicking user (§18).
14. Wire the redaction step (§14) into both the flagged-message content/URL snapshot and any log line
    that would otherwise carry raw message content.
15. Write unit, integration, and Discord-interaction tests per §21–§23.
16. Manual QA per §24 in a dev guild.
17. Confirm with the Document 015 owner (or, if run sequentially, verify directly) that
    `muteExpiryService.processExpiredMutes()`'s exported shape and the `ModerationCase` schema are
    sufficient for Doc 015 to register the recurring job without further changes to this document's
    code — this is the explicit hand-off point for the "blocks 015" dependency.

## 21. Unit tests

- Command-handler input validation for every command in §12 (duration parsing bounds for `/mod mute`,
  purge count bounds, reason-required enforcement) against a fake Discord interaction object, no
  network/database I/O.
- `muteExpiryService.processExpiredMutes()`: given a fixed "now," asserts it resolves exactly the
  `ModerationCase` rows with `active=true AND expiresAt <= now`, leaves future-expiring mutes
  untouched, is a safe no-op on a second immediate re-run (idempotency, §15), and correctly sets
  `resolvedBy='SYSTEM_EXPIRY'`. This is the test the old bot never had (row 19's UNKNOWN gap) and is
  the direct regression guard for this document's core reliability fix.
- `/mod unban` ID-resolution: asserts the handler only ever accepts/looks up a numeric Discord snowflake
  ID (or a resolved mention), and has no code path that parses or matches against a
  `name#discriminator`-shaped string — a direct regression test for the named security finding.
- Auto-mod domain matching: given a message with URLs against ALLOW, DENY, and unlisted domains,
  asserts ALLOW is untouched, DENY is deleted with a log entry, unlisted is flagged (not deleted) —
  a direct regression test for the named blanket-deletion finding, asserting deletion never happens
  for an unlisted domain.
- Redaction helper: asserts a token-like query string in a flagged URL is stripped before it would be
  persisted or logged.
- Idempotency/upsert behavior for `/mod mute` on an already-muted target, and no-op responses for
  `/mod unmute`/`/mod unban`/`/mod unlock` with no matching active case.
- Error-mapping for every Discord-side failure case listed in §17 (permission/hierarchy failure,
  missing muted-role config, DM failure) against a fake Discord client that simulates each failure.

## 22. Integration tests

- Every repository module (§10 tables) against a real disposable bot database (mirrors
  `TEST_STRATEGY.md`: "Bot-owned persistence (tickets, moderation, giveaways, suggestions) tested
  against a real disposable bot database"): create/read/update paths for `ModerationCase`,
  `GuildModerationConfig`, `AutoModDomainRule`, `AutoModFlaggedMessage`, including the unique
  constraint behavior on `AutoModDomainRule(guildId, domain, listType)`.
- `muteExpiryService.processExpiredMutes()` against the real disposable database: seed several
  `ModerationCase` (MUTE) rows with a mix of past/future `expiresAt`, run the function, assert exactly
  the expected subset is flipped to `active=false` in the actual database, not just in an in-memory
  fake.
- Mod-log posting: asserts `postModLogEntry` correctly no-ops (with a captured warning log, not an
  exception) when `modLogChannelId` is unset for a guild, using a real database row for that guild's
  config.
- Full command-to-persistence round trip for `/mod warn` → `/mod warns` (write then read back the
  same case), and for `/mod mute` → `muteExpiryService` (mute a member with a very short test duration,
  advance the test clock, run the expiry function, assert the mute is resolved end-to-end).

## 23. Discord interaction tests

Per `TEST_STRATEGY.md`, simulated interaction payloads run through the real interaction router and
command handlers without a live gateway connection:

- Slash-command parsing for all 11 `/mod` subcommands plus the 3 `/mod automod` subcommands: correct
  option parsing, correct `defaultMemberPermissions` enforcement (simulate an interaction from a user
  lacking the required Discord permission and assert Discord's own gate — not the handler — is what
  blocks it, consistent with §13's "stronger guarantee than the old bot's in-handler check").
- Button-click simulation for every confirmation flow (Confirm/Cancel, type-to-confirm modal submit
  for `/mod ban`) — asserts the exact response shape (ephemeral flag, embed fields, disabled
  button state post-click) and that a Cancel or timeout never executes the underlying action.
- Persistent-component test for the auto-mod flag Delete/Allow buttons: round-trips a flagged
  message's button custom ID through a simulated bot restart and confirms the handler can still
  resolve the correct `AutoModFlaggedMessage` row from bot-owned persistence, not from in-memory
  state (directly regression-testing the old bot's reaction-based flows "which don't survive
  restarts," per `COMMAND_CATALOGUE.md` UI standards).
- Permission-gate simulation asserting every `/mod automod *` and `/mod warn`/`/mod warns` subcommand
  actually requires `administrator` as declared, with no accidental fallthrough to a lower permission
  level.

## 24. Manual QA checklist

Run in a real, disposable test guild, per `TEST_STRATEGY.md`'s manual-QA pass ("moderation suite"
item):

- [ ] `/mod kick` on a test alt account: DM sent (or DM-failure notice shown if closed), member
      removed, mod-log entry posted with correct actor/target/reason.
- [ ] `/mod ban` on a test alt account: type-to-confirm required, ban applied, mod-log entry posted.
- [ ] `/mod ban` on a raw user ID for an account not currently in the guild (hackban path): succeeds
      without requiring guild membership.
- [ ] `/mod mute` with a short duration (e.g. `1m`): muted role applied immediately; after the
      duration elapses, confirm (once Doc 015's scheduler is wired, or via a manual invocation of
      `processExpiredMutes()` in a dev harness) the role is removed and the mod-log shows
      `resolvedBy=System`.
- [ ] `/mod mute` on an already-muted member: existing case updated, no duplicate active mute created.
- [ ] `/mod unmute` on an actively muted member: role removed immediately, case resolved.
- [ ] `/mod unmute` on a non-muted member: clear "not currently muted" response, no error.
- [ ] `/mod purge` for a count under 100 in-window: correct count deleted; for a mix including
      >14-day-old messages: correct partial-count-with-explanation response.
- [ ] `/mod warn` then `/mod warns` on the same member: warning appears in the paginated list with
      correct reason/actor/timestamp.
- [ ] `/mod lockdown` on the current channel: `@everyone` (and member role, if configured) lose
      `send_messages`; `/mod unlock` restores it; both survive a bot restart in between (state read
      from persistence, not memory).
- [ ] `/mod banlist`: paginates correctly with more bans than fit one page; Previous/Next disabled at
      bounds.
- [ ] `/mod unban` using a Discord user ID for a currently-banned test account: succeeds; confirm the
      handler was never given and never needed a `name#discriminator`-formatted value.
- [ ] `/mod automod allow`/`deny`/`list`: add a domain to each list, confirm `list` reflects both.
- [ ] Post a link to a DENY-listed domain as a non-staff test account: message deleted immediately,
      mod-log entry posted.
- [ ] Post a link to an unlisted domain as a non-staff test account: message is **not** deleted,
      flagged-review embed posted to mod-log with working Delete/Allow buttons.
- [ ] Post a link to the seeded ALLOW-listed (Slice web app) domain as a non-staff test account: no
      action taken at all, no mod-log entry.
- [ ] Security QA (per `TEST_STRATEGY.md`): grep bot logs and the mod-log channel history after a full
      pass, confirm no raw exception text, no unredacted token-like string, and no Slice token/secret
      ever appears anywhere in this document's output.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires the disposable bot database, no Slice instance needed for this document's scope
npm run build
```

## 26. Completion checklist

- [ ] All 11 `/mod` subcommands plus the 3 `/mod automod` subcommands implemented and registered.
- [ ] `ModerationCase`, `GuildModerationConfig`, `AutoModDomainRule`, `AutoModFlaggedMessage` tables
      migrated and covered by repository unit/integration tests.
- [ ] `muteExpiryService.processExpiredMutes()` implemented, idempotent, unit- and
      integration-tested, and confirmed ready for Doc 015 to schedule (§20 step 17) — the tempmute
      UNKNOWN gap from `OLD_BOT_FEATURE_INVENTORY.md` row 19 is closed with a real, tested consumer.
- [ ] `/mod unban` verified to accept only stable Discord user IDs, with a passing regression test
      proving no `name#discriminator` string-matching code path exists anywhere in this document's
      code.
- [ ] Auto-mod URL listener verified to never blanket-delete: ALLOW untouched, DENY deleted with a
      log entry, unlisted flagged-not-deleted — with a passing regression test.
- [ ] Every command in scope posts to the configured mod-log channel, and gracefully no-ops (not
      crashes) when unset.
- [ ] Every destructive command uses the shared confirmation component; `/mod ban` additionally uses
      type-to-confirm.
- [ ] No raw exception text, stack trace, or unredacted content reaches any user-facing message or
      persisted log row.
- [ ] No Slice API call, Slice DTO, or Slice credential appears anywhere in this document's code (§5,
      §11 verified empty).
- [ ] `npm run lint`, `typecheck`, `test:unit`, `test:integration`, and `build` all pass.
- [ ] Manual QA checklist (§24) fully run and signed off in a dev guild.

## 27. Documentation updates

Once this document's work actually lands, update: `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md`
(flip Document 012's status row to COMPLETE, not based on this document alone per those files' own
instructions); `CURRENT_STATE.md` (reflect that moderation-suite code now exists, updating the
"No Discord bot code exists anywhere" line accordingly); `MASTER_CHECKLIST.md`'s "Production
readiness" section (check off "Discord bot implementation begun" once any implementation document,
including this one, actually lands code); `project-state.json`'s `codingStarted` field. No change is
needed to `OLD_BOT_FEATURE_INVENTORY.md` or `OLD_TO_NEW_MIGRATION_MATRIX.md` themselves — those are
historical review artifacts of the old bot, not living status trackers of the new one.

## 28. Final report format

The implementer's completion report for this document must state, in order: (1) which of the 11
`/mod` subcommands and 3 `/mod automod` subcommands were completed and which (if any) were not, with
reasons; (2) confirmation that the two named security findings (deprecated `name#discriminator`
matching in unban, blanket URL deletion in auto-mod) are fixed, each with a pointer to the specific
regression test proving it; (3) confirmation of the mute-expiry reliability fix, with a pointer to
`muteExpiryService`'s test coverage and an explicit note on the hand-off state for Doc 015; (4) full
verification-command output (§25); (5) manual QA checklist results (§24) with any unchecked items and
why; (6) any deviation from this document's scope (§7/§8) and why, since deviations are never silent
per this build guide's ground rules.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
