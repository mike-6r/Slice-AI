# 014 — Community and engagement features

## 1. Metadata

- **Document number:** 014
- **Title:** Community and engagement features
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 001 (Repository reconciliation and bot foundation), 003
  (Discord interaction framework and command registry)
- **Blocks (this build guide):** 015 (Background jobs and scheduled digests) — specifically the
  `giveaway-tick` scheduled job (EVENT_AND_JOB_CATALOGUE.md), which reads the giveaway persistence
  schema and calls the winner-selection function this document defines
- **Slice backend dependency:** none. Per IMPLEMENTATION_ORDER.md and PROMPT_INDEX.md, this
  document's row reads "none (news feed is external)" — that parenthetical exists because the news
  feed is the other bot-owned, no-Slice-dependency community feature named in BOT_PRODUCT_SPEC.md's
  wishlist table, and it shares this document's "Track C: fully bot-owned" classification
  (IMPLEMENTATION_ORDER.md). It is **not**, however, part of this document's assigned scope — see
  §8.
- **Can start today:** Yes

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend; the Slice Discord bot is a
**companion client** to Slice, never a second backend — it calls Slice's HTTP API for anything with
product/financial/identity meaning and owns nothing Slice already owns (BOT_ARCHITECTURE.md,
BOT_DATA_OWNERSHIP.md). This document sits in **Track C** of IMPLEMENTATION_ORDER.md ("fully
bot-owned, no Slice dependency at all"), alongside Documents 011 (support/ticket migration) and 012
(moderation suite migration), all of which can proceed in parallel once 001 and 003 land, and all of
which feed Document 015's scheduled-job wiring afterward. This document covers the subset of the
client's supplementary feature wishlist (BOT_PRODUCT_SPEC.md, "Client-requested feature
wishlist — reality check") that BOT_PRODUCT_SPEC.md classifies **BUILD NOW** and that is entirely
bot-owned Discord engagement functionality with zero Slice API touchpoint: reaction roles, a
message-based leveling/XP system, `#suggestions`, a weekly `#memes` competition, `#polls`, `#faq`,
and `#roadmap` (including its poster). It also migrates the old bot's `Giveaways.py` cog, fixing the
missing-permission-decorator finding documented in `OLD_BOT_FEATURE_INVENTORY.md` row 26.

## 3. Current implementation audit

As of this document's authoring, **no Discord bot code exists anywhere** (CURRENT_STATE.md,
`project-state.json`: `"codingStarted": false`) — this build guide is documentation-only, and
Implementation Document 001 has not itself been executed. This document is written on the
assumption, per IMPLEMENTATION_ORDER.md's stated dependency graph, that by the time an implementer
picks it up, Document 001 (repository/bot foundation: project scaffold, config loader, Discord
client bootstrap, bot-owned persistence layer, health/readiness endpoints) and Document 003 (Discord
interaction framework: command registry, interaction router, shared embed builder, pagination
component, persistent-component/custom-ID pattern, confirmation-component pattern) have both closed
per their own completion checklists. Nothing from Documents 002, 004–010, or 013 needs to close
first — per IMPLEMENTATION_ORDER.md's "Parallelizable tracks" section, this document (Track C) is
independent of Track A (account linking, 004–006/009/010/013) and Track B (marketplace/asset
commands, 007/008). No bot-owned persistence table referenced in this document exists yet; §10
defines what this document introduces.

## 4. Old bot behavior migrated

Per `OLD_BOT_FEATURE_INVENTORY.md` and `OLD_TO_NEW_MIGRATION_MATRIX.md`:

- **Feature #26 — Giveaways** (`cogs/Giveaways.py`, `!giveaway start/reroll/end/delete`, a 30-second
  countdown-embed update loop). Migration status: **REWRITE** (matrix entry **M4**). The inventory's
  documented findings this rewrite must fix:
  - `start` is `administrator`-gated, but `reroll`, `end`, and `delete` "appear to lack
    `@commands.has_permissions(administrator=True)` that `start` has — any member could end/delete/
    reroll another user's giveaway." This is the missing-permission-decorator security finding named
    in this document's assignment. The rewrite (§7, §12, §13) gates **every** `/giveaway` subcommand
    behind the bot admin role, with no exceptions, per M4's explicit fix and PERMISSION_MATRIX.md's
    row (`/giveaway *` → "bot admin role only, every subcommand (fixes old bot's missing checks)").
  - Winner selection via `message.reactions[0].users().flatten()` "breaks if any other reaction is
    added first (index 0 assumption)." The rewrite uses button-based entry (a persisted entrant list,
    not a reaction index) so there is no reaction-index assumption at all — TEST_STRATEGY.md
    explicitly calls out unit-testing winner selection "given an arbitrary entry set — explicitly
    regression-testing the old bot's reaction-index-0 bug."
- **Feature #7 — Suggestions** (`cogs/Main.py`, `!suggest`, tick/cross reactions, "no persisted
  status" — "no record of accept/reject decisions, no admin change log," and reactions "silently
  vanish if bot restarts mid-vote"). Migration status: **REWRITE** (matrix entry **M5**). The rewrite
  replaces reactions with Approve/Reject/Planned/Completed buttons and a persisted status/status-
  history record that survives a bot restart (§10, §12).
- **Reaction roles, leveling/XP, `/poll`, `/faq`, `/roadmap`, and the `#memes` competition: None —
  these have no old-bot predecessor.** The old bot (`main.py` + 12 cogs) has no reaction-role system,
  no XP/leveling system, no poll command, no FAQ command, no roadmap command, and no meme-competition
  feature anywhere in its inventory (`OLD_BOT_FEATURE_INVENTORY.md` items 1–31). These are new
  capabilities drawn directly from the client's supplementary wishlist (BOT_PRODUCT_SPEC.md), not
  migrations of existing old-bot code, and this document does not force a mapping that isn't real.

## 5. Slice features supported

**None.** Every capability this document delivers is classified **Bot**-authoritative in
`BOT_DATA_OWNERSHIP.md`: "Guild configuration (ticket categories, moderation settings, channel IDs,
auto-mod domain lists, **roadmap content, FAQ copy**)," "**Suggestion state machine** — Pure Discord
engagement feature," "**Giveaway state** — Pure Discord engagement feature," "**Leveling/XP/
leaderboard/birthdays** — Pure Discord engagement feature, explicitly out of Slice's domain," and
"Roadmap/FAQ/announcement content — Bot (admin-editable) — Marketing/static content, not a live
Slice data source." No Slice backend document (VERIFIED, PARTIAL, NOT STARTED, or DEFERRED per
`CURRENT_STATE.md`/`project-state.json`) is read from or written to anywhere in this document's
scope. This is consistent with `IMPLEMENTATION_ORDER.md`'s and `PROMPT_INDEX.md`'s "Slice backend
dependency" column for Document 014, which reads "none."

