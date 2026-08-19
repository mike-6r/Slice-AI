# 011 — Support/ticket migration

## 1. Metadata

- **Document number:** 011
- **Title:** Support/ticket migration
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 001 (Repository reconciliation and bot foundation — bot-owned
  database/ORM, config loader, base project structure), 003 (Discord interaction framework and
  command registry — interaction router, command registry, permission pre-check module, persistent
  component/button handling, embed-builder and pagination helpers)
- **Blocks (this build guide):** 015 (Background jobs and scheduled digests) — specifically the
  `ticket-inactivity-sweep` job (`EVENT_AND_JOB_CATALOGUE.md`), which reads the `Ticket` table's
  `lastActivityAt`/inactivity-window fields this document creates. Document 015 cannot schedule
  ticket auto-close until this document's schema and lifecycle exist.
- **Slice backend dependency:** none. This is a fully bot-owned feature per
  `IMPLEMENTATION_ORDER.md` Track C ("fully bot-owned, no Slice dependency at all: 011, 012, 014 in
  parallel; then 015's ticket/mute/giveaway jobs") and `BOT_DATA_OWNERSHIP.md` (ticket
  channel/thread mapping, claim state, blacklist, and transcripts are all bot-owned rows with "no
  Slice equivalent exists or should exist").
- **Can start today:** Yes.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend; the Discord bot being built
from this guide is a **companion client** to Slice — it calls Slice's HTTP API for anything
Slice-authoritative, never becomes a second backend, and never duplicates a Slice business rule
(`docs/qa/README.md` ground rules, `BOT_ARCHITECTURE.md`). This document is one of three fully bot-owned,
Slice-independent tracks (`IMPLEMENTATION_ORDER.md` Track C: 011/012/014) that can proceed in
parallel with the account-linking track once Documents 001–003 land. It rebuilds, as a native
Discord.js v14 slash-command/component feature with its own persistence, the ticket system that
existed in the old Python bot ("Infria," `discord.py 1.6.0`) as `cogs/Tickets.py` — an unrelated
FiveM/GTA roleplay community bot reviewed solely as a source of reusable Discord-infrastructure
patterns, never as a Slice feature blueprint (`docs/qa/README.md`, `OLD_BOT_FEATURE_INVENTORY.md`). Slice
itself has no ticketing concept anywhere in its backend documents; this document introduces none on
Slice's side and requires no Slice API work to close.

## 3. Current implementation audit

Nothing ticket-specific exists yet. Per `CURRENT_STATE.md`, **no Discord bot code exists anywhere** —
no repository, no `package.json`, no `src/`. This document's prerequisites are the *outputs* of
Documents 001 and 003, not anything already built:

- From Document 001 (once closed): the bot's project skeleton, typed config loader, bot-owned
  database connection and ORM/migration tooling, structured logging, `/health`/`/ready` endpoints.
- From Document 003 (once closed): the interaction router, declarative command registry, permission
  pre-check module, persistent-component (button/select/modal) handling with opaque custom IDs, the
  shared embed-builder module, and the shared pagination component.

This document assumes both close first (per its own "Depends on") and adds nothing to either; it
only consumes the scaffolding they provide. There is no partially-built ticket code to audit.

## 4. Old bot behavior migrated

From `OLD_BOT_FEATURE_INVENTORY.md`:

- **Row 16 — Ticket creation (reaction → category → Q&A intake)**, `cogs/Tickets.py`. Migration
  status: **REWRITE**. Old behavior: a reaction on a ticket-intake message opened a private channel
  per category with role overwrites, then asked configured questions via blocking `bot.wait_for`
  calls and posted the collected Q&A. Works, but reaction-based (state doesn't survive a bot
  restart), no rate limit on ticket creation beyond a blacklist check, plain-text unvalidated
  answers, and channel-name collisions were possible between members sharing a display-name prefix.
  The inventory explicitly maps this to the client's requested `#create-a-ticket` feature.
- **Row 17 — Ticket lifecycle (close/delete/raise/lower/add/remove/blacklist)**, `cogs/Tickets.py`.
  Migration status: **REWRITE**. Old behavior: `!close`/`!delete`/`!forcedelete`/`!raise`/`!lower`/
  `!add`/`!remove`/`!blacklist`/`!unblacklist`, transcript export via `chat_exporter` on close, a
  MySQL row update, then channel deletion. Close had a 10-second cancel window keyed on "the next
  message in-channel," which a bot/webhook message could incorrectly trigger. Transcripts were
  posted to a logs channel with no retention or redaction policy despite potentially containing
  personal detail from the Q&A answers.
- **Row 8 — Bug reports**, `!bugreport` (`cogs/Main.py`). Migration status: **MERGE** into the
  ticket system — the inventory states the `General Support`/an `Account Issues`-adjacent category
  covers this use case; no separate bug-report command is built.

From `OLD_TO_NEW_MIGRATION_MATRIX.md`, **M1 — Ticket system** is the authoritative rewrite spec this
document implements. Its stated new command/UI (`/support open` → category select → modal for
initial description → private thread/channel with Claim/Add Member/Remove Member/Escalate/Close
buttons), Slice dependency ("none required to open a ticket... optional read-only context, never a
write"), bot persistence dependency (channel/thread ID, category, opener, claim state, status,
transcript location, blacklist), permissions (open = any verified member; claim/close/add/
remove/escalate = support-role members; blacklist = admin), rate limit (max 1 open ticket per user,
cooldown on repeat attempts), audit (every lifecycle transition to a private bot audit channel), and
completion criteria (all seven categories functional, transcript stored on close, auto-close fires
after inactivity, blacklist enforced, no raw exception text reaches a user) are carried forward
exactly as written there — this document does not re-decide any of it, only implements it. **M6 —
Error handling** and **M7 — Shared embed builder/confirmation helper pattern** are also directly
relevant here: ticket lifecycle actions must use the shared button-with-timeout confirmation
component (never a blocking `wait_for`), and any unexpected failure must use the generic
"something went wrong, logged, here's a reference" pattern, never the raw exception text the old
bot's `ErrorHandler.py` leaked in its generic branch.

**Explicitly not carried forward:** the reaction-based entry point, in-memory/message-state tracking
of ticket lifecycle, the blocking `wait_for` Q&A intake, `chat_exporter` itself (a Python-only
library — not portable, and not reused per `BOT_ARCHITECTURE.md`'s "behavioral migration, not code
migration" rule), and the hardcoded raw MySQL connection pool pattern from `cogs/SQL.py` (flagged as
a critical security finding in `OLD_BOT_FEATURE_INVENTORY.md` — plaintext production credentials in
source, import-time blocking DB connection with no reconnect logic).

## 5. Slice features supported

**None.** This document touches no Slice feature area and has no Slice backend dependency
(`IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md`: "Slice backend dependency: none" for Document 011).
Per `BOT_DATA_OWNERSHIP.md`, tickets have "no Slice equivalent exists or should exist" and Slice's
own backend documents contain no ticketing concept anywhere.

**Optional, non-blocking exception:** `OLD_TO_NEW_MIGRATION_MATRIX.md` M1 allows a ticket to
*display* read-only context about the opener's linked Slice account ("if the user has a linked
Slice account, the ticket may show read-only context... never write anything to Slice from a
ticket"). The only endpoint that could supply this is `GET /v1/bot/discord-link/:discordUserId`
(`BOT_API_REQUIREMENTS.md` §1), a **bot-only service endpoint that does not exist yet** — it is
gated behind Documents 004/005 (account-linking) closing on a real Slice environment. This document
does **not** depend on that endpoint to close: the linked-account context line in the ticket-open
embed is optional and MUST degrade to simply omitting the line (never an error, never a placeholder
like "unknown") if account linking isn't available yet. No user PII from Slice flows into ticket
content unless the user themselves shares it in the ticket conversation.

## 6. Files to read before starting

- `docs/qa/README.md`, `CURRENT_STATE.md` — overall guide state and ground rules.
- `OLD_BOT_FEATURE_INVENTORY.md` rows 8, 16, 17 — old ticket behavior and its problems (source of
  truth for what must change).
- `OLD_TO_NEW_MIGRATION_MATRIX.md` M1, M6, M7 — the authoritative rewrite spec, error-handling
  pattern, and confirmation-component pattern this document implements.
- `BOT_PRODUCT_SPEC.md` §9 ("Support and tickets") and the client-wishlist table row for
  `#create-a-ticket` — category list and the "never a raw Slice user ID or email in a channel name"
  rule.
- `BOT_ARCHITECTURE.md` — command registry, persistent-component pattern, embed-builder,
  confirmation dialogs, BullMQ job technology (for the auto-close job's *interface*, built in 015),
  interaction-response/defer conventions.
- `BOT_SECURITY_MODEL.md` §10 ("Logging redaction, DM privacy, ticket privacy"), §11 ("Admin action
  confirmation").
- `BOT_DATA_OWNERSHIP.md` — the ticket-related rows (channel/thread mapping, claim state,
  blacklist, transcripts) and the "if ambiguous, default to Slice unless zero product/financial/
  identity meaning outside Discord" rule (tickets are the explicit exception).
- `COMMAND_CATALOGUE.md` — the `/support open`, `/support close` + claim/add/remove/escalate row,
  and the "UI standards" section (ephemeral defaults, buttons not reactions, modals not `wait_for`,
  confirmation dialogs, type-to-confirm for highest-impact actions).
- `PERMISSION_MATRIX.md` — the two `/support` rows.
- `ERROR_CATALOGUE.md` — the shared error-mapping pattern and tone (this document adds ticket-only
  error cases in the same style, §17 below).
- `EVENT_AND_JOB_CATALOGUE.md` — the `ticket-inactivity-sweep` job row (built in Doc 015, but this
  document must leave the schema fields it needs in place).
- `TEST_STRATEGY.md` — general unit/integration/Discord-interaction/manual-QA approach this
  document's test sections (§21–24) follow.
- Implementation Documents 001 and 003 (once they exist and close) — the actual bot-owned DB/ORM
  choice, command-registry API, and persistent-component API this document builds directly against.

## 7. Strict scope

- `/support open` slash command: category select menu with the seven categories from
  `BOT_PRODUCT_SPEC.md` §9 / `OLD_TO_NEW_MIGRATION_MATRIX.md` M1 — **Account Issues, Investment
  Issues, Withdrawal, Deposit, Report User, Partnership, General Support** — followed by a modal
  capturing a short initial description, then creation of a private thread or channel (per-guild
  configurable, see below) visible only to the opener, claimed staff, and anyone explicitly added.
- Ticket lifecycle buttons posted in the ticket channel/thread itself: **Claim**, **Add Member**,
  **Remove Member**, **Escalate**, **Close** — persistent custom IDs (survive bot restarts) per
  `BOT_ARCHITECTURE.md`.
- `/support close` slash command as an equivalent entry point to the Close button, with an optional
  transcript archive generated and stored in the bot's own persistence/storage on close.
- `/support blacklist add|remove|list` admin-only subcommands (the "blacklist" action named in the
  `/support` lifecycle row of `PERMISSION_MATRIX.md`).
- A minimal per-guild `/support config` admin-only command to set: the ticket parent
  category/container, the support role, the transcript/audit log channel, and (for Document 015's
  future consumption) an inactivity-window value in minutes. **Note:** this exact command is not
  separately enumerated as its own row in `COMMAND_CATALOGUE.md` today — that file's "Support /
  community" table lists `/support open` and `/support close` + buttons at a summary level only.
  This document adds `/support config` as a necessary administrative surface under the same
  "`/support` lifecycle... bot support/admin role" permission gate already defined in
  `PERMISSION_MATRIX.md`, and flags in §27 that `COMMAND_CATALOGUE.md` should be updated to list it
  explicitly.
- Bot-owned persistence for ticket state, participants, blacklist, per-guild ticket configuration,
  and a local ticket audit log (schema in §10).
- Rate limiting: at most one open ticket per Discord user per guild at a time; a cooldown on repeat
  open attempts.
- A local (bot-owned) audit trail of every lifecycle transition, and best-effort posting of the same
  to a private, admin-configured audit/log channel.
- The schema fields (`lastActivityAt`, inactivity-window config) that Document 015's
  `ticket-inactivity-sweep` job will read — **not** the job itself.

## 8. Out of scope

- The `ticket-inactivity-sweep` scheduled job (auto-close on inactivity) — that is Document 015's
  scope; this document only leaves the data it needs in place (per its "Blocks" relationship above).
- Any Slice API call, read or write, as a hard dependency — the optional linked-account context line
  described in §5 is best-effort and degrades silently.
- Any wallet/deposit/withdrawal/investment **business logic**. The "Investment Issues," "Withdrawal,"
  and "Deposit" categories are routing labels for a human support conversation only — they do not
  imply Slice has live trading, wallet, or fund-movement capability. Per `BOT_SECURITY_MODEL.md`
  ("Explicit non-goals... no wallet-connect, deposit/withdrawal... command is designed here — Doc
  016 is DEFERRED") and `PERMISSION_MATRIX.md` ("Any wallet/deposit/withdrawal/KYC action — never
  exposed"), no button, command, or automation in this document moves money, checks a balance, or
  performs any wallet/trading action. Staff handling these categories today will, in practice, often
  be telling the user those features aren't live yet — that is a support-content decision for the
  staff team, not something this document builds workflow around.
- Bug-report intake as a *separate* command (`!bugreport`'s replacement) — per
  `OLD_BOT_FEATURE_INVENTORY.md` row 8, it is merged into the General Support / Account Issues
  ticket categories, not rebuilt as its own command.
- Any moderation action triggered from a ticket (e.g., a "ban this user from a Report User ticket"
  shortcut) — moderation is Document 012's scope; a ticket can only link/reference a case, never
  invoke `/mod *` directly.
- Any Suggestions/Giveaways/Polls functionality — Document 014's scope, even though `#bugreport`
  once lived alongside `!suggest` in the old bot's `Main.py`.
- Any change to `COMMAND_CATALOGUE.md`, `PERMISSION_MATRIX.md`, or other top-level guide documents —
  this document only *flags* the `/support config` gap in §27; editing those files is out of scope
  for this document (see the assignment's own scope: one output file only).
- Push/DM delivery of ticket notifications beyond best-effort DMs already described in
  `BOT_SECURITY_MODEL.md` §10 (no retry loop, no guaranteed delivery).

## 9. Dependencies

- **discord.js v14+** — inherited from Document 001/003's foundation; this document adds no new
  Discord-library dependency.
- **Bot-owned relational persistence** — inherited from Document 001's ORM/database decision
  (`BOT_ARCHITECTURE.md`: "Postgres/SQLite via an ORM, or a managed KV store"). This document
  assumes whatever Document 001 finalizes and defines its own tables (§10) against that choice; it
  does not itself choose or introduce a new database technology.
- **BullMQ** — no new job is implemented here (§8), but this document's schema must be shaped so
  Document 015 can add a `ticket-inactivity-sweep` job against it without a follow-up migration
  (per `EVENT_AND_JOB_CATALOGUE.md`, BullMQ is already the chosen technology, matching Slice's own
  Doc 017 design).
- **Transcript generation.** The old bot used `chat_exporter`, a Python-only library not portable to
  TypeScript and not reused per `BOT_ARCHITECTURE.md`'s "behavioral migration, not code migration"
  rule. This document specifies the requirement (a durable, retrievable per-ticket transcript
  produced on close) and a concrete minimum approach — a bot-owned TypeScript module that renders
  the channel/thread's message history (author display name, timestamp, message content, and
  attachment URLs *as captured at export time*) to a stored Markdown or JSON document — but the
  exact storage backend (a DB blob/text column vs. an object-storage bucket) is a Document
  001-level infrastructure decision this document inherits rather than makes. **Known limitation to
  document, not solve here:** Discord CDN attachment URLs expire; a transcript capturing only the
  URL (not re-hosting the binary) will lose attachment content over time unless Document 001's
  chosen storage also re-uploads attachments — flagged as a decision for whoever picks up this
  document, not silently assumed either way.
- No new third-party service dependency (no external ticketing SaaS, no email-to-ticket bridge) —
  the whole feature is Discord-native and bot-owned.

## 10. Bot-owned persistence

All tables below are entirely bot-owned (`BOT_DATA_OWNERSHIP.md`: "Ticket channel/thread mapping,
claim state, blacklist... Ticket transcripts... Suggestion state machine... all Bot"). None of them
mirror or duplicate any Slice table; none are ever queried by or written to Slice.

```text
Ticket
  id                  PK
  guildId             Discord guild ID
  channelId           Discord thread/channel ID (unique)
  category            enum: ACCOUNT_ISSUES | INVESTMENT_ISSUES | WITHDRAWAL | DEPOSIT |
                       REPORT_USER | PARTNERSHIP | GENERAL_SUPPORT
  openerDiscordId      Discord user ID of the opener
  openerDescription    initial modal text (opener-authored only; never Slice data)
  status               enum: OPEN | CLAIMED | ESCALATED | CLOSED
  claimedByDiscordId    nullable, Discord user ID of claiming staff member
  escalated            boolean, default false
  createdAt            timestamp
  lastActivityAt        timestamp, updated on every message/lifecycle action (feeds Doc 015's job)
  closedAt              nullable timestamp
  closedByDiscordId      nullable, Discord user ID (or system, for future auto-close)
  closeReason           nullable text
  transcriptRef          nullable, storage reference/key for the generated transcript
  linkedSliceContextShown boolean, default false — records only whether the optional §5 context
                          line was shown, never any Slice user ID/email/content itself

TicketParticipant
  id            PK
  ticketId       FK -> Ticket
  discordUserId   Discord user ID added beyond opener/claimant
  addedByDiscordId Discord user ID of the staff member who added them
  addedAt         timestamp
  removedAt        nullable timestamp (soft-removed, not deleted, for audit continuity)

TicketBlacklist
  id             PK
  guildId         Discord guild ID
  discordUserId    Discord user ID
  reason           text
  addedByDiscordId  Discord user ID (admin)
  addedAt           timestamp
  removedAt          nullable timestamp (soft-removed on unblacklist)

TicketGuildConfig
  guildId              PK, Discord guild ID
  parentCategoryId       Discord category-channel ID new ticket channels/threads are created under
  supportRoleId          Discord role ID granted claim/add/remove/escalate/close permission
  auditLogChannelId       Discord channel ID lifecycle events are best-effort posted to
  inactivityWindowMinutes integer, default value TBD-by-admin-per-guild (consumed by Doc 015's job,
                           not read by anything in this document)
  openTicketCooldownSeconds integer, cooldown between a user's ticket-open attempts

TicketAuditLog
  id             PK
  ticketId        FK -> Ticket (nullable — blacklist add/remove is not ticket-scoped)
  guildId          Discord guild ID
  actorDiscordId    Discord user ID who performed the action
  action            enum: OPEN | CLAIM | ADD_MEMBER | REMOVE_MEMBER | ESCALATE | CLOSE |
                     BLACKLIST_ADD | BLACKLIST_REMOVE
  targetDiscordId    nullable, Discord user ID acted upon (e.g., added/removed member,
                     blacklisted user)
  reason              nullable text
  createdAt            timestamp
```

`Ticket.lastActivityAt` and `TicketGuildConfig.inactivityWindowMinutes` exist specifically so
Document 015 can implement `ticket-inactivity-sweep` without a schema change — this document does
not read them for any purpose of its own beyond writing/maintaining `lastActivityAt`.

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Used by | Required for this document to close? |
|---|---|---|---|
| `GET /v1/bot/discord-link/:discordUserId` | bot-only service endpoint, **proposed, not yet built** (gated behind Documents 004/005 closing on a real Slice environment) | Optional linked-account context line in the ticket-open embed (§5, §18) | **No.** This document ships and closes with this line simply omitted if the endpoint is unavailable. No retry loop, no error surfaced to the user for its absence. |

No other Slice endpoint is called anywhere in this document's scope. This is the complete table —
it is intentionally short, matching the "Slice backend dependency: none" status in
`IMPLEMENTATION_ORDER.md`/`PROMPT_INDEX.md`.

## 12. Commands / events / jobs delivered

Filtered from `COMMAND_CATALOGUE.md`'s "Support / community (bot-owned, no Slice dependency)"
table, plus the `/support config` and `/support blacklist` additions flagged in §7/§27:

| Command / component | Purpose | Permission | Ephemeral/public | Old-bot predecessor | Impl doc |
|---|---|---|---|---|---|
| `/support open` | Open a category ticket | any verified member | ephemeral confirmation; ticket channel itself is private, not public | `cogs/Tickets.py` reaction flow (concept only) | 011 |
| `/support close` | Close the current ticket, optional transcript | bot support/admin role (or opener, for their own ticket, per §13) | ephemeral confirmation | `!close` | 011 |
| Claim button | Claim an open ticket | bot support/admin role | in-channel, visible to ticket participants | `!raise`/lifecycle concept | 011 |
| Add Member button | Add a Discord user to the ticket | bot support/admin role | in-channel | `!add` | 011 |
| Remove Member button | Remove a Discord user from the ticket | bot support/admin role | in-channel | `!remove` | 011 |
| Escalate button | Mark a ticket escalated (tier change) | bot support/admin role | in-channel | `!raise` | 011 |
| Close button | Same as `/support close`, in-channel entry point | bot support/admin role (or opener, per §13) | in-channel, then ephemeral confirmation | `!close` | 011 |
| `/support blacklist add\|remove\|list` | Manage the guild's ticket blacklist | bot admin role | ephemeral | `!blacklist`/`!unblacklist` | 011 |
| `/support config` | Set per-guild ticket parent category, support role, audit-log channel, inactivity window, open cooldown | bot admin role | ephemeral | none (new; old bot used static `configs/config.json`) | 011 |

No event or scheduled job is delivered by this document (§8) — `EVENT_AND_JOB_CATALOGUE.md`'s
`ticket-inactivity-sweep` row remains Document 015's to build.

## 13. Permission rules

From `PERMISSION_MATRIX.md`:

| Capability | Discord-side gate | Slice-side gate |
|---|---|---|
| `/support open` | any verified member | none |
| `/support` lifecycle (claim/close/add/remove/escalate/blacklist) | bot support/admin role | none |

Applied concretely in this document:

- `/support open`, and the initial category/modal flow: any member who is not on the guild's
  `TicketBlacklist` (§10) and does not already have an `OPEN`/`CLAIMED`/`ESCALATED` ticket in that
  guild (§15 rate limit).
- Claim / Add Member / Remove Member / Escalate: requires the bot-defined support role
  (`TicketGuildConfig.supportRoleId`) or the bot admin role. A member with only the opener's own
  identity cannot self-claim.
- Close: the support/admin role, **or** the ticket's own opener closing their own ticket (a
  reasonable UX allowance mirroring the old bot's "close is member-usable" behavior from
  `OLD_BOT_FEATURE_INVENTORY.md` row 17 — but without that row's fragile "next channel message
  cancels closure" pattern; see §18).
- Blacklist add/remove/list and `/support config`: bot **admin** role specifically, not the broader
  support role — mirrors `OLD_TO_NEW_MIGRATION_MATRIX.md` M1's "blacklist = admin" line, which is a
  narrower gate than the general lifecycle row.
- **This entire feature has no Slice-side gate at all**, and that absence is itself deliberate, not
  an oversight: per `BOT_DATA_OWNERSHIP.md` and `BOT_SECURITY_MODEL.md` §6, Discord role possession
  is never treated as proof of Slice permission — but the converse also holds here: because tickets
  are 100% bot-owned with no Slice data or action involved, there is no Slice permission to check in
  the first place. If the optional §5 linked-account context line is shown, that read uses the
  bot's own service-account credential (per `BOT_ARCHITECTURE.md` §"Slice API client"), not the
  requesting user's own Slice permission — it is a display-only enrichment, never an authorization
  input for anything in this document.

## 14. Security requirements

From `BOT_SECURITY_MODEL.md`:

- **§10 (Logging redaction, DM privacy, ticket privacy):** "Ticket channels are visible only to the
  opener, claimed staff, and anyone explicitly added — never broadly visible by default, matching
  (and improving on) the old bot's overwrite model." This document implements that exactly via
  per-channel/thread permission overwrites set at creation time and updated on Add/Remove Member.
  "No log line, embed, or transcript ever contains a raw email address, password, token, or session
  cookie" — applies directly to the transcript-export module in §9/§19: the transcript renderer
  must never include the optional §5 linked-account context beyond a display name/handle (never an
  email, user ID, or token), and structured logs for ticket actions redact known-sensitive field
  names by default. "DMs... are best-effort; a failed DM (closed DMs) is handled gracefully with a
  one-time in-channel notice, not a repeated retry loop" — applies to any best-effort DM sent on
  ticket close/status change.
- **§11 (Admin action confirmation):** "Every destructive or high-impact bot command (ban, ticket
  force-delete, role mutation if ever exposed, blacklist) requires an explicit type-to-confirm or
  button-confirm step with a visible summary of the action before execution — no single-click
  destructive actions." Applies directly to: Close (channel/thread deletion or archival),
  `/support blacklist add`, and `/support config` changes that affect an active category (all must
  show a Confirm/Cancel button pair with a summary before executing).
- **§3 (Custom IDs):** "Custom IDs on buttons/selects/modals are opaque, non-guessable, bot-generated
  resource references (never a raw Slice user ID, email, or predictable sequential ID)... Every
  button handler re-verifies that the interacting user matches the resource's owner (or has an
  explicit permission override) before acting." Every lifecycle button's custom ID encodes only the
  bot-owned `Ticket.id`, never anything Slice-identifying; every handler re-checks the interacting
  user's role/ownership against the current `Ticket` row at click time, not at message-render time
  (so a permission change between render and click is respected).
- **Channel naming (`BOT_PRODUCT_SPEC.md` §9):** "Ticket channel names never include a raw Slice
  user ID or email; if linked-account context is shown inside the ticket, it's the display
  name/handle only, fetched fresh via `GET /v1/me` equivalent (admin-scoped lookup) at ticket-open
  time, not cached indefinitely." Channel/thread names are derived from the Discord display name
  and category only (e.g., a slugified `ticket-general-support-<discordUsername>` pattern with a
  disambiguating suffix on collision — a direct fix of the old bot's row-16 collision problem).
- **No credential/secret risk class carried forward:** unlike `cogs/SQL.py`'s hardcoded production
  MySQL credentials (`OLD_BOT_FEATURE_INVENTORY.md`, top-of-document critical finding), this
  document's persistence uses whatever connection-string/secret-manager pattern Document 001
  establishes — no credential of any kind is hardcoded in ticket-feature source.

## 15. Idempotency and rate limits

No Slice API mutation exists in this document's scope, so no Slice `Idempotency-Key` header is
relevant here. Idempotency instead applies to the bot's own mutating actions, mirroring the intent
behind `BOT_ARCHITECTURE.md`'s idempotency-key convention:

- **Claim:** the first successful claim sets `Ticket.claimedByDiscordId` and updates the button
  state (disabled/relabeled "Claimed by X"). A second click by the same staff member is a no-op
  success ("You've already claimed this ticket"). A click by a *different* staff member is rejected
  with a friendly "already claimed by X" message, never a raw constraint-violation error.
- **Add/Remove Member:** re-adding an already-present participant, or removing a not-present one,
  is a no-op success (mirrors the watchlist add/remove idempotency pattern described in
  `BOT_PRODUCT_SPEC.md` §4, applied here as a bot-owned equivalent).
- **Escalate:** idempotent — escalating an already-escalated ticket is a no-op success.
- **Close:** guarded by the confirmation step in §14; a double-click after confirmation is
  prevented by immediately disabling the Close button on first successful close and rejecting a
  second close attempt on an already-`CLOSED` ticket with "This ticket is already closed."
- **Open:** rate-limited to **one open ticket per Discord user per guild** at a time (mirrors the
  old bot's `currentTickets` check per `OLD_TO_NEW_MIGRATION_MATRIX.md` M1) — a user attempting a
  second `/support open` while one is `OPEN`/`CLAIMED`/`ESCALATED` is told which existing ticket to
  use instead, not silently allowed to open a duplicate. In addition, `TicketGuildConfig`'s
  `openTicketCooldownSeconds` (admin-configurable, no fixed value mandated here) applies a cooldown
  between the *close* of one ticket and a user's ability to open another, to blunt open/close spam;
  the exact default is a product decision left to whoever configures the guild, not hardcoded in
  this document.
- **Blacklist enforcement:** a blacklisted user's `/support open` attempt is rejected before any
  channel/thread is created — no partial ticket is ever left behind.

## 16. Audit requirements

Per `OLD_TO_NEW_MIGRATION_MATRIX.md` M1: "every lifecycle transition (open/claim/close/blacklist)
logged to a private bot audit channel with actor, target, reason, timestamp." This document
implements that as two layers, matching `BOT_DATA_OWNERSHIP.md`'s "Audit events... Bot writes its
own *correlated* local log entry, never a competing audit record" principle applied to a feature
that has nothing to correlate against on the Slice side:

1. **Durable record:** every OPEN/CLAIM/ADD_MEMBER/REMOVE_MEMBER/ESCALATE/CLOSE/BLACKLIST_ADD/
   BLACKLIST_REMOVE action writes a `TicketAuditLog` row (actor, target if applicable, reason if
   applicable, timestamp) — this is the bot's own system of record, since (unlike every other
   document in this build guide) there is no Slice `AuditEvent` to defer to.
2. **Operational visibility:** the same event is best-effort posted as a compact embed to the
   guild's `TicketGuildConfig.auditLogChannelId`, if configured. A failure to post (e.g., channel
   deleted, missing permission) is logged to the bot's own structured logs and does not block or
   fail the underlying lifecycle action — the durable `TicketAuditLog` row remains the source of
   truth regardless of whether the channel post succeeded.
- No PII beyond Discord identifiers (user ID, display name) and staff-authored reason text is ever
  written to either layer; the opener's ticket description and conversation content are not
  duplicated into the audit log (they remain in the channel/thread and, on close, the transcript).

## 17. Error behavior

This document introduces no new Slice error codes (no Slice call is required, §11), so
`ERROR_CATALOGUE.md`'s Slice-code rows do not apply directly except as the tone/pattern template and
its two generic rows, both directly relevant:

- `ERROR_CATALOGUE.md`'s "Discord-side failure (missing permissions to act, channel deleted, DM
  closed)" row → "Specific, context-aware message per case (never the generic bot-error message for
  a Discord-side, not Slice-side, failure)" — applies to e.g. a failed channel-create due to missing
  bot permission in the parent category, or a closed-DM notification failure.
- `ERROR_CATALOGUE.md`'s "Unrecognized/unexpected error" row → "Something went wrong on our end —
  we've logged it (ref: `{requestId}`)." — applies verbatim to any unexpected failure in this
  document's own code (e.g., a DB write failure), following the same rule inherited from the old
  bot's known bug (M6): the generic branch never interpolates the raw exception/stack trace into a
  user-facing string.

New, ticket-specific error cases this document defines (same tone, same "never raw internals" rule):

| Case | User-facing message |
|---|---|
| User already has an open ticket in this guild | "You already have an open ticket: {channel mention}. Close it before opening another." |
| User is blacklisted from tickets | "You're currently unable to open a support ticket. Contact a moderator if you believe this is a mistake." |
| Open attempted during the post-close cooldown | "You can open another ticket in {remaining time}." |
| Claim attempted on an already-claimed ticket (by someone else) | "This ticket is already claimed by {claimant}." |
| Add Member on a user already in the ticket | "{user} is already part of this ticket." (no-op success, not an error) |
| Remove Member on a user not in the ticket | "{user} isn't part of this ticket." (no-op success, not an error) |
| Close attempted on an already-closed ticket | "This ticket is already closed." |
| Action attempted by a non-support-role, non-opener member | "You don't have permission to do that." (matches `ERROR_CATALOGUE.md`'s `FORBIDDEN` copy exactly, for consistency) |
| Transcript generation fails on close | Close still succeeds; the confirmation message adds "Transcript couldn't be generated — the ticket is closed, but no transcript was saved. This has been logged." — never blocks closure on a transcript failure. |
| Optional §5 linked-account lookup fails/unavailable | Silent omission of that embed line — never shown as an error to the ticket opener. |

## 18. Interaction UX

**`/support open`:**
1. User runs `/support open`. Bot defers ephemerally (respecting the 3-second ack window per
   `BOT_ARCHITECTURE.md`).
2. If blacklisted or already has an open ticket, respond ephemerally with the matching §17 message
   and stop.
3. Otherwise, present an ephemeral select menu: "What do you need help with?" with the seven
   categories as options (Account Issues, Investment Issues, Withdrawal, Deposit, Report User,
   Partnership, General Support), each with a short one-line description.
4. On selection, open a modal: a single required multi-line text field, "Briefly describe your
   issue" (character-limited to Discord's modal field maximum).
5. On modal submit, create a private thread or channel (per `TicketGuildConfig`, guild-configurable
   which of the two) under the configured parent category, named
   `ticket-<category-slug>-<discord-username>` (with a numeric suffix on collision), visible only to
   the opener, the support role, and the bot.
6. Post an opening embed in the new channel/thread: category, opener mention, the modal description,
   creation timestamp (Discord relative-timestamp markdown), and — only if available (§5) — a single
   "Linked Slice account: {display name}" line, omitted entirely otherwise. Footer: plain "Slice"
   footer per `COMMAND_CATALOGUE.md`'s UI standards (no fabricated data-source claim, since this is
   bot-owned content).
7. Below the embed: Claim / Add Member / Remove Member / Escalate / Close buttons (Add/Remove/
   Escalate/Close disabled or hidden for non-support-role viewers, per Discord's own
   component-visibility limits — the bot still re-checks permission server-side on click regardless
   of what's rendered, §14).
8. Respond to the original ephemeral interaction with a confirmation and a link/mention to the new
   channel/thread.

**Lifecycle buttons (Claim/Add Member/Remove Member/Escalate):**
- Claim: immediate action (no confirmation needed — low-risk, reversible by another claim/unclaim
  flow if ever added), updates the embed/button state in place.
- Add Member / Remove Member: opens a short user-select component (or modal with a user mention
  field if a native user-select isn't available in the given context), then applies the channel
  permission overwrite and posts a compact "added/removed by {actor}" line in-channel.
- Escalate: button-confirm (per §14) with a short reason modal, then updates `Ticket.escalated` and
  visibly marks the embed (e.g., a red accent color and "ESCALATED" tag), and best-effort pings the
  support role.

**Close (button or `/support close`):**
1. Button-confirm dialog: "Close this ticket? A transcript will be generated." with Confirm/Cancel
   and a short timeout (per `BOT_SECURITY_MODEL.md` §11 and `COMMAND_CATALOGUE.md`'s "Confirmation
   dialogs" standard) — this replaces the old bot's fragile "next channel message cancels closure"
   pattern (`OLD_BOT_FEATURE_INVENTORY.md` row 17) with an explicit, unambiguous button click.
2. On confirm: generate the transcript (§9), store it, update `Ticket.status = CLOSED`, disable all
   buttons, post a final "Closed by {actor} — transcript saved" line, and archive or delete the
   channel/thread per `TicketGuildConfig` (guild-configurable — archival preferred over hard
   deletion, to keep the transcript link’s channel context recoverable for a period, but either is a
   valid per-guild choice this document supports rather than mandates).
3. Best-effort DM to the opener: "Your support ticket has been closed." — single attempt, no retry
   loop, silent on DM failure beyond a one-time in-channel note if the close actor is present to see
   it (`BOT_SECURITY_MODEL.md` §10).

**`/support blacklist add|remove|list` and `/support config`:** standard ephemeral admin commands
using the shared embed-builder and, for `add`, the same button-confirm pattern as Close/Escalate
(per §14's "blacklist" example).

**Errors:** every case in §17 renders as a single consistent ephemeral embed matching
`COMMAND_CATALOGUE.md`'s "Errors" UI standard — friendly copy for expected cases, the generic
"something went wrong... ref" embed for anything unexpected, never raw exception text.

## 19. Implementation file plan

```text
src/commands/support/
  open.ts            — /support open command handler (category select + modal orchestration)
  close.ts            — /support close command handler
  blacklist.ts          — /support blacklist add|remove|list
  config.ts              — /support config
src/components/support/
  buttons.ts               — Claim/Add Member/Remove Member/Escalate/Close button handlers
  selects.ts                 — category select menu, user-select for add/remove
  modals.ts                    — initial-description modal, escalate-reason modal
src/services/
  ticketService.ts               — application-service layer: open/claim/add/remove/escalate/close
                                    orchestration, rate-limit/blacklist checks, calls the repository
                                    and transcript modules; no Discord.js types leak past this layer
  ticketTranscriptService.ts        — renders a channel/thread's message history to a stored
                                       Markdown/JSON transcript document (§9)
src/persistence/
  ticket.repository.ts                — typed CRUD over Ticket, TicketParticipant, TicketBlacklist,
                                         TicketGuildConfig, TicketAuditLog (§10 schema)
  migrations/0xx_create_ticket_tables.ts — schema migration for the tables in §10 (exact numbering
                                            depends on Document 001's migration sequence so far)
src/errors/
  ticketErrors.ts                       — typed error classes for the §17 ticket-specific cases,
                                           mapped to user-facing copy by the shared error-mapping
                                           middleware from Document 003/M6
```

## 20. Numbered implementation steps

1. Confirm Documents 001 and 003 have closed; pull their command-registry, persistent-component, and
   ORM/migration conventions rather than inventing new ones.
2. Write the `TicketGuildConfig`, `Ticket`, `TicketParticipant`, `TicketBlacklist`, and
   `TicketAuditLog` migrations per §10; run them against the bot's dev database.
3. Implement `ticket.repository.ts` with typed methods for every operation §12's commands/buttons
   need (create ticket, find open ticket for user, claim, add/remove participant, escalate, close,
   blacklist add/remove/list, config get/set, audit-log append).
4. Implement `ticketService.ts`: business rules only (one-open-ticket check, blacklist check, cooldown
   check, idempotency no-ops per §15, permission re-checks per §14) — no Discord.js objects passed
   in beyond opaque IDs, so the service layer stays unit-testable without a Discord client.
5. Implement the §5 optional linked-account context lookup as an isolated, failure-tolerant call
   (try/catch around a call to the bot's own Slice API client wrapper for
   `GET /v1/bot/discord-link/:discordUserId`, treating "endpoint not implemented"/"not linked"/
   "network error" identically as "omit the line").
6. Implement `commands/support/open.ts`: register the command, wire the category select → modal →
   channel-creation flow via `ticketService`, apply channel permission overwrites, post the opening
   embed and buttons.
7. Implement `components/support/buttons.ts` and `selects.ts`/`modals.ts` for Claim/Add
   Member/Remove Member/Escalate/Close, each re-verifying permission and current `Ticket.status`
   against the repository before acting (§14).
8. Implement `commands/support/close.ts` and the Close button path sharing one underlying
   `ticketService.closeTicket` call; wire the button-confirm dialog per §18.
9. Implement `ticketTranscriptService.ts`: fetch channel/thread message history, render to the
   chosen storage format, persist via the repository, set `Ticket.transcriptRef`; ensure a failure
   here never blocks `closeTicket` from completing (§17).
10. Implement `commands/support/blacklist.ts` and `config.ts` with the admin-only gate and
    button-confirm on `blacklist add` (§14).
11. Implement `ticketErrors.ts` and wire every §17 case through the shared error-mapping middleware
    from Document 003's interaction router.
12. Wire the local `TicketAuditLog` write and best-effort audit-channel embed post on every
    lifecycle action (§16), with the post failure isolated from the underlying action's success.
13. Write unit tests (§21), integration tests (§22), and Discord-interaction tests (§23).
14. Run the manual QA checklist (§24) in a dev guild.
15. Run every command in §25 and fix findings before marking this document's completion checklist
    (§26) satisfied.

## 21. Unit tests

- Category-to-permission-overwrite mapping: given a category and guild config, the correct channel
  overwrite set (opener, support role, bot) is produced.
- One-open-ticket-per-user enforcement: a second `open` attempt while one is active is rejected with
  the correct §17 case; a third attempt after the first is closed succeeds (respecting cooldown).
- Blacklist enforcement: a blacklisted user's open attempt is rejected before any repository write
  occurs (no partial ticket row).
- Idempotency no-ops (§15): re-claim by the same user, re-add of an existing participant, re-remove
  of an absent participant, re-escalate, and double-close all produce the documented no-op/rejection
  behavior, never a raw DB constraint error surfacing to the user.
- Permission re-check at click time: a button handler invoked with a Discord user who no longer
  holds the support role (simulated role change between render and click) is rejected, even though
  the button was originally rendered for a support-role viewer.
- Error mapping: every case in §17's table maps to its exact documented copy, and the generic/
  unrecognized branch never includes exception message text (mirrors the M6 regression test called
  out in `TEST_STRATEGY.md`'s unit-test section for the whole bot).
- Optional §5 context lookup: simulated "endpoint not implemented," "not linked," and "network
  error" responses all result in the context line being omitted, never an error path.
- Channel-name collision handling: two openers with the same Discord display name in the same
  category produce distinct, disambiguated channel names (direct regression test for the old bot's
  row-16 collision bug).

## 22. Integration tests

Per `TEST_STRATEGY.md`'s "Bot-owned persistence (tickets, moderation, giveaways, suggestions) tested
against a real disposable bot database":

- Full open → claim → add member → escalate → close lifecycle against a real disposable instance of
  the bot's own database, asserting the final `Ticket`, `TicketParticipant`, and `TicketAuditLog`
  rows match every transition.
- Blacklist add → open attempt (rejected) → blacklist remove → open attempt (succeeds), against the
  real database.
- Transcript generation and storage round-trip: create a ticket, post several messages (via a
  simulated Discord message history fetch), close it, and confirm the stored transcript document
  contains every message in order with author/timestamp/content preserved.
- Cooldown enforcement: close a ticket, attempt to reopen before `openTicketCooldownSeconds` elapses
  (rejected), then after it elapses (succeeds), against real timestamps in the disposable database.
- Because this document has no required Slice dependency (§11), no disposable Slice instance is
  needed for these tests to pass — only the optional §5 lookup would ever touch a Slice environment,
  and its tests (below) run against a fake/stubbed client, never a live one, since the endpoint
  itself doesn't exist yet.

## 23. Discord interaction tests

Per `TEST_STRATEGY.md`'s "Simulated interaction payloads... run through the real interaction router
and command handlers... without a live Discord gateway connection":

- `/support open` simulated slash-command interaction → correct ephemeral select-menu response,
  correct options (all seven categories, correct labels/order).
- Simulated select-menu choice → correct modal payload (single required text field, correct label).
- Simulated modal submit → assert a channel/thread-creation call was made with the correct
  overwrite set and the correct opening embed/button layout, and that the original interaction
  received an ephemeral confirmation.
- Simulated button clicks (Claim/Add Member/Remove Member/Escalate/Close) from both an authorized
  (support-role) and unauthorized (plain member) simulated interacting user, asserting the
  authorized path succeeds and the unauthorized path returns the exact `FORBIDDEN`-style §17 message.
- **Persistent-component restart test** (per `TEST_STRATEGY.md`'s "a button's custom ID is
  round-tripped through a simulated bot restart to confirm state is recoverable from bot-owned
  persistence, not memory"): simulate a Claim button click, simulate a bot process restart (fresh
  in-memory state, same database), then simulate a Close button click on the same custom ID and
  confirm it resolves correctly against the persisted `Ticket` row — a direct regression test for
  the old bot's reaction-based, restart-fragile ticket state (`OLD_BOT_FEATURE_INVENTORY.md` row 16).
- `/support blacklist add` and `/support config` simulated interactions, asserting the admin-only
  gate and the button-confirm step are both exercised (a simulated Cancel click must leave state
  unchanged).

## 24. Manual QA checklist

Per `TEST_STRATEGY.md`'s "Full pass through every Phase 1 command in a real test guild... ticket
lifecycle (all seven categories)":

- [ ] Open a ticket in each of the seven categories; confirm the correct channel/thread is created,
      named without collision, visible only to the opener and support role.
- [ ] Attempt to open a second ticket while one is open; confirm the rejection message and channel
      link are correct.
- [ ] Claim a ticket as a support-role member; confirm a plain member cannot claim.
- [ ] Add a member to a ticket; confirm they can now see/post in the channel; remove them; confirm
      they can no longer see it.
- [ ] Escalate a ticket; confirm the visible embed change and support-role ping.
- [ ] Close a ticket via the button; confirm the confirmation dialog, the transcript is generated
      and stored, the opener receives a best-effort DM (or, with DMs closed, no repeated retry).
- [ ] Close a ticket via `/support close`; confirm identical behavior to the button path.
- [ ] Blacklist a user, confirm their `/support open` is rejected with the correct message;
      unblacklist, confirm it now succeeds.
- [ ] Set `/support config` values (parent category, support role, audit-log channel, inactivity
      window, cooldown); confirm subsequent tickets/actions respect the new configuration.
- [ ] Confirm every lifecycle action appears in the configured audit-log channel with correct actor/
      target/reason/timestamp, and in the `TicketAuditLog` table.
- [ ] Restart the bot process mid-ticket (after opening, before closing); confirm all buttons still
      function correctly against the persisted state (no "unknown interaction"/stale-state failure).
- [ ] Security QA (per `TEST_STRATEGY.md`): grep the test guild's ticket channels, transcripts, and
      the bot's structured logs after a full pass to confirm no raw Slice token, email, or password
      ever appears anywhere in ticket-related output.
- [ ] Confirm no "Investment Issues"/"Withdrawal"/"Deposit" category ticket ever presents or implies
      a live wallet/trading action (no button, no automated response claiming money was moved).

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

(Exact commands per `TEST_STRATEGY.md`'s verification template; no ticket-specific script is needed
beyond the standard suite, since this document introduces no new toolchain.)

## 26. Completion checklist

- [ ] `Ticket`, `TicketParticipant`, `TicketBlacklist`, `TicketGuildConfig`, `TicketAuditLog` tables
      exist and migrate cleanly against Document 001's chosen database.
- [ ] `/support open` functions correctly for all seven categories, with no channel-name collisions.
- [ ] Claim/Add Member/Remove Member/Escalate/Close buttons all function, all persistent across a
      simulated bot restart, all re-verify permission at click time.
- [ ] `/support close` and the Close button both produce a stored transcript (or a logged,
      non-blocking failure per §17) and correctly close/archive the channel.
- [ ] `/support blacklist add|remove|list` and `/support config` function, admin-gated, with
      button-confirm on `blacklist add`.
- [ ] One-open-ticket-per-user, cooldown, and blacklist rate limits all enforced and tested.
- [ ] Every §17 error case produces its exact documented copy; no raw exception text, stack trace,
      or DB error string ever reaches a Discord message (unit-tested per §21).
- [ ] Every lifecycle action is written to `TicketAuditLog` and best-effort posted to the configured
      audit channel.
- [ ] The optional §5 linked-account context line degrades silently when unavailable — tested with
      the endpoint stubbed as absent.
- [ ] No Slice API call is a hard dependency of this document (§11 table has exactly one optional,
      non-blocking row).
- [ ] No Discord bot token, Slice credential, email, or password appears in any ticket channel,
      transcript, or log line (manually verified per §24's security QA step).
- [ ] `Ticket.lastActivityAt` and `TicketGuildConfig.inactivityWindowMinutes` exist and are
      populated correctly, ready for Document 015 to consume.
- [ ] All commands in §25 pass.
- [ ] Unit, integration, and Discord-interaction tests from §21–23 all pass.
- [ ] Manual QA checklist (§24) fully run in a dev guild.

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md`: flip Document 011's status row from NOT STARTED
  to COMPLETE once this document's own completion checklist (§26) is actually satisfied by real
  implementation work — not based on this specification document alone.
- `CURRENT_STATE.md`: update to note that the ticket track (011) has landed, once true, so Document
  015 knows the `ticket-inactivity-sweep` job's data dependency is ready.
- `COMMAND_CATALOGUE.md`: add explicit rows for `/support blacklist add|remove|list` and
  `/support config` to the "Support / community (bot-owned, no Slice dependency)" table — today it
  only lists `/support open` and `/support close` + the lifecycle buttons at summary level (§7).
- `BOT_PRODUCT_SPEC.md`: **flag, do not silently fix** — §9 ("Support and tickets") and the
  `#create-a-ticket` row of the client-wishlist table both currently read "See... Implementation Doc
  013" / "Ship per Implementation Doc 013." Every other cross-reference in this build guide
  (`COMMAND_CATALOGUE.md`, `IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md`, and this document's own
  assignment) consistently identifies the ticket-migration document as **011**, and Document 013 is
  actually "Admin read-only operational commands" — an unrelated, account-linking-gated document.
  This is a stale/incorrect cross-reference inside `BOT_PRODUCT_SPEC.md` that should be corrected to
  "Implementation Doc 011" by whoever next has edit authority over that file; it is called out here
  rather than corrected in place, since this document's assignment is limited to producing this one
  output file.
- `EVENT_AND_JOB_CATALOGUE.md`: no change needed — its `ticket-inactivity-sweep` row already
  correctly describes the job this document's schema enables, to be built in Document 015.

## 28. Final report format

When this document's implementation work is actually complete, the implementer's completion report
must state, in order:

1. **Scope closed:** confirmation that every item in §7 (Strict scope) was delivered and every item
   in §8 (Out of scope) was correctly *not* built.
2. **Schema delivered:** the final migration file names/paths for the five tables in §10, and
   confirmation they match the schema sketch (or an explicit list of any deviations and why).
3. **Commands/components delivered:** the table from §12, with each row marked delivered/not, and
   any deviation from the documented permission/UX behavior called out explicitly.
4. **Test results:** pass/fail summary for §21 (unit), §22 (integration), §23 (Discord interaction),
   with the exact command output of §25's verification commands attached or linked.
5. **Manual QA:** the completed checklist from §24, with any finding and its resolution.
6. **Slice dependency confirmation:** explicit statement that the §11 table's one optional row
   either was or was not exercised, and that no other Slice call exists anywhere in the delivered
   code (a `grep`-style search for any Slice API client usage inside the ticket feature's files,
   with the result pasted into the report).
7. **Documentation updates applied:** which of the §27 items were actually updated (noting that the
   `BOT_PRODUCT_SPEC.md` correction, if made, should be reported as a separate, explicitly-labeled
   change since it falls outside this document's own file).
8. **Open items / follow-ups:** anything deferred, any known limitation (e.g., the attachment-URL
   expiry limitation noted in §9), and confirmation that Document 015 now has everything it needs
   from `Ticket.lastActivityAt`/`TicketGuildConfig.inactivityWindowMinutes` to proceed.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
