# 010 — Notification commands and delivery-preference documentation

## 1. Metadata

- **Document number:** 010
- **Title:** Notification commands and delivery-preference documentation
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 005 (Account-linking Discord commands), 006 (Permission and
  authorization integration)
- **Blocks (this build guide):** none. A future push-delivery-to-Discord document is deliberately
  **not** listed in `IMPLEMENTATION_ORDER.md`'s 18 documents at all — it is a not-yet-approved,
  not-yet-numbered future document, itself blocked on Slice Doc 017 shipping plus a new `DISCORD`
  channel type in `NotificationPreference` (neither of which exists today). This document does not
  create that future document and does not reserve a number for it.
- **Slice backend dependency:** Slice Doc 008 (VERIFIED, reads/marks-read only — `Notification`
  list/unread-count/mark-read/mark-all-read endpoints only; Doc 017's outbox/delivery layer is
  NOT STARTED and is explicitly out of scope, see §8 below)
- **Can start today:** Blocked — until account linking (Implementation Documents 005 and 006) closes.
  `/notifications *` requires a linked account and a working delegated-token-exchange path
  (`BOT_API_REQUIREMENTS.md` §2) for every command in this document's scope, per
  `PERMISSION_MATRIX.md`'s `/watchlist *`, `/notifications *`, `/portfolio` row.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`); the Discord bot
