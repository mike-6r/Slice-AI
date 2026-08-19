# 006 — Permission and authorization integration

## 1. Metadata

- **Document number:** 006
- **Title:** Permission and authorization integration
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 004 (Account-linking domain and backend API requirements), 005
  (Account-linking Discord commands)
- **Blocks (this build guide):** 009 (Watchlist and portfolio commands), 010 (Notification commands
  and delivery-preference documentation), 013 (Admin read-only operational commands), and any future
  admin-tier command this build guide has not yet scoped
- **Slice backend dependency:** delegated-token-exchange endpoint, `POST /v1/bot/tokens/exchange`
  (`BOT_API_REQUIREMENTS.md` §2, "Bot-scoped delegated reads/writes on behalf of a linked user") —
  this endpoint does not exist on Slice today and requires the backend team's explicit design
  sign-off before this document's runtime behavior can be exercised against a real environment
- **Can start today:** Blocked until 004 closes. Document 004 is itself gated ("spec work: yes, full
  closure: blocked on Slice team building the new endpoints" per `IMPLEMENTATION_ORDER.md`), and 005
  depends on 004, so this document's own start is transitively blocked on the same Slice backend
  work. Spec/design work on this document may proceed in parallel with 004/005's own spec work, but
  the runtime code this document describes cannot be written and tested end-to-end until 004's
  bot-only endpoints exist on a real or disposable Slice environment and 005's linking commands are
  in place to produce the linked-account records this document consumes.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend that remains the single
source of truth for identity, permissions, and every product/financial concept the bot touches. The
Discord bot is a companion client to Slice: it calls Slice's HTTP API, never queries Slice's
Postgres/Prisma directly, never duplicates a Slice business rule, and never becomes a second backend
(`docs/qa/README.md` ground rules; `BOT_ARCHITECTURE.md` "Bot must never do"). This document sits at
Track A's midpoint in `IMPLEMENTATION_ORDER.md`: 004 defines the account-linking domain and the
backend API shape, 005 builds the Discord-facing `/account link|unlink|status` commands that produce
a linked `discordUserId ↔ userId` mapping, and this document (006) is the layer that turns that
linked mapping into an authorized Slice actor for every subsequent command — obtaining and using the
delegated-token-exchange so the bot acts with the user's real Slice permissions rather than any
Discord-side signal, and gating admin-tier commands on Slice's own fresh permission and recent-auth
checks. Every command family built after this document (009, 010, 013, and any future admin-tier
command) depends on this layer rather than reimplementing authorization logic per command.

## 3. Current implementation audit

Per `CURRENT_STATE.md`, no Discord bot code exists anywhere — no repository, no `package.json`, no
`src/`. This document builds on top of what 001–005 are specified to deliver, not on anything that
currently exists in a codebase:

- From 001–003 (specified, not yet built): the interaction router, command registry, and Slice API
  client scaffold (`BOT_ARCHITECTURE.md`'s "Interaction Router" and "Slice API Client" modules).
- From 004 (specified, not yet built): the account-linking domain model and the backend API contract
  for `POST /v1/bot/discord-link/challenge`, `POST /v1/me/discord-link/complete`,
  `POST /v1/bot/discord-link/unlink`, `GET /v1/bot/discord-link/:discordUserId`
  (`BOT_API_REQUIREMENTS.md` §1).
- From 005 (specified, not yet built): the `/account link`, `/account unlink`, `/account status`
  Discord commands that exercise 004's domain and produce a real `discordUserId ↔ userId` link record
  on Slice's side once a user completes the challenge on the Slice web app.

Nothing described in this document exists yet. This document assumes 004 and 005 have closed (their
own completion checklists satisfied) before its own numbered implementation steps (§20) begin.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. The old Python bot (Infria) had no concept of a
linked external identity system and no delegated-permission model at all; its authorization model
was Discord-native roles only (`is_owner()`, `administrator`, `ban_members`, `kick_members`), which
is exactly the pattern this document's rule set exists to prevent from leaking into any command that
touches a Slice account. Two of the old bot's catalogued security findings are directly relevant as
negative examples this document's design must not repeat, per `project-state.json`'s
`criticalSecurityFindingsInOldBot` and `OLD_TO_NEW_MIGRATION_MATRIX.md`: "Missing permission checks
on Tebex giftcard lookup and Giveaways reroll/end/delete subcommands" (a command shipped without
re-verifying the actor's authority at the point of the mutating action) and "Raw exception text
surfaced to end users in `ErrorHandler.py`'s generic branch" (an authorization/error boundary that
leaked internals instead of a safe mapped message). This document's fresh-check-every-time rule
(§13) and its use of `ERROR_CATALOGUE.md`'s mapped messages (§17) are the direct fixes for both.

## 5. Slice features supported

- **Account-linking domain (Doc 004, this build guide)** — NOT STARTED (spec only; full closure
  blocked on Slice backend team per `IMPLEMENTATION_ORDER.md`). This document consumes the
  `discordUserId ↔ userId` mapping 004 defines.
- **Bot-scoped delegated token exchange, `POST /v1/bot/tokens/exchange` (`BOT_API_REQUIREMENTS.md`
  §2)** — NOT STARTED / proposed only. Explicitly flagged in `BOT_API_REQUIREMENTS.md` as "a
  genuinely new pattern for Slice and requires the backend team's explicit design sign-off — this
  build guide proposes the shape but does not assume it is pre-approved." This document treats the
  endpoint as PROPOSED, never as VERIFIED, anywhere it is referenced.
- **Slice access-control model (roles `USER`/`SUPPORT`/`COMPLIANCE_ANALYST`/`ASSET_REVIEWER`/
  `VAULT_OPERATOR`/`FINANCE_OPERATOR`/`ADMIN`)** — per the task background, effective role resolution
  is currently **GLOBAL-only**; non-GLOBAL (e.g., per-guild or per-resource) scopes are inert. This
  is treated as VERIFIED current backend behavior for the purposes of this document's blast-radius
  reasoning (§14, §18): every admin-tier grant the bot ever checks is platform-wide by construction,
  not scoped to "this Discord server."
- **Recent-auth freshness gate for high-impact admin actions (Doc 005's own backend requirement, as
  referenced in `BOT_SECURITY_MODEL.md` §7 and §1's `/account unlink` admin case)** — PARTIAL:
  VERIFIED as a Slice-side concept for `/account unlink` (support case) and named admin
  status/role-change endpoints, but this build guide does not expose the latter in Discord (see §8).
- **`GET /v1/admin/audit-events`, `GET /v1/admin/users/:id/status-history`** — VERIFIED,
  already-available per `BOT_API_REQUIREMENTS.md`'s "Already available" table (token auth,
  `ADMIN`/`SUPPORT` permission, read-only). This document is what makes calling these endpoints as
  the linked user's real role possible for Document 013.
- **`GET /v1/session`, `GET /v1/me`** — VERIFIED, already-available. Used by this document's status
  freshness check (§13, §15) to re-confirm the linked account's current status/role before honoring
  a delegated token.

## 6. Files to read before starting

- `PERMISSION_MATRIX.md` — the full table (every row), the source of truth for which capability gets
  which Discord-side and Slice-side gate.
- `BOT_SECURITY_MODEL.md` §1 (account linking), §3 (slash command permissions/role spoofing/
  interaction forgery), §4 (bot token and Slice credential safety, including the two credential
  types), §6 (Discord role possession ≠ Slice permission), §7 (recent authentication for high-impact
  actions), §11 (admin action confirmation).
- `BOT_API_REQUIREMENTS.md` §2 (bot-scoped delegated reads/writes) and §3 (service-account
  authentication itself) — this document's entire mechanism rests on both.
- `BOT_DATA_OWNERSHIP.md` — specifically the "Account status, roles" and "Discord ↔ Slice user link
  mapping" rows; confirms the bot never becomes a second source of truth for either.
- `ERROR_CATALOGUE.md` — full table, especially the 401/403 rows and the "Discord-side failure" row.
- `COMMAND_CATALOGUE.md` — the Admin (read-only) table (`/admin audit`, `/admin status-history`,
  `/admin link-lookup`) and every row's "Permission" column across the Phase 1 table.
- `TEST_STRATEGY.md` — "Account-link token lifecycle" unit-test note and the integration-test note on
  "the full link → delegated-token-exchange → watchlist-mutation path."
- `BOT_ARCHITECTURE.md` — "Permission module" and "Slice API client" sections (the module boundaries
  this document's steps implement against).
- This build guide's own `implementation/004-account-linking-domain-and-backend-api-requirements.md`
  and `implementation/005-account-linking-discord-commands.md` (once they exist as closed documents)
  for the exact shape of the link record and commands this document builds on.

## 7. Strict scope

- A **permission-resolution module** that, given a Discord interaction from a user, determines: (a)
  whether the user has a valid Slice account link, (b) if so, the user's current Slice account status
  and role fetched fresh via `GET /v1/me` / `GET /v1/session`, and (c) whether the requested
  capability is permitted, per `PERMISSION_MATRIX.md`'s per-capability Slice-side gate.
- A **delegated-token client** wrapping `POST /v1/bot/tokens/exchange` (service-account auth,
  `{discordUserId, scope}` → short-lived ≤5-minute scoped access token), including scope-allowlist
  enforcement (`watchlist:read`, `watchlist:write`, `notifications:read`, `notifications:write`,
  `portfolio:read`, `profile:read` — exactly the scopes named in `BOT_API_REQUIREMENTS.md` §2, no
  others), token caching bounded strictly to the token's own short lifetime (never persisted, never
  reused past expiry), and safe failure handling when the exchange itself 401s/403s/errors.
- A **recent-auth freshness check** for the one admin-tier mutating case currently in scope
  (`/account unlink`, support/admin path) per `PERMISSION_MATRIX.md`'s row and
  `BOT_SECURITY_MODEL.md` §1/§7: the bot verifies, on every invocation, that the underlying Slice
  `ADMIN` check itself carries a fresh-enough authentication signal, and never treats a previously
  successful check (in this interaction or an earlier one) as still valid.
- A **Slice-response-is-authoritative rule**, implemented as a single reusable guard used by every
  command handler that calls a permission-gated Slice endpoint: the bot only ever concludes a user is
  authorized because Slice's API returned a 2xx for the actual requested action, and it always
  surfaces Slice's own 401/403 (mapped per `ERROR_CATALOGUE.md`) rather than a bot-computed "you
  don't have permission" message derived from Discord role state alone.
- Wiring `PERMISSION_MATRIX.md`'s rows into concrete, reusable permission-check functions the
  Discord-side command registry (Doc 003) and the individual command handlers (007–010, 013) call,
  for every capability row in that matrix that involves a Slice-side gate.
- Explicit handling and interaction-level UX for the documented failure mode: a Discord user holds a
  Discord "Admin" role (or the bot's own configured admin/support Discord role) but Slice denies the
  action — the bot must surface Slice's denial, never Discord's role state, as the reason.
- Local structured logging of every authorization decision (allow and deny) for correlation, per
  `BOT_SECURITY_MODEL.md` §5 and §10.

## 8. Out of scope

- Building `POST /v1/bot/tokens/exchange` itself, or any other Slice backend endpoint — that is
  Slice's backend team's work, tracked as a named dependency, not something this document or any
  Discord-bot-repository code can deliver.
- The account-linking challenge/completion flow and the `/account link|unlink|status` commands
  themselves — those are 004/005's scope; this document consumes their output (a link record and the
  commands that produce/inspect it), it does not re-implement them.
- Any admin-tier **mutating** command (user status change, role grant/revoke). Per
  `PERMISSION_MATRIX.md`'s "High-impact Slice mutations" row and `BOT_SECURITY_MODEL.md` §7 /
  `BOT_PRODUCT_SPEC.md` §8, these are explicitly **not exposed in Discord in Phase 1/2** given the
  GLOBAL-only effective-role-resolution blast radius (a compromised bot-admin flow would be
  "every Slice user," not "one guild"). This document defines how the bot *would* gate such a
  command if one were ever approved (§13, §14) but does not build or expose one.
- The actual command bodies for `/admin audit`, `/admin status-history`, `/admin link-lookup`
  (Doc 013), `/watchlist *`, `/notifications *`, `/portfolio` (Doc 009/010) — this document delivers
  the permission/authorization layer those documents call into, not the commands' own business
  logic, embeds, or pagination.
- Discord-native moderation permission checks (`/mod *`, kick/ban/mute/purge/warn/lockdown/unlock/
  banlist/unban) — per `PERMISSION_MATRIX.md`, these use Discord's own kick/ban/administrator
  permission model exclusively and are "explicitly decoupled from Slice" (`BOT_SECURITY_MODEL.md`
  §6). Doc 012's scope, not this document's.
- Bot-owned-only command permission gates with no Slice counterpart (tickets, giveaways, suggestions,
  polls, FAQ/roadmap edits) — these use Discord-side role checks only, per `PERMISSION_MATRIX.md`,
  and have no Slice-side authorization step for this document to wire.
- Any push-notification-to-Discord authorization model — blocked on Slice Doc 017 shipping a
  `DISCORD` channel type, which does not exist (`BOT_API_REQUIREMENTS.md` §4); not addressed here.
- Service-account credential provisioning itself (`BOT_API_REQUIREMENTS.md` §3) — this document
  *uses* a service-account credential to call `POST /v1/bot/tokens/exchange` and the read-only
  discord-link lookup endpoint, but provisioning/rotating that credential is a deployment/secrets
  concern (`BOT_SECURITY_MODEL.md` §4, `DEPLOYMENT_PLAN.md`), not this document's implementation
  work.

## 9. Dependencies

- The Slice API client module from Doc 002 (typed HTTP client, already responsible for attaching
  auth, `Idempotency-Key`, and request IDs per `BOT_ARCHITECTURE.md`) — this document extends it with
  a delegated-token acquisition path, it does not build a second HTTP client.
- The interaction router and command registry from Doc 003 (permission pre-check hook point).
- The account-linking domain types and bot-only endpoint client from Doc 004.
- No new third-party runtime library is introduced by this document specifically; token handling uses
  the same HTTP client and typed-config (`zod`-validated env schema per `BOT_ARCHITECTURE.md`)
  already specified for the bot's service-account credentials.

## 10. Bot-owned persistence

None, in the sense of a new durable table. This document is explicitly forbidden from persisting a
Slice access/refresh token, or the delegated short-lived token, at rest — `BOT_SECURITY_MODEL.md` §4
and `BOT_ARCHITECTURE.md`'s "Bot must never do" both state the bot never persists a Slice token
anywhere (message, embed, custom ID, log, database row). The only bot-side state this document
introduces is:

- An in-memory, per-interaction-lifetime holder for a delegated token, scoped to the single command
  invocation that requested it, discarded immediately after the Slice call(s) that used it complete
  (success or failure) — never written to the bot's database, never cached across interactions, never
  cached across users.
- A structured **operational log line** per authorization decision (allow/deny), per
  `BOT_SECURITY_MODEL.md` §5/§10 — this is the bot's existing structured-logging sink (Doc 001/002
  convention), not a new table, and it never logs the token value itself, only: Discord user ID,
  command name, requested capability, Slice's response code/error code, and the Slice request ID for
  correlation.

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Auth | Used for |
|---|---|---|---|
| `POST /v1/bot/tokens/exchange` | Bot-only service endpoint — **proposed, not yet built**, requires Slice backend team design sign-off (§2) | Service-account | Exchanging a linked `discordUserId` for a short-lived (≤5 min), scope-limited access token usable as the real Slice user, for every self-scoped mutating/reading command in `PERMISSION_MATRIX.md`'s "self-token via delegated exchange" row (`/watchlist *`, `/notifications *`, `/portfolio`) |
| `GET /v1/bot/discord-link/:discordUserId` | Bot-only service endpoint — proposed, not yet built (§1) | Service-account | Resolving whether a Discord user is linked at all, and to which Slice account, before attempting a token exchange or an admin permission check |
| `GET /v1/session`, `GET /v1/me` | Already available — VERIFIED | User token (obtained via delegated exchange, scope `profile:read`, or the user's own recent-link context for `/account status`) | Fresh account-status/role confirmation immediately before honoring any permission decision; never cached across interactions |
| `GET /v1/admin/audit-events`, `GET /v1/admin/users/:id/status-history` | Already available — VERIFIED | User token scoped to the requester (admin/support Slice user), or an equivalent admin-scoped delegated exchange if Slice's team approves extending the exchange's scope allowlist to admin reads — **this build guide does not assume that extension is approved; it is flagged as an open question for Doc 013 to resolve with Slice's backend team, not assumed here** | The permission-check step Doc 013's `/admin audit` / `/admin status-history` / `/admin link-lookup` commands call before executing their own request |
| `POST /v1/bot/discord-link/unlink` (admin/support path) | Bot-only service endpoint — proposed, not yet built (§1) | Admin token, recent-auth required | The one admin-tier mutation currently in scope for this document's recent-auth gate (§13) |

Every endpoint in this table that is tagged "proposed, not yet built" means this document's code can
be written and unit-tested against a fake client (`TEST_STRATEGY.md`'s unit-test approach) but cannot
be integration-tested end-to-end, or run in production, until Slice's backend team ships it. This
document does not assume approval or availability beyond what `BOT_API_REQUIREMENTS.md` itself
states.

## 12. Commands / events / jobs delivered

This document delivers no new user-facing Discord command itself — no row in `COMMAND_CATALOGUE.md`
is created here. It delivers the **shared authorization layer** that the following existing
catalogue rows depend on and will call at their permission-check step:

| Command | Permission (per `COMMAND_CATALOGUE.md` / `PERMISSION_MATRIX.md`) | Consumes from this document | Impl doc |
|---|---|---|---|
| `/watchlist add/remove/list` | any member, linked account required, self-token via delegated exchange | Delegated-token client (`watchlist:read`/`watchlist:write` scope), fresh-status check | 009 |
| `/notifications list/unread/read/read-all` | any member, linked account required, self-token via delegated exchange | Delegated-token client (`notifications:read`/`notifications:write` scope) | 010 |
| `/portfolio` | any member, linked account required, self-token via delegated exchange | Delegated-token client (`portfolio:read` scope) | 009 |
| `/admin audit`, `/admin status-history`, `/admin link-lookup` | Slice `ADMIN`/`SUPPORT`, checked fresh every call, never cached | Fresh-permission-check module, Discord admin/support role as a first gate only | 013 |
| `/account unlink` (support/admin path) | self or admin (recent-auth) | Recent-auth freshness check, fresh-permission-check module | 005 (already scoped there; this document supplies the reusable recent-auth check 005 calls) |

No event or job is delivered by this document (`EVENT_AND_JOB_CATALOGUE.md` has no row that maps to
permission integration itself).

## 13. Permission rules

This document is the concrete implementation of `PERMISSION_MATRIX.md`'s rule stated at the bottom of
that file: **"a Discord-side role check is always a gate, never a substitute for the corresponding
Slice-side check when a command touches Slice data."** Specifically, from that matrix:

- `/watchlist *`, `/notifications *`, `/portfolio`: Discord-side gate is "any member"; Slice-side
  gate is "self-token via delegated exchange" — requires a linked account. This document's
  permission-resolution module is what turns "linked account" into an actual usable, scoped token for
  the command handler to call the real endpoint with.
- `/admin audit`, `/admin status-history`, `/admin link-lookup`: Discord-side gate is "bot admin/
  support role" (a first-pass UX gate, checked cheaply, so a non-staff member never even sees a
  "loading" state for a command they can't use); Slice-side gate is "Slice `ADMIN`/`SUPPORT`, checked
  fresh every call, never cached." This document's fresh-permission-check module is what performs
  that second, authoritative check on every single invocation — it never remembers a prior call's
  result, never keys off Discord role membership as a substitute, and never trusts a bot-owned
  "is this user an admin" flag that could drift from Slice's own state.
- `/account unlink` (support case): Discord-side gate is "bot support/admin role"; Slice-side gate is
  "Slice `ADMIN` + recent-auth" — described in the matrix as "two-gate, both required." This document
  supplies the recent-auth check as a reusable function (§9 dependency for Doc 005).
- High-impact Slice mutations (user status/role change): matrix row states this is "not exposed in
  Discord in Phase 1/2" and that if it were, it "would require Slice `ADMIN` + recent-auth + Discord
  admin role + explicit confirm." This document's design supports that hypothetical future gate
  structurally (the fresh-permission-check module and recent-auth module are both reusable for it)
  but, per §8, no command in this build guide's current scope calls it.

**The explicit failure mode this document must handle correctly:** a Discord user holds whatever
Discord role the bot's guild configuration maps to "admin" or "support" (a native Discord permission,
entirely under that guild's own administrators' control, with zero cryptographic or product
relationship to Slice). That user runs `/admin audit`. The bot's Discord-side gate passes (they have
the role) and the command handler defers the interaction. The bot then calls the fresh-permission
check, which resolves the user's linked Slice account and calls `GET /v1/me` (or the equivalent
scoped read) to get their actual Slice role. If that role is not `ADMIN`/`SUPPORT` — or the account
isn't linked at all, or the linked account's status is `SUSPENDED`/`RESTRICTED` — the module returns
a denial, and the command handler surfaces `ERROR_CATALOGUE.md`'s `FORBIDDEN`/403 mapping ("You don't
have permission to do that.") or the not-linked prompt, **never** the fact that the user *does* hold
the Discord role, and the command never proceeds to call `GET /v1/admin/audit-events`. The reverse is
equally true and equally required: a linked user with real Slice `ADMIN` permission but no
configured Discord admin/support role in this guild is denied at the Discord-side gate first and
never reaches the Slice call at all — the Discord-side gate is a UX convenience (don't waste a round
trip on an obviously-wrong request), not a security boundary, but it is still enforced, because a
guild's own Discord-role configuration is that guild's legitimate choice about who should even be
offered the command's UI.

