# Old-to-new migration plan

Full specifications for every feature marked PRESERVE, REWRITE, MERGE, or REPLACE in
`SLICE_FEATURE_COMPATIBILITY.md`. Nothing here is vague — each entry states exact new command/UI,
Slice API dependency (or explicit "none — bot-owned"), bot persistence dependency, permissions, rate
limits, audit, tests, and completion criteria.

## M1 — Ticket system

- **Old:** `cogs/Tickets.py` — reaction-category picker, MySQL `tickets`/`ticket_blacklist`,
  `chat_exporter` transcripts, admin lifecycle commands.
- **Old source files:** `cogs/Tickets.py`, `cogs/Functions.py` (helpers), `cogs/SQL.py` (persistence).
- **Old behavior:** works, but reaction-based (fragile across restarts), no rate limit on creation,
  transcripts have no retention/redaction policy.
- **Problems:** raw MySQL with a hardcoded credential pattern (must not be repeated); no PII policy on
  transcripts; channel-name collisions possible.
- **New command/UI:** `/support open` → select menu of categories (Account Issues, Investment
  Issues, Withdrawal, Deposit, Report User, Partnership, General Support) → modal for initial
  description → private thread/channel created with buttons: Claim, Add Member, Remove Member,
  Escalate, Close.
- **Slice API dependency:** none required to open a ticket. **Optional:** if the user has a linked
  Slice account, the ticket may show read-only context (`GET /v1/me` equivalent, admin-scoped) —
  never write anything to Slice from a ticket.
- **Bot persistence dependency:** ticket channel/thread ID, category, opener Discord ID, claim state,
  status, transcript storage location, blacklist list — all bot-owned (see BOT_DATA_OWNERSHIP.md).
- **Permissions:** open = any verified member; claim/close/add/remove/escalate = support-role members;
  blacklist = admin.