being built from this guide is a **companion client** to Slice — it calls Slice's HTTP API for every
read and write, never queries Slice's Postgres/Prisma directly, and never duplicates a Slice business
rule (`docs/qa/README.md` ground rules, `BOT_ARCHITECTURE.md` "Bot must never do"). This document is
Implementation Document 010 of 18 (`IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md`), on Track A
(account-linking-dependent commands: 004 → 005 → 006 → 009 → 010 → 013). It delivers the four
`/notifications` slash commands — all pull-based, on-demand reads/mutations against Slice's existing,
VERIFIED `Notification` endpoints (Doc 008) — and formally documents, without implementing, the
delivery-preference gap: Slice has no mechanism today to push a notification to Discord, and no
document in this build guide may claim otherwise (`MASTER_CHECKLIST.md`'s accuracy rule: "never claim
notifications can push to Discord without a delivery design").

## 3. Current implementation audit

This document assumes Implementation Documents 001–006 have already closed (per
`IMPLEMENTATION_ORDER.md`'s stated dependency chain: 001 → 002 → 003 → 004 → 005/006). At the point
this document starts, the bot codebase is expected to already have, from those prior documents (not
built here, not re-verified here beyond citing their existence):

- A working Discord interaction framework and command registry (Document 003).
- A typed Slice API client with auth attachment, `Idempotency-Key` generation, request-ID
  correlation, and single-retry-on-401-for-GET-only behavior (Document 002, `BOT_ARCHITECTURE.md`).
- `/account link`, `/account unlink`, `/account status`, and the underlying
  `discordUserId ↔ userId` link resolution (Document 005).
- Fresh-per-call Slice permission/status verification and the delegated-token-exchange flow (scope
  `notifications:read` / `notifications:write` per `BOT_API_REQUIREMENTS.md` §2) (Document 006).
- The shared button-based pagination component wrapping Slice's `{items, nextCursor, hasMore}` cursor
  shape (`BOT_ARCHITECTURE.md`), already in use by at least `/asset search`/`/collector search`
  (Document 007) and `/watchlist list` (Document 009, which also depends on 005/006 and precedes 010
  on Track A).
- The shared embed-builder module, deferred-response helpers, and the centralized error-mapping layer
  (`ERROR_CATALOGUE.md`).

This document does not re-verify any of that prior work; it only adds the four `/notifications`
command handlers and this document's own gap-documentation content on top of it.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. `OLD_BOT_FEATURE_INVENTORY.md` catalogues 31
features of the old Python bot (Infria, a FiveM/GTA roleplay community bot with zero product overlap
with Slice); none of them concern notifications of any kind — the old bot's domain is
tickets/moderation/giveaways/a Tebex store, not a collectibles marketplace with a notification model.
`COMMAND_CATALOGUE.md`'s "Old-bot predecessor" column for all four `/notifications *` rows is `—`,
confirming no mapping exists. `OLD_TO_NEW_MIGRATION_MATRIX.md` contains no notification-related row.
This is new product surface, designed fresh (`OLD_BOT_FEATURE_INVENTORY.md` line 101: "...
notifications, collectors, vault) is being designed fresh").

## 5. Slice features supported

- **Slice Doc 008 (Collector/notification reads) — VERIFIED.** Per `BOT_PRODUCT_SPEC.md` §5: "Doc
  008's `Notification` read/mark-read/mark-all-read endpoints are VERIFIED." This document's scope is
  entirely within that VERIFIED surface: `GET /v1/me/notifications` (list, with `unreadOnly` filter
  and pagination), `PATCH /v1/me/notifications/:id/read` (mark one read), and
  `POST /v1/me/notifications/read-all` (mark all read) — all listed under "Already available (use
  as-is, no backend change needed)" in `BOT_API_REQUIREMENTS.md`.
- **Slice Doc 017 (outbox/jobs/realtime/notification delivery) — NOT STARTED**, per
  `project-state.json`'s `sliceBackendStatus.notStartedDocuments`. This document does **not**
  implement anything against Doc 017. It only documents, per §8 below, that Doc 017's eventual
  `NotificationPreference.channel` enum (today `IN_APP | EMAIL | ...`, per `BOT_PRODUCT_SPEC.md` §5)
  has no Discord/webhook value, and that this is the reason push delivery cannot be built in this
  document or any current document in this build guide.

## 6. Files to read before starting

- `COMMAND_CATALOGUE.md` — the four `/notifications *` rows (Phase 1 table) for exact
  options/permission/ephemeral/backend-call/error-case values, plus the "UI standards" section for
  pagination/ephemeral/footer/error conventions.
- `BOT_API_REQUIREMENTS.md` §"Already available" (the `Notification` endpoint row) and §4
  ("Notification delivery / Discord channel type") — read §4 closely; it is the authoritative source
  for the delivery-gap language used in §8 of this document.
- `EVENT_AND_JOB_CATALOGUE.md` — the `notification-delivery-consumer` job row (marked "Phase 2, not
  built") and the "Domain events referenced from Slice" list (`notification.created.v1`,
  `notification.read.v1`, unsubscribable today) — both inform §8's "why not" explanation.
- `BOT_PRODUCT_SPEC.md` §5 ("Notifications — read + mutate today; push delivery is not possible
  yet") — the canonical statement of this document's central constraint.
- `BOT_SECURITY_MODEL.md` §§1, 3, 4, 5, 6, 10 — account-link verification, custom-ID opacity, token
  handling, idempotency/rate-limit/audit obligations, role-vs-permission separation, DM/logging
  redaction.
- `BOT_DATA_OWNERSHIP.md` — the `Notifications` row ("Slice | Bot reads/marks-read via the real API
  only") and the `Delivery deduplication (once notification push exists)` row (bot-owned, not
  applicable until push exists).
- `PERMISSION_MATRIX.md` — the `/watchlist *`, `/notifications *`, `/portfolio` row.
- `ERROR_CATALOGUE.md` — every row, in particular `NOTIFICATION_NOT_FOUND`,
  `AUTHENTICATION_REQUIRED`/`ACCESS_TOKEN_EXPIRED`, `REFRESH_TOKEN_INVALID`/`REFRESH_TOKEN_REUSED`/
  `SESSION_REVOKED`, `RATE_LIMITED`, `IDEMPOTENCY_KEY_CONFLICT`/`REQUEST_IN_PROGRESS`, and the
  unrecognized-error fallback.
- `BOT_ARCHITECTURE.md` — the pagination-component paragraph, the idempotency-key derivation formula,
  the deferred-response convention, and the "Notification delivery: not implemented in this build
  guide beyond the pull-based `/notifications` commands" paragraph.
- `TEST_STRATEGY.md` — unit/integration/Discord-interaction/manual-QA expectations that apply to this
  document's scope.
- `MASTER_CHECKLIST.md` — the accuracy rule "never claim notifications can push to Discord without a
  delivery design," which this document exists partly to operationalize.
- Implementation Document 005 (`005-account-linking-discord-commands.md`) and Document 006
  (`006-permission-and-authorization-integration.md`) — once they exist, for the exact link-check and
  delegated-token-exchange call signatures this document's handlers depend on.
- Implementation Document 009 (`009-watchlist-and-portfolio-commands.md`) — once it exists, as the
  most directly comparable prior document (same dependency chain, same pagination pattern, same
  delegated-token-exchange scope family) to keep this document's shape consistent with it.

## 7. Strict scope

- `/notifications list` — paginated list of the linked user's notifications, with an `unreadOnly`
  boolean option and cursor-based pagination via the shared paginator, reading
  `GET /v1/me/notifications`.
- `/notifications unread` — unread count only, reading `GET /v1/me/notifications?unreadOnly=true`
  (count derived from the response, no separate count endpoint exists or is proposed).
- `/notifications read` — marks a single notification read by `id`, calling
  `PATCH /v1/me/notifications/:id/read`, with a required deterministic `Idempotency-Key`.
- `/notifications read-all` — marks all of the linked user's notifications read, calling
  `POST /v1/me/notifications/read-all`, with a required deterministic `Idempotency-Key`.
- Command-level enforcement that all four commands require a linked Slice account (per
  `PERMISSION_MATRIX.md`), using the delegated-token-exchange scopes `notifications:read` (for
  `list`/`unread`) and `notifications:write` (for `read`/`read-all`) from `BOT_API_REQUIREMENTS.md`
  §2.
- Rendering of notification bodies exactly as returned by Slice (server-authored, allowlisted plain
  text per Doc 008 — the bot adds no inferred or synthesized content).
- The formal, written documentation (not implementation) of the delivery-preference gap: no
  push-to-Discord path exists; §8 below is this document's authoritative treatment of that gap for
  the whole build guide going forward, cross-referencing `BOT_API_REQUIREMENTS.md` §4 rather than
  restating a competing account of it.

## 8. Out of scope

- **Any push/proactive delivery of a notification to Discord** — no DM, no channel post, no
  `notification-delivery-consumer` job (that job is explicitly listed in
  `EVENT_AND_JOB_CATALOGUE.md` as "Phase 2, not built"), no webhook receiver, no polling loop that
  surfaces new notifications without an explicit `/notifications` command invocation. This is the
  single most important boundary of this document: **Slice's `NotificationPreference.channel` enum
  today defines only `IN_APP | EMAIL | ...` — there is no `DISCORD` or generic webhook value anywhere
  in Slice's Doc 017 design**, and Doc 017 itself is NOT STARTED (`project-state.json`). Until Slice's
  own backend team (a) ships Doc 017 and (b) adds a `DISCORD` (or generic `WEBHOOK`) value to
  `NotificationPreference.channel`, there is no channel for Slice to address a Discord user through,
  and therefore nothing this document — or any document in this build guide — can build to make a
  notification "arrive" in Discord without the user running a command. This document does not invent
  a workaround (e.g., a bot-side polling loop that DMs on any new item) because that would silently
  duplicate Slice's future outbox-consumer responsibility with a different, non-idempotent, non-Doc-
  017-compliant mechanism — exactly the kind of "second backend" behavior the bot must never exhibit
  (`docs/qa/README.md` ground rules, `BOT_ARCHITECTURE.md` "Bot must never do").
- A user-facing "notification preferences" or "delivery channel" command/setting of any kind. There
  is nothing for such a command to configure yet: Slice's `NotificationPreference` model has no
  Discord-addressable channel, so a bot-side preferences UI would either do nothing or silently
  mislead the user into believing delivery is configurable. Per `COMMAND_CATALOGUE.md`'s "Disabled/
  unavailable features" UI standard, a disabled/not-available affordance is preferred to a fake one —
  but even that affordance is deferred to the future push-delivery document, not built here, because
  there is no concrete design to point it at yet.
- The `GET /v1/bot/notifications/outbox` endpoint proposed (not built) in `BOT_API_REQUIREMENTS.md`
  §4 — that endpoint does not exist, is not requested from Slice's team by this document (it was
  already flagged in §4 by the top-level API-requirements document), and is not called by any code
  this document produces.
- The bot-owned `InboxReceipt`-style delivery-deduplication table listed in `BOT_DATA_OWNERSHIP.md`
  ("Delivery deduplication (once notification push exists)") — explicitly conditioned on push
  existing, which it does not; §10 of this document confirms no such table is created here.
- `#roles` Discord-native "reaction roles for notification categories" (`BOT_PRODUCT_SPEC.md`'s
  client-wishlist table) — that item is BUILD NOW for the *role assignment* half only, under
  Document 014 (community/engagement features), and PHASE-GATED for the *delivery* half for the same
  Doc 017 reason as this document's §8. This document does not touch Discord role assignment.
- Any change to Slice's `Notification` or `NotificationPreference` Prisma models, migrations, or API
  surface. Per this build guide's scope boundaries (`docs/qa/README.md`), no Slice source is modified by any
  document in this guide, including this one.
- Notification creation/authoring. The bot never creates a `Notification` on a user's behalf; it only
  reads and marks-read notifications Slice itself already created.

## 9. Dependencies

No new runtime/library dependency is introduced beyond what Implementation Documents 001–003 and 006
already establish (discord.js v14+, the typed Slice API client, the shared pagination/embed-builder
modules, the delegated-token-exchange client helper from Document 006). This document adds no new
package to `package.json`.

## 10. Bot-owned persistence

None. This document is entirely read/mark-read against Slice's existing API; it introduces no new
table, collection, or cache in the bot's own database. Per `BOT_DATA_OWNERSHIP.md`, "Notifications"
is a Slice-authoritative row ("Bot reads/marks-read via the real API only") — the bot does not cache
notification content or unread state beyond the lifetime of a single interaction's in-memory response
handling. The one bot-owned row in `BOT_DATA_OWNERSHIP.md` that concerns notifications at all
("Delivery deduplication (once notification push exists)") is explicitly conditioned on push
delivery existing, which per §8 it does not — so that table is not created by this document.

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Used by |
|---|---|---|
| `GET /v1/me/notifications` | Already-available (VERIFIED) | `/notifications list`, `/notifications unread` |
| `PATCH /v1/me/notifications/:id/read` | Already-available (VERIFIED) | `/notifications read` |
| `POST /v1/me/notifications/read-all` | Already-available (VERIFIED) | `/notifications read-all` |
| `POST /v1/bot/tokens/exchange` (scope `notifications:read` / `notifications:write`) | Bot-only service endpoint — **proposed, not yet built**, requires Slice backend team design sign-off (`BOT_API_REQUIREMENTS.md` §2) | All four commands, to obtain the linked user's short-lived delegated token before calling the endpoints above |
| `GET /v1/bot/discord-link/:discordUserId` | Bot-only service endpoint — **proposed, not yet built** (`BOT_API_REQUIREMENTS.md` §1) | Pre-flight link check on every command invocation (Document 006's fresh-verification pattern), before attempting the token exchange |
| `GET /v1/bot/notifications/outbox` | Bot-only service endpoint — **proposed only as a future design note, not built, not requested for this document** (`BOT_API_REQUIREMENTS.md` §4) | Not called by anything in this document; listed here only to state explicitly that it is out of scope (§8) |

This document's four commands cannot reach full closure until the two "bot-only service endpoint...
not yet built" rows above (token exchange, discord-link lookup) exist on a real Slice environment —
consistent with `IMPLEMENTATION_ORDER.md`'s note that Document 010's "Can start today" is "Blocked
until account linking closes," since that closure is itself gated on those same endpoints via
Documents 004/005/006.

## 12. Commands / events / jobs delivered

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases |
|---|---|---|---|---|---|---|---|---|---|---|
| `/notifications list` | Paginated notifications | `unreadOnly`, `page` | any member | yes | ephemeral | `GET /v1/me/notifications` | standard | n/a | n/a | empty list |
| `/notifications unread` | Unread count | — | any member | yes | ephemeral | `GET /v1/me/notifications?unreadOnly=true` | standard | n/a | n/a | none |
| `/notifications read` | Mark one read | `id` | any member | yes | ephemeral | `PATCH /v1/me/notifications/:id/read` | standard | limited | required | not found |
| `/notifications read-all` | Mark all read | — | any member | yes | ephemeral | `POST /v1/me/notifications/read-all` | standard | limited | required | none |

(Table reproduced verbatim from `COMMAND_CATALOGUE.md`'s Phase 1 table, filtered to this document's
scope.) No events or jobs are delivered by this document — the only notification-related job in
`EVENT_AND_JOB_CATALOGUE.md`, `notification-delivery-consumer`, is explicitly "Phase 2, not built"
and out of scope per §8.

## 13. Permission rules

Per `PERMISSION_MATRIX.md`: `/notifications *` — Discord-side gate is "any member" (no special
Discord role required); the Slice-side gate is "self-token via delegated exchange
(`BOT_API_REQUIREMENTS.md` §2)," and the row is explicitly marked "requires linked account." This
means the Discord-side check (any guild member may invoke the command) is necessary but never
sufficient — the command handler must independently confirm the invoking Discord user is linked
(`GET /v1/bot/discord-link/:discordUserId`), obtain a delegated token scoped to
`notifications:read`/`notifications:write` (never the bot's own service-account credential, which is
reserved for calls that do not impersonate a specific user), and let the Slice API's own response be
final authority on whether the action is allowed. Per `PERMISSION_MATRIX.md`'s stated rule: "a
Discord-side role check is always a gate, never a substitute for the corresponding Slice-side check
when a command touches Slice data." No Discord role — including a bot admin/support role — grants any
elevated notification access; there is no admin variant of `/notifications *` in this document's
scope (an admin cannot read or mark-read another user's notifications through these commands).

## 14. Security requirements

Per `BOT_SECURITY_MODEL.md`:
- §1: every command in this document first re-confirms the Discord↔Slice link using the ID Discord
  itself attaches to the interaction object — never a client-supplied ID — consistent with "the bot
  never trusts a client-supplied Discord ID for anything security-relevant."
- §4.2: watchlist/notifications/account-status/admin calls "must be made using a token tied to the
  linked Slice user's own permission set, not the bot's service identity" — this document's four
  commands are exactly the "notifications" case named there. The bot never holds the linked user's
  password or long-lived refresh token; it obtains a short-lived (≤5 minute per §2 of
  `BOT_API_REQUIREMENTS.md`), narrowly-scoped delegated token per invocation.
- §5: every mutating call (`read`, `read-all`) carries a deterministic `Idempotency-Key`; the bot
  honors `Retry-After` on 429 and never fans out parallel retries; the bot logs its own local action
  (Discord user, command, outcome, Slice request ID) for correlation without duplicating Slice's own
  audit record.
- §6: a Discord role never implies any elevated Slice notification access, and conversely a Slice
  account-status change never triggers an automatic Discord-side action from this document's
  commands.
- §10: no notification body, ID, or any other field is ever logged, embedded in a custom ID, or
  placed in a log line in a way that leaks a raw email, token, or session cookie; notification
  content itself (server-authored, allowlisted plain text per Doc 008) is safe to render directly in
  an ephemeral embed but is never included in a bot-local structured log beyond what's needed for
  error correlation (e.g., notification `id`, not full body text, in error logs).
- No new PII exposure is introduced: notification bodies are Slice's own server-authored, allowlisted
  plain text (`BOT_PRODUCT_SPEC.md` §5) — the bot renders them as-is and does not enrich them with any
  additional user data (email, real name) that Slice did not already choose to include.

## 15. Idempotency and rate limits

- **Idempotency key scheme:** per `BOT_ARCHITECTURE.md`, every mutating call gets a deterministic
  `Idempotency-Key` derived from `(discordUserId, command, targetResourceId, nonce)`, where `nonce`
  is fixed per logical user intent (only regenerated if the user explicitly retries after an error,
  never on a bare Discord gateway retry). Concretely for this document:
  - `/notifications read`: key derived from `(discordUserId, "notifications.read", notificationId,
    nonce)`.
  - `/notifications read-all`: key derived from `(discordUserId, "notifications.read-all", "self",
    nonce)` — there is no per-item target, so the fixed literal `"self"` stands in for
    `targetResourceId`.
  - `/notifications list` and `/notifications unread` are pure reads and carry no idempotency key
    (`COMMAND_CATALOGUE.md` marks both "n/a" for idempotency), consistent with `BOT_API_REQUIREMENTS.md`
    marking the underlying `GET` endpoint's idempotency column "n/a."
- **Rate limits:** all four commands are tagged "standard" in `COMMAND_CATALOGUE.md` (no
  command-specific override, unlike `/account link`'s explicit 3/hour/user). The bot applies its
  default local pre-check cooldown plus honors Slice's own `RateLimit-*`/`Retry-After` response
  headers on every call (`BOT_ARCHITECTURE.md`). On a `429`, the bot never auto-retries a mutation
  (`read`/`read-all`); it surfaces the `RATE_LIMITED` mapping from `ERROR_CATALOGUE.md` with the exact
  `Retry-After` value.
- Per `ERROR_CATALOGUE.md`'s `IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS` row, the bot never
  auto-retries a conflicting mutation on `read` or `read-all` — it surfaces "That's already being
  processed — give it a second."

## 16. Audit requirements

- `COMMAND_CATALOGUE.md` marks `/notifications list` and `/notifications unread` as "n/a" for audit
  (pure reads — Doc 008's read endpoints are not individually audited by Slice, consistent with every
  other "n/a (read)" row in `BOT_API_REQUIREMENTS.md`).
- `/notifications read` and `/notifications read-all` are marked "limited" audit in
  `COMMAND_CATALOGUE.md`, mirroring `BOT_API_REQUIREMENTS.md`'s "limited" audit tag on the underlying
  `Notification` mark-read/mark-all-read endpoints — Slice itself is the system of record for that
  audit trail; the bot does not write a competing `AuditEvent`.
- Per `BOT_SECURITY_MODEL.md` §5, the bot additionally writes its own local operational log entry for
  every command invocation in this document's scope (Discord user ID, command name, notification ID
  where applicable, outcome, Slice request ID) purely for support correlation — never presented as, or
  confused with, Slice's own audit record. This local log is subject to the same redaction rules as
  every other bot log (§14 above / `BOT_SECURITY_MODEL.md` §10): no notification body text, no email,
  no token.

## 17. Error behavior

Directly from `ERROR_CATALOGUE.md`, applicable to this document's four commands:

| Slice error code | HTTP | Discord-facing message |
|---|---|---|
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | 401 | "Your linked session needs refreshing — try again in a moment." (bot silently retries the delegated-token exchange once, GET only, never for `read`/`read-all`) |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | 401 | "Your Slice link needs to be re-established — run `/account link`." |
| `NOTIFICATION_NOT_FOUND` | 404 | "Couldn't find that — double check and try again." (`/notifications read` with a stale/invalid/already-processed `id`) |
| `RATE_LIMITED` | 429 | "You're doing that too fast — try again in {Retry-After}s." |
| `IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS` | 409 | "That's already being processed — give it a second." (`/notifications read`, `/notifications read-all`) |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | 503 | "Slice is having a moment — try again shortly." (retried once automatically, GET only) |
| Unrecognized/unexpected error | any | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." — never interpolates the raw exception object (the old bot's known bug, Migration M6) |

Command-specific cases not otherwise in the table above, all using the standard "not-linked" pattern
from `COMMAND_CATALOGUE.md`'s UI standards ("any command requiring a linked account that's invoked by
an unlinked user responds with a short explanation and a button that runs `/account link` directly"):

- All four commands, invoked by an unlinked Discord user: short explanation + `/account link` button,
  never a raw permission error.
- `/notifications list` / `/notifications unread` with zero notifications (or zero unread): rendered
  as a friendly "you're all caught up" / "no notifications yet" empty state, not an error.
- `/notifications read-all` when there are zero unread notifications: treated as a successful no-op
  (Slice's own endpoint semantics govern this; the bot does not special-case it client-side beyond
  showing a normal success confirmation).

## 18. Interaction UX

- **`/notifications list`**
  - Options: `unreadOnly` (boolean, optional, default `false`), `page` (integer, optional, default
    first page).
  - Deferred ephemeral response immediately on invocation (Discord's 3-second ack window), then a
    single embed listing notifications for the current page: each entry shows the server-authored
    body text, a read/unread indicator, and a native relative timestamp (`<t:unix:R>`).
  - Uses the shared button-based paginator (Previous/Next, disabled at bounds, page position shown in
    the embed footer) wrapping Slice's `{items, nextCursor, hasMore}` shape.
  - Footer additionally carries the data's `asOf`/`source` per the UI-standards footer convention.
  - Empty state: "You're all caught up — no notifications to show" (adjusted to "no unread
    notifications" when `unreadOnly` is true), same embed style, no pagination controls shown.
- **`/notifications unread`**
  - Deferred ephemeral response, single compact embed or plain response showing just the unread
    count (e.g., "You have 3 unread notifications.") — no pagination, no per-item detail (that's
    `/notifications list unreadOnly:true`'s job).
  - Zero-unread case: "You have no unread notifications." — a normal success state, not an error.
- **`/notifications read`**
  - Option: `id` (required — the notification's opaque ID; per `BOT_SECURITY_MODEL.md` §3, this ID is
    never itself a Slice-internal sequential ID exposed insecurely — it is whatever opaque identifier
    Slice's own API already returns from `/notifications list`, typically surfaced to the user via a
    per-item "Mark read" button rather than requiring the user to type an ID by hand; the slash-command
    `id` option remains available for direct use but the primary UX path is button-driven).
  - Preferred UX: each item in `/notifications list`'s embed has an associated "Mark read" button
    (component-based, per the UI standards' "every mutating action uses a component, not a reaction"
    rule) whose custom ID is an opaque, bot-generated reference to the notification — never the raw
    Slice notification ID exposed in a guessable way, and the handler re-verifies the interacting
    user matches the resource owner before acting (`BOT_SECURITY_MODEL.md` §3).
  - On success: the item's embed/message updates to reflect the read state (or a short ephemeral
    confirmation "Marked as read.") without a full page reload of the list.
  - Deferred ephemeral response; no confirmation dialog required (non-destructive, easily reversible
    from Slice's perspective — Slice, not the bot, defines whether "unread" can be restored, and the
    bot does not claim it can).
- **`/notifications read-all`**
  - No options. Deferred ephemeral response.
  - Given it affects every notification at once, follows the "confirmation dialogs" UI standard: a
    button-based Confirm/Cancel step with a visible summary ("Mark all N notifications as read?")
    and a short auto-cancel timeout, before the actual `POST /v1/me/notifications/read-all` call is
    made. This is a lower-severity confirmation than the "type to confirm" pattern reserved for
    destructive admin actions (ban, force-delete) — a simple button confirm suffices since this action
    is a Slice-side toggle, not data-destructive.
  - On success: ephemeral confirmation "All notifications marked as read."
- **Delivery-preference gap (documentation surface only, not a command):** none of the four commands
  in this document offer a "notify me automatically" toggle. Per §8, no such toggle is built. If a
  future document ever adds a disabled/"coming soon" affordance for this, it is out of this
  document's scope and must be designed against a concrete Doc 017 + `DISCORD` channel type, not
  invented speculatively here.

## 19. Implementation file plan

(Illustrative module layout, consistent with `BOT_ARCHITECTURE.md`'s command-handler-per-family
convention; exact paths are set at implementation time against whatever repository layout Document
001 established.)

| File | Purpose |
|---|---|
| `src/commands/notifications/list.ts` | `/notifications list` handler: option parsing, delegated-token exchange (`notifications:read`), calls `GET /v1/me/notifications`, renders paginated embed via the shared paginator |
| `src/commands/notifications/unread.ts` | `/notifications unread` handler: delegated-token exchange (`notifications:read`), calls `GET /v1/me/notifications?unreadOnly=true`, renders count |
| `src/commands/notifications/read.ts` | `/notifications read` handler: delegated-token exchange (`notifications:write`), deterministic idempotency key, calls `PATCH /v1/me/notifications/:id/read` |
| `src/commands/notifications/readAll.ts` | `/notifications read-all` handler: confirm-button flow, delegated-token exchange (`notifications:write`), deterministic idempotency key, calls `POST /v1/me/notifications/read-all` |
| `src/commands/notifications/index.ts` | Registers the `/notifications` command group (subcommands `list`, `unread`, `read`, `read-all`) with the command registry from Document 003 |
| `src/components/notifications/markReadButton.ts` | Persistent-button handler for the per-item "Mark read" component on `/notifications list` embeds; opaque custom-ID scheme, owner re-verification before acting |
| `src/components/notifications/readAllConfirm.ts` | Confirm/Cancel component handler for the `/notifications read-all` confirmation step |
| `test/unit/commands/notifications/*.test.ts` | Unit tests per §21 |
| `test/integration/commands/notifications.test.ts` | Integration tests per §22 |
| `test/discord-interactions/notifications.test.ts` | Discord interaction-simulation tests per §23 |

No file in this plan touches Slice source, Slice's Prisma schema, or any push-delivery mechanism.

## 20. Numbered implementation steps

1. Confirm Documents 005 and 006 have closed (linked-account flow and delegated-token-exchange path
   both functional against a real or disposable Slice environment) before starting.
2. Register the `/notifications` command group and its four subcommands in the command registry
   (name, description, options, "linked account required: yes," "ephemeral: yes" per §7/§12).
3. Implement the shared "require linked account" pre-check reused by all four handlers (calls
   `GET /v1/bot/discord-link/:discordUserId`; on not-linked, responds with the standard
   not-linked/`/account link` prompt per §17 and returns early).
4. Implement `/notifications list`: parse `unreadOnly`/`page` options, exchange for a
   `notifications:read`-scoped delegated token, call `GET /v1/me/notifications`, map the response
   into the shared paginator, render the embed with read/unread indicators and relative timestamps.
5. Implement the per-item "Mark read" persistent button component referenced from each list entry,
   with an opaque custom ID and owner re-verification, delegating to the same logic as step 6's
   handler.
6. Implement `/notifications read`: parse `id`, exchange for a `notifications:write`-scoped delegated
   token, derive the deterministic idempotency key `(discordUserId, "notifications.read",
   notificationId, nonce)`, call `PATCH /v1/me/notifications/:id/read`, handle
   `NOTIFICATION_NOT_FOUND` per §17.
7. Implement `/notifications unread`: exchange for a `notifications:read`-scoped delegated token,
   call `GET /v1/me/notifications?unreadOnly=true`, render the count (including the zero-unread
   success state).
8. Implement `/notifications read-all`: render the Confirm/Cancel component first; on confirm,
   exchange for a `notifications:write`-scoped delegated token, derive the deterministic idempotency
   key `(discordUserId, "notifications.read-all", "self", nonce)`, call
   `POST /v1/me/notifications/read-all`.
9. Wire every handler through the centralized error-mapping layer (`ERROR_CATALOGUE.md`) — no handler
   catches and formats a Slice error inline.
10. Add the local operational-log correlation call (Discord user, command, outcome, Slice request ID)
    to every handler per §16, using whatever structured-logging helper Document 001/002 established.
11. Write unit tests (§21), integration tests (§22), and Discord interaction tests (§23).
12. Run the manual QA checklist (§24) in a real test guild against a non-production Slice environment.
13. Update this build guide's tracking documents per §27.

## 21. Unit tests

Against a fake, typed Slice API client (no network), covering only business-logic-shaped code
(no I/O):

- `unreadOnly`/`page` option parsing and validation for `/notifications list` (default values,
  out-of-range page handling).
- Pagination math for the shared paginator as applied to the notification list response shape
  (`{items, nextCursor, hasMore}` → button enable/disable state at first/last page).
- Idempotency-key derivation for `/notifications read` and `/notifications read-all`: deterministic
  for the same `(discordUserId, command, targetResourceId, nonce)` input, and unchanged across a
  simulated bare Discord gateway retry, only regenerated on an explicit user-initiated retry after an
  error.
- Error-mapping coverage: every `ERROR_CATALOGUE.md` row applicable to this document's endpoints
  (§17's table) produces the exact specified user-facing string from a given Slice error code/HTTP
  status fixture, and the unrecognized-error branch never interpolates a raw exception object into
  the output string (regression test for Migration M6).
- Embed construction: given a fixed set of notification fixtures (mixed read/unread, empty list,
  zero-unread), the correct embed fields/empty-state copy/footer (`asOf`/`source`) are produced.
- Not-linked pre-check: given an unlinked-user fixture, every one of the four command handlers short-
  circuits to the standard not-linked response and makes zero Slice API calls beyond the link check
  itself.

## 22. Integration tests

Against a **disposable local Slice instance** (per `TEST_STRATEGY.md`, mirroring Slice's own Doc 002
disposable-Postgres/Redis pattern) exercising the real, VERIFIED `Notification` endpoints listed in
§11:

- `/notifications list` end-to-end: seed a set of notifications for a test user, invoke the command
  through the real handler, assert the correct page contents and pagination metadata against the real
  API response.
- `/notifications unread` end-to-end: seed a mix of read/unread notifications, assert the correct
  count.
- `/notifications read` end-to-end: mark one notification read, assert the underlying Slice record's
  `readAt` (or equivalent) changed, assert a repeated call with the same idempotency key does not
  double-process.
- `/notifications read-all` end-to-end: assert every notification for the test user is marked read,
  assert idempotent replay behaves per `IDEMPOTENCY_KEY_CONFLICT`/`REQUEST_IN_PROGRESS` semantics.
- Full link → delegated-token-exchange → notification-mutation path, once the bot-only endpoints from
  §11 exist on the disposable instance (per `TEST_STRATEGY.md`: "Once the bot-only endpoints ...
  exist on a disposable Slice instance, integration tests cover the full link → delegated-token-
  exchange → watchlist-mutation path end-to-end" — this document applies the same pattern to
  notifications).
- `NOTIFICATION_NOT_FOUND` case: attempt `/notifications read` with a nonexistent/foreign-user
  notification ID, assert the correct 404 mapping and that no cross-user data leaks in the response.

## 23. Discord interaction tests

Simulated interaction payloads run through the real interaction router and command handlers, without
a live Discord gateway connection:

- Slash command payloads for all four `/notifications *` subcommands, asserting the exact response
  shape (ephemeral flag set true in every case, correct embed field set, correct component set when
  applicable).
- Button-click payloads for the per-item "Mark read" component and the `/notifications read-all`
  Confirm/Cancel component, asserting the handler re-verifies the interacting user against the
  resource owner (a forged/replayed custom-ID payload from a different user is rejected) per
  `BOT_SECURITY_MODEL.md` §3.
- Persistent-component recovery test: round-trip the "Mark read" button's custom ID through a
  simulated bot restart, confirming the notification reference is recoverable without relying on
  in-memory state (consistent with `BOT_ARCHITECTURE.md`'s persistent-button convention).
- Permission-gate simulation: an interaction from a Discord user with no Slice link is routed to the
  not-linked response for all four commands, never reaching the Slice API client mock.

## 24. Manual QA checklist

Run in a real test guild against a real, non-production Slice environment, per `TEST_STRATEGY.md`:

- [ ] `/notifications list` with no options shows the current page of notifications, correctly
      ordered, with working Previous/Next buttons disabled at the correct bounds.
- [ ] `/notifications list unreadOnly:true` shows only unread items.
- [ ] `/notifications list` on a user with zero notifications shows the friendly empty state, not an
      error.
- [ ] `/notifications unread` shows the correct count, including the zero-unread success state.
- [ ] `/notifications read` (via the slash command `id` option and via the "Mark read" button) marks
      the correct single notification read and does not affect any other notification.
- [ ] `/notifications read` with an invalid/foreign `id` shows the `NOTIFICATION_NOT_FOUND` friendly
      message, never a raw error.
- [ ] `/notifications read-all` shows the Confirm/Cancel step first, cancels cleanly on Cancel or
      timeout, and marks every notification read only on Confirm.
- [ ] All four commands, invoked by a Discord user with no linked Slice account, show the standard
      not-linked explanation with a working `/account link` button, and make no Slice API call beyond
      the link check.
- [ ] Rate-limit QA: deliberately trigger Slice's documented rate limit on the notification endpoints
      and confirm the friendly `Retry-After`-aware message appears, not a raw 429.
- [ ] Security QA: grep the test guild's message/embed history and the bot's structured logs after a
      full pass to confirm no Slice token, password, session cookie, or raw email address ever
      appeared.
- [ ] Confirm no command, button, embed, or help text in this document's scope implies or claims that
      a notification will ever arrive in Discord without the user running a `/notifications` command
      (manual read-through against §8's constraint, not just a functional check).

## 25. Verification commands

```
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run build
```

## 26. Completion checklist

- [ ] `/notifications list` implemented, paginated, `unreadOnly` filter working, empty state honest.
- [ ] `/notifications unread` implemented, correct count including zero-unread state.
- [ ] `/notifications read` implemented, idempotent, correct not-found handling.
- [ ] `/notifications read-all` implemented, confirm-gated, idempotent.
- [ ] All four commands enforce linked-account requirement and use delegated-token-exchange scopes
      (`notifications:read`/`notifications:write`), never the bot's service-account credential.
- [ ] Every mutating call carries a deterministic `Idempotency-Key` per the scheme in §15.
- [ ] Every error path routes through the centralized error-mapping layer with no raw exception text
      ever reaching a user-facing string.
- [ ] Unit, integration, and Discord-interaction tests per §§21–23 pass.
- [ ] Manual QA checklist (§24) completed in a real test guild against a non-production Slice
      environment.
- [ ] No code in this document's scope implements, stubs, or gestures toward push/proactive delivery
      to Discord; no "notification preferences" command was added.
- [ ] No Slice source, Prisma schema, or API was modified.
- [ ] Bot-owned persistence remains unchanged by this document (§10 confirmed: none added).

## 27. Documentation updates

Once this document's work actually lands (not before):

- `PROMPT_INDEX.md` — flip row 010's Status column from NOT STARTED to COMPLETE.
- `IMPLEMENTATION_ORDER.md` — update Document 010's row if its "Can start today" note needs
  revision (e.g., once Documents 005/006 have actually closed, this document's own blocked-status
  note becomes stale and should reflect the real state).
- `CURRENT_STATE.md` — update the "Known blockers" section only if the underlying blocker changes
  (i.e., do not remove the Doc 017 / `DISCORD` channel type blocker language, since that blocker is
  unrelated to this document's own closure — it blocks only the separate, unnumbered future
  push-delivery document, not this one).
- `MASTER_CHECKLIST.md` — mark this document's specific checklist items complete once verified; do
  not mark the Doc 017 push-delivery blocker item complete, since it remains unresolved regardless of
  this document's completion.
- No update to `SLICE_FEATURE_COMPATIBILITY.md`, `BOT_API_REQUIREMENTS.md`, or `BOT_PRODUCT_SPEC.md`
  is expected from this document's closure — this document did not change any Slice-side fact those
  documents assert; it only implemented against already-VERIFIED endpoints they already describe.

## 28. Final report format

On completion, the implementer's report must state, mirroring the top-level build guide's own report
style, scoped to this document only:

1. **What was built:** the four `/notifications` commands, their component handlers, and nothing
   else — explicitly confirm no push-delivery code was added.
2. **What was verified:** which of the §25 verification commands were run and passed, and confirmation
   the §24 manual QA checklist was completed against a named non-production Slice environment.
3. **What remains blocked:** restate, without softening, that push delivery to Discord remains
   impossible until Slice ships Doc 017 and adds a `DISCORD` channel type to
   `NotificationPreference` — this document does not change that fact and must not be summarized in
   a way that implies progress toward it.
4. **Deviations:** any point where the actual implementation diverged from this document's §7/§12
   scope, with justification, flagged for human review before Document 010 is marked COMPLETE in
   `PROMPT_INDEX.md`.
5. **Stop confirmation:** explicit acknowledgment of §29 below.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
