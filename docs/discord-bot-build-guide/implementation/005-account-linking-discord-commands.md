# Implementation Document 005 — Account-linking Discord commands

## 1. Metadata

- **Document number:** 005
- **Title:** Account-linking Discord commands
- **Status:** NOT STARTED (this build guide is documentation-only and contains no completed
  implementation work; every implementation document starts in this state)
- **Depends on (this build guide):** 003 (Discord interaction framework and command registry), 004
  (Account-linking domain and backend API requirements)
- **Blocks (this build guide):** 006 (Permission and authorization integration), 009 (Watchlist and
  portfolio commands), 010 (Notification commands and delivery-preference documentation), 013 (Admin
  read-only operational commands)
- **Slice backend dependency:** same as 004 — the bot-only service endpoints in
  `BOT_API_REQUIREMENTS.md` §1 (`POST /v1/bot/discord-link/challenge`,
  `POST /v1/bot/discord-link/unlink`, `GET /v1/bot/discord-link/:discordUserId`) and the
  service-account credential type (§3) must exist on a Slice environment
- **Can start today:** Blocked until 004 closes. **This document additionally cannot be marked
  complete until 004's own Slice backend dependency is satisfied** — 004 itself is only
  spec-complete today ("spec work: yes, full closure: blocked on Slice team building the new
  endpoints" per `IMPLEMENTATION_ORDER.md`); 005's command handlers have nothing real to call until
  those endpoints exist on a reachable Slice environment. Writing and unit-testing the Discord-facing
  command code against a fake Slice API client can proceed once 004 closes its domain/contract work,
  but integration testing, manual QA, and this document's own completion checklist all require the
  live endpoints.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend exposing an HTTP API
(`/v1/*`). The Slice Discord bot being built here is a **companion client** to Slice — it calls
Slice's HTTP API for every read and write, never queries Slice's Postgres/Prisma directly, never
duplicates a Slice business rule, and never becomes a second backend. This document is the fifth of
18 implementation documents in `IMPLEMENTATION_ORDER.md` and sits at the head of **Track A** (the
account-linking track: 004 → 005 → 006 → 009 → 010 → 013). Document 004 established the
account-linking **domain model** and the Slice-side **backend contract** (the new bot-only endpoints
and the `DiscordLink` mapping) without writing any Discord-facing code. This document (005) is where
that contract becomes real, invocable Discord slash commands: `/account link`, `/account unlink`, and
`/account status`. Everything downstream that requires a linked Slice account (watchlist, portfolio,
notifications, admin reads) depends on the interaction patterns — especially the reusable
"not linked → prompts `/account link`" component — this document delivers.

## 3. Current implementation audit

Before this document starts, per `IMPLEMENTATION_ORDER.md`'s strict ordering, the following are
assumed closed:

- **001 (Repository reconciliation and bot foundation):** the bot's TypeScript/discord.js project
  skeleton, config loader, Discord client bootstrap, health/readiness endpoints.
- **002 (Slice API client and shared contracts):** a typed Slice API client module and shared DTO
  types, covering the "already available" endpoints (`BOT_API_REQUIREMENTS.md`, top table) — this
  does **not** yet include the new bot-only endpoints from §1–3, since those didn't exist when 002
  closed (002's Slice backend dependency is documents 004–008 VERIFIED read-only surface only).
- **003 (Discord interaction framework and command registry):** the interaction router, command
  registry, permission/rate-limit pre-check scaffolding, deferred-response helpers, embed-builder
  module, and the shared button-based confirmation pattern — all with no product-specific commands
  registered yet.
- **004 (Account-linking domain and backend API requirements):** the account-linking domain model
  (challenge/complete/unlink/lookup flows), the typed client methods for the four bot-only endpoints
  added to the Slice API client from 002, and the specific `DiscordLink` contract shape — but,
  per 004's own stop condition, **no Discord command surface**. 004 is explicitly scoped as
  domain/contract work only.

**What does not exist yet when 005 starts:** no `/account link`, `/account unlink`, or
`/account status` command registration; no confirmation-button handlers for unlink; no "not linked"
prompt component (referenced by every later document per `COMMAND_CATALOGUE.md`'s UI standards); no
local rate-limit pre-check state for these three commands; nothing in the bot's own database related
to account linking (the mapping itself is Slice-side, not bot-owned, per `BOT_DATA_OWNERSHIP.md`).

## 4. Old bot behavior migrated

Per `OLD_BOT_FEATURE_INVENTORY.md` row 15 — **`Verification.py`** (`cogs/Verification.py`,
`on_raw_reaction_add` in the verify channel):

- **Old behavior:** a new member reacts in a verify channel, the bot DMs a random 4-digit code, and
  `bot.wait_for` blocks for a matching reply before granting a "member" Discord role. State lives
  only in an in-memory `sentError` list (does not survive a restart), has no expiry, no replay
  protection, and does not link to any external identity — it is purely anti-raid/anti-bot theater,
  not account linking in any real sense.
- **Migration status: REWRITE.** The inventory explicitly notes this is "conceptually the closest
  thing to 'account linking'" in the old bot, and that the *concept* (a DM/ephemeral-message-based
  confirmation flow with a reaction or command entry point) is reasonable UX to reuse for the real
  Slice account-linking flow — but "the implementation (in-memory state, no expiry, no replay
  protection, grants a role rather than establishing identity) must not be reused."
- **What this document actually reuses:** the entry-point-then-code-confirmation *shape* only. Every
  implementation detail is rebuilt per `BOT_SECURITY_MODEL.md` §1: the code is server-generated
  (never client-supplied), single-use, ≤10 minutes, invalidated on any use (success or failure),
  bound server-side to the requesting Discord user ID, shown only in an ephemeral message, and
  completion happens on the authenticated Slice web app — not via a Discord DM reply — so the bot
  never has to `wait_for` free-text input or hold a code-comparison responsibility itself.
- No other row in `OLD_BOT_FEATURE_INVENTORY.md` maps to this document's scope; `/account unlink` and
  `/account status` have no old-bot predecessor (Infria had no external identity-linking concept at
  all beyond the role-grant verification above).

## 5. Slice features supported

- **Account linking (new Slice capability, NOT STARTED on the Slice side today):** per
  `BOT_PRODUCT_SPEC.md` §1, "no Discord-identity concept exists anywhere in Slice today" — confirmed
  by 004's own review of Docs 003–018 and the entity blueprint. This document's three commands are
  entirely dependent on the four bot-only endpoints in `BOT_API_REQUIREMENTS.md` §1, which are
  proposed, not built. Status: **NOT STARTED (Slice backend), spec-only (this build guide)**.
- **Session/profile read (`GET /v1/session`, `GET /v1/me`):** status **VERIFIED** per
  `BOT_API_REQUIREMENTS.md`'s "already available" table — these back the profile-detail portion of
  `/account status`. See the cross-document dependency note in §11 and §18 below regarding how the
  bot obtains a token scoped to call these on a linked user's behalf.
- **Service-account authentication (`BOT_API_REQUIREMENTS.md` §3):** status **NOT STARTED** — "no
  such entity exists in Docs 003–018 today." Every one of this document's Slice calls to the §1
  endpoints requires this credential type to exist first.
- **Slice `AuditEvent` model:** status **VERIFIED** as an existing Slice concept (Docs 003/005), but
  the specific `actorType: SERVICE` extension needed for bot-originated audit rows is **NOT
  STARTED** (BOT_API_REQUIREMENTS.md §3).

## 6. Files to read before starting

- `BOT_SECURITY_MODEL.md` §1 (account linking), §2 (guild authorization), §3 (custom-ID/interaction
  forgery), §4 (bot token/Slice credential safety), §5 (idempotency/rate-limit/audit obligations), §6
  (Discord role ≠ Slice permission), §7 (recent authentication for high-impact actions), §8
  (compromised Discord account handling), §10 (logging redaction).
- `BOT_DATA_OWNERSHIP.md` — specifically the `DiscordLink` mapping row ("shared — Slice is
  authoritative") and the "Discord interaction state" row (bot-owned, ephemeral, short TTL).
- `BOT_API_REQUIREMENTS.md` §1–3 in full.
- `COMMAND_CATALOGUE.md` — the `/account link`, `/account unlink`, `/account status` rows, and the
  "UI standards" section (buttons/modals, ephemeral defaults, confirmation dialogs, rate-limit
  messages, account-link prompts).
- `PERMISSION_MATRIX.md` — the four `/account *` rows.
- `ERROR_CATALOGUE.md` — in full, plus the note on the gap described in §17 below.
- `OLD_BOT_FEATURE_INVENTORY.md` row 15 (`Verification.py`).
- `BOT_ARCHITECTURE.md` — interaction router, deferred-response helpers, idempotency-key derivation,
  rate-limit handling, embed-builder module, custom-ID conventions (all built generically in 003; this
  document is the first consumer of several of them).
- `TEST_STRATEGY.md` — "Account-link token lifecycle" unit-test line and the integration-test note on
  the full link → delegated-token-exchange → mutation path.
- Implementation Document 004 itself (`implementation/004-account-linking-domain-and-backend-api-requirements.md`)
  once it exists — this document builds directly on 004's domain model and typed client methods.

## 7. Strict scope

- Registers and implements the three Discord-facing account commands: `/account link`,
  `/account unlink` (self-service path), `/account status`.
- Implements the exact interaction flow for each command per `BOT_SECURITY_MODEL.md` §1 and
  `COMMAND_CATALOGUE.md`'s UI standards: deferred ephemeral acknowledgement, code display for link,
  button-based confirm/cancel for unlink, read-only profile embed for status.
- Implements the bot-side local rate-limit pre-check for `/account link` (3/hour/user) and
  `/account unlink` (5/hour/user), on top of Slice's own server-side enforcement.
- Implements the shared, reusable **"not linked → prompts `/account link`"** component
  (`COMMAND_CATALOGUE.md` UI standards: "any command requiring a linked account that's invoked by an
  unlinked user responds with a short explanation and a button that runs `/account link` directly")
  — built here because `/account status` is the first command to need it, but designed for reuse by
  006, 009, 010, and 013.
- Maps every error returned by the four §1 endpoints (and the two already-available endpoints used by
  `/account status`) to the friendly copy patterns in `ERROR_CATALOGUE.md`, extended per §17 below for
  the not-yet-catalogued bot-only error cases (already-linked, not-linked).
- Implements bot-local structured logging correlating each command invocation with the Slice request
  ID returned by the API call, per `BOT_SECURITY_MODEL.md` §5.
- Defines (but does not implement, since 006 owns integration authorization work) the exact contract
  shape the shared "not linked" component and the account-status embed expose, so 006/009/010/013 can
  consume them without re-deriving the pattern.

## 8. Out of scope

- The admin-assisted `/account unlink` path's full working implementation. `PERMISSION_MATRIX.md`
  lists a "support" row (Slice `ADMIN` + recent-auth, two-gate) for this command, and
  `BOT_API_REQUIREMENTS.md` §1 already provisions the backend capability
  (`POST /v1/bot/discord-link/unlink` accepts an admin token + `{userId, reasonCode}`). But
  `COMMAND_CATALOGUE.md` lists `/account unlink`'s **Options** column as `—`, giving the command no
  documented target parameter, and `BOT_SECURITY_MODEL.md` §7 flags that the bot cannot itself satisfy
  Slice's "recent-auth" freshness requirement for admin-triggered high-impact mutations and
  recommends **not exposing these specific mutations in Discord in early phases**. This document
  therefore delivers the Discord-side admin **permission gate** (bot support/admin role check, per
  `PERMISSION_MATRIX.md`) as dead code behind a feature flag default-off, but does **not** deliver a
  working admin-initiated unlink flow — that requires an explicit interaction-design decision
  (how an admin supplies a target, and how Discord-side recent-auth is satisfied) that is not resolved
  anywhere in this build guide's top-level documents. Flagged for product/security sign-off before any
  future document turns the flag on.
- The delegated-token-exchange mechanism itself (`BOT_API_REQUIREMENTS.md` §2,
  `POST /v1/bot/tokens/exchange`) — that is Document 006's ("Permission and authorization
  integration") scope. See the cross-document dependency note in §11/§18: this document specs
  `/account status`'s full UX assuming that mechanism exists, but does not build it.
- `POST /v1/me/discord-link/complete` — this is called from the **Slice web app**, under a real user
  session, not from the bot. Nothing in this document implements or tests that endpoint or its web UI.
- The bot-only service-account credential/authentication mechanism itself
  (`BOT_API_REQUIREMENTS.md` §3) — provisioning and issuing that credential is a Slice backend team
  action, not bot-side code.
- Watchlist, notification, portfolio, or admin-read commands (009, 010, 013) — those consume this
  document's linked-account pattern but are not built here.
- Any Discord-side automatic reaction to a Slice account status change (`SUSPENDED`, etc.) beyond
  what `/account status` displays when queried — no proactive push, per `BOT_SECURITY_MODEL.md` §6.
- Push notification delivery of any kind (`BOT_API_REQUIREMENTS.md` §4) — unrelated to this document's
  scope entirely.

## 9. Dependencies

- discord.js v14+ (already a project dependency per 001/003) — slash command builder,
  `ButtonBuilder`/`ActionRowBuilder` for the unlink confirm/cancel and "not linked" prompt components,
  ephemeral (`flags: MessageFlags.Ephemeral`) response helpers from 003.
- The Slice API client module from 002, extended by 004 with typed methods for the four §1 endpoints
  and the two already-available endpoints (`GET /v1/session`, `GET /v1/me`).
- A short-TTL cache for pending interaction state (see §10) — reuses whatever key/value store 003
  already introduced for the generic interaction-router layer (Redis, per `BOT_ARCHITECTURE.md`'s
  mention of Redis for bot-owned state), rather than introducing a second store.
- No new third-party npm package is required beyond what 001–003 already established.

## 10. Bot-owned persistence

The Discord↔Slice link mapping itself is **not** bot-owned (per `BOT_DATA_OWNERSHIP.md`, it is
"shared — Slice is authoritative for the mapping's existence/validity"). This document introduces two
narrow, ephemeral, short-TTL entries under the "Discord interaction state" and local rate-limit rows
of `BOT_DATA_OWNERSHIP.md` — neither is a system of record and neither duplicates anything Slice owns:

1. **Pending unlink confirmation state** (per-interaction, keyed by an opaque, bot-generated
   confirmation ID embedded in the Confirm/Cancel button custom IDs — never a raw Slice user ID or
   Discord user ID alone, per `BOT_SECURITY_MODEL.md` §3):

   ```text
   key:   pending-unlink:{opaqueConfirmationId}
   value: { discordUserId, requestedAt }
   ttl:   120 seconds (Discord's own component-interaction timeout window is respected on top)
   ```

   On Confirm, the handler re-verifies `interaction.user.id === value.discordUserId` before calling
   Slice (never trusts "this button was shown to the right person" alone, per
   `BOT_SECURITY_MODEL.md` §3). On timeout or Cancel, the key is deleted / left to expire; no
   Slice call is made.

2. **Local rate-limit pre-check counters** (bot-side optimization only — the authoritative limit is
   enforced by Slice itself on the §1 endpoints; this is purely to avoid calling Slice at all for an
   obviously-throttled user, per `BOT_ARCHITECTURE.md`'s "Rate-limit handling" section):

   ```text
   key:   ratelimit:{discordUserId}:{command}   # command ∈ {account-link, account-unlink}
   value: incrementing counter
   ttl:   3600 seconds (rolling, reset on window expiry)
   ```

Neither entry is queried by any other command in this document set, is never exposed to the user
directly, and is discarded if lost (a cache miss simply means the bot's local pre-check falls through
to Slice's own server-side rate-limit response, which is the authoritative source either way).

## 11. Slice API dependencies

| Endpoint | Tag (`BOT_API_REQUIREMENTS.md`) | Used by | Notes |
|---|---|---|---|
| `POST /v1/bot/discord-link/challenge` | Bot-only service endpoint, §1 — **not yet built** | `/account link` | Service-account auth. Body `{discordUserId}`. Rate limited server-side (3/hour/user) in addition to this document's local pre-check. |
| `POST /v1/bot/discord-link/unlink` | Bot-only service endpoint, §1 — **not yet built** | `/account unlink` (self-service path only, per §8) | Service-account auth for the self-service case (`{discordUserId}`); admin-token path exists in the endpoint's design but is out of scope here per §8. Idempotent, audited server-side. |
| `GET /v1/bot/discord-link/:discordUserId` | Bot-only service endpoint, §1 — **not yet built** | `/account link` (already-linked pre-check), `/account unlink` (not-linked pre-check), `/account status` (linked/not-linked gate), the shared "not linked" prompt component | Service-account auth. Returns `{linked, userId?, status?}` without requiring a user-scoped token — this is how the bot resolves link state cheaply. |
| `GET /v1/session` | Already available, VERIFIED | `/account status` | **User-session-scoped**, not service-account-scoped. See the cross-document dependency note below. |
| `GET /v1/me` | Already available, VERIFIED | `/account status` | Same as above. |
| Service-account authentication itself | §3 — **not yet built** | All of the above §1 calls | Prerequisite for every bot-only call in this document; nothing above works until this exists. |

**Cross-document dependency note (flagged, not silently assumed):** `/account status`'s two backend
calls (`GET /v1/session`, `GET /v1/me`) are **user-token-scoped** endpoints — they require a Slice
access token representing the linked Slice user, not the bot's service-account credential. The only
mechanism this build guide defines for the bot to obtain such a token without holding the user's
password or refresh token is the delegated-token-exchange endpoint
(`POST /v1/bot/tokens/exchange`, `BOT_API_REQUIREMENTS.md` §2, scope `profile:read`), and that
mechanism is explicitly Document 006's scope ("Permission and authorization integration"), not this
document's. `IMPLEMENTATION_ORDER.md` lists 005's dependencies as 003 and 004 only — it does not list
006 as a dependency of 005, even though 005's own `/account status` command, as specced in
`COMMAND_CATALOGUE.md`, calls endpoints that need 006's token-exchange integration to reach. This
document resolves that tension by splitting `/account status` into two parts (see §18): the
**linked/not-linked gate**, built fully here using the service-account-scoped
`GET /v1/bot/discord-link/:discordUserId` lookup (available once 004's endpoints exist, no dependency
on 006), and the **profile-detail rendering** (`GET /v1/session`/`GET /v1/me` data), whose UX and
embed shape are specced here but whose actual Slice call is wired once 006's token-exchange lands.
This document's completion checklist (§26) reflects this split explicitly rather than claiming a
capability this document alone cannot deliver.

## 12. Commands / events / jobs delivered

Pulled directly from `COMMAND_CATALOGUE.md`'s Phase 1 table, filtered to this document's scope:

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases | Old-bot predecessor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/account link` | Start linking Discord to Slice | — | any member | no (this creates the link) | ephemeral | `POST /v1/bot/discord-link/challenge` | 3/hour/user | Slice `AuditEvent` on completion (written when the web app completes the link, not by this command itself — see §16) | n/a (challenge) | already-linked, rate-limited | `Verification.py` (concept only) |
| `/account unlink` | Remove the link | — | self or admin (recent-auth) | yes | ephemeral | `POST /v1/bot/discord-link/unlink` | 5/hour/user | yes | required | not-linked | — |
| `/account status` | Show profile/status/join date | — | any member | yes | ephemeral | `GET /v1/session`, `GET /v1/me` | standard | n/a (read) | n/a | not-linked → prompts `/account link` | — |

No events or scheduled jobs are delivered by this document — account linking is entirely
interaction-driven (slash command + button), with no background job component.

## 13. Permission rules

Cited directly from `PERMISSION_MATRIX.md`:

| Capability | Discord-side gate | Slice-side gate |
|---|---|---|
| `/account link`, `/account status` | any member | none (self-service) |
| `/account unlink` (self) | any member | self-token match |
| `/account unlink` (support) | bot support/admin role | Slice `ADMIN` + recent-auth |

Per `PERMISSION_MATRIX.md`'s stated rule and repeated here for this document specifically: **a
Discord-side role check is always a gate, never a substitute for the corresponding Slice-side check.**
Concretely for this document: Discord imposes no role restriction on `/account link` or
`/account status` (any guild member can run them), but the *authorization* that actually matters —
"is this the right Discord user for this Slice account" — is enforced entirely server-side by Slice
(the challenge token is bound to the Discord user ID Discord itself attaches to the interaction, per
`BOT_SECURITY_MODEL.md` §1, never a client-supplied value). For `/account unlink` self-service, "any
member" Discord-side plus "self-token match" Slice-side means the bot never needs to ask "are you
allowed to unlink this," it always operates on the linked mapping for the exact Discord user invoking
the command. The support-assisted row is present in the matrix but not delivered by this document
(§8).

## 14. Security requirements

Cited from `BOT_SECURITY_MODEL.md`, with what's specific to this document's scope called out:

- **§1 (Account linking):** the token generated by `POST /v1/bot/discord-link/challenge` is shown
  **only** in an ephemeral Discord message — this document's `/account link` handler must never post
  it publicly, log it, or include it in any non-ephemeral surface. The token is single-use and
  ≤10-minutes-lived; the bot displays the `expiresAt` value returned by Slice using Discord's native
  relative-timestamp markdown (`<t:unix:R>`) rather than computing or trusting a client-side timer.
  The bot never trusts a client-supplied Discord ID for the challenge request — it always reads
  `interaction.user.id` from the interaction object Discord itself provides.
- **§1 (1:1 enforcement):** an already-linked user calling `/account link` again must receive the
  "already linked" error verbatim from Slice's response, mapped to friendly copy (§17) — never a
  silent overwrite, never a second challenge issued client-side to paper over the rejection.
- **§1 (Unlink/relink):** `/account unlink`'s self-service path requires no additional Discord-side
  proof beyond "this is the linked Discord user" (enforced server-side); relinking after unlink always
  requires the full challenge flow again — this document's `/account link` handler contains no
  "skip the challenge, you were linked before" shortcut.
- **§1 (No password collection, ever):** no Slice access/refresh token, session cookie, or password
  is ever placed in a Discord message, embed, button custom ID, modal, or log line by any handler in
  this document. `/account status`'s embed shows profile fields only (status, joined date, linked
  Discord ID confirmation per `BOT_PRODUCT_SPEC.md` §2) — no token internals, no raw session data.
- **§3 (Custom-ID opacity and re-verification):** the unlink confirm/cancel buttons use an opaque,
  bot-generated confirmation ID (§10) as their custom ID, never a raw Slice user ID, email, or
  predictable sequential ID. The Confirm handler re-verifies `interaction.user.id` against the stored
  pending-confirmation state before calling Slice, per §10 above.
- **§5 (Idempotency/rate-limit/audit — bot-side obligations):** every mutating call in this document
  (`challenge`, `unlink`) carries a deterministic `Idempotency-Key`; the bot never bypasses Slice's own
  rate limiting with parallel retries and honors `Retry-After`; the bot logs its own local action
  (Discord user, command, outcome, Slice request ID) without duplicating Slice's audit record (§16).
- **§6 (Discord role ≠ Slice permission):** none of this document's three commands treat Discord role
  possession as proof of Slice status — `/account status`'s account-status display always reflects a
  fresh Slice read (subject to the §11 dependency note), never a cached value.
- **§7 (Recent authentication):** flagged explicitly in §8 as the reason the admin-assisted unlink
  path is out of scope for this document.
- **§10 (Logging redaction):** structured logs from this document's handlers redact known-sensitive
  field names by default; no log line ever contains a raw email address, password, token, or session
  cookie, mirroring Slice's own audit metadata allowlisting approach.

## 15. Idempotency and rate limits

- **`/account link` (challenge):** not idempotent by design, marked "n/a (challenge)" in
  `COMMAND_CATALOGUE.md` — each invocation is intended to mint a fresh single-use code (the previous
  one, if any and still valid, is superseded), so there is no meaningful "same request, same result"
  contract to key an idempotency key against. Instead, the abuse-prevention control is the rate limit:
  **3/hour/user**, enforced authoritatively by Slice on `POST /v1/bot/discord-link/challenge`
  (`BOT_API_REQUIREMENTS.md` §1) and pre-checked locally by this document's rate-limit cache (§10) to
  avoid an unnecessary Slice round-trip once a user is already over the local count.
- **`/account unlink`:** idempotency **required**, per `COMMAND_CATALOGUE.md`. The deterministic key
  is derived per `BOT_ARCHITECTURE.md`'s scheme: `(discordUserId, command, targetResourceId, nonce)`
  — here `command = "account-unlink"`, `targetResourceId = discordUserId` (the resource being mutated
  is the link itself, identified by the acting Discord user), and `nonce` fixed per logical unlink
  intent (regenerated only if the user explicitly retries after an error via a fresh Confirm click,
  not on every Discord gateway retry of the same click). This makes a double-click on Confirm, or a
  Discord-side interaction retry, safe — Slice's own `POST /v1/bot/discord-link/unlink` is documented
  as "Idempotent, audited." Rate limit: **5/hour/user**, enforced server-side, pre-checked locally.
- **`/account status`:** read-only, no idempotency key needed (`n/a` in the catalogue). Rate limit:
  "standard" (Slice's normal per-user read rate limit, no bot-specific override).
- All three commands' local rate-limit pre-check (§10) is a UX optimization only — if it is ever
  wrong (cache miss, restart), the request still reaches Slice and Slice's own server-side limit is
  the true enforcement point, consistent with `BOT_ARCHITECTURE.md`'s "local pre-check... plus
  honoring Slice's own headers."

## 16. Audit requirements

- **Slice-side (`AuditEvent`):**
  - `/account link`'s challenge creation itself is **not** the audited event — `COMMAND_CATALOGUE.md`
    marks the audit as occurring "on completion," and per `BOT_API_REQUIREMENTS.md` §1, the actual
    `AuditEvent` write happens inside `POST /v1/me/discord-link/complete`, which fires when the user
    finishes the flow on the **Slice web app**, entirely outside this document's call graph. This
    document's `/account link` handler therefore has **no direct signal** that a link succeeded — the
    bot only knows a challenge was issued. This is flagged honestly rather than assumed away: the
    user finds out their link is active by re-running `/account status` (or a future command), not
    via a real-time confirmation inside Discord, since no webhook/push mechanism exists
    (`BOT_API_REQUIREMENTS.md` §4 is explicitly not built).
  - `/account unlink`'s call to `POST /v1/bot/discord-link/unlink` is synchronous and, per
    `BOT_API_REQUIREMENTS.md` §1, "Idempotent, audited" — the `AuditEvent` write happens as part of
    that call, and the bot receives success/failure directly in the same response it's already
    handling.
  - Once §3's `ServiceAccount`/`actorType: SERVICE` extension exists, every one of this document's
    service-account-authenticated calls is distinguishable in Slice's audit trail from a human actor,
    per `BOT_SECURITY_MODEL.md` §3's design.
- **Bot-side (operational log, never a competing audit record):** per `BOT_SECURITY_MODEL.md` §5,
  every command invocation in this document logs, at minimum: the Discord user ID, the command name,
  the outcome (success/already-linked/not-linked/rate-limited/error), and the Slice request ID
  returned by the API call (for support correlation) — never the challenge code itself, never a token.
  This bot-local log exists purely for operational correlation (§16 of `BOT_ARCHITECTURE.md`'s "audit
  correlation" concern), not as a second source of truth for whether a link exists.

## 17. Error behavior

Cited from `ERROR_CATALOGUE.md` where the code already exists there; flagged as a documented gap
where it doesn't:

| Slice error code | Discord-facing message (per `ERROR_CATALOGUE.md`) | Applies to |
|---|---|---|
| `RATE_LIMITED` | "You're doing that too fast — try again in {Retry-After}s." | `/account link`, `/account unlink` (both server-side and local pre-check trigger this copy) |
| `VALIDATION_FAILED` | "That input doesn't look right — check the details and try again." | Any malformed request (should not occur in normal use since these commands take no user-supplied options, but the client must still handle it defensively) |
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | "Your linked session needs refreshing — try again in a moment." (bot silently retries a GET-only delegated exchange once first) | `/account status`'s profile-detail portion, once 006's token exchange is wired (§11) |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | "Your Slice link needs to be re-established — run `/account link`." | Same as above |
| Unrecognized/unexpected error | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | Any error from the four §1 endpoints not covered by a named row (see gap below) |

**Documented gap:** `ERROR_CATALOGUE.md` maps *Slice's existing* error codes (from Docs 004–008). The
new bot-only §1 endpoints do not exist yet, so their exact error code strings ("already linked,"
"not linked," code-expired, code-already-used) are **not yet defined anywhere** in this build guide —
`BOT_SECURITY_MODEL.md` §1 only specifies the *behavior* ("expired tokens are rejected with a generic
error — no distinction between 'expired' and 'already used' is leaked"). This document specifies the
**UX pattern** these bot-only errors must follow once Slice's team defines the actual codes, rather
than inventing authoritative code strings that don't exist:

- **Already linked** (`/account link` on an already-linked Discord account): a short, specific,
  friendly message ("You're already linked to a Slice account — run `/account status` to see it, or
  `/account unlink` first if you need to relink.") — never the generic unrecognized-error copy.
- **Not linked** (`/account unlink` or `/account status` on an unlinked Discord account): renders the
  shared "not linked → prompts `/account link`" component (§18), never a bare error.
- **Code expired / already used** (surfaced only if the web-app completion step somehow reaches the
  bot, which it does not in this document's scope — flagged for completeness): would follow the same
  "no distinction leaked" rule as `BOT_SECURITY_MODEL.md` §1 specifies, using a single generic "that
  code isn't valid — run `/account link` again" message.
- Any §1 error not matching one of the above falls through to the existing "unrecognized/unexpected
  error" row verbatim — never interpolating a raw exception object into the user-facing string, per
  the rule inherited from the old bot's `ErrorHandler.py` bug (Migration M6).

## 18. Interaction UX

### `/account link`

1. Interaction received → defer ephemerally immediately (respecting Discord's 3-second ack window,
   per `BOT_ARCHITECTURE.md`).
2. Local rate-limit pre-check (§10/§15); if already over the local count, skip the Slice call and
   render the rate-limited message directly using the locally-tracked reset time as a `Retry-After`
   estimate.
3. Call `POST /v1/bot/discord-link/challenge` with `{discordUserId: interaction.user.id}`
   (service-account auth, `Idempotency-Key` not applicable per §15).
4. **Success:** ephemeral embed with: the code (formatted for easy copy, e.g. a code block), the
   expiry rendered as `<t:unix:R>`, and short instructions to complete the link on the Slice web app
   (the exact URL/route for the "confirm Discord link" page is not guessed here — pulled from Slice's
   real frontend routes at implementation time, mirroring how `COMMAND_CATALOGUE.md`'s UI standards
   defer brand-color hex values to implementation time rather than guessing). No button that
   auto-completes anything in Discord — completion is explicitly web-app-side per
   `BOT_SECURITY_MODEL.md` §1.
5. **Already-linked error:** ephemeral message per §17, no code shown.
6. **Rate-limited (server-side):** ephemeral message per §17, using Slice's `Retry-After` header.

### `/account unlink` (self-service only, per §8)

1. Defer ephemerally.
2. Local rate-limit pre-check (§10/§15).
3. Call `GET /v1/bot/discord-link/:discordUserId` to confirm the user is currently linked (avoids
   presenting a confirmation dialog for an action that will just fail as not-linked).
4. **Not linked:** render the shared "not linked" component (below), no confirmation dialog shown.
5. **Linked:** render a confirmation embed summarizing the action ("This removes the link between
   your Discord account and your Slice account. You'll need to run `/account link` again to
   reconnect.") with Confirm/Cancel buttons, per `COMMAND_CATALOGUE.md`'s "Confirmation dialogs"
   standard. The button custom IDs encode the opaque pending-confirmation ID from §10.
6. **On Confirm:** re-verify the interacting user matches the pending confirmation's
   `discordUserId` (§10/§14), then call `POST /v1/bot/discord-link/unlink` with the deterministic
   idempotency key (§15). On success, edit the ephemeral message to a plain success confirmation
   ("Your Slice account has been unlinked."). On error, map per §17.
7. **On Cancel or timeout (120s):** edit the ephemeral message to a neutral "Cancelled — nothing
   changed" state; no Slice call made.

### `/account status`

1. Defer ephemerally.
2. Call `GET /v1/bot/discord-link/:discordUserId` (service-account auth) to determine linked state
   cheaply, per the §11 dependency note.
3. **Not linked:** render the shared "not linked" component (below) — this is the canonical example
   `COMMAND_CATALOGUE.md` cites for `/account status`'s error case ("not-linked → prompts
   `/account link`").
4. **Linked:** render an embed with the fields `BOT_PRODUCT_SPEC.md` §2 specifies — profile summary,
   account status enum, joined date (`User.createdAt`), and linked-Discord-ID confirmation — sourced
   from `GET /v1/session`/`GET /v1/me` once 006's delegated-token-exchange is wired (§11). Until that
   integration lands, this document's own completion checklist (§26) records the linked/not-linked
   gate as complete and the profile-detail rendering as blocked on 006, rather than silently shipping
   a stub with fabricated fields.
5. No mutation, no buttons required beyond the shared "not linked" component's link-prompt button.

### Shared component: "not linked → prompts `/account link`"

Built here for reuse by 006, 009, 010, 013. A single ephemeral embed: short explanation ("You need to
link your Slice account first.") plus one button labeled "Link my account" whose click directly
invokes the same handler `/account link` uses (not a redirect instruction — an actual one-click
action, per `COMMAND_CATALOGUE.md`'s exact wording: "responds with a short explanation and a button
that runs `/account link` directly"). The component takes no parameters beyond the invoking Discord
user's ID (read from the interaction, never passed in a custom ID) and is safe to call from any
command context (self-contained ephemeral response, no side effects on the calling command's own
message state beyond replacing it).

## 19. Implementation file plan

| File | Purpose |
|---|---|
| `src/commands/account/link.ts` | `/account link` command handler |
| `src/commands/account/unlink.ts` | `/account unlink` command handler (self-service path) + Confirm/Cancel button handlers |
| `src/commands/account/status.ts` | `/account status` command handler |
| `src/commands/account/index.ts` | Registers the `/account` subcommand group with the command registry from 003 |
| `src/services/accountLinkService.ts` | Thin orchestration layer over 004's typed Slice API client methods for the four §1 endpoints — no business logic beyond calling Slice and shaping the response for the command handlers |
| `src/discord/components/notLinkedPrompt.ts` | The shared "not linked → prompts `/account link`" embed + button builder, exported for reuse by 006/009/010/013 |
| `src/discord/components/confirmCancel.ts` | Generic Confirm/Cancel button-row builder (if not already generic enough from 003; extended here with the unlink-specific summary text) |
| `src/discord/cache/pendingConfirmations.ts` | Short-TTL store for the unlink confirmation state described in §10 |
| `src/discord/cache/localRateLimit.ts` | Short-TTL counters for the local rate-limit pre-check described in §10/§15 |
| `tests/unit/commands/account/link.test.ts` | Unit tests for the link handler against a fake Slice API client |
| `tests/unit/commands/account/unlink.test.ts` | Unit tests for the unlink handler and its confirm/cancel state machine |
| `tests/unit/commands/account/status.test.ts` | Unit tests for the status handler's linked/not-linked gate |
| `tests/unit/discord/components/notLinkedPrompt.test.ts` | Unit tests for the shared component's rendering and button wiring |
| `tests/integration/account-linking.test.ts` | Integration tests against a disposable Slice instance once the §1 endpoints exist there |

## 20. Numbered implementation steps

1. Confirm Document 004 has closed its domain/contract work and its typed Slice API client methods
   for the four §1 endpoints are available to import.
2. Register the `/account` subcommand group (`link`, `unlink`, `status`) with the command registry
   from 003, with the exact options/permission/ephemeral defaults from §12.
3. Implement `accountLinkService.ts` wrapping the four §1 endpoint calls plus `GET /v1/session`/
   `GET /v1/me`, with typed request/response shapes matching 004's domain model.
4. Implement the local rate-limit cache (`localRateLimit.ts`) and pending-confirmation cache
   (`pendingConfirmations.ts`) per §10, wired to whatever key/value store 003 already established.
5. Implement `link.ts`: defer, local rate-limit pre-check, call challenge endpoint, render
   success/already-linked/rate-limited states per §18.
6. Implement the shared `notLinkedPrompt.ts` component per §18, with its button handler invoking the
   same code path as `link.ts`'s own handler (not duplicated logic).
7. Implement `status.ts`: defer, call the link-lookup endpoint, branch to the shared not-linked
   component or the profile embed. Stub the profile-detail data source behind a clearly-named
   not-yet-wired marker pending 006, per the §11 dependency note — never fabricate the fields.
8. Implement `unlink.ts`: defer, link-lookup pre-check, render confirm dialog, implement Confirm/
   Cancel button handlers with the re-verification and idempotency-key logic from §14/§15.
9. Wire every error branch from all three handlers through the error-mapping layer from
   `ERROR_CATALOGUE.md`, extended per the §17 gap-handling pattern, ensuring no raw exception text
   ever reaches a Discord message.
10. Wire bot-local structured logging (Discord user ID, command, outcome, Slice request ID) into each
    handler per §16, with redaction applied per `BOT_SECURITY_MODEL.md` §10.
11. Write unit tests (§21), integration tests (§22, gated on the §1 endpoints existing on a disposable
    instance), and Discord interaction tests (§23).
12. Run the verification commands (§25) and confirm the completion checklist (§26), explicitly
    recording which items remain blocked on 004's backend closure and/or 006's token-exchange
    integration rather than checking them off prematurely.

## 21. Unit tests

Against a fake, typed Slice API client (no network), per `TEST_STRATEGY.md`'s unit-test section:

- `/account link`: renders the code/expiry embed on a successful challenge response; renders the
  already-linked message on that specific error; renders the rate-limited message with the correct
  `Retry-After`-derived copy on both a server-side 429 and a local-pre-check trip; never logs or
  displays the raw code anywhere but the single ephemeral response.
- `/account unlink`: link-lookup gate correctly branches to the not-linked component when unlinked;
  renders the confirm dialog with correct summary text when linked; Confirm handler rejects a
  mismatched `interaction.user.id` against the stored pending state without calling Slice; Confirm
  handler derives the same idempotency key across two calls for the same logical intent and a
  different key after an explicit retry-after-error; Cancel and timeout both result in "nothing
  changed" with no Slice call.
- `/account status`: link-lookup gate correctly renders the shared not-linked component when
  unlinked; renders the intended embed field set (with the profile-detail portion clearly marked as
  pending §11's dependency) when linked.
- Shared `notLinkedPrompt` component: renders consistently regardless of which calling command
  invoked it; its button, when clicked, produces the identical outcome as running `/account link`
  directly (asserted via the shared handler function, not a duplicated code path).
- Idempotency-key derivation: deterministic per logical unlink intent, changes only on an explicit
  user-initiated retry — direct regression coverage of `TEST_STRATEGY.md`'s named unit-test line.
- Account-link token lifecycle assertions (expiry, single-use, 1:1 enforcement) against the fake
  service layer — direct regression coverage of `TEST_STRATEGY.md`'s named unit-test line, exercised
  through this document's `link.ts`/`unlink.ts` handlers rather than duplicating 004's own domain-layer
  tests.
- Every error code in the §17 table produces its exact specified copy, and no test ever asserts a raw
  exception string appears in a rendered embed.

## 22. Integration tests

Per `TEST_STRATEGY.md`'s integration-test section, against a **disposable local Slice instance** —
these tests are explicitly gated on the §1 endpoints (and §3's service-account auth) existing there,
consistent with this document's own "cannot be marked complete until 004's backend dependency is
satisfied" status:

- Full challenge → (simulated web-app completion, exercised as a direct API call to
  `POST /v1/me/discord-link/complete` rather than through Discord, since that endpoint is web-app-only)
  → `/account status` showing linked, end to end against the disposable instance.
- `/account unlink` self-service path against a real linked test account: confirm dialog → Confirm →
  real `AuditEvent` row created on the disposable instance → subsequent `/account status` on the same
  Discord user shows not-linked.
- Rate-limit integration: deliberately exceed 3/hour on `/account link` and 5/hour on
  `/account unlink` against the disposable instance and confirm the bot surfaces Slice's real
  `Retry-After` value, not a locally-fabricated one.
- Already-linked and not-linked error paths exercised against real Slice responses, not mocked ones,
  to catch any drift between this document's assumed error shape and Slice's actual implementation.

## 23. Discord interaction tests

Per `TEST_STRATEGY.md`'s Discord-interaction-test section, run through the real interaction router
and command handlers via discord.js's interaction-simulation tooling, without a live gateway
connection:

- Simulated `/account link`, `/account unlink`, `/account status` slash-command interactions assert
  the exact response shape (ephemeral flag set, embed fields, button presence/absence) for each
  branch in §18.
- Simulated button-click interactions for the unlink Confirm/Cancel flow, including a simulated
  interaction from a **different** Discord user than the one who received the confirm dialog, asserting
  the handler rejects it per §14's re-verification rule.
- Persistent-component round-trip: the unlink confirmation's custom ID is round-tripped through a
  simulated bot restart (state re-read from the §10 cache, not memory) to confirm the confirmation
  state survives a restart within its TTL, and is correctly treated as expired/absent once the TTL has
  elapsed.
- Command-parsing tests confirming all three commands are registered with the exact options (none),
  permission defaults (any member, per §13), and ephemeral defaults (always ephemeral) specified in
  `COMMAND_CATALOGUE.md`.

## 24. Manual QA checklist

Run by hand in a dev guild against a real, non-production Slice environment once the §1 endpoints
exist there:

- [ ] `/account link` from a fresh (never-linked) Discord account produces a visible, ephemeral code
      and expiry; completing the flow on the Slice web app, then re-running `/account status`, shows
      linked.
- [ ] `/account link` from an already-linked Discord account shows the already-linked message, not a
      new code.
- [ ] `/account link` run 4 times within an hour from the same Discord account is rate-limited on the
      4th attempt with an accurate `Retry-After`.
- [ ] `/account unlink` from a linked account shows the confirm dialog; Cancel leaves the link intact;
      Confirm removes it, verified by a subsequent `/account status` showing not-linked.
- [ ] `/account unlink` from an unlinked account shows the shared not-linked component, not a
      confirm dialog.
- [ ] `/account unlink` run 6 times within an hour is rate-limited on the 6th attempt.
- [ ] `/account status` from an unlinked account shows the shared not-linked component with a working
      "Link my account" button that triggers the same flow as running `/account link` directly.
- [ ] `/account status` from a linked account shows the profile embed (or, if 006 has not yet landed,
      confirms the profile-detail portion visibly indicates it's pending rather than showing blank or
      fabricated fields).
- [ ] Security QA (per `TEST_STRATEGY.md`): grep the test guild's message history and the bot's
      structured logs after a full pass to confirm no Slice code, token, or session value ever
      appears anywhere.
- [ ] Confirm the unlink confirmation dialog auto-cancels after its timeout with no lingering
      clickable button.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance with §1 endpoints deployed
npm run build
```

## 26. Completion checklist

Mirrors `MASTER_CHECKLIST.md`'s style, specific to this document — all boxes unchecked until the work
is actually done:

- [ ] `/account link`, `/account unlink` (self-service), `/account status` registered and implemented
      per §12/§18.
- [ ] Shared "not linked → prompts `/account link`" component implemented and exported for 006/009/
      010/013 to consume.
- [ ] Local rate-limit pre-check and pending-confirmation cache implemented per §10.
- [ ] Every error branch in §17 mapped to the specified friendly copy; no raw exception text reachable
      in any Discord-facing string.
- [ ] Idempotency-key derivation for `/account unlink` implemented and unit-tested per §15/§21.
- [ ] Bot-local structured logging with Slice request-ID correlation implemented per §16.
- [ ] Unit tests (§21), Discord interaction tests (§23) passing.
- [ ] **Integration tests (§22) passing against a disposable Slice instance with the §1 endpoints and
      §3 service-account auth actually deployed** — cannot be checked until Slice's backend team
      builds these (see §1 Metadata).
- [ ] Manual QA checklist (§24) completed in a real dev guild against a real, non-production Slice
      environment — cannot be checked until the same backend dependency is satisfied.
- [ ] `/account status`'s profile-detail rendering explicitly confirmed as either (a) fully wired
      against `GET /v1/session`/`GET /v1/me` via 006's delegated-token-exchange, or (b) explicitly and
      honestly marked pending 006 in the shipped UX — never silently stubbed.
- [ ] Admin-assisted `/account unlink` explicitly confirmed as out of scope and gated off (§8), not
      partially implemented and left reachable.
- [ ] No Slice source modified, no old-bot source modified (this document is Discord-bot-only code).
- [ ] Verification commands (§25) all pass.

**This document cannot be marked COMPLETE while the "Slice backend dependency" checklist items above
remain unchecked** — consistent with `IMPLEMENTATION_ORDER.md`'s framing of 005 as "blocked until 004
closes," where 004's own closure is itself gated on the same Slice backend work.

## 27. Documentation updates

Once this document's work actually lands (subject to the backend dependency above):

- `PROMPT_INDEX.md` — flip document 005's row from `NOT STARTED` to `COMPLETE`.
- `IMPLEMENTATION_ORDER.md` — update 005's "Can start today" framing to reflect that it has closed,
  and note that 006/009/010/013 are now unblocked with respect to this document's dependency (006/009/
  010/013 may still be blocked on their own additional dependencies, e.g. 006's delegated-token
  exchange).
- `CURRENT_STATE.md` — update "Known blockers" to remove 005 from the list of documents blocked on the
  new Slice backend endpoints (004–006, 009, 010, 013), since 005's portion of that blocker is
  resolved; 006, 009, 010, 013 remain listed until they close in turn.
- `project-state.json` — no structural change expected beyond whatever machine-readable status fields
  the project's tooling tracks per-document (this build guide's JSON currently only tracks build-guide
  authorship metadata, not per-implementation-document status).

## 28. Final report format

The implementer's completion report for this document must state, in order:

1. **Status:** COMPLETE or BLOCKED, and if BLOCKED, exactly which item(s) from §26 are unmet and why
   (in particular, whether the Slice backend dependency is unmet).
2. **Commands delivered:** the exact list of slash commands/components implemented, cross-referenced
   to §12.
3. **What was NOT delivered from this document's nominal scope, and why:** explicitly restate the §8
   out-of-scope items and the §11/§18 dependency-on-006 split for `/account status`'s profile detail,
   so a reader does not assume more was built than actually was.
4. **Test results:** pass/fail for each of §21–24, with integration-test and manual-QA results marked
   "not run — backend dependency unmet" if applicable, never silently omitted.
5. **Verification command output:** pass/fail summary for each command in §25.
6. **Files touched:** the actual file list, compared against the plan in §19 (noting any deviation).
7. **Open questions carried forward:** the admin-assisted-unlink interaction-design gap (§8), the
   `/account status` cross-document dependency on 006 (§11), and the not-yet-defined bot-only error
   codes (§17), each restated so document 006 (and whichever document ultimately resolves them) starts
   with full context rather than rediscovering these gaps independently.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