- **Rate limits:** max 1 open ticket per user at a time (mirrors old bot's `currentTickets` check);
  cooldown on repeated open attempts.
- **Audit:** every lifecycle transition (open/claim/close/blacklist) logged to a private bot audit
  channel with actor, target, reason, timestamp.
- **Tests:** unit tests for category-to-permission-overwrite mapping, closure inactivity timer, blacklist
  enforcement; integration test opening/closing a real test-guild ticket; manual QA script covering
  every category.
- **Completion criteria:** all seven categories functional, transcript generated and stored on close,
  auto-close fires after the configured inactivity window, blacklist enforced, no raw exception text
  ever reaches a user-facing message.

## M2 — Moderation suite (kick/ban/mute/purge/warn/lockdown/unlock/banlist/unban)

- **Old:** `cogs/Moderation.py`, `cogs/AutoModerator.py`.
- **Old behavior:** functional but `unban` matches on the deprecated `name#discriminator` format
  (broken against modern Discord usernames); tempmute expiry scheduler was not found in the reviewed
  code (possibly non-functional); auto-mod blanket-deletes any URL from non-staff.
- **New command/UI:** `/mod kick`, `/mod ban`, `/mod mute`, `/mod unmute`, `/mod purge`, `/mod warn`,
  `/mod warns`, `/mod lockdown`, `/mod unlock`, `/mod banlist`, `/mod unban` (accepts user ID or
  modern `@username`, not the deprecated discriminator format).
- **Slice API dependency:** none — pure Discord moderation, explicitly **not** linked to Slice
  account status (see BOT_SECURITY_MODEL.md).
- **Bot persistence dependency:** punishment history, active mutes with real scheduled expiry (a
  proper job, not a dangling DB row), lockdown state.
- **Permissions:** mirror Discord's own kick/ban permission model; `administrator`-gated actions stay
  admin-gated.
- **Rate limits:** none beyond Discord's own API limits; purge capped at Discord's 100-message bulk
  delete ceiling with an explicit "cannot delete messages older than 14 days" notice (fixing the old
  bot's silent gap).
- **Audit:** every action to a private mod-log channel; warn/unwarn additionally queryable via
  `/mod warns <user>`.
- **Tests:** unit tests for mute-expiry scheduling, unban username-resolution; manual QA for each
  command against a test guild.
- **Completion criteria:** tempmute reliably auto-expires via a real job (fixing the suspected old-bot
  gap); unban works against current Discord usernames; auto-mod uses an explicit allow/deny domain
  list instead of blanket deletion.

## M3 — Auto-moderation (invite/link filter)

- **Old:** `cogs/AutoModerator.py` — regex mute-on-invite (15 min), blanket link deletion with one
  hardcoded exempt channel.
- **New design:** keep invite-spam auto-mute (configurable duration, configurable exempt
  channels/roles). Replace blanket link deletion with a configurable per-guild allow/deny domain
  list that explicitly allows the Slice web app's own domain; non-listed links are flagged for
  moderator review (a report to the mod-log channel with a delete/allow button) rather than silently
  deleted.
- **Slice API dependency:** none.
- **Bot persistence dependency:** allow/deny domain list, per-guild config.
- **Permissions:** admin-configurable; auto-action applies to all non-staff.
- **Audit:** every auto-action logged with the triggering message content (redacted of any token-like
  strings) to the mod-log channel.
- **Completion criteria:** legitimate Slice links are never deleted; unknown links are held for review,
  not destroyed.

## M4 — Giveaways

- **Old:** `cogs/Giveaways.py` — MySQL-backed, reaction entry, 30s update loop, `reroll`/`end`/`delete`
  missing permission checks, winner-selection assumes reaction index 0.
- **New command/UI:** `/giveaway start`, `/giveaway reroll`, `/giveaway end`, `/giveaway delete` — all
  admin-gated (fixing the missing-check bug), button-based entry (not reaction-index assumption).
- **Slice API dependency:** none.
- **Bot persistence dependency:** giveaway state (bot-owned).
- **Permissions:** `administrator` on every subcommand, no exceptions.
- **Rate limits:** none beyond Discord API limits.
- **Audit:** start/end/reroll/delete logged with actor.
- **Tests:** unit test winner-selection against an arbitrary reaction/entry set (no index-0
  assumption); permission-check test for every subcommand.
- **Completion criteria:** no subcommand is reachable by a non-admin; winner selection is correct
  regardless of entry order.

## M5 — Suggestions

- **Old:** `cogs/Main.py` `!suggest` — reaction tick/cross, no persisted status.
- **New command/UI:** `/suggest <text>` posts an embed with Approve/Reject/Planned/Completed buttons
  (admin-only interaction), status persisted and shown on the embed, requester notified on status
  change (DM, best-effort).
- **Slice API dependency:** none.
- **Bot persistence dependency:** suggestion ID, text, author, status, status-history — bot-owned.
- **Permissions:** submit = any verified member; status change = admin/support role.
- **Audit:** status-change history retained per suggestion.
- **Completion criteria:** status is durable across bot restarts (unlike the old reaction-based
  version), requester is notified on every status change.

## M6 — Error handling

- **Old:** `cogs/ErrorHandler.py` — maps known exception types to embeds, but the generic branch
  echoes raw exception text to the end user.
- **New design:** central interaction-error middleware. Known Slice API error codes (from
  ERROR_CATALOGUE.md) map to specific, friendly, branded messages. Unknown/unexpected errors map to a
  single generic "something went wrong, we've logged it" message with a request ID the user can quote
  to support — **never** the raw exception, stack trace, or backend response body.
- **Slice API dependency:** consumes Slice's own error envelope (`code`, `message`, correlation ID)
  from Docs 001/004–008.
- **Bot persistence dependency:** none (errors logged to structured logging/observability, not a DB).
- **Permissions:** N/A (applies to every command).
- **Audit:** full error detail logged server-side (bot's own logs) with the Slice request ID for
  correlation; only the safe summary reaches Discord.
- **Completion criteria:** no code path can put a raw exception message, stack trace, SQL fragment, or
  backend response body into a user-facing Discord message.

## M7 — Shared embed builder / confirmation helper pattern

- **Old:** `cogs/Functions.py` — config-driven embed templates, token substitution,
  `reactionConfirmation`/`waitResponse` blocking helpers.
- **New design:** typed embed-builder module matching BOT_PRODUCT_SPEC.md's UI standards (brand
  colors, footer, timestamp conventions) — see COMMAND_CATALOGUE.md "UI standards." Confirmation
  flows use Discord buttons with a mandatory timeout (never an unbounded `wait_for`), not reactions.
- **Slice API dependency:** none.
- **Bot persistence dependency:** none beyond in-memory interaction state with a TTL.
- **Completion criteria:** every destructive/mutating command uses the shared confirmation component;
  no command can hang indefinitely waiting for a reply.

## Explicitly not migrated (REMOVE, no replacement)

Bot bootstrap/cog-loader pattern, `!addrole`/`!removerole`, `!memberall`, custom help-gating,
gang/faction leaderboard and strikes, Tebex store lookup/payments/giftcards, reaction-based DM
verification (replaced by the real account-linking flow, not a like-for-like port), trailer/perk
approval workflow (replaced conceptually by Slice's own real submission-review system, once exposed
read-only), raw MySQL connection pool. Rationale for each is in `OLD_BOT_FEATURE_INVENTORY.md` and
`SLICE_FEATURE_COMPATIBILITY.md`.
