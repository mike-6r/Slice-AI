# Implementation document 013 — Admin read-only operational commands

## 1. Metadata

- **Document number:** 013
- **Title:** Admin read-only operational commands
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 005 (Account-linking Discord commands), 006 (Permission and
  authorization integration)
- **Blocks (this build guide):** none
- **Slice backend dependency:** Slice Doc 005 (VERIFIED, admin user status/roles/audit reads —
  `project-state.json` lists `005` in `sliceBackendStatus.completedDocuments`)
- **Can start today:** Blocked until account linking closes — specifically, until Documents 004–006
  (the new bot-only `discord-link` endpoints, the `/account link`/`/account unlink` commands, and
  the fresh, non-cached Slice permission-check mechanism) have each closed per
  `IMPLEMENTATION_ORDER.md`

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend; this document is one part of
the plan for a companion Discord bot that gives Slice's own staff (never end users) a fast,
read-only way to run the same admin lookups they already have on Slice's web admin panel, without
leaving Discord. The bot is a client, never a second backend: every fact rendered in Discord in this
document is fetched live from Slice's HTTP API on every invocation, nothing is cached beyond the
lifetime of a single interaction, and no business rule (who counts as "linked," what an audit event
means, what a status-history entry means) is reimplemented — Slice's API answer is trusted as-is. Per
`IMPLEMENTATION_ORDER.md`, Document 013 sits in "Track A" (the account-linking-dependent track:
004 → 005 → 006 → 009 → 010 → 013) precisely because every command here requires a linked Discord
identity to resolve a fresh Slice `ADMIN`/`SUPPORT` role before it can run.

## 3. Current implementation audit

Nothing in this build guide's `implementation/` tree has actually been built yet — `CURRENT_STATE.md`
is explicit that "no Discord bot code exists anywhere." Describing "what exists before this document
starts" therefore means describing what Documents 001–006 are each scoped to deliver, per
`IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md`, since 013 cannot start until all of them close:

- **001** — repository/bot foundation (Discord client bootstrap, config loader, health/ready
  endpoints, no `Intents.all()`).
- **002** — the typed Slice API client (auth attachment, `Idempotency-Key` generation, retry-GET-
  once-on-401, `Retry-After` handling) that this document's commands call into rather than
  hand-rolling HTTP calls.
- **003** — the interaction router, command registry, and the shared pagination/embed-builder
  components this document reuses for `/admin audit`'s paginated results.
- **004** — the account-linking domain and the new bot-only `discord-link` backend endpoints
  (`BOT_API_REQUIREMENTS.md` §1), including `GET /v1/bot/discord-link/:discordUserId`, which this
  document's `/admin link-lookup discordUser:` option calls directly.
- **005** — `/account link` / `/account unlink` / `/account status`, and the account-linking domain
  module this document assumes is fully wired (a Discord user must be able to be resolved to a Slice
  identity at all before an admin/support check on that identity means anything).
- **006** — the permission and authorization integration: the fresh, non-cached "resolve this linked
  Discord user's current Slice role via a live API call, every interaction" mechanism
  (`BOT_SECURITY_MODEL.md` §6, `PERMISSION_MATRIX.md`). This document does not reimplement that
  mechanism — it calls it once per `/admin *` invocation, exactly as `PERMISSION_MATRIX.md`'s admin
  row specifies ("checked fresh every call ... never cached").

An implementer starting Document 013 must confirm, not assume, that 001–006 have actually closed
their own completion checklists before beginning — this document's own "strict scope" below assumes
that foundation is real and working, not aspirational.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. `OLD_BOT_FEATURE_INVENTORY.md` and `README.md` are
explicit that the old Python bot (Infria, a FiveM/GTA-roleplay-community bot, `discord.py==1.6.0`)
has zero product overlap with Slice, and it never had anything resembling an admin-audit-lookup or
account-status-history surface — those concepts don't exist in its domain at all. The closest
adjacent items in the inventory are unrelated financial/support lookups, both marked `REMOVE` because
they have no Slice counterpart and carry the old bot's own named security defects:

- Row 12–13 (`!lookup`, `!payments` in `cogs/Tebex.py`) — Tebex store transaction/payment lookups,
  gated only on a hardcoded owner Discord ID, calling an external payment API with a **hardcoded
  plaintext secret in source**. `REMOVE` — "Slice has no storefront/game-server purchase concept."