## 6. Files to read before starting

- `BOT_PRODUCT_SPEC.md` — full "Client-requested feature wishlist — reality check" table (the
  classification source of truth for what this document may and may not include).
- `COMMAND_CATALOGUE.md` — the "Support / community (bot-owned, no Slice dependency)" table and the
  "UI standards" section (component-not-reaction rule, ephemeral/public defaults, confirmation
  dialogs, pagination).
- `OLD_BOT_FEATURE_INVENTORY.md` — row 26 (Giveaways) in full, including its "Security risks" and
  "Reliability issues" columns.
- `OLD_TO_NEW_MIGRATION_MATRIX.md` — M4 (Giveaways) and M5 (Suggestions) in full.
- `BOT_ARCHITECTURE.md` — persistent-component/custom-ID pattern, embed-builder module, pagination
  component, background-job technology (BullMQ), "Bot must never do" section.
- `BOT_SECURITY_MODEL.md` §3 (custom-ID opacity, per-click re-verification), §10 (logging redaction,
  DM best-effort), §11 (admin action confirmation).
- `BOT_DATA_OWNERSHIP.md` — every row tagged **Bot**.
- `PERMISSION_MATRIX.md` — the `/suggest`, `/giveaway *`, `/poll`/`/faq`/`/roadmap` rows.
- `ERROR_CATALOGUE.md` — the "Unrecognized/unexpected error" and "Discord-side failure" rows (the
  only rows applicable to a document with zero Slice API calls).
- `TEST_STRATEGY.md` — the giveaway winner-selection regression-test callout.
- `EVENT_AND_JOB_CATALOGUE.md` — the `giveaway-tick` job row (owned by Document 015, but this
  document must produce the persistence/function it depends on).
- Implementation Document 001 and 003 (once they exist) — the actual bot-foundation and
  interaction-framework code this document builds on top of.

## 7. Strict scope