Concretely, the permission-resolution module's contract is:

1. Resolve `discordUserId` from the interaction object itself (never from any client-supplied field —
   `BOT_SECURITY_MODEL.md` §1's "Discord user verification" rule applies transitively here).
2. Look up the link via `GET /v1/bot/discord-link/:discordUserId` (service-account auth). Not linked →
   short-circuit with the "run `/account link`" prompt (`COMMAND_CATALOGUE.md` UI standard).
3. For self-scoped capabilities, exchange for a delegated token (§2 endpoint) with the exact scope the
   command needs (least privilege — never request a broader scope than the single call requires).
4. For admin-tier capabilities, resolve the linked user's current role/status via a fresh `GET
   /v1/me`/`GET /v1/session` call (or the admin-scoped equivalent once Doc 013 resolves the open
   question in §11), and require `ADMIN` or `SUPPORT` exactly as `PERMISSION_MATRIX.md` states per
   command — never a broader or narrower set invented by the bot.
5. Make the actual downstream Slice call (watchlist mutation, admin read, etc.) using the token/role
   just obtained.
6. If that downstream call itself returns 401/403, treat it as authoritative and final — the bot does
   not retry with a different token, does not fall back to a cached "they were allowed last time"
   state, and maps the response through `ERROR_CATALOGUE.md` (§17).

## 14. Security requirements

Grounded in `BOT_SECURITY_MODEL.md`:

- **§1 (account linking):** this document never trusts a client-supplied Discord ID for anything
  security-relevant (inherited rule); the `discordUserId` used for every link lookup and token
  exchange in this document comes from the interaction object Discord itself provides, matching §1's
  general rule.
- **§3 (slash command permissions, role spoofing, interaction forgery):** Discord's own
  application-command permission system is the *first* gate only; for anything touching a Slice
  account, Discord role possession is never treated as proof of Slice permission. This document is
  the direct implementation of that sentence.
- **§4 (bot token and Slice credential safety):** this document's delegated-token client is precisely
  the "way to obtain a short-lived, narrowly-scoped access token on behalf of the linked user without
  ever holding their password or long-lived refresh token directly" that §4 describes as an open
  design question — this document treats it as still-open until Slice's backend team signs off, and
  the code this document specifies must fail closed (deny, with a mapped error) if the exchange
  endpoint is unavailable, never fall back to acting as the bot's own service-account identity on the
  user's behalf.
- **§6 (Discord role possession ≠ Slice permission, and vice versa):** "Any command touching a
  privileged Slice endpoint re-checks the linked account's actual Slice role via a fresh API call — it
  never caches 'this Discord user is a Slice admin' beyond the lifetime of a single interaction." This
  document's fresh-permission-check module has no cache with a lifetime longer than one interaction,
  full stop — not a five-minute cache, not a per-guild cache, nothing. Conversely, a Slice account
  status change (e.g., `SUSPENDED`) never automatically triggers a Discord-side action in this
  document's scope — that stays out of scope per §6 and `BOT_DATA_OWNERSHIP.md`'s moderation-history
  row.
- **§7 (recent authentication for high-impact actions):** the bot cannot itself satisfy a "prove you
  recently authenticated" requirement with a stale link record — this document's recent-auth check
  calls through to whatever Slice's own admin endpoint requires for freshness (it does not invent a
  bot-side timer as a substitute) and, per this section's own recommendation, this build guide does
  not expose the highest-impact mutations in Discord at all (§8), sidestepping rather than
  approximating the harder cases.
- **§11 (admin action confirmation):** every admin-tier read this document gates (audit lookup,
  status-history lookup, link lookup) is read-only, so no destructive-confirmation flow is required by
  this document itself, but the permission layer this document builds is deliberately structured so
  that if a future, approved admin mutation is added, its confirmation step (Doc 003/013's UI
  responsibility) sits *after* this document's permission check passes, never before — a user must
  never be shown a "confirm this destructive action" prompt for an action Slice has not yet confirmed
  they're allowed to take.
- **GLOBAL-only effective role resolution (task background, `BOT_PRODUCT_SPEC.md` §8):** because
  every Slice role grant this document ever checks is platform-wide (no working per-guild/per-resource
  scoping exists today), this document's admin-tier checks must never be treated as "safe because it's
  scoped to this one Discord server" — a positive `ADMIN`/`SUPPORT` result grants the same real-world
  authority regardless of which guild the interaction came from. This is precisely why §8 keeps every
  mutating admin capability out of scope and why the read-only admin commands this document gates
  (Doc 013) still get the full fresh-check treatment rather than a lighter one.
- **No token persistence, anywhere:** consistent with `BOT_ARCHITECTURE.md`'s "Bot must never do" and
  §10 (logging redaction), the delegated token this document's client obtains is never written to a
  message, embed, button custom ID, modal, log line, or the bot's own database — held in memory only
  for the duration of the single command invocation that requested it.

## 15. Idempotency and rate limits

- This document's own operations are predominantly reads (permission resolution, status fetch, token
  exchange) and therefore carry no `Idempotency-Key` requirement themselves — `Idempotency-Key` is a
  mutation concern (`BOT_ARCHITECTURE.md`), and the actual mutating calls (e.g., a watchlist add) are
  Doc 009's responsibility, using the token this document supplies.
- The delegated-token exchange itself (`POST /v1/bot/tokens/exchange`) is treated as a mutation from a
  rate-limit-safety perspective even though it does not mutate Slice user data, because a
  high-frequency exchange loop would be indistinguishable from an abuse pattern. The bot applies a
  local per-`discordUserId` cooldown on top of whatever rate limit Slice's own endpoint documents
  (per `BOT_SECURITY_MODEL.md` §5 — "the bot never bypasses Slice's own rate limiting by fanning out
  parallel retries; it honors `Retry-After` and applies its own local cooldown on top"), sized so that
  a user rapidly clicking through several watchlist/notification commands in one Discord session does
  not each trigger a fresh exchange call when a still-valid short-lived token could be reused within
  its own ≤5-minute lifetime for the same scope and the same single interaction — but never reused
  *across* interactions or cached at rest (§10, §14).
- `GET /v1/bot/discord-link/:discordUserId` and `GET /v1/me`/`GET /v1/session` reads inherit the
  "standard" rate limit tier per `BOT_API_REQUIREMENTS.md`'s existing table, with the bot's typed
  client (Doc 002) retrying a GET once on a 401-triggered refresh only, per `BOT_ARCHITECTURE.md`'s
  documented retry rule — never retrying a permission *denial* (403) as if it might succeed on a
  second attempt.
- No new idempotency key scheme is introduced by this document; it reuses the deterministic
  `(discordUserId, command, targetResourceId, nonce)` derivation already specified in
  `BOT_ARCHITECTURE.md` for any mutation the downstream command performs after this document's
  permission check passes.

## 16. Audit requirements

- Every Slice-side mutation or admin read this document's permission layer authorizes is already
  audited by Slice itself (the underlying endpoint's own `AuditEvent` write, per Docs 004/005's
  models) — this document does not create a second, competing audit record.
- The bot additionally logs its own local, structured operational log line for every authorization
  decision (allow and deny), per `BOT_SECURITY_MODEL.md` §5: Discord user ID, guild ID, command name,
  requested capability/scope, the fresh Slice role/status observed (if an admin-tier check), the
  outcome (allow/deny and why — e.g., "not linked," "role insufficient," "account status
  restricted," "recent-auth stale"), and the Slice request ID from the downstream call for
  correlation with Slice's own `AuditEvent` — but never the token value itself, never the user's
  email, and never a raw exception payload (§10's redaction rule).
- The denial case described in §13 (Discord admin role present, Slice denies) is logged with enough
  detail for a support engineer to see, after the fact, that a Discord-side "admin" user was correctly
  denied at the Slice layer — this is a deliberate audit signal that the two-gate model is working as
  designed, not a bug to be hidden.
- No audit log line for this document's own operation is a substitute for Slice's own `AuditEvent`;
  if Slice's `POST /v1/bot/tokens/exchange` or admin-read endpoints ever stop writing their own audit
  trail, that is a Slice backend defect to raise with Slice's team, not something this document's
  local log is designed to compensate for.

## 17. Error behavior

Every error this document's permission layer can surface maps to `ERROR_CATALOGUE.md` exactly — no
new user-facing copy is invented here beyond what that catalogue already defines:

| Situation | Slice error code (if applicable) | Discord-facing message used | Note specific to this document |
|---|---|---|---|
| Discord user not linked | n/a (bot-side short-circuit before any Slice call) | Not-linked prompt with an `/account link` button (`COMMAND_CATALOGUE.md` UI standard) | Never a generic error — this is an expected, common state |
| Delegated token exchange itself returns 401 | `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | "Your linked session needs refreshing — try again in a moment." | Bot silently retries the exchange once (never the downstream mutation) per the catalogue's existing rule, then surfaces this if it still fails |
| Linked account's Slice session/link itself is invalid | `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | "Your Slice link needs to be re-established — run `/account link`." | Never says "reused/replayed" |
| Linked account restricted/suspended | `ACCOUNT_RESTRICTED` | "This action isn't available on your account right now. Contact support if you think that's wrong." | Never explains why beyond this, even if the bot's fresh `GET /v1/me` shows the exact status reason |
| Downstream Slice call returns 403 (role insufficient) | `FORBIDDEN` | "You don't have permission to do that." | This is the exact message shown in the "Discord admin role, Slice denies" failure mode from §13 — never supplemented with "...even though you have the Discord role," which would leak the two-gate model's internals unnecessarily |
| Delegated-token exchange endpoint itself unavailable/erroring | `MARKET_DATA_UNAVAILABLE`/`PERSISTENCE_UNAVAILABLE`/`CONTROL_STORE_UNAVAILABLE`-equivalent 503, or unrecognized | "Slice is having a moment — try again shortly." or the generic "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | The command fails closed (denied), never falls back to a bot-service-account call on the user's behalf |
| Rate-limited on the exchange endpoint | `RATE_LIMITED` | "You're doing that too fast — try again in {Retry-After}s." | Reads Slice's `Retry-After` header, per the catalogue |
| Recent-auth check stale (admin unlink case) | Whatever Slice's admin endpoint returns for a stale-auth 403 (mapped as `FORBIDDEN`/`ACCESS_TOKEN_EXPIRED` depending on Slice's exact response) | Same as the corresponding row above | This document does not invent a new "please re-authenticate" copy string beyond the catalogue's existing ones |