- Row 28 (`cogs/ErrorHandler.py`) — the old bot's generic error handler leaked raw exception text to
  end users. Not a predecessor feature, but its named defect (`OLD_TO_NEW_MIGRATION_MATRIX.md` M6,
  cited in `ERROR_CATALOGUE.md`'s closing rule) is exactly the failure mode this document's error
  handling (§17) must not repeat when an unexpected admin-lookup failure occurs.

No feature, table, or command in the old bot is reused, referenced, or partially migrated by this
document. Say so honestly rather than forcing a mapping that isn't real, per this build guide's own
rule.

## 5. Slice features supported

- **Slice Doc 005 — admin user status/roles/audit reads.** Status: **VERIFIED**
  (`project-state.json.sliceBackendStatus.completedDocuments` includes `"005"`). This is the sole
  Slice backend document this scope touches. `BOT_API_REQUIREMENTS.md`'s "already available" table
  lists `GET /v1/admin/audit-events` and `GET /v1/admin/users/:id/status-history` as token-auth,
  `ADMIN`/`SUPPORT`-permission, already-shippable reads with documented rate limiting — no new Slice
  backend work is required for `/admin audit` or `/admin status-history` beyond what Doc 005 already
  ships.
- **The bot-only `discord-link` service endpoints (Doc 004's scope, not a Slice backend document).**
  `GET /v1/bot/discord-link/:discordUserId` is listed in `BOT_API_REQUIREMENTS.md` §1 as a
  **proposed, not-yet-built** bot-only service endpoint (service-account auth). `/admin link-lookup`
  depends on this endpoint existing and being verified by Document 004's own closure, not on any
  additional Slice backend document beyond what Doc 005 covers for the role check itself.
- No other Slice feature area (marketplace, watchlist, notifications, collectors, vault, portfolio)
  is touched by this document.

## 6. Files to read before starting

- `README.md`, `CURRENT_STATE.md`, `project-state.json` (this build guide's own state)
- `BOT_PRODUCT_SPEC.md` §8 ("Admin operations — mostly read-only in the bot; mutations stay in the
  web admin panel") — the single clearest statement of this document's scope boundary
- `BOT_ARCHITECTURE.md` (Slice API client, permission module, pagination components, structured
  logging/request-ID conventions this document reuses rather than reinventing)
- `BOT_SECURITY_MODEL.md` §§5–11 (bot-side audit obligations, role-possession-≠-permission,
  recent-auth, compromised-account handling, logging redaction, admin action confirmation)
- `BOT_DATA_OWNERSHIP.md` (the "audit events" and "guild configuration" rows, and the rule for
  resolving ambiguous data-ownership questions)
- `BOT_API_REQUIREMENTS.md` (the "already available" table's `/v1/admin/*` rows, and §1's
  `discord-link` endpoints)
- `COMMAND_CATALOGUE.md` (the "Admin (read-only)" table in full, and the "UI standards" section)
- `PERMISSION_MATRIX.md` (the `/admin audit`, `/admin status-history`, `/admin link-lookup` row)
- `ERROR_CATALOGUE.md` (full table — every mapped Slice error code this document's commands can hit)
- `OLD_BOT_FEATURE_INVENTORY.md` (confirm §4's "no predecessor" claim directly rather than trusting
  a summary of it)
- `TEST_STRATEGY.md` (unit/integration/Discord-interaction/manual-QA conventions this document's
  §§21–24 follow)
- `implementation/005-account-linking-discord-commands.md` and
  `implementation/006-permission-and-authorization-integration.md` — read these two documents' own
  completion state directly (not just their one-line summary in `IMPLEMENTATION_ORDER.md`) before
  starting, since this document's permission mechanism is entirely inherited from 006 and its
  identity-resolution mechanism is entirely inherited from 005

## 7. Strict scope

- `/admin audit` — filter Slice audit events by `action`, `actorId`, `subjectId`, `from`, `to`
  against `GET /v1/admin/audit-events`, paginated, ephemeral.
- `/admin status-history` — a given Slice `userId`'s account status history via
  `GET /v1/admin/users/:id/status-history`, ephemeral.
- `/admin link-lookup discordUser:<user>` — resolve a Discord user to their linked Slice account (or
  confirm "not linked") via `GET /v1/bot/discord-link/:discordUserId`, ephemeral. **Fully in scope
  and shippable once Document 004's endpoint is live.**
- `/admin link-lookup slug:<value>` — the same lookup in the reverse direction (Slice user/collector
  slug → Discord user), **present as a command option but shipped in a disabled/"not available yet"
  state** (see §8, §11, §18) because no Slice or bot-only endpoint documented anywhere in this build
  guide performs that reverse resolution today.
- A fresh, non-cached Slice `ADMIN`/`SUPPORT` role check (via Document 006's mechanism) on every
  single invocation of any of the three commands above, with no result cached beyond that one
  interaction.
- A bot-owned "who ran which admin lookup, when" correlation log (§10, §16) written on every
  invocation — successful, not-found, denied, or errored — for accountability.
- Friendly error mapping for every documented failure mode (§17), consistent with the rest of the
  bot's error handling.
- Pagination for `/admin audit` results using the shared paginator component from Document 003.

## 8. Out of scope

- **Any mutation.** No status change, no role grant/revoke, no ban, no account restriction, no
  catalogue edit. `BOT_PRODUCT_SPEC.md` §8 and `PERMISSION_MATRIX.md` are both explicit that
  high-impact Slice mutations are **not exposed in Discord in Phase 1/2** given the "GLOBAL-only
  effective role resolution" blast-radius problem — this document does not revisit that decision.
  Every one of these mutations remains exclusively on Slice's own web admin surface.
- Building, deploying, or standing up the `GET /v1/bot/discord-link/:discordUserId` endpoint itself —
  that is Document 004's and Slice's backend team's responsibility; this document only calls it.
- Building a new reverse-lookup (slug → Discord user) backend endpoint. This document **proposes**
  the shape of that endpoint as a gap identified while writing this scope (§11) but does not build
  it, and does not assume Slice's or the bot's backend team has approved it.
- Any admin **write** correlated to Slice's own `AuditEvent` model — this document's bot-owned log
  (§10) is a separate, non-authoritative correlation record, never a competing audit source, per
  `BOT_DATA_OWNERSHIP.md`'s "Audit events" row.
- Catalogue admin mutations (`BOT_PRODUCT_SPEC.md` §8 calls these "a reasonable Phase 2 candidate")
  — not this document.
- Any Discord-side automatic action (kick/ban/role change) triggered by a Slice account status —
  `BOT_SECURITY_MODEL.md` §6 keeps the two systems decoupled by default; this document does not
  introduce such a trigger.
- Bot-owned guild configuration for *which* Discord role maps to "bot admin/support role" — that
  configuration mechanism belongs to Document 001/003's guild-config scope; this document consumes
  it, not defines it.
- Notification delivery, push, or any Phase 2+ feature named in `COMMAND_CATALOGUE.md`'s "Phase 2+"
  table — unrelated to this scope entirely.

## 9. Dependencies

No new runtime/library dependency is introduced by this document. It reuses, unmodified:

- The typed Slice API client from Document 002 (auth attachment, `Retry-After` handling, retry-GET-
  once semantics) — extended only with three new typed method signatures for the endpoints in §11.
- The interaction router, command registry, and shared button-based paginator from Document 003.
- The fresh-permission-check module from Document 006.
- The structured-logging/request-ID convention from `BOT_ARCHITECTURE.md` (reused for both the bot's
  own operational logs and the new correlation-log entries in §10).
- Whatever ORM/persistence technology Document 001 established for bot-owned state (`BOT_ARCHITECTURE.md`
  names "Postgres/SQLite via an ORM, or a managed KV store") — this document adds one new table to
  that existing store; it does not introduce a second persistence technology.

## 10. Bot-owned persistence

This document is **read-only against Slice** but introduces one new bot-owned table for the
accountability logging the assignment requires — per `BOT_DATA_OWNERSHIP.md`'s rule that Slice
remains authoritative for the underlying audit *data*, while "who in Discord looked at what, and
when" is Discord-operational metadata with no Slice counterpart, mirroring the same pattern
`BOT_SECURITY_MODEL.md` §5 already establishes ("the bot additionally logs its own local action ...
but never duplicates Slice's audit record as a second source of truth").

**`AdminLookupLog`** (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID/PK | — |
| `discordUserId` | string, indexed | The Discord snowflake of the staff member who ran the command (from the verified interaction object, never client-supplied) |
| `discordUsername` | string | Denormalized display name **at the time of the action**, for readability; never re-synced, never used for authorization |
| `guildId` | string, indexed | Which Discord server the command was run in |
| `channelId` | string | — |
| `command` | enum: `ADMIN_AUDIT`, `ADMIN_STATUS_HISTORY`, `ADMIN_LINK_LOOKUP` | — |
| `optionsSummary` | JSON | Allowlisted option values only (e.g., `{action, from, to}` for `/admin audit`, `{userId}` for `/admin status-history`, `{discordUserId}` or `{slug}` for `/admin link-lookup`) — never a raw email, token, or unallowlisted Slice field, per `BOT_SECURITY_MODEL.md` §10 |
| `slicePermissionResult` | enum: `GRANTED_ADMIN`, `GRANTED_SUPPORT`, `DENIED_NOT_LINKED`, `DENIED_INSUFFICIENT_ROLE` | The outcome of Document 006's fresh permission check for this specific invocation |
| `outcome` | enum: `SUCCESS`, `NOT_FOUND`, `SLICE_ERROR`, `DENIED` | — |
| `sliceRequestId` | string, nullable | Correlates this row to a specific Slice API response, per `BOT_ARCHITECTURE.md`'s audit-correlation convention |
| `createdAt` | timestamp | — |

- Written on **every** invocation of any `/admin *` command — including denied attempts (a non-admin
  or unlinked user attempting `/admin audit` is itself a security-relevant event worth recording, not
  just successes).
- Never stores a Slice access/refresh token, password, session cookie, or full raw API response body
  — only the allowlisted summary fields above, matching `BOT_SECURITY_MODEL.md` §10's redaction rule.
- Retention: no Slice audit-retention policy is specified anywhere in this build guide's available
  documents, so no specific retention period is asserted here as fact. Recommendation for the
  implementer: default to indefinite retention (this is a low-volume, staff-only accountability log,
  not user data) until Slice's own `AuditEvent` retention policy is confirmed, at which point this
  table's retention should be aligned to it rather than invented independently.
- This table is queried only by future observability tooling (Document 016's scope) or manual
  support/incident review — this document does not build a `/admin lookup-log` command to read it
  back, since that was not requested in scope and would itself need its own permission/audit design
  pass.

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Notes |
|---|---|---|
| `GET /v1/admin/audit-events` | **Already available (VERIFIED)** | Token auth, `ADMIN`/`SUPPORT` permission, audit tagged `n/a (read)`, rate limited. `BOT_API_REQUIREMENTS.md` names the endpoint but does not enumerate its exact query-parameter names/pagination shape beyond "Bot usage: Admin read-only lookups" — the implementer must confirm the exact `action`/`actorId`/`subjectId`/`from`/`to` query-parameter names and the cursor/page shape against Slice's actual route/OpenAPI definition at implementation time; this document does not guess or invent that shape |
| `GET /v1/admin/users/:id/status-history` | **Already available (VERIFIED)** | Token auth, `ADMIN`/`SUPPORT` permission, audit tagged `n/a (read)`, rate limited. `:id` is the Slice `userId` supplied as the command's `userId` option |
| `GET /v1/bot/discord-link/:discordUserId` | **Bot-only service endpoint, proposed, not yet built** (`BOT_API_REQUIREMENTS.md` §1) | Service-account auth. Returns `{linked, userId?, status?}`. Rate limited. Backs `/admin link-lookup discordUser:`. This document's `discordUser:` option cannot close in production until Document 004 has this endpoint live and verified on a real Slice environment |
| *(not currently proposed anywhere)* reverse lookup: Slice `userId`/slug → `discordUserId` | **Gap — no tag applies; nothing to call yet** | Backs `/admin link-lookup slug:`. Neither the "already available" table nor `BOT_API_REQUIREMENTS.md` §1's bot-only endpoint list defines a reverse-direction lookup. This document flags the gap and proposes the shape below; it does not assume the endpoint exists |

**Proposed extension to `BOT_API_REQUIREMENTS.md` §1** (documented here as a request to Slice's/the
bot's backend team, not built by this document): a service-account-authenticated
`GET /v1/bot/discord-link/by-user/:userId` (or an equivalent query-parameter form on the existing
endpoint), returning the same `{linked, discordUserId?, status?}` shape in the reverse direction,
rate limited the same way as its forward counterpart. Until this exists and is verified, `/admin
link-lookup slug:` ships as a visibly disabled option per §18, exactly as `COMMAND_CATALOGUE.md`'s UI
standards require for an unavailable feature ("never a silently missing feature or a broken
click-through").

Every Slice-side auth/permission check on all four rows above is re-verified fresh on each call — no
result is cached across interactions.

## 12. Commands / events / jobs delivered

Pulled directly from `COMMAND_CATALOGUE.md`'s "Admin (read-only)" table, filtered to this document's
scope (all three admin rows), supplemented with the ephemeral/rate-limit/audit detail this document
adds:

| Command | Purpose | Options | Permission | Backend calls | Ephemeral/public | Rate limit | Bot-side audit (this doc) | Impl doc |
|---|---|---|---|---|---|---|---|---|
| `/admin audit` | Look up audit events | `action`, `actorId`, `subjectId`, `from`, `to` | Slice `ADMIN`/`SUPPORT` (verified fresh, not cached) | `GET /v1/admin/audit-events` | ephemeral | per Slice's documented rate limit on the endpoint (exact figure not enumerated in `BOT_API_REQUIREMENTS.md`; honor `Retry-After`) | `AdminLookupLog` row on every attempt | 013 |
| `/admin status-history` | User status history | `userId` | Slice `ADMIN`/`SUPPORT` | `GET /v1/admin/users/:id/status-history` | ephemeral | same as above | `AdminLookupLog` row on every attempt | 013 |
| `/admin link-lookup` | Resolve Discord↔Slice link for support | `discordUser` (functional) or `slug` (disabled pending §11's proposed endpoint) | Slice `ADMIN`/`SUPPORT` | `GET /v1/bot/discord-link/:discordUserId` (`discordUser` path only) | ephemeral | per the endpoint's rate limit (`BOT_API_REQUIREMENTS.md` §1: "Rate limited") | `AdminLookupLog` row on every attempt | 013 |

No event or scheduled job is delivered by this document — `EVENT_AND_JOB_CATALOGUE.md` has no row for
admin-lookup commands, and this document does not add one.

## 13. Permission rules

Cited directly from `PERMISSION_MATRIX.md`'s admin row:

> `/admin audit`, `/admin status-history`, `/admin link-lookup` — Discord-side gate: **bot
> admin/support role**. Slice-side gate: **Slice `ADMIN`/`SUPPORT`, checked fresh every call**. Notes:
> **never cached**.

Both gates are required, and they are not interchangeable:

- The **Discord-side gate** (possession of the bot's configured admin/support role in that guild) is
  checked first, purely as a UX pre-filter — it stops an obviously unauthorized user from triggering
  a Slice API call at all.
- The **Slice-side gate** — a fresh call through Document 006's permission module resolving the
  linked Discord user's *actual current* Slice role — is the only check that has real authority.
  `PERMISSION_MATRIX.md`'s closing rule states this generally: "a Discord-side role check is always a
  gate, never a substitute for the corresponding Slice-side check when a command touches Slice data."
  This document treats that rule as absolute: a user holding the Discord admin role but whose linked
  Slice account is not `ADMIN`/`SUPPORT` (or is unlinked, or the link has been revoked) is denied,
  full stop, regardless of their Discord role.
- If the invoking Discord user has no linked Slice account at all, the command is denied with the
  standard "not linked" account-link prompt (`COMMAND_CATALOGUE.md`'s UI standards), not a generic
  permission error — this is a distinct, more specific case than "linked but insufficient role."

## 14. Security requirements

Cited from `BOT_SECURITY_MODEL.md`, scoped to what applies to this document:

- **§6, Discord role possession ≠ Slice permission (the core rule for this whole document):** "Any
  command touching a privileged Slice endpoint re-checks the linked account's actual Slice role via a
  fresh API call — it never caches 'this Discord user is a Slice admin' beyond the lifetime of a
  single interaction." All three commands in this document are exactly this case.
- **§10, logging redaction / PII:** no log line, embed, or the `AdminLookupLog` table itself (§10 of
  this document) may ever contain a raw email address, password, token, or session cookie. Audit
  events and status-history entries returned by Slice may contain sensitive metadata (e.g., an
  `actorId`, a status-change `reason`) — the embed renders only what Slice's own API response
  includes as user-facing fields (never internal-only fields Slice itself doesn't surface for admin
  reads), and the `AdminLookupLog` correlation row stores only the allowlisted `optionsSummary`, never
  a full copy of the Slice response body.
- **§7, recent authentication for high-impact actions:** this section specifically gates *mutations*
  (Doc 005's "recent-auth" freshness window for admin status/role changes). This document introduces
  **no mutation**, so the stricter recent-auth window described there does not apply here — what
  *does* apply, and is the mechanism this document actually uses, is §6's fresh-permission-check
  (every call, no caching), which `PERMISSION_MATRIX.md`'s admin row also names explicitly. This
  distinction is called out deliberately so this document does not overstate what "verified fresh"
  means for a read-only surface versus a mutating one.
- **§5, bot-side audit obligations:** "Every Slice-side mutation the bot triggers is already audited
  by Slice itself ... the bot additionally logs its own local action ... but never duplicates Slice's
  audit record as a second source of truth." This document's commands are reads, not mutations, and
  `BOT_API_REQUIREMENTS.md`'s "already available" table tags both `/v1/admin/*` reads' own audit
  column `n/a (read)` — meaning **Slice itself does not currently audit who viewed an audit-events or
  status-history page**. The `AdminLookupLog` table (§10) is therefore the *only* record of that
  access anywhere in either system. This is flagged here as a real observation, not invented: whether
  Slice's backend team wants to add server-side auditing of admin-read access is a decision for them,
  out of scope for this document to assume or build.
- **§11, admin action confirmation:** applies to "every destructive or high-impact bot command." None
  of this document's three commands are destructive or mutating, so no confirm-dialog/type-to-confirm
  flow is required here — explicitly noted so a future reader does not assume one is missing by
  omission.
- **Never-persist rule (`BOT_ARCHITECTURE.md` "Bot must never do"):** no Slice access token, refresh
  token, or password is ever placed in any embed, log line, or the `AdminLookupLog` table.

## 15. Idempotency and rate limits

- **Idempotency:** not applicable. Every call this document makes (`GET /v1/admin/audit-events`,
  `GET /v1/admin/users/:id/status-history`, `GET /v1/bot/discord-link/:discordUserId`) is a read with
  no side effect on Slice's data. `BOT_ARCHITECTURE.md`'s `Idempotency-Key` requirement is scoped to
  "every mutating Slice call" — none of this document's calls are mutations, so no key is generated or
  sent.
- **Rate limits:** `BOT_API_REQUIREMENTS.md` tags all three endpoints "Rate limit: yes" but does not
  enumerate a specific numeric threshold (unlike the Phase 1 table in `COMMAND_CATALOGUE.md`, which
  gives explicit per-hour figures for account-linking commands). This document does not invent a
  number. The bot honors whatever `Retry-After`/`RateLimit-*` headers Slice's response actually
  returns (`BOT_ARCHITECTURE.md`'s Slice API client responsibility) and surfaces the standard
  `RATE_LIMITED` mapping from `ERROR_CATALOGUE.md` when hit. As a bot-side courtesy on top of Slice's
  own limit — consistent with `BOT_ARCHITECTURE.md`'s "local pre-check to avoid calling Slice at all
  for an obviously-throttled user" — the implementer should add a conservative local per-admin-user
  cooldown (exact figure to be set with the backend team once Slice's actual documented limit for
  these two endpoints is confirmed, not asserted here as fact).

## 16. Audit requirements

- **Slice-side:** none of the three endpoints in §11 write a Slice `AuditEvent` for a read (tagged
  `n/a (read)` in `BOT_API_REQUIREMENTS.md`'s already-available table; the bot-only
  `discord-link` GET endpoint's bullet in §1 does not mention an audit write either). This document
  does not claim Slice audits these reads, because that isn't documented anywhere in this build guide.
- **Bot-side:** every invocation of `/admin audit`, `/admin status-history`, or `/admin link-lookup`
  — success, not-found, denied, or errored — writes one `AdminLookupLog` row (§10) with the acting
  Discord user, the command, an allowlisted summary of the options used, the permission-check outcome,
  and (when available) the correlating Slice `requestId`, per `BOT_SECURITY_MODEL.md` §5's
  "correlate a Discord interaction with a specific Slice `AuditEvent` row" pattern applied to the
  reads this document performs.
- **Denied attempts matter as much as successes.** A user without the bot's admin/support role, or a
  linked user whose fresh Slice role check fails, attempting any of these three commands is itself
  logged (`slicePermissionResult: DENIED_*`) — this is the accountability mechanism the assignment
  calls for: "who ran which admin lookup, when," including attempts that were correctly refused.

## 17. Error behavior

Mapped directly from `ERROR_CATALOGUE.md`, scoped to what these three commands can realistically hit:

| Slice error code | HTTP | Discord-facing message (verbatim from `ERROR_CATALOGUE.md`) | When it applies here |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | "That input doesn't look right — check the details and try again." | Malformed `from`/`to` date filters on `/admin audit`, or a malformed `userId` on `/admin status-history` |
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | 401 | "Your linked session needs refreshing — try again in a moment." | Bot silently retries the delegated-token exchange once (GET only) before showing this |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | 401 | "Your Slice link needs to be re-established — run `/account link`." | The invoking admin's own link has gone stale |
| `FORBIDDEN` | 403 | "You don't have permission to do that." | The fresh Slice-side check resolves to a role other than `ADMIN`/`SUPPORT` |
| `RATE_LIMITED` | 429 | "You're doing that too fast — try again in {Retry-After}s." | Reads Slice's `Retry-After` header, per §15 |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | 503 | "Slice is having a moment — try again shortly." | Backend outage while serving audit-events/status-history; retried once automatically since these are GET-only |
| Unrecognized/unexpected error | any | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | Full detail logged server-side only, never interpolated into the user-facing string — the exact defect `ERROR_CATALOGUE.md`'s closing rule and Migration M6 both name as never-to-repeat |

Command-specific cases not already covered by a Slice error code, using the same "specific, friendly
copy" pattern the catalogue establishes rather than a raw 404:

- `/admin status-history` with a `userId` Slice doesn't recognize: no admin-specific "user not found"
  code is enumerated anywhere in `ERROR_CATALOGUE.md`. This document maps that response to the same
  generic-not-found copy the catalogue already uses elsewhere ("Couldn't find that — double check and
  try again.") rather than inventing a new error code that isn't documented; the implementer should
  confirm at build time whether Slice's actual `/v1/admin/users/:id/status-history` 404 response
  carries one of the catalogue's existing codes or a new one, and update this mapping accordingly.
- `/admin audit` with filters that match zero events: **not an error** — a normal empty-result state,
  rendered as "No matching audit events found for those filters," matching the Phase 1 table's own
  "empty results" handling pattern for `/asset search` and similar commands.
- `/admin link-lookup discordUser:` for a Discord user with no Slice link: **not an error** — the
  endpoint's documented response shape is `{linked: false}`, a valid answer, not a 404. Rendered as
  "No Slice account is linked to that Discord user."
- `/admin link-lookup slug:`: always renders the disabled/"not available yet" state described in §18,
  regardless of input — this is a Discord-side unavailable-feature message, not a Slice error, per
  `ERROR_CATALOGUE.md`'s own carve-out ("Discord-side failure ... Specific, context-aware message per
  case, never the generic bot-error message for a Discord-side, not Slice-side, failure").

## 18. Interaction UX

All three commands are **ephemeral** by default, with no exception — every response contains
account-identifying or account-status information about a third party (the audited actor, the
looked-up user, the linked Discord/Slice pair), squarely inside `COMMAND_CATALOGUE.md`'s "Ephemeral
messages" UI standard ("default for anything account-scoped or containing private data").

**`/admin audit`**

- Options: `action` (free text, matched against whatever Slice's endpoint accepts — no client-side
  enum is asserted since none is documented), `actorId`, `subjectId`, `from`, `to` (date inputs).
- Deferred immediately (respecting the 3-second ack window), then a paginated embed list using the
  shared paginator component (Document 003): one row per audit event (action, actor, subject,
  timestamp rendered as `<t:unix:R>`), Previous/Next buttons disabled at bounds, page position in the
  footer.
- Footer on every page: `asOf`/`source` per the bot's general UI standard for any embed sourced from a
  live Slice call.
- Zero-result state: a plain "No matching audit events found for those filters" embed, no pagination
  controls shown.

**`/admin status-history`**

- Option: `userId` (Slice user ID, free text/autocomplete deferred to implementation — no autocomplete
  data source is documented for this, so plain text input is the safe default).
- Deferred, then a single embed: chronological status-change entries (old status → new status,
  timestamp, and whatever safe metadata Slice's response includes), newest first.
- If the entry list is long, reuses the same shared paginator as `/admin audit` rather than a second
  bespoke component.

**`/admin link-lookup`**

- Options: `discordUser` (Discord user-select option type — resolved via Discord's own object, never
  a raw client-typed ID, per `BOT_SECURITY_MODEL.md` §3) and `slug` (free text).
- If `discordUser` is supplied: deferred, then a single embed showing linked status, the Slice
  `userId` (and status, if the endpoint returns it) or a clear "not linked" state.
- If `slug` is supplied: the command responds immediately (no defer needed, since no Slice call is
  made) with a plain-text "not available yet" message explaining the reason — "Looking up a link by
  Slice username/slug isn't available yet; look up by Discord user instead, or ask the backend team
  about the pending `discord-link` reverse-lookup endpoint (see this build guide's Document 013,
  §11)." This mirrors `COMMAND_CATALOGUE.md`'s "Disabled/unavailable features" standard exactly:
  "rendered as a visibly disabled button or a plain-text 'not available yet' message with the reason
  ... never a silently missing feature or a broken click-through."
- If both options are supplied simultaneously, `discordUser` takes precedence and the command
  proceeds on that path only (documented behavior, not a validation error, to keep the UX simple).

No modal, no button, no confirmation dialog is used by any of the three commands — none of them
mutate anything, so `COMMAND_CATALOGUE.md`'s confirmation-dialog standard (reserved for
"destructive/mutating admin action") does not apply here.

## 19. Implementation file plan

| File | Purpose |
|---|---|
| `src/commands/admin/audit.ts` | `/admin audit` command definition and handler wiring |
| `src/commands/admin/statusHistory.ts` | `/admin status-history` command definition and handler wiring |
| `src/commands/admin/linkLookup.ts` | `/admin link-lookup` command definition and handler wiring, including the `slug` disabled-path |
| `src/services/adminLookupService.ts` | Application service: orchestrates the fresh permission check (via Document 006's module), calls the Slice API client, builds response DTOs, writes the `AdminLookupLog` row — no business logic duplicated from Slice |
| `src/services/adminLookupAuditLog.ts` | Repository/writer for the `AdminLookupLog` table (§10) |
| `src/db/migrations/<next-sequential-id>_add_admin_lookup_log.ts` | Migration adding the `AdminLookupLog` table to the bot's existing persistence store, numbered as the next entry in the bot's own migration chain established by Document 001 |
| `src/ui/embeds/adminAuditEmbed.ts` | Embed builder for `/admin audit` results (paginated) |
| `src/ui/embeds/adminStatusHistoryEmbed.ts` | Embed builder for `/admin status-history` results |
| `src/ui/embeds/adminLinkLookupEmbed.ts` | Embed builder for `/admin link-lookup` (both the found/not-linked states and the `slug` disabled-state message) |
| `src/api/adminClient.ts` (extension of Document 002's client, not a new module) | Adds three typed methods: `getAuditEvents(filters)`, `getUserStatusHistory(userId)`, `getDiscordLink(discordUserId)` |
| `tests/unit/commands/admin/*.test.ts` | Unit tests per §21 |
| `tests/integration/admin/*.test.ts` | Integration tests per §22 |
| `tests/discord-interactions/admin/*.test.ts` | Discord interaction tests per §23 |

No file outside this list, and no file in the top-level `docs/discord-bot-build-guide/` tree other
than the ones named in §27, is created or modified by this document's own scope.

## 20. Numbered implementation steps

1. Confirm Documents 001–006 have each closed their own completion checklists; read
   `implementation/005-*.md` and `implementation/006-*.md` directly (not just their summary rows).
2. Confirm the `discord-link` bot-only service endpoints (`BOT_API_REQUIREMENTS.md` §1) are live and
   reachable on the target Slice environment for this document's own integration testing.
3. Extend the Document 002 Slice API client with the three typed read methods named in §19, each
   attaching the same auth/retry/rate-limit handling every other client method already uses — no
   bespoke HTTP logic in the command handlers themselves.
4. Add the `AdminLookupLog` migration (§10) to the bot's existing persistence store and generate the
   corresponding typed model/repository.
5. Implement `adminLookupAuditLog.ts` as a single write path called from `adminLookupService.ts`
   after every command outcome (success, not-found, denied, error) — never skipped on any branch.
6. Implement `adminLookupService.ts`: for each of the three commands, call Document 006's fresh
   permission-check function first; on denial, write the log row and short-circuit with the
   "not linked" or `FORBIDDEN` message per §17 before making any Slice API call.
7. Implement `/admin audit`'s command definition (option schema for `action`/`actorId`/`subjectId`/
   `from`/`to`), wire it to the service, wire pagination to the shared Document 003 paginator.
8. Implement `/admin status-history`'s command definition (`userId` option), wire it to the service.
9. Implement `/admin link-lookup`'s command definition with both `discordUser` and `slug` options;
   wire `discordUser` to the service and the real endpoint; wire `slug` to the immediate disabled-
   state response described in §18, with no Slice API call on that path.
10. Implement the three embed builders (§19), including the zero-result and not-linked/disabled
    states.
11. Wire all three commands into the Document 003 command registry with their permission
    pre-check metadata (bot admin/support role) as the first-pass Discord-side gate.
12. Implement the error-mapping branch for each Slice error code in §17, confirming no raw exception
    text or Slice response body is ever interpolated into a user-facing string.
13. Write unit tests (§21), integration tests (§22), and Discord interaction tests (§23).
14. Run the verification commands (§25) and fix any failure before considering the document closed.
15. Manually complete the QA checklist (§24) in a real dev guild against a non-production Slice
    environment.
16. Update the documentation listed in §27.

## 21. Unit tests

- Permission-check branching: given a fake fresh-permission-check result of `GRANTED_ADMIN`,
  `GRANTED_SUPPORT`, `DENIED_NOT_LINKED`, and `DENIED_INSUFFICIENT_ROLE`, assert the correct
  short-circuit behavior and the correct `AdminLookupLog` write for each, using a fake Slice API
  client (no network), per `TEST_STRATEGY.md`'s unit-test convention.
- Error-mapping: every Slice error code row in §17 mapped to its exact expected Discord-facing string,
  and an assertion that no raw exception/response body ever appears in the mapped output.
- `/admin audit` filter validation: valid/invalid `from`/`to` combinations, empty-filter case,
  pagination-math correctness (page bounds, `hasMore`/`nextCursor` handling) against a fake paginated
  response.
- `/admin link-lookup` branch selection: `discordUser` supplied alone, `slug` supplied alone, both
  supplied together (asserting `discordUser` precedence per §18), neither supplied (validation error).
- `AdminLookupLog` row construction: assert the `optionsSummary` field never contains an unallowlisted
  key (e.g., a raw Slice access token accidentally passed through) for any of the three commands.

## 22. Integration tests

- `/admin audit` and `/admin status-history` run against a **disposable local Slice instance**
  (`TEST_STRATEGY.md`'s convention, mirroring Slice's own Doc 002 disposable-Postgres pattern) with a
  seeded `ADMIN` and a seeded `SUPPORT` user, asserting both roles succeed and a non-admin/non-support
  linked user is denied.
- `/admin link-lookup discordUser:` run against the same disposable instance once the `discord-link`
  bot-only endpoints (§2 of this document's steps) are live on it, covering: linked user found,
  never-linked Discord user, and a Discord user whose link was previously removed (`unlinkedAt` set).
- Rate-limit behavior: deliberately trigger Slice's documented rate limit on `/v1/admin/audit-events`
  against the disposable instance and confirm the bot surfaces the friendly `RATE_LIMITED` message
  with the correct `Retry-After` value, not a raw 429.
- `AdminLookupLog` persistence: confirm a row is actually written to the bot's own disposable database
  for each of success, not-found, and denied outcomes across all three commands.

## 23. Discord interaction tests

- Simulated slash-command payloads for all three commands, run through the real interaction router
  and command handlers (per `TEST_STRATEGY.md`'s "Discord interaction tests" convention), asserting:
  ephemeral flag is always `true`, embed field shape matches §18's wireframe, and pagination button
  component state (enabled/disabled at bounds) is correct for `/admin audit`.
- Permission pre-check simulation: an interaction from a Discord user without the bot's configured
  admin/support role is rejected before any service-layer/Slice call is made (asserted via a spy on
  the fake Slice client showing zero invocations).
- `/admin link-lookup slug:` simulated interaction: asserts the immediate disabled-state response
  with no defer and no Slice client invocation at all (since §18 specifies no API call is made on
  that path).
- Persistent-component round-trip: the `/admin audit` paginator's button custom IDs survive a
  simulated bot restart and still resolve to the correct page/filter state from bot-owned component
  state, per `BOT_ARCHITECTURE.md`'s persistent-button convention.

## 24. Manual QA checklist

- [ ] `/admin audit` with no filters returns a paginated list; Previous/Next buttons behave correctly
      at both bounds.
- [ ] `/admin audit` with each individual filter (`action`, `actorId`, `subjectId`, `from`, `to`) and
      with combinations of filters, against a real (non-production) Slice environment.
- [ ] `/admin audit` with filters matching zero events shows the friendly empty-result message, not an
      error.
- [ ] `/admin status-history` for a real seeded `userId` with multiple status changes shows them in
      correct chronological order.
- [ ] `/admin status-history` for a `userId` with no history, and for a `userId` Slice doesn't
      recognize, both show friendly (non-raw-error) messages.
- [ ] `/admin link-lookup discordUser:` for a linked user, a never-linked user, and (if seedable) a
      previously-unlinked user, all show the correct distinct states.
- [ ] `/admin link-lookup slug:` always shows the disabled/"not available yet" message with no Slice
      call made (confirm via logs — zero Slice request for this path).
- [ ] All three commands, run by a Discord user holding the bot's admin/support role but whose linked
      Slice account is *not* `ADMIN`/`SUPPORT`, are denied — confirming the Slice-side gate is not
      bypassable by Discord role alone.
- [ ] All three commands, run by a Discord user with no linked Slice account at all, show the
      "not linked" prompt, not a generic permission error.
- [ ] Rate-limit QA: deliberately trigger Slice's documented rate limit on each endpoint and confirm
      the friendly message with correct `Retry-After`.
- [ ] Security QA: after a full manual pass, grep the bot's structured logs, the `AdminLookupLog`
      table, and the Discord test guild's message history for any raw email, token, session cookie,
      or unhandled exception text — none should appear, per `TEST_STRATEGY.md`'s security-QA
      convention.
- [ ] Confirm every invocation above (including every denied attempt) produced exactly one
      `AdminLookupLog` row with the correct outcome.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance with the discord-link endpoints live
npm run build
```

## 26. Completion checklist

- [ ] `/admin audit`, `/admin status-history`, `/admin link-lookup discordUser:` implemented and
      passing all tests in §§21–23
- [ ] `/admin link-lookup slug:` implemented as a disabled/"not available yet" state, with zero Slice
      API calls made on that path
- [ ] Fresh, non-cached Slice `ADMIN`/`SUPPORT` permission check (via Document 006's mechanism) is
      the sole authority on every invocation — no Discord role is ever treated as sufficient alone
- [ ] `AdminLookupLog` table, migration, and write path implemented, covering every outcome including
      denials
- [ ] No mutation of any kind introduced anywhere in this scope
- [ ] No raw Slice error body, stack trace, token, or PII ever surfaced in an embed or log line
- [ ] Every error code in §17 mapped and tested
- [ ] Manual QA checklist (§24) fully run in a real dev guild against a non-production Slice
      environment
- [ ] Verification commands (§25) all pass
- [ ] The proposed reverse-lookup endpoint shape (§11) has been communicated to Slice's/the bot's
      backend team as a named, scoped ask — not silently left as an open TODO in code

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md` — flip Document 013's status row from `NOT STARTED`
  to its actual closed state once the completion checklist (§26) is satisfied; do not mark it complete
  based on this document alone.
- `CURRENT_STATE.md` — update once 013 closes, noting explicitly that `/admin link-lookup slug:`
  remains in a disabled state pending the new reverse-lookup endpoint, so a future reader doesn't
  assume full parity with the `discordUser:` path.
- `BOT_API_REQUIREMENTS.md` §1 — add the proposed reverse-lookup endpoint (§11 of this document) as a
  named, scoped ask for Slice's backend team, rather than leaving it undocumented outside this
  implementation document.
- `COMMAND_CATALOGUE.md` — annotate the `/admin link-lookup` row to note the `slug` option's
  phased/disabled status, so the top-level catalogue doesn't imply both options are equally available.
- `MASTER_CHECKLIST.md`'s "Production readiness" section — no new row is required by this document
  specifically, since it introduces no new named Slice backend blocker beyond what §11 already
  documents as a proposal.

## 28. Final report format

An implementer closing this document reports, in this order:

1. **Status:** closed / blocked, and if blocked, the exact blocking condition (e.g., "Document 006's
   permission module is not yet merged").
2. **Commands shipped:** `/admin audit`, `/admin status-history`, `/admin link-lookup discordUser:` —
   confirmed working against a named non-production Slice environment; `/admin link-lookup slug:` —
   confirmed shipped in its disabled state.
3. **Tests:** pass/fail state of §§21–23 and the verification commands in §25, with a link/reference
   to the CI run if applicable.
4. **Manual QA:** confirmation that §24's checklist was run in full, with the date and target Slice
   environment named.
5. **Open items handed off:** the proposed reverse-lookup endpoint (§11) as a named ask to the backend
   team, and any other deviation from this document's scope discovered during implementation.
6. **Documentation updated:** confirmation that §27's updates were actually made, not just planned.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