- **Reaction roles (component-based):** an admin command that posts a persistent role-selection
  message using Discord **buttons or a select menu — never raw emoji reactions**, per
  `COMMAND_CATALOGUE.md`'s UI standard: "every mutating action uses a component, not a reaction (a
  direct fix over the old bot's reaction-based flows, which don't survive restarts and have no
  built-in permission scoping per-click)." Clicking a component toggles Discord role membership
  (idempotent — see §15). Options include Slice-feature-linked "notification category" roles (e.g.,
  "New Listing," "Price Alert"); per BOT_PRODUCT_SPEC.md's wishlist row, these are shipped now with
  a visible label that the underlying notification **will not fire yet** ("will activate once
  [feature] launches") — the role assignment itself has no Slice dependency; the eventual delivery
  does (gated on Slice Doc 017 + a new `DISCORD` channel type, per BOT_DATA_OWNERSHIP.md and
  BOT_ARCHITECTURE.md's `NotificationDeliveryConsumer` stub — not built here).
- **Leveling/XP (message-based, bot-owned leaderboard):** XP awarded on qualifying messages with a
  per-user cooldown (anti-spam), level computed from a defined curve, a level-up announcement in a
  configured channel, `/level` (self or another member) and `/leaderboard` (paginated) read commands.
  Entirely bot-owned persistence per BOT_DATA_OWNERSHIP.md's "Leveling/XP/leaderboard" row.
- **`/suggest`** with Approve/Reject/Planned/Completed status buttons (M5): submission via modal,
  persisted status + status-history, requester notified (best-effort DM) on every status change.
- **`/giveaway start/reroll/end/delete`** (M4 rewrite): button-based entry, every subcommand
  admin-gated (fixing the missing-decorator finding), persisted giveaway/entrant state, and a
  standalone, unit-testable winner-selection function that does not assume anything about entry
  order. This document delivers the commands, persistence, and winner-selection function; the
  recurring 30-second countdown-embed update and automatic end-at-`endsAt` execution are the
  `giveaway-tick` scheduled job, owned by Document 015 (hence "Blocks: 015" in §1) — `/giveaway end`
  in this document performs the same winner-selection logic on-demand for an admin-triggered manual
  end.
- **`/poll`** (timed, button-based): question + up to a configured max number of options, vote
  buttons, live vote counts, a `closesAt` timestamp rendered with Discord's native relative-timestamp
  markdown, and automatic closure evaluated from the stored `closesAt` value (§9, §18) — not a raw
  reaction poll.
- **`/faq`**: static, admin-editable content, versioned by last-editor/last-edited-at, served from
  bot-owned persistence, not a hardcoded config file (so it can be edited without a redeploy).
- **`/roadmap`**: static/admin-editable roadmap content (milestones with admin-set, not live-metric,
  progress values) plus the client-supplied roadmap poster, displayed as a Discord file attachment
  on the response embed — an actual image the client provided, never fabricated progress data or a
  placeholder chart.
- **`#memes` weekly competition:** per BOT_PRODUCT_SPEC.md's wishlist classification ("Ship as a
  simple reaction-count job"), a channel-scoped submission tracker plus a weekly scheduled job that
  tallies a configured "vote" reaction's count on submissions posted that week and announces a
  winner. This is channel automation, not a slash command surface, consistent with the fact that
  `COMMAND_CATALOGUE.md` does not list a `/memes` command.
- Bot-owned persistence schema for every feature above (§10), consistent with `BOT_DATA_OWNERSHIP.md`.
- Error mapping, audit logging, permission gating, and UI (embeds/buttons/modals/pagination/
  confirmation) consistent with `COMMAND_CATALOGUE.md`'s UI standards and `ERROR_CATALOGUE.md`'s
  "never leak raw errors" rule.

## 8. Out of scope

### 8a. Excluded because it implies trading/financial functionality (per BOT_PRODUCT_SPEC.md's
client-wishlist classification table — cited exactly, so a reader does not assume this document
covers the whole wishlist)

- **`#start-here` "Connect Wallet" button** — **NEEDS PRODUCT/LEGAL DECISION.** "Wallet is explicitly
  disabled with 'no provider' in Slice's own frontend review; Doc 016 (wallet/compliance) is formally
  DEFERRED pending provider approval." Not built in any form here.
- **"Verified Investor" role unlocking marketplace channels** — **NEEDS PRODUCT DECISION.** "Implies
  KYC-verified status, which requires Doc 016 (DEFERRED)." This document's reaction roles (§7) ship
  only non-financial opt-in categories; a KYC-gated role is not one of them.
- **Investor Profiles (win rate, ROI, total invested, portfolio value)** — **PHASE-GATED**, requires
  Slice Docs 012 + 013 (both NOT STARTED). Not delivered here; the non-financial part
  (`/collector view`) is Implementation Document 008's scope, not this one.
- **Achievement system tied to £ invested / trade count / hold duration** — **PHASE-GATED (mostly)**,
  requires real ownership/trading data (Slice Docs 012/014, NOT STARTED). Not delivered here. (The
  one named exception, an "Early Supporter" join-date badge, is not itemized against any
  implementation document number in this build guide's `COMMAND_CATALOGUE.md` or
  `IMPLEMENTATION_ORDER.md` — that is a real scoping gap in this build guide, not something this
  document silently claims.)
- **`/balance`** — explicitly "not buildable (no finance ledger, 013 NOT STARTED)" per the
  `/portfolio /profile /card /search /value /balance /watchlist /price /history /help /invite /top`
  wishlist row. Not built here or anywhere in this build guide's Phase 1 scope.
- **`#requesting` (peer "looking for X, budget £Y")** — **NEEDS PRODUCT/LEGAL DECISION.** "No such
  concept exists in any Slice document (010–018); implies a peer-to-peer request/matching surface for
  a regulated investment product with no compliance review." Not built here.
- **`#offering` (sell template, "Buy"/"Message Seller"/"Watch" buttons, "Expected ROI")** — **NEEDS
  PRODUCT/LEGAL DECISION — HIGH RISK**, per BOT_PRODUCT_SPEC.md "the single highest-risk item in the
  entire request list; a non-functional 'Buy' button is actively misleading." Not built here.
- **`#trades` (Trade Complete posts with buyer/seller/price/txn ID)** — **PHASE-GATED + PRIVACY
  REVIEW**, needs real Slice Doc 014 execution data (NOT STARTED). Not built here.
- **`#market-feed` (new listings, funding progress %, "Buy Shares")** — **NEEDS PRODUCT/LEGAL
  DECISION — HIGH RISK.** "'Funding Progress %' implies a crowdfund/issuance mechanic not present in
  any Slice document ... 'Buy Shares' has the same risk as `#offering`." Not built here.
- **`#recent-sales` (completed purchases, volume charts)** — **PHASE-GATED**, needs real Slice Doc
  014 data. Not built here.
- **`#portfolio-showcase` `/portfolio` card (value/P&L/best-worst/diversification/ROI)** —
  **PHASE-GATED**, needs Slice Doc 013 (NOT STARTED); today portfolio reads return `authority: DEMO`
  or `UNAVAILABLE` only. Not built here (the honest "not available yet" version of `/portfolio` is
  Implementation Document 009's scope, not this one).
- **Daily "Top 10 Undervalued" scanner with confidence rating** — **NEEDS PRODUCT DECISION.** "No
  'undervalued'/expected-ROI scoring model exists anywhere in Slice's documented backend." Not built
  here.
- **Portfolio analytics (lowest volatility, highest appreciation, oldest holdings, conviction)** —
  **PHASE-GATED**, needs Slice Docs 012/013 real ownership/portfolio data. Not built here.

### 8b. Adjacent BUILD NOW / bot-owned wishlist items not delivered by this document

These are classified BUILD NOW (or PARTIAL BUILD NOW) in BOT_PRODUCT_SPEC.md and are not
trading/financial-implying, but they are not named in this document's assigned scope (§7) — they
belong to other implementation documents, or (where noted) are an unassigned gap in this build
guide's numbering that a future document must pick up explicitly, not something this document
silently absorbs because its title is broad:

- **Pokémon TCG news aggregator** and **prediction market + accuracy leaderboard** — both BUILD NOW
  per BOT_PRODUCT_SPEC.md and both appear in `EVENT_AND_JOB_CATALOGUE.md` (`news-feed-poll`,
  `prediction-scoring`), but neither is assigned to a specific implementation document number
  anywhere in `COMMAND_CATALOGUE.md` or `IMPLEMENTATION_ORDER.md`. This is the reason
  `IMPLEMENTATION_ORDER.md`'s dependency note for Document 014 mentions "news feed is external" — it
  is the most natural home for that feature given this document's title, but it was not included in
  this document's assigned strict scope (§7) and is not delivered here. Flagged as an open scoping
  gap for a human to resolve (a new document, or an addendum to this one), not silently claimed.
- **"Live Market Engine" (movers/summary polling)** and **`#market-discussion` auto-morning
  summary** — PARTIAL BUILD NOW, real DEMO-labeled Doc 007 data on a polling cadence. These are
  `market-digest`/`price-alert-poll` jobs explicitly assigned to Implementation Document 015 per
  `IMPLEMENTATION_ORDER.md` ("Yes, for market-digest/price-alert jobs"). Not this document.
- **Analytics (DAU, trades/day, holding time, liquidity, retention)** — PARTIAL BUILD NOW
  (admin-only Discord-engagement analytics). No implementation document number is assigned to this
  in `COMMAND_CATALOGUE.md`/`IMPLEMENTATION_ORDER.md`; not delivered here.
- **`#start-here` welcome embed**, **socials/`#links`**, **"Account Level"/Verification
  Status/Joined Date display**, and the **"Linked Account" role reframe** — BUILD NOW or PARTIAL
  BUILD NOW, but these are onboarding/account-status surfaces that belong to Document 001's
  bootstrap (`guildMemberAdd` welcome handler, per `EVENT_AND_JOB_CATALOGUE.md`), Document 003
  (`/help`/`/invite`), or Document 005 (account status once linking exists) — not this document.
- **`#create-a-ticket`** — BUILD NOW, but explicitly Implementation Document 011 (`/support open`
  and lifecycle), not this document.

### 8c. Explicitly out of scope regardless of classification

- The `giveaway-tick` scheduled job itself (30-second countdown-embed edit loop, automatic end at
  `endsAt`) — Implementation Document 015, per `EVENT_AND_JOB_CATALOGUE.md` and
  `IMPLEMENTATION_ORDER.md` ("ticket/mute/giveaway jobs depend on 011/012/014"). This document
  delivers what that job depends on (§7).
- Account linking, permission/authorization integration (Documents 004–006), marketplace/watchlist/
  notification/collector/vault commands (Documents 007–010), admin read-only operational commands
  (Document 013), moderation and ticket migration (Documents 011–012) — none of that is touched here.
- Any Discord push delivery of a real Slice notification (gated on Slice Doc 017 + a new `DISCORD`
  channel type that does not exist today, per BOT_ARCHITECTURE.md and BOT_DATA_OWNERSHIP.md).
- Observability/audit-correlation infrastructure (Document 016), E2E testing infrastructure
  (Document 017), and deployment/launch hardening (Document 018).

## 9. Dependencies

No new external runtime dependency is introduced beyond what Documents 001 and 003 already
establish: the bot's ORM/persistence layer for bot-owned state ("Postgres/SQLite via an ORM, or a
managed KV store," per `BOT_ARCHITECTURE.md`), the shared embed-builder module, the shared
button-based pagination component, the persistent-component/custom-ID pattern, and the
confirmation-component pattern (Confirm/Cancel with a visible summary and a timeout, per
`COMMAND_CATALOGUE.md`'s UI standards and `OLD_TO_NEW_MIGRATION_MATRIX.md` M7). Specific notes:

- **`/poll` auto-close** does not require BullMQ (reserved for Document 015's job infrastructure —
  see §8c). It is implemented as a **lazily-evaluated** `closesAt` timestamp stored on the poll row:
  every vote attempt and every render checks `now >= closesAt` and treats the poll as closed if so
  (never trusting only an in-process timer, consistent with `BOT_ARCHITECTURE.md`'s "never trust
  cached/in-memory state as a system of record" posture). An optional best-effort in-process
  `setTimeout` may proactively post final results at expiry as a UX nicety, but correctness never
  depends on it — a bot restart before expiry still yields a correctly-closed poll on the next
  interaction because closure is derived from the stored timestamp, not from surviving timer state.
- **Roadmap poster display:** no new library — the poster file the client supplied is attached to
  the `/roadmap` response via Discord's native file-attachment API (the same mechanism `discord.js`
  already provides for any embed image), not fetched from an external URL and not regenerated as a
  chart. This directly satisfies the assignment's requirement that the poster is shown "as an
  attached image/embed, not fabricated data."
- **Reaction-role components:** uses the same persistent-component/custom-ID pattern already
  required by `BOT_ARCHITECTURE.md` for ticket and suggestion buttons — no new component technology.

## 10. Bot-owned persistence

Per `BOT_DATA_OWNERSHIP.md`, every table below is **Bot**-authoritative with zero Slice product/
financial/identity meaning outside Discord. Schema sketches (field lists, not code):

| Table | Key fields | Notes |
|---|---|---|
| `ReactionRolePanel` | `id`, `guildId`, `channelId`, `messageId`, `title`, `createdByDiscordId`, `createdAt` | One row per posted role-selection message |
| `ReactionRoleOption` | `id`, `panelId` (FK), `label`, `roleId`, `notificationCategory` (nullable), `activatesOnFeature` (nullable text, e.g. "New Listing alerts"), `sortOrder` | `notificationCategory`/`activatesOnFeature` populate the "will activate once [feature] launches" label (§7); role grant/revoke itself uses Discord's own membership state as the source of truth — no separate grant-ledger table needed since toggling is idempotent against Discord's own API |
| `GuildLevelConfig` | `guildId` (PK), `xpPerMessage`, `cooldownSeconds`, `levelUpChannelId`, `levelCurve` | Admin-editable per guild |
| `MemberLevel` | `guildId`, `discordUserId` (composite PK), `xp`, `level`, `totalMessages`, `lastXpAwardedAt` | Message-based; `lastXpAwardedAt` enforces the anti-spam cooldown |
| `Suggestion` | `id`, `guildId`, `authorDiscordId`, `text`, `status` (`SUBMITTED`\|`APPROVED`\|`REJECTED`\|`PLANNED`\|`COMPLETED`), `channelId`, `messageId`, `createdAt`, `updatedAt` | M5 |
| `SuggestionStatusHistory` | `id`, `suggestionId` (FK), `fromStatus`, `toStatus`, `actorDiscordId`, `reason` (nullable), `changedAt` | Durable across restarts, fixing the old bot's "reactions silently vanish" gap |
| `Giveaway` | `id`, `guildId`, `channelId`, `messageId`, `prize`, `winnerCount`, `hostDiscordId`, `startedAt`, `endsAt`, `status` (`ACTIVE`\|`ENDED`\|`CANCELLED`), `lastWinnerDiscordIds` | M4; `endsAt` is what Document 015's `giveaway-tick` job reads |
| `GiveawayEntry` | `id`, `giveawayId` (FK), `discordUserId`, `enteredAt`; unique `(giveawayId, discordUserId)` | Button-based, not reaction-index-based; uniqueness makes double-entry a no-op |
| `Poll` | `id`, `guildId`, `channelId`, `messageId`, `question`, `options` (ordered list), `multiSelect` (bool), `createdByDiscordId`, `closesAt`, `status` (`OPEN`\|`CLOSED`) | §9 lazy-close design |
| `PollVote` | `id`, `pollId` (FK), `discordUserId`, `optionIndex`; unique `(pollId, discordUserId, optionIndex)` | Single-select polls also enforce unique `(pollId, discordUserId)` at the application layer |
| `FaqEntry` | `id`, `guildId`, `slug`, `question`, `answer`, `sortOrder`, `lastEditedByDiscordId`, `lastEditedAt` | Admin-editable via command, not a redeploy-only config file |
| `RoadmapConfig` | `id`, `guildId`, `posterAttachmentRef`, `milestones` (ordered list of `{title, percentComplete, status}`), `lastEditedByDiscordId`, `lastEditedAt` | `percentComplete` is always admin-set, never derived from a live metric, per BOT_PRODUCT_SPEC.md ("keep progress values admin-editable, not tied to any live metric") |
| `MemeSubmission` | `id`, `guildId`, `messageId`, `authorDiscordId`, `submittedAt`, `weekOf` | Tracks eligible posts in the configured `#memes` channel |
| `MemeWeekWinner` | `id`, `guildId`, `weekOf`, `messageId`, `authorDiscordId`, `reactionCount`, `announcedAt` | Written by the weekly tally job |

## 11. Slice API dependencies

**None.** This document introduces zero calls to Slice's HTTP API — the table required by the
template is empty by design. Every feature in §7 is backed exclusively by the bot-owned persistence
in §10, consistent with every relevant `BOT_DATA_OWNERSHIP.md` row being tagged **Bot**. The one
feature that *references* a future Slice-dependent capability (reaction-role "notification
category" options, §7) still makes no Slice call today — it only renders a static, honest
"will activate once [feature] launches" label from `ReactionRoleOption.activatesOnFeature`, which is
admin-entered text, not a live query.

## 12. Commands / events / jobs delivered

From `COMMAND_CATALOGUE.md`'s "Support / community (bot-owned, no Slice dependency)" table, filtered
to this document, plus commands this document defines that are not yet itemized by name in
`COMMAND_CATALOGUE.md` (flagged below — this document is where those names are first specified,
consistent with the top-level catalogue setting boundaries and each implementation document filling
in command-level detail):

| Command / component / job | Purpose | Source |
|---|---|---|
| `/suggest` | Suggestion with status buttons | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/giveaway start` | Start a button-entry giveaway (admin-gated) | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/giveaway reroll` | Re-pick winner(s) from persisted entrants (admin-gated — fixes M4) | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/giveaway end` | Manually end early and pick winner(s) now (admin-gated — fixes M4) | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/giveaway delete` | Cancel/delete a giveaway with no winner (admin-gated — fixes M4) | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/poll` | Timed, button-based poll | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/faq` | Static platform education (view); admin subcommand to edit | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/roadmap` | Roadmap display with poster attachment (view); admin subcommand to edit milestones | `COMMAND_CATALOGUE.md` row, Impl doc 014 |
| `/roles panel` | Admin command to post/update a reaction-role panel | Named by this document; BOT_PRODUCT_SPEC.md wishlist row "`#roles` reaction roles," not yet itemized as a command name in `COMMAND_CATALOGUE.md` |
| `/level` | Show a member's XP/level (self or `member?` option) | Named by this document; BOT_PRODUCT_SPEC.md wishlist row "Leveling system," not yet itemized as a command name in `COMMAND_CATALOGUE.md` |
| `/leaderboard` | Paginated XP leaderboard | Named by this document, same wishlist row |
| Reaction-role select/button component | Toggles Discord role membership on click | Persistent component, custom-ID pattern (BOT_ARCHITECTURE.md) |
| Giveaway entry button component | Adds/records an entrant | Persistent component |
| Poll vote button component | Records/updates a vote | Persistent component |
| Suggestion status buttons (Approve/Reject/Planned/Completed) | Admin/support-role status transition | Persistent component |
| `meme-of-the-week` weekly tally | Counts the configured "vote" reaction on `#memes` submissions from the past week, announces a winner | Not in `EVENT_AND_JOB_CATALOGUE.md` today — this document adds it there as part of its documentation-update obligation (§27) |

Explicitly **not** in this table (deferred to Document 015 per §8c): the `giveaway-tick` scheduled
job itself.

## 13. Permission rules

Cited exactly from `PERMISSION_MATRIX.md`:

| Capability | Discord-side gate | Slice-side gate |
|---|---|---|
| `/suggest` submit | any verified member | none |
| `/suggest` status change | bot support/admin role | none |
| `/giveaway *` | bot admin role only, every subcommand (fixes old bot's missing checks) | none |
| `/poll`, `/faq`, `/roadmap` (view) | any member | none |
| `/roadmap`, `/faq` (edit content) | bot admin role | none |

This document extends the same pattern, consistent with `PERMISSION_MATRIX.md`'s established rows,
to the two capabilities it introduces that are not yet itemized there: **reaction-role panel
create/edit** (`/roles panel`) is gated to the bot admin role, same as `/roadmap`/`/faq` edit;
**leveling config edit** (XP-per-message, cooldown, level-up channel) is likewise bot-admin-gated;
**reaction-role toggle** (any member, no Slice-side gate, matching `/poll`/`/faq`/`/roadmap` view
rows) and **`/level`/`/leaderboard` view** (any member, no Slice-side gate) require no elevated
Discord role.

Per `PERMISSION_MATRIX.md`'s stated rule, "a Discord-side role check is always a gate, never a
substitute for the corresponding Slice-side check when a command touches Slice data" — restated here
for completeness even though **no command in this document touches Slice data** (§11), because the
same architectural principle applies going forward: if a future document ever wires the "will
activate once [feature] launches" reaction-role labels (§7) to a real Slice-backed delivery
mechanism, that day's implementation must add its own fresh Slice-side authorization check — today's
Discord-only role gate must never be assumed to already satisfy it.

## 14. Security requirements

Cited from `BOT_SECURITY_MODEL.md`:

- **§3 (custom IDs, interaction forgery):** "Custom IDs on buttons/selects/modals are opaque,
  non-guessable, bot-generated resource references (never a raw Slice user ID, email, or predictable
  sequential ID) ... Every button handler re-verifies that the interacting user matches the
  resource's owner (or has an explicit permission override) before acting." Applied here: giveaway
  entry buttons reference an opaque giveaway ID, not a sequential integer guessable across
  giveaways; poll vote buttons re-check the poll's `status`/`closesAt` server-side on every click
  (never trusting that a rendered "Vote" button implies the poll is still open); suggestion
  status-change buttons re-verify the clicking user holds the bot support/admin role at click time,
  not just at message-render time; reaction-role toggles re-verify current Discord role state before
  acting (avoids a stale double-grant race).
- **§10 (logging redaction, DM privacy):** suggestion status-change DM notifications are
  best-effort — "a failed DM (closed DMs) is handled gracefully with a one-time in-channel notice,
  not a repeated retry loop," directly reusing the pattern this section specifies for other
  best-effort DMs.
- **§11 (admin action confirmation):** "`/giveaway delete`" is a destructive, irreversible action and
  requires the shared button-based Confirm/Cancel component with a visible summary (prize, entrant
  count, host) and a timeout, per `COMMAND_CATALOGUE.md`'s "Confirmation dialogs" UI standard —
  directly addressing the fact that the old bot's `!delete` had **no permission check at all**
  (§4), let alone a confirmation step.
- This document introduces no new credential-handling surface (no Slice token, no service-account
  credential, no password) anywhere — every table in §10 stores only Discord IDs, bot-owned content,
  and timestamps.

## 15. Idempotency and rate limits

- **Reaction-role toggle:** idempotent by construction — a click either grants a role the user
  doesn't have or revokes one they do; a rapid double-click against Discord's own role-membership
  state produces at most one net change, never a duplicate grant.
- **Giveaway entry:** the `GiveawayEntry` unique constraint `(giveawayId, discordUserId)` (§10) makes
  a double-click a no-op success, mirroring the pattern `BOT_PRODUCT_SPEC.md` §4 describes for
  Slice's own watchlist add/remove.
- **Poll vote:** upsert semantics keyed on `(pollId, discordUserId[, optionIndex for multi-select])`
  — re-voting changes the prior vote rather than adding a second one for single-select polls.
- **`/suggest` submission:** rate-limited per user (a short cooldown, mirroring the ticket-open
  cooldown pattern from `OLD_TO_NEW_MIGRATION_MATRIX.md` M1: "cooldown on repeated open attempts") to
  prevent spam submissions.
- **Leveling XP award:** `MemberLevel.lastXpAwardedAt` enforces `GuildLevelConfig.cooldownSeconds`
  between XP-earning messages per user, preventing spam-farming (this is the anti-spam control, not
  a Slice-facing rate limit, since no Slice call is made).
- **`/giveaway reroll` / `/giveaway end` / `/giveaway delete`:** no idempotency key is needed (single
  admin action, not a retried mutation against an external API), but each checks the giveaway's
  current `status` first — ending an already-`ENDED` giveaway or deleting an already-`CANCELLED` one
  returns a friendly no-op message (§17) rather than re-posting winners or erroring.
- **`/faq` / `/roadmap` edits:** no rate limit beyond the admin-role gate; each edit is logged (§16).
- None of the above uses Slice's `Idempotency-Key` header (`BOT_SECURITY_MODEL.md` §5,
  `BOT_ARCHITECTURE.md`) because no command in this document calls Slice's API.

## 16. Audit requirements

Per `BOT_DATA_OWNERSHIP.md`, none of this document's mutations are Slice mutations, so **nothing
here writes a Slice `AuditEvent`.** Every action below is logged to the bot's own operational log
(structured logging, per `BOT_ARCHITECTURE.md`'s conventions), with actor Discord ID, action,
target, and timestamp:

- Suggestion status changes (actor, suggestion ID, from-status, to-status, optional reason) — also
  persisted as durable `SuggestionStatusHistory` rows (§10), not just a log line, so status history
  is queryable, not just observable in logs.
- Giveaway lifecycle: start (host, prize, winner count, `endsAt`), reroll (actor, prior winners, new
  winners), end (actor, final winners), delete (actor, reason if type-to-confirm text captures one).
- `/faq` and `/roadmap` content edits (actor, field changed, before/after values) — supports rollback
  and accountability for admin-editable public-facing content.
- Reaction-role panel creation/edits (actor, panel, options added/removed/changed).
- `GuildLevelConfig` changes (actor, field, before/after).
- `meme-of-the-week` job runs (week, winner, reaction count, guild) for troubleshooting if a weekly
  announcement misfires.

## 17. Error behavior

Since this document makes zero Slice API calls, only two `ERROR_CATALOGUE.md` rows apply directly:

| Slice error code | Applies here? | Discord-facing message |
|---|---|---|
| Unrecognized/unexpected error | Yes (generic catch-all for any bug in this document's own logic) | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." — never the raw exception, per the rule inherited from the old bot's `ErrorHandler.py` generic-branch leak (`OLD_TO_NEW_MIGRATION_MATRIX.md` M6) |
| Discord-side failure (missing permissions to act, channel deleted, DM closed) | Yes | Specific, context-aware message per case, not the generic message |

This document's own bot-owned error cases, following `ERROR_CATALOGUE.md`'s friendly-copy pattern
("specific, friendly copy for expected errors ... not-found, not-linked, rate-limited"):

- Poll already closed → "This poll has closed — check the results above."
- Already voted (single-select, re-vote allowed) → silently updates the vote, no error.
- Giveaway already ended/cancelled (on `reroll`/`end`/`delete`) → "This giveaway has already
  {ended/been cancelled} — nothing to do here."
- Giveaway has zero entrants (on `end`/`reroll`) → "No one entered this giveaway — nothing to draw
  from."
- Suggestion not found (stale/deleted) → "Couldn't find that suggestion — it may have been removed."
- FAQ/roadmap edit with empty/invalid content → "That input doesn't look right — check the details
  and try again," matching `ERROR_CATALOGUE.md`'s `VALIDATION_FAILED` copy exactly for consistency,
  even though this is a bot-owned validation, not a Slice one.
- Reaction-role panel posted to a channel the bot cannot post persistent components in → a
  Discord-side failure message naming the specific permission missing (e.g., "I don't have
  permission to post embeds/manage roles in that channel").

## 18. Interaction UX

- **`/suggest`:** slash command opens a modal (single multi-line text field) per
  `COMMAND_CATALOGUE.md`'s "Modals: used for any multi-field input ... instead of the old bot's
  blocking `wait_for` message prompts." On submit, posts a public embed (author, text, status badge
  "Submitted") with Approve/Reject/Planned/Completed buttons visible only to admins/support role
  (clicking as a non-privileged member returns an ephemeral "you don't have permission" error).
  Status changes update the embed's status badge in place and append to `SuggestionStatusHistory`.
- **`/giveaway start`:** modal or options for prize, winner count, duration; posts a public embed
  (prize, winner count, host, entrant count starting at 0, `endsAt` as `<t:unix:R>`) with a single
  "Enter" button. Entering updates the visible entrant count. `/giveaway reroll`/`end`/`delete` are
  ephemeral admin-only responses that also update or remove the public embed as appropriate; `delete`
  requires the shared Confirm/Cancel component (§14) before executing.
- **`/poll`:** public embed (question, one button per option, live vote-count/percentage per option,
  `closesAt` as `<t:unix:R>`). Voting updates the embed in place. Once closed (lazily evaluated, §9),
  buttons render disabled and the embed footer reads "Closed" with final results.
- **`/faq`:** public embed listing FAQ entries (paginated if long, using the shared pagination
  component) or a specific entry via an autocompleted `topic` option. `/faq edit` (admin-only) is
  ephemeral and uses a modal for question/answer text.
- **`/roadmap`:** public embed with milestone list (title, status, admin-set progress) and the
  supplied poster image attached to the same response. `/roadmap edit` (admin-only) is ephemeral,
  modal-based per milestone.
- **`/roles panel`:** admin-only, ephemeral confirmation of what will be posted; the resulting public
  message is a persistent component (select menu if more than five options, otherwise buttons, per
  Discord UX convention) that survives bot restarts (custom-ID pattern, §14).
- **`/level`, `/leaderboard`:** public embeds (a level "card" is a comparative/social feature, not
  private data, consistent with `COMMAND_CATALOGUE.md`'s "public for anything genuinely public ...
  community features" default) — `/leaderboard` uses the shared pagination component.
- **Errors:** the single consistent "something went wrong" embed style for unexpected failures; the
  specific friendly messages from §17 for expected ones — no raw exception text anywhere, per
  `COMMAND_CATALOGUE.md`'s "Errors" UI standard.
- **Loading:** every command in this document defers immediately (Discord's 3-second ack window)
  before any persistence read/write, per `COMMAND_CATALOGUE.md`'s "Loading/deferred responses"
  standard, even though none of this document's calls are network-bound to Slice — deferring is
  still correct practice for consistency and to accommodate slower persistence-layer calls.

## 19. Implementation file plan

- `src/commands/community/suggest.ts` — `/suggest` command definition and handler.
- `src/commands/community/giveaway.ts` — `/giveaway start/reroll/end/delete` command definitions and
  handlers.
- `src/commands/community/poll.ts` — `/poll` command definition and handler.
- `src/commands/community/faq.ts` — `/faq` (view/edit) command definitions and handlers.
- `src/commands/community/roadmap.ts` — `/roadmap` (view/edit) command definitions and handlers.
- `src/commands/community/roles.ts` — `/roles panel` command definition and handler.
- `src/commands/community/level.ts` — `/level`, `/leaderboard` command definitions and handlers.
- `src/services/suggestionService.ts` — suggestion CRUD/status-transition logic (pure functions where
  possible, for unit testing).
- `src/services/giveawayService.ts` — giveaway CRUD, entry recording, and the standalone
  winner-selection function (exported for reuse by Document 015's `giveaway-tick` job).
- `src/services/pollService.ts` — poll CRUD, vote recording, lazy-close evaluation.
- `src/services/levelingService.ts` — XP award/cooldown/level-curve logic, leaderboard query.
- `src/services/reactionRoleService.ts` — panel CRUD, role-toggle logic.
- `src/services/faqService.ts`, `src/services/roadmapService.ts` — content CRUD.
- `src/services/memeService.ts` — submission tracking and the `meme-of-the-week` weekly tally
  handler (registered as a scheduled job by whatever job-runner wiring Documents 001/015 establish;
  this document defines the handler function, not the scheduler registration itself).
- `src/components/giveawayEntryButton.ts`, `src/components/pollVoteButton.ts`,
  `src/components/suggestionStatusButtons.ts`, `src/components/reactionRolePanel.ts` — persistent
  component handlers, custom-ID encode/decode helpers.
- `src/persistence/models/community.ts` — schema definitions for every table in §10 (using whatever
  ORM Document 001 establishes).
- `test/unit/community/*.test.ts`, `test/integration/community/*.test.ts` — per §21–§23.

## 20. Numbered implementation steps

1. Confirm Documents 001 and 003 have closed (command registry, interaction router, embed builder,
   pagination component, persistent-component pattern, confirmation-component pattern, bot-owned ORM
   all exist and are usable).
2. Add the persistence schema from §10 as a migration against the bot's own database.
3. Implement `suggestionService.ts`: create, list, status-transition (with `SuggestionStatusHistory`
   append), DM-notify-best-effort.
4. Implement `/suggest` command + modal + status buttons; wire to `suggestionService`.
5. Implement `giveawayService.ts`: create, add-entrant (idempotent), the winner-selection function
   (accepting an arbitrary, unordered entrant list and returning N unique winners), end/reroll/delete
   state transitions.
6. Write the winner-selection unit tests first (arbitrary entry order, zero entrants, fewer entrants
   than `winnerCount`) before wiring the command, per the TEST_STRATEGY.md regression callout.
7. Implement `/giveaway start/reroll/end/delete` with the admin-role gate on every subcommand (no
   exceptions) and the entry button component.
8. Implement `pollService.ts` (create, vote upsert, lazy-close evaluation) and `/poll` + vote button.
9. Implement `faqService.ts`/`roadmapService.ts` (CRUD) and `/faq`/`/roadmap` (view + admin edit),
   including the roadmap poster file-attachment handling.
10. Implement `reactionRoleService.ts` and `/roles panel` + the persistent select/button component,
    including the "will activate once [feature] launches" label rendering for notification-category
    options.
11. Implement `levelingService.ts` (XP award on `messageCreate` with cooldown check, level curve,
    level-up announcement) and `/level`/`/leaderboard`.
12. Implement `memeService.ts` submission tracking (`messageCreate` scoped to the configured
    `#memes` channel) and the `meme-of-the-week` weekly handler function.
13. Wire every command's permission gate exactly per §13, every error case per §17, and every audit
    log line per §16.
14. Add this document's new job (`meme-of-the-week`) to `EVENT_AND_JOB_CATALOGUE.md` per §27.
15. Run the full verification suite (§25) and complete manual QA (§24) in a real dev guild.

## 21. Unit tests

- Giveaway winner-selection function: arbitrary/shuffled entrant order produces a stable,
  order-independent result set of the requested size; zero entrants returns an empty/error result,
  not a crash; fewer entrants than `winnerCount` returns all entrants, not a duplicate pick —
  directly regression-testing the old bot's reaction-index-0 assumption per TEST_STRATEGY.md.
- Permission pre-check for every `/giveaway` subcommand: a non-admin caller is rejected for
  `start`, `reroll`, `end`, **and** `delete` (the specific finding this document fixes).
- Suggestion status-transition logic: every valid transition persists a `SuggestionStatusHistory`
  row; an invalid actor (non-admin/support) is rejected before any state change.
- Poll lazy-close evaluation: a poll with `closesAt` in the past is treated as closed on both vote
  and render paths, regardless of whether any in-process timer fired.
- Leveling cooldown/curve: XP is not awarded twice within `cooldownSeconds`; level computed
  correctly at curve boundaries.
- Reaction-role toggle logic: idempotent under a simulated double-click.
- Error-mapping: every bot-owned error case in §17 maps to its exact specified copy, never a raw
  exception string (mirrors `TEST_STRATEGY.md`'s "error-mapping (every code in ERROR_CATALOGUE.md)"
  unit-test requirement, extended to this document's own bot-owned error cases).

## 22. Integration tests

Per `TEST_STRATEGY.md`, "Bot-owned persistence (tickets, moderation, giveaways, suggestions) tested
against a real disposable bot database" — extended here to every table in §10:

- Giveaway lifecycle end-to-end against a disposable bot database: start → multiple entries
  (including a duplicate-entry attempt, asserting no duplicate row) → reroll → end, asserting final
  persisted state and winner set.
- Suggestion lifecycle: submit → each status transition → assert `SuggestionStatusHistory` is
  append-only and durable (simulating a process restart between steps, per
  `BOT_ARCHITECTURE.md`'s "survive bot restarts" requirement for persistent components).
- Poll lifecycle: create → multiple votes including a vote change → simulate time passing `closesAt`
  → assert closed state and correct final tallies without relying on an in-process timer having run.
- FAQ/roadmap edit persistence and audit-log correlation.
- Reaction-role panel persistence: panel/options survive a simulated restart; toggling reflects in
  both the bot's own records (if any) and the correct Discord role-membership call.
- Leveling: XP accrual across multiple simulated messages respecting the cooldown; leaderboard
  ordering correctness at scale (many members).

## 23. Discord interaction tests

Per `TEST_STRATEGY.md`'s "simulated interaction payloads ... run through the real interaction router
and command handlers, asserting the exact response shape ... without a live Discord gateway
connection":

- `/suggest`, `/giveaway *`, `/poll`, `/faq`, `/roadmap`, `/roles panel`, `/level`, `/leaderboard`:
  simulated slash-command invocations asserting correct ephemeral/public flag, embed fields, and
  component presence per §18.
- Button/select interactions: giveaway entry, poll vote, suggestion status change, reaction-role
  toggle — simulated component-interaction payloads asserting correct permission gating (a
  non-admin's suggestion-status-button click is rejected; any member's giveaway-entry click
  succeeds) and correct state mutation.
- **Persistent-component restart test** (per `TEST_STRATEGY.md`): a giveaway entry button's and a
  reaction-role panel's custom IDs are round-tripped through a simulated bot restart to confirm
  state is recoverable from bot-owned persistence, not memory — directly exercising the fix over the
  old bot's "reactions silently vanish if bot restarts" gap (§4).
- Modal submission tests: `/suggest`, `/faq edit`, `/roadmap edit` modal payloads produce the
  expected persisted record.

## 24. Manual QA checklist

- [ ] `/suggest` submit → Approve/Reject/Planned/Completed each tested; requester receives a
      best-effort DM on each transition; a closed-DM user gets a one-time in-channel notice instead.
- [ ] `/giveaway start` as admin succeeds; `/giveaway reroll`/`end`/`delete` as a **non-admin** are
      all rejected (explicitly re-verify this for all three, since this is the exact bug being
      fixed).
- [ ] Giveaway entry button: double-click does not double-enter; entrant count updates visibly;
      winner selection with 1 entrant, 0 entrants, and entrants < winner count all behave sanely.
- [ ] `/giveaway delete` requires the Confirm/Cancel step and cannot be single-clicked to completion.
- [ ] `/poll` with a short `closesAt`: vote, change vote, confirm results lock at expiry and buttons
      disable; confirm a poll interacted with *after* a simulated bot restart still closes correctly
      at its stored `closesAt`.
- [ ] `/faq` view (paginated if long) and `/faq edit` (admin-only) round-trip correctly; a non-admin
      cannot edit.
- [ ] `/roadmap` displays the actual supplied poster as an attached image (not a placeholder, not a
      generated chart) alongside admin-set milestone progress; `/roadmap edit` (admin-only) updates
      correctly.
- [ ] `/roles panel` posts a component-based (button/select) panel, never raw emoji reactions;
      clicking toggles the correct Discord role; a "notification category" option visibly shows the
      "will activate once [feature] launches" label and does not claim to deliver anything today.
- [ ] Leveling: send qualifying messages, confirm XP accrues respecting the cooldown (rapid messages
      within the cooldown window do not over-award); level-up posts to the configured channel;
      `/level` and `/leaderboard` render correctly, including pagination at scale.
- [ ] `#memes` weekly tally: post a submission, react with the configured vote emoji from multiple
      accounts, confirm the weekly job (run manually/on-demand for QA) picks the correct top
      submission and posts an announcement.
- [ ] Error QA: trigger each bot-owned error case in §17 (vote on a closed poll, reroll an already-
      ended giveaway, edit FAQ as a non-admin) and confirm the exact specified friendly copy, never a
      raw exception.
- [ ] Security QA: grep bot logs and Discord message history in the test guild after a full pass to
      confirm no internal ID, stack trace, or database error string ever leaked into a user-facing
      message or log line beyond what §16 specifies.

## 25. Verification commands

```
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

## 26. Completion checklist

- [ ] Reaction roles ship as a component-based (button/select) persistent panel, never raw reactions.
- [ ] Leveling/XP is message-based, cooldown-protected, and its leaderboard is bot-owned with zero
      Slice dependency.
- [ ] `/suggest` status is durable across a simulated bot restart, with full status history and
      best-effort requester notification.
- [ ] Every `/giveaway` subcommand (`start`, `reroll`, `end`, `delete`) is admin-gated with no
      exceptions — the specific missing-permission-decorator finding from
      `OLD_BOT_FEATURE_INVENTORY.md` row 26 is fixed and verified by an explicit non-admin-rejection
      test on all four subcommands.
- [ ] Giveaway winner selection makes no assumption about entry order (fixes the reaction-index-0
      bug) and is covered by the TEST_STRATEGY.md-mandated regression test.
- [ ] The giveaway persistence schema and winner-selection function are stable and exported in a form
      Document 015's `giveaway-tick` job can consume without modification.
- [ ] `/poll` closes correctly based on a stored `closesAt`, never solely on in-process timer state.
- [ ] `/faq` and `/roadmap` are admin-editable through bot commands, not redeploy-only config.
- [ ] `/roadmap` displays the actual supplied poster as a real file attachment, never fabricated
      progress data or a placeholder chart.
- [ ] `#memes` weekly tally runs as a reaction-count job and announces a winner.
- [ ] No Slice API call exists anywhere in this document's code (§11 verified true in the actual
      implementation, not just in this document).
- [ ] No raw exception, stack trace, or internal ID ever reaches a user-facing Discord message.
- [ ] Every destructive action (`/giveaway delete`) requires explicit confirmation.
- [ ] All unit, integration, and Discord-interaction tests in §21–§23 pass; manual QA checklist (§24)
      is fully executed in a real dev guild.
- [ ] §8's out-of-scope items are verified absent from the actual implementation (no wallet button,
      no "Buy" button, no trade feed, no undervalued scanner, no news feed, no prediction game).

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md`: flip Document 014's status row from NOT STARTED
  to COMPLETE once the completion checklist (§26) is actually satisfied — not before.
- `CURRENT_STATE.md`: update to reflect that Track C's community/engagement feature set has landed,
  and that Document 015 is now unblocked for its `giveaway-tick` job specifically.
- `EVENT_AND_JOB_CATALOGUE.md`: add the `meme-of-the-week` job row (cadence: weekly, purpose: tally
  the configured "vote" reaction on `#memes` submissions from the past week and announce a winner,
  backend calls: none, failure handling: skip and log, matching the table's existing style) — this
  job does not exist in that document today and this document introduces it.
- `COMMAND_CATALOGUE.md`: add explicit rows for `/roles panel`, `/level`, and `/leaderboard` (§12),
  since they are not itemized there today.
- `MASTER_CHECKLIST.md`: no change required to the "Review completion" section (that section
  describes this build guide's own authoring, already complete); the "Production readiness" section
  remains unchecked until this document's own work actually lands, per its own stated scope.

## 28. Final report format

The implementer's completion report for this document must state, in order: (1) which of §26's
checklist items are satisfied, verbatim, with a yes/no per item; (2) confirmation that
`/giveaway reroll`, `/giveaway end`, and `/giveaway delete` were each explicitly tested against a
non-admin caller and rejected (the specific security fix this document exists to deliver); (3) the
exact verification commands run (§25) and their pass/fail outcome; (4) a list of every file created
or modified (§19); (5) confirmation that zero Slice API calls exist anywhere in the delivered code;
(6) any deviation from this document's scope (§7/§8), with justification; (7) the documentation
updates actually made (§27); (8) explicit confirmation that no work on Document 015 or any other
document was begun.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