The catalogue's own inherited rule applies without exception here: "the generic/unrecognized branch
must never interpolate the raw exception object into a user-facing string" (Migration M6).

## 18. Interaction UX

This document has no command of its own, so there is no top-level embed to wireframe; instead, it
defines the **shared UX behaviors** every downstream command (009, 010, 013) must exhibit when this
document's permission layer denies or gates a request:

- **Not-linked state:** ephemeral response, a short one-line explanation ("You need to link your
  Slice account to use this command."), and a button that runs `/account link` directly
  (`COMMAND_CATALOGUE.md`'s "Account-link prompts" UI standard) — never a bare error.
- **Admin/support Discord-role gate failing (user lacks the Discord role):** the command should not
  even be visible/usable per Discord's own application-command permission configuration where
  supported; where a runtime check is still needed as a backstop, an ephemeral "You don't have
  permission to do that." — no distinction drawn between "you're not staff" and any other denial
  reason, to avoid leaking staff-membership information unnecessarily.
- **Discord role present, Slice denies (the explicit failure mode this document exists to handle):**
  ephemeral "You don't have permission to do that." — the same `FORBIDDEN` copy as any other
  permission denial, deferred first (respecting the 3-second ack window per `BOT_ARCHITECTURE.md`) so
  the round trip to Slice's fresh permission check never causes a visible timeout. The response never
  mentions the user's Discord role at all — from the user's perspective, the message is identical to
  any other permission denial, which is the point: Discord role state is never part of the
  explanation.
- **Linked-account status restricted mid-flow (e.g., suspended between link time and this command):**
  ephemeral `ACCOUNT_RESTRICTED` mapped message; no retry button offered (retrying won't change a
  restricted status), only the generic "contact support" copy already in the catalogue.
- **Token exchange transient failure:** ephemeral "try again in a moment" copy per §17's table; the
  command does not silently drop the interaction — Discord's deferred-response contract is always
  honored with either a success embed or a mapped error embed, never neither.
- **Admin read commands (Doc 013) once authorized:** this document's scope ends at "the call is
  authorized" — the actual embed/pagination UX for `/admin audit` etc. is Doc 013's own §18.

## 19. Implementation file plan

- `src/auth/permissionResolver.ts` — the permission-resolution module described in §13: resolves
  link status, fresh Slice role/status, and returns an allow/deny decision plus (for admin-tier
  checks) the fresh role snapshot used to decide.
- `src/auth/delegatedTokenClient.ts` — wraps `POST /v1/bot/tokens/exchange`: scope-allowlist
  validation, short-lived in-memory token handling, safe-failure behavior when the endpoint is
  unavailable.
- `src/auth/recentAuthCheck.ts` — the recent-auth freshness check used by `/account unlink`'s
  admin/support path (consumed by Doc 005) and structurally available for any future approved
  admin-tier mutation (not invoked by any command in this build guide's current scope, per §8).
- `src/auth/permissionMatrix.ts` — a typed, in-code mirror of `PERMISSION_MATRIX.md`'s per-capability
  gate table (Discord-side gate type, Slice-side gate type, linked-account requirement), consumed by
  the interaction router's permission pre-check hook (Doc 003) so the matrix is a single source
  developers update in lockstep with the documentation table, never duplicated ad hoc per command.
- `src/auth/errors.ts` — typed error classes for each denial reason (not-linked, role-insufficient,
  account-restricted, recent-auth-stale, exchange-unavailable), consumed by the error-mapping layer
  (`ERROR_CATALOGUE.md`'s implementation, Doc 003) to select the exact user-facing copy.
- `src/auth/__fixtures__/fakeSliceAuthClient.ts` — the hand-written fake Slice API client (typed
  against the same interface as the real client) used by unit tests per `TEST_STRATEGY.md`.

## 20. Numbered implementation steps

1. Confirm Doc 004 and Doc 005 have closed (their own completion checklists satisfied) and that a
   disposable or real Slice environment exposes (or stubs, for early steps) the endpoints in §11.
2. Define the typed permission-matrix mirror (`permissionMatrix.ts`) directly from
   `PERMISSION_MATRIX.md`'s table, one entry per capability row, reviewed against the live document
   so no row is silently dropped or altered.
3. Implement the link-lookup step of `permissionResolver.ts` against
   `GET /v1/bot/discord-link/:discordUserId` (service-account auth), including the not-linked
   short-circuit.
4. Implement `delegatedTokenClient.ts` against `POST /v1/bot/tokens/exchange`, enforcing the exact
   scope allowlist from `BOT_API_REQUIREMENTS.md` §2 and rejecting any scope request outside it before
   the call is even made.
5. Implement the fresh admin-role/status check path of `permissionResolver.ts` against `GET
   /v1/session`/`GET /v1/me`, with zero caching beyond the single interaction's lifetime.
6. Implement `recentAuthCheck.ts`, consumed by Doc 005's `/account unlink` admin path (coordinate the
   exact call signature with Doc 005 so it can be integrated without modification there).
7. Implement `errors.ts` and wire each denial path in `permissionResolver.ts` /
   `delegatedTokenClient.ts` to raise the correct typed error, never a raw exception or a
   free-text string.
8. Wire the interaction router's (Doc 003) permission pre-check hook to call
   `permissionResolver.ts` for every command tagged with a Slice-side gate in `permissionMatrix.ts`,
   confirming Discord-side gates alone are used only for the bot-owned-only rows.
9. Add the structured operational log line (§16) at every allow/deny decision point, confirming no
   token, email, or raw exception body is ever included.
10. Build the fake Slice auth client fixture and the initial unit-test suite (§21) proving the
    "Discord role present, Slice denies" failure mode behaves exactly as §13/§18 specify.
11. Once a disposable Slice environment exposes the real endpoints (or stubs matching their exact
    contract), run the integration-test suite (§22) end-to-end.
12. Coordinate with Doc 009/010/013 authors (or, in a solo-implementer flow, the same implementer
    proceeding to those documents next) to confirm the exported interface from this document's
    modules is exactly what those documents' command handlers expect to call.

## 21. Unit tests

- `permissionResolver.ts`: not-linked → correct denial type; linked + sufficient role → allow;
  linked + insufficient role → denial with `FORBIDDEN`-mapped type; linked + restricted account status
  → denial with `ACCOUNT_RESTRICTED`-mapped type; the exact "Discord role present, Slice role absent"
  scenario from §13, asserting the returned decision never references Discord role state as a reason.
- `delegatedTokenClient.ts`: scope-allowlist enforcement (rejects an out-of-allowlist scope before any
  network call); token never logged or returned in a serializable form beyond the single call site
  that consumes it; exchange 401/403/503/429 each map to the correct typed error.
- `recentAuthCheck.ts`: freshness boundary behavior (fresh vs. stale, per whatever window Slice's
  endpoint documents once 004/005 finalize it) against a fake clock.
- `permissionMatrix.ts`: a snapshot/parity test asserting every row in the in-code matrix has a
  corresponding row in `PERMISSION_MATRIX.md` (and vice versa) — fails the build if the two drift.
- Error-mapping: every denial type from `errors.ts` maps to exactly one `ERROR_CATALOGUE.md` row, with
  a test asserting the exact copy string used.

## 22. Integration tests

- Against a disposable local Slice instance (or the closest available stub matching §11's endpoint
  contracts, once they exist): the full link → delegated-token-exchange → watchlist-mutation path
  end-to-end, per `TEST_STRATEGY.md`'s explicit note that this becomes possible "once the bot-only
  endpoints (§1–3 of BOT_API_REQUIREMENTS.md) exist on a disposable Slice instance."
- Admin-tier read path: a test Slice user seeded with `SUPPORT` role successfully authorizes an
  `/admin audit`-shaped permission check; a test user seeded with `USER` role is denied even when the
  test harness simulates the Discord-side admin role being present, proving the fresh check is what
  actually gates the outcome, not any bot-side flag.
- Token-exchange failure injection: simulate the exchange endpoint returning 503/429/401 and assert
  the permission layer fails closed with the correct mapped error, never falling back to a
  service-account-authorized call performed as if it were the user's own.
- Recent-auth staleness: simulate an `/account unlink` admin-path request against a Slice test session
  that does not satisfy the freshness window, asserting denial.

## 23. Discord interaction tests

- Simulated interaction payloads for a representative command in each `PERMISSION_MATRIX.md` category
  (self-token delegated-exchange row, admin-tier fresh-check row, bot-owned-only row) run through the
  real interaction router with this document's permission modules wired in (using the fake Slice auth
  client), asserting: correct ephemeral/public flag, correct denial copy, and — critically — that a
  simulated interaction from a user with the bot's configured Discord "admin" role but a fake Slice
  client configured to deny returns the exact same denial embed as a user with no Discord role at
  all, proving the UX in §18 is Discord-role-independent.
- Custom-ID/component tests are not applicable to this document (it introduces no buttons/selects of
  its own beyond the shared "link your account" button already specified in Doc 005).

## 24. Manual QA checklist

- [ ] With a Slice test account seeded as `USER` and no Discord admin/support role: `/admin audit`
      command is not visible/runnable at the Discord layer.
- [ ] With a Slice test account seeded as `USER` but the Discord bot admin/support role manually
      granted in the test guild: `/admin audit` is visible, the interaction defers, and the response
      is the standard "You don't have permission to do that." — never a raw Slice error, never any
      hint that the Discord role was checked or passed.
- [ ] With a Slice test account seeded as `SUPPORT` and the Discord admin/support role granted:
      `/admin audit` succeeds and returns real data.
- [ ] With a Slice test account seeded as `SUPPORT` but *no* Discord admin/support role in this guild:
      the command is not offered at the Discord layer (Discord-side gate correctly enforced even
      though the Slice-side permission would have passed).
- [ ] Unlink the Discord↔Slice mapping mid-session (via `/account unlink`) and immediately retry a
      previously-working `/watchlist add`: the bot re-resolves the link fresh and correctly denies
      with the not-linked prompt, never using a stale in-memory token from the prior interaction.
- [ ] Suspend the linked Slice test account and retry `/watchlist add`: `ACCOUNT_RESTRICTED` mapped
      message shown, no internal reason leaked.
- [ ] Trigger the delegated-token exchange endpoint's rate limit deliberately (or via a test double)
      and confirm the bot surfaces the `Retry-After`-aware message, not a raw 429.
- [ ] Grep the test guild's message history and the bot's structured logs after a full pass to confirm
      no token value, email address, or raw exception text ever appeared (mirrors
      `TEST_STRATEGY.md`'s "Security QA" step).

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance exposing BOT_API_REQUIREMENTS.md §2's endpoint
npm run build
```

## 26. Completion checklist

- [ ] `permissionResolver.ts`, `delegatedTokenClient.ts`, `recentAuthCheck.ts`, `permissionMatrix.ts`,
      and `errors.ts` implemented per §19/§20.
- [ ] Every row in `PERMISSION_MATRIX.md` that has a Slice-side gate is represented in the in-code
      matrix with a passing parity test (§21).
- [ ] The "Discord admin role present, Slice denies" failure mode is covered by a unit test, an
      integration test (once the real endpoint exists), and a Discord-interaction test, all passing.
- [ ] No Slice access token, delegated token, refresh token, or password appears in any log line,
      message, embed, or custom ID — verified by the manual QA grep step (§24) in addition to
      automated redaction tests.
- [ ] Every denial path maps to an exact `ERROR_CATALOGUE.md` row; no free-text or raw-exception
      user-facing string exists anywhere in this document's modules.
- [ ] Fresh-check behavior verified to have zero caching beyond a single interaction's lifetime (no
      TTL cache, no per-guild cache, no "trust it for N minutes" shortcut anywhere in the code).
- [ ] Doc 009, Doc 010, and Doc 013's authors (or the same implementer proceeding next) confirm this
      document's exported module interfaces are sufficient for their own command handlers without
      needing to reimplement any permission logic locally.
- [ ] All verification commands in §25 pass.
- [ ] This document's own row in `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md` is not marked
      COMPLETE by this document alone — only once the actual work described here has been done and
      verified (per those files' own stated update rule).

## 27. Documentation updates

- `PROMPT_INDEX.md` — flip this document's row from NOT STARTED to COMPLETE once the completion
  checklist (§26) is fully satisfied, not before.
- `IMPLEMENTATION_ORDER.md` — no structural change expected (dependency graph stays the same), but its
  "Can start today?" column for 009, 010, and 013 should be revisited once this document actually
  closes, since their block reason ("blocked until account linking closes") specifically depends on
  006 in addition to 004/005.
- `CURRENT_STATE.md` — update the "Known blockers" section once the delegated-token-exchange endpoint
  (BOT_API_REQUIREMENTS.md §2) is confirmed built and verified on a real Slice environment, since that
  blocker is currently named there as blocking Documents 004–006, 009, 010, 013 collectively.
- `MASTER_CHECKLIST.md` — the "Production readiness (future)" section's "New Slice backend endpoints
  (BOT_API_REQUIREMENTS.md §1–3) built and verified by Slice's own team" checkbox is directly relevant
  to this document's own closure and should be checked only once genuinely true, not assumed.
- No change to `PERMISSION_MATRIX.md`, `BOT_SECURITY_MODEL.md`, `BOT_API_REQUIREMENTS.md`,
  `BOT_DATA_OWNERSHIP.md`, or `ERROR_CATALOGUE.md` is anticipated from this document's work — this
  document implements what those already specify; if implementation reveals a gap or contradiction in
  any of them, that top-level document is corrected separately, not silently worked around here.

## 28. Final report format

On completion, the implementer's report for this document must state, in this order:

1. **Status:** closed / blocked (and if blocked, the exact blocking condition — e.g., "Slice's
   `POST /v1/bot/tokens/exchange` endpoint is not yet available on any environment").
2. **What was built:** the exact module list from §19 that now exists, with file paths.
3. **Slice backend dependency status:** whether `POST /v1/bot/tokens/exchange` (and the read-only
   discord-link lookup) exist on a real or disposable Slice environment at the time of this report,
   quoting Slice's own backend build guide status if available — never assumed.
4. **Test results:** pass/fail for each of §21/§22/§23's test categories, with integration tests
   explicitly marked "not run — no Slice environment available" if that is the case, never silently
   omitted.
5. **Completion checklist (§26):** each item's final checked/unchecked state.
6. **Handback:** explicit confirmation that Doc 009/010/013 can now proceed to consume this document's
   modules, or an explicit list of what remains before they can.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
