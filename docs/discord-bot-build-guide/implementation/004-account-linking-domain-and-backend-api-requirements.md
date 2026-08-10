# Implementation Document 004: Account-linking domain and backend API requirements

## 1. Metadata

- **Document number:** 004
- **Title:** Account-linking domain and backend API requirements
- **Status:** NOT STARTED (this build guide is documentation-only and contains no completed
  implementation work; per `CURRENT_STATE.md`, no Discord bot code exists anywhere)
- **Depends on (this build guide):** 002 (Slice API client and shared contracts)
- **Blocks (this build guide):** 005 (Account-linking Discord commands), 006 (Permission and
  authorization integration), 009 (Watchlist and portfolio commands), 010 (Notification commands and
  delivery-preference documentation), 013 (Admin read-only operational commands) — every downstream
  document that requires a linked Discord↔Slice identity to act on behalf of a real user
- **Slice backend dependency:** New bot-only endpoints must exist on a Slice environment before this
  document closes (`BOT_API_REQUIREMENTS.md` §1 "Discord account linking", §2 "Bot-scoped delegated
  reads/writes", §3 "Service-account authentication itself"). None of these endpoints, the proposed
  `DiscordLink` table, or the proposed `ServiceAccount` entity exist in Slice today.
- **Can start today:** Spec work — Yes, this document's domain-model and request-contract content can
  be produced now from already-verified material. Full closure — **Blocked**: this document cannot be
  marked COMPLETE until Slice's own backend team has designed, built, and deployed the endpoints and
  entities specified in §11 below on at least a staging Slice environment, and has explicitly signed
  off on the two open design questions raised in §7/§11 (the delegated-token-exchange mechanism and
  the service-account credential shape). This is deliberately a coordination document as much as a
  build document: half of its deliverable is a formal, precise ask directed at a team outside this
  build guide's control, not code this build guide's own implementer can finish unilaterally.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`) that this build
guide never modifies, rewrites, or bypasses. The Slice Discord bot is a companion client to Slice: it
calls Slice's HTTP API for every read and write, never queries Slice's Postgres/Prisma database
directly, and never duplicates a Slice business rule. Per `IMPLEMENTATION_ORDER.md`, this is
Implementation Document 004, the first document in "Track A" (004 → 005 → 006 → 009 → 010 → 013), the
one track of the eighteen-document build that is blocked on new Slice backend work rather than purely
on bot-side sequencing. Slice's identity model has no Discord or external-identity concept anywhere
today — no field on `User`, no `ExternalIdentity` table, no service-account credential type. This
document is where that gap gets designed: the account-linking domain model on the bot side (the
challenge/link/unlink state machine, how a Discord user ID is associated with a Slice user ID without
the bot ever holding Slice credentials), and the exact, formal request-for-endpoints this document
directs at Slice's own backend team so that Document 005 has something real to build Discord commands
against. Document 002 (Slice API client and shared contracts) must close first because this document's
request-contract tables extend that document's typed client pattern; this document in turn blocks
every later document whose commands require a linked identity.

## 3. Current implementation audit

Per `CURRENT_STATE.md`, no Discord bot code exists anywhere: there is no repository, no
`package.json`, no `src/` tree, nothing beyond this documentation tree. No Slice source file has been
modified. Because implementation has not begun on any of Documents 001–003 either, this document's
starting state is not "Document 002's shipped API client," but Document 002's own *specification* —
this document treats Document 002's planned typed HTTP client module (`BOT_ARCHITECTURE.md`'s "Slice
API client" component) as the extension point its own new endpoint methods will be added to once both
(a) an implementer actually builds Document 002 and (b) Slice's backend team ships the endpoints
specified in §11 below. On the Slice side, `project-state.json`'s `sliceBackendStatus` confirms
Slice's backend Documents 004–008 (identity, sessions, catalogue, market, collectors) are COMPLETE and
VERIFIED, which is what makes `GET /v1/session` and `GET /v1/me` safely reusable by `/account status`
(Document 005) once linking exists — but nothing in Slice's own backend build guide (Docs 001–018)
defines a Discord/external-identity table, a service-account credential type, or a token-delegation
mechanism. Those are new asks, not extensions of anything already built.

## 4. Old bot behavior migrated

`OLD_BOT_FEATURE_INVENTORY.md` row 15, `cogs/Verification.py` ("Reaction-triggered DM verification"),
is the old bot's closest analog, and it is cited here precisely because of how limited that analogy
is. The old bot's flow: a new member reacts in a verification channel, the bot DMs a random 4-digit
code, the member echoes it back via a blocking `bot.wait_for`, and on a match the bot grants a
"member" Discord role. Its own inventory row states plainly: this is "conceptually the closest thing
to 'account linking,' but does **not** link to any external identity — it's pure anti-raid/anti-bot
theater." It verifies only that the responding Discord client is not an automated join-flood bot; it
never verifies anything against an external product account, because Infria (the old bot's community)
has no external product for a Discord identity to be linked to. Its migration status in
`OLD_TO_NEW_MIGRATION_MATRIX.md` is **REWRITE** with an explicit split: the *concept* (a short-lived,
single-use, bot-issued code as a DM-based confirmation UX pattern) is a reasonable pattern to reuse for
the real Slice account-linking flow this document designs, but the *implementation* — in-memory
`sentError` state that does not survive a restart, no expiry, no replay protection, and a role grant
rather than an identity assertion — must not be reused. Nothing else in
`OLD_BOT_FEATURE_INVENTORY.md`/`OLD_TO_NEW_MIGRATION_MATRIX.md` maps to this document's scope; there is
no old-bot predecessor for delegated token exchange or service-account authentication, because the old
bot never called an external product API on a user's behalf at all — it read/wrote only its own MySQL
tables and the Discord API directly.

## 5. Slice features supported

This document touches Slice's identity and session model (Slice backend Docs 004–005, per
`project-state.json` COMPLETE/VERIFIED) only as a *read* dependency (`GET /v1/session`, `GET /v1/me`,
already available per `BOT_API_REQUIREMENTS.md`'s "Already available" table) — those calls are not
implemented by this document (they belong to Document 005's `/account status`), but their VERIFIED
status is why `/account status` is safe to design against once linking exists. The actual subject of
this document — Discord account linking, delegated token exchange, and service-account authentication
— has **NOT STARTED** status on Slice's side in the strongest possible sense: it is not merely an
unimplemented row in Slice's own 18-document backend build guide, it is not a documented feature of
Slice's identity model *at all*. `BOT_API_REQUIREMENTS.md`'s "Bot-only service endpoints" section
states this explicitly for all three: "none of this exists today." This document does not claim any
different status; it exists specifically to turn that "does not exist" into a precise, actionable spec
Slice's own team can build against.

## 6. Files to read before starting

- `BOT_API_REQUIREMENTS.md` — full document, especially §1 (Discord account linking), §2 (bot-scoped
  delegated reads/writes), §3 (service-account authentication), and the "Explicitly NOT recommended"
  section (bounds what this document is allowed to ask for).
- `BOT_SECURITY_MODEL.md` — full document, especially §1 (account linking), §2 (guild authorization),
  §4 (bot token and Slice credential safety), §6 (Discord role possession ≠ Slice permission), §7
  (recent authentication for high-impact actions), §8 (compromised Discord account handling), §9
  (deleted Discord accounts).
- `BOT_DATA_OWNERSHIP.md` — full table, especially the "Discord ↔ Slice user link mapping" row and its
  "Rule" section (default answer is Slice unless the data has zero product/financial/identity meaning
  outside Discord).
- `PERMISSION_MATRIX.md` — rows for `/account link`, `/account status`, `/account unlink` (self and
  support paths).
- `ERROR_CATALOGUE.md` — full table and its inherited rule from Migration M6 (never interpolate a raw
  exception into a user-facing string).
- `COMMAND_CATALOGUE.md` — rows for `/account link`, `/account unlink`, `/account status` (their
  columns for Purpose, Permission, Linked account required, Backend calls, Rate limit, Audit,
  Idempotency, Error cases, Old-bot predecessor, Impl doc — noting these commands are *built* in
  Document 005, not this one).
- `OLD_BOT_FEATURE_INVENTORY.md` row 15 (`Verification.py`) and `OLD_TO_NEW_MIGRATION_MATRIX.md`'s
  "Explicitly not migrated" section (confirms reaction-based DM verification is not ported as-is).
- `BOT_ARCHITECTURE.md` — "Slice API client" and "Auth/linking module" bullets under "Architecture
  overview," and "Bot must never do."
- `TEST_STRATEGY.md` — "Account-link token lifecycle (expiry, single-use, 1:1 enforcement) against a
  fake service layer" (unit tests) and the integration-test note that link → delegated-token-exchange
  → watchlist-mutation end-to-end tests are gated on the bot-only endpoints existing on a disposable
  Slice instance.
- `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md` — this document's row, to confirm dependency/blocking
  chain (002 → 004 → {005, 006} → {009, 010, 013}).
- `CURRENT_STATE.md` and `project-state.json` — to confirm zero bot code exists and Slice's own backend
  document statuses before assuming anything is further along than it is.

## 7. Strict scope

- Define the account-linking **domain model**: the challenge → pending → linked → unlinked/revoked
  state machine, its states, transitions, and the invariants each transition must uphold (single-use
  token, 1:1 uniqueness both directions, no silent overwrite).
- Specify, precisely and without inventing anything Slice hasn't proposed, **the linking challenge
  flow** grounded in `BOT_API_REQUIREMENTS.md` §1's single proposed contract: a short-lived (≤10
  minute), single-use, cryptographically random code, generated by a bot-only service-account-authed
  endpoint, bound server-side to the requesting Discord user ID, completed on the Slice **web app**
  (not in Discord) via a user-session-authed endpoint. `BOT_API_REQUIREMENTS.md` §1 does not propose a
  second flow (e.g., a magic-link variant) — so this document does not present one as an option; where
  §1's sibling section (§2, and `BOT_SECURITY_MODEL.md` §4) explicitly frames a mechanism as an *open*
  design question with named alternatives, this document presents those alternatives as options for
  Slice's team to choose between (see §11) rather than silently picking one.
- Specify how the bot associates a Discord user ID with a Slice user ID **without ever storing Slice
  credentials** (password, session cookie, access token, or refresh token) on the bot side, consistent
  with `BOT_DATA_OWNERSHIP.md`'s rule that the link mapping's authoritative record is a new Slice-side
  table, and `BOT_ARCHITECTURE.md`'s "Bot must never do" list.
- Define the bot-side, **non-authoritative** operational persistence this document introduces (a
  short-TTL link-status cache and a local audit-correlation log) — explicitly distinct from, and never
  a substitute for, the Slice-side authoritative mapping.
- Produce the **exact request/response contract** this document is asking Slice's backend team to build
  for `BOT_API_REQUIREMENTS.md` §1–3: every endpoint's method, auth type, request body, response body,
  idempotency behavior, rate limit, and audit requirement, plus the two new Slice-side entities
  (`DiscordLink`, `ServiceAccount`) those endpoints depend on.
- State plainly, in this metadata and again here, that this document is a **coordination document**:
  its bot-side domain model and its Slice-facing request contract can both be fully specified today,
  but the document's own completion checklist (§26) cannot be checked off in full until Slice's team
  has built and deployed the requested endpoints on at least a staging environment and has signed off
  on the two flagged open design questions.

## 8. Out of scope

- Building any Discord command (`/account link`, `/account unlink`, `/account status`) — those are
  Document 005's scope; this document defines the domain model and contract those commands will be
  built against, nothing more.
- Building the permission/authorization integration that uses a linked account to gate other commands
  (`/watchlist`, `/notifications`, `/portfolio`, `/admin *`) — that is Document 006's scope.
- Implementing any part of Slice's backend (the `DiscordLink` table, the `ServiceAccount` entity, the
  four bot-only endpoints, or the delegated-token-exchange mechanism). This document specifies what is
  being asked of Slice's team; it does not write, migrate, or deploy any Slice code, and per this build
  guide's ground rules, no Slice source or Prisma schema is touched by producing this document.
- Designing or building notification delivery / a Discord notification channel type
  (`BOT_API_REQUIREMENTS.md` §4) — explicitly a separate, later design dependency on Slice Doc 017, not
  part of account linking.
- Deciding the bot's UI copy/embed layout for the link flow — `§18` below states only the UX
  *constraints* the domain model imposes (e.g., "the code is shown ephemerally, never logged"); the
  actual wireframe is Document 005's deliverable.
- Any recent-auth-gated high-impact Slice mutation (admin status/role changes) — `BOT_SECURITY_MODEL.md`
  §7 explicitly recommends not exposing these in Discord in early phases, and this document does not
  reopen that question.

## 9. Dependencies

- **Document 002** (Slice API client and shared contracts) must exist first: this document's request
  contract (§11) is written to extend that document's typed HTTP client pattern (one typed method per
  endpoint, shared DTO types), and its own bot-side domain types are meant to live alongside Document
  002's shared-contracts package rather than duplicate it.
- No new third-party runtime library is introduced by this document's spec work itself. Once Document
  005/006 implement against this contract, the same dependencies already named in `BOT_ARCHITECTURE.md`
  apply: `discord.js` v14+, a `zod`-validated config/DTO layer, and — for the bot-owned persistence
  introduced in §10 — whatever ORM/KV store Document 001 selects for bot-owned state (Postgres/SQLite
  via an ORM, or a managed KV store, per `BOT_DATA_OWNERSHIP.md`).
- **External dependency, not a library:** Slice's backend team's own design and delivery of the
  entities and endpoints in §11 — this is the one dependency this document cannot resolve by writing
  more documentation.

## 10. Bot-owned persistence

`BOT_DATA_OWNERSHIP.md` is explicit: the Discord↔Slice link mapping's row is "Shared — Slice is
authoritative for the mapping's existence/validity; the mapping itself is a new Slice-side table," and
"the bot never independently decides a link is valid — it always confirms against Slice." This
document therefore does **not** introduce a bot-owned authoritative link table. What it does introduce
is two narrowly-scoped, explicitly non-authoritative pieces of bot-owned state, both falling under
`BOT_DATA_OWNERSHIP.md`'s "Discord interaction state... Ephemeral, short TTL, never a system of
record" and "Audit events... Bot writes its own *correlated* local log entry, never a competing audit
record" rows:

| Table (proposed) | Purpose | Authority | Schema sketch | TTL / retention |
|---|---|---|---|---|
| `LinkStatusCache` | Avoids an unnecessary Slice API round-trip for low-stakes, read-only UX (e.g., deciding whether to show an "you're not linked yet" hint before a user runs `/watchlist`) | **Non-authoritative.** Never consulted for any mutating action or any permission decision — those always call `GET /v1/bot/discord-link/:discordUserId` fresh (`BOT_ARCHITECTURE.md`'s permission module: "never trusts a cached Slice status for a mutating command") | `discordUserId` (PK), `cachedStatus` (`LINKED`\|`NOT_LINKED`), `cachedAt` | 60 seconds, hard TTL; expired rows are treated as cache-miss, not as "not linked" |
| `LinkAuditCorrelation` | Local operational log entry correlating a bot-side interaction with the Slice-side `AuditEvent` the linking/unlinking action produced | **Non-authoritative, correlation only** — never a competing record of *whether* a link is valid, per `BOT_DATA_OWNERSHIP.md`'s "Audit events" row and `BOT_SECURITY_MODEL.md` §5 | `id`, `discordUserId`, `botRequestId`, `sliceRequestId`, `action` (`CHALLENGE_ISSUED`\|`LINK_COMPLETED`\|`UNLINK_REQUESTED`), `outcome`, `createdAt` | Retained per the bot's general structured-log retention policy (Document 016), not deleted on link/unlink |

No bot-owned table stores a Slice password, session cookie, access token, or refresh token, consistent
with `BOT_ARCHITECTURE.md`'s "Bot must never do" list and `BOT_SECURITY_MODEL.md` §1's "no password
collection in Discord, ever." The bot-issued challenge code itself is never persisted by the bot beyond
the single ephemeral Discord message it is shown in — it is generated and owned by Slice
(`BOT_API_REQUIREMENTS.md` §1: "Creates a single-use, ≤10-minute token bound to `discordUserId`"), and
the bot only relays it to the requesting user.

## 11. Slice API dependencies

This document delivers no runtime code, so no code in this document *calls* a Slice endpoint. What it
delivers instead is the formal contract that Documents 005/006/009/010/013's code will call once built,
and — because none of these endpoints exist — a precise request directed at Slice's backend team. Every
endpoint below is tagged exactly as in `BOT_API_REQUIREMENTS.md`.

### Already-available (VERIFIED, used only as a downstream reference by this domain model)

| Endpoint | Tag | Used by |
|---|---|---|
| `GET /v1/session`, `GET /v1/me` | already-available (VERIFIED, Slice Docs 004–005) | `/account status` (Document 005), not called by this document's own deliverable |

### New endpoint required (extends an existing Slice module)

| Endpoint | Tag | Notes |
|---|---|---|
| `GET /v1/me/discord-link` | new-endpoint-required, NOT yet built | Web-app-facing link-status read; not called by the bot itself (the bot uses the bot-only equivalent below), included here only because it shares the same `DiscordLink` table this document requests |

### Bot-only service endpoints — THE FORMAL REQUEST TO SLICE'S BACKEND TEAM (none of this exists today)

This is the operative deliverable of this document. Each row is a precise ask; nothing here should be
built by the bot team — it names exactly what Slice's backend team needs to design, build, and deploy.

| Endpoint | Method | Tag | Auth | Request body | Response body | Idempotency | Rate limit | Audit |
|---|---|---|---|---|---|---|---|---|
| `POST /v1/bot/discord-link/challenge` | POST | bot-only-service-endpoint, proposed/not yet built | service-account | `{discordUserId: string}` | `{code: string, expiresAt: ISO8601}` | Not idempotent by design (each call may legitimately issue a new code); rate limit is the abuse control | 3/hour per `discordUserId` | No Slice `AuditEvent` on issuance alone (only on completion) — bot writes a local `LinkAuditCorrelation` row (`CHALLENGE_ISSUED`) |
| `POST /v1/me/discord-link/complete` | POST | bot-only-service-endpoint, proposed/not yet built — **called from the Slice web app, not the bot** | user session (cookie/token) | `{code: string}` | `{linked: true, discordUserId, linkedAt}` on success; generic rejection (no expired-vs-used distinction) on failure | Idempotency key required | Standard | Slice `AuditEvent` written, one per successful completion |
| `POST /v1/bot/discord-link/unlink` | POST | bot-only-service-endpoint, proposed/not yet built | service-account (self-service, on behalf of the requesting Discord user) OR admin token (support case, recent-auth required) | `{discordUserId}` (self-service) or `{userId, reasonCode}` (admin) | `{unlinked: true}` (idempotent success even if already unlinked) | Idempotent | 5/hour per `discordUserId` (self-service path) | Slice `AuditEvent` written on every call, success or already-unlinked no-op |
| `GET /v1/bot/discord-link/:discordUserId` | GET | bot-only-service-endpoint, proposed/not yet built | service-account | — | `{linked: boolean, userId?, status?}` | n/a (read) | Rate limited (exact figure left to Slice's team; this document does not invent one where §1 doesn't state one) | n/a (read) |
| `POST /v1/bot/tokens/exchange` | POST | bot-only-service-endpoint, **proposed, requires Slice backend team's explicit design sign-off before this document can close** | service-account | `{discordUserId, scope}` — `scope` restricted to an explicit allowlist: `watchlist:read`, `watchlist:write`, `notifications:read`, `notifications:write`, `portfolio:read`, `profile:read` | Short-lived (≤5 minute) narrowly-scoped access token for the linked Slice user, usable only for the requested scope | n/a (each exchange is a fresh grant) | To be set by Slice's team commensurate with the sensitivity of impersonation-adjacent token issuance | Slice `AuditEvent` per exchange, `actorType: SERVICE` acting on behalf of `userId` |

**New Slice-side entity requested (not an endpoint):** a `ServiceAccount` credential type
(`BOT_API_REQUIREMENTS.md` §3) — none of Slice's existing `User.status`/`role` model covers a machine
identity. Requested shape: a new `ServiceAccount` entity (or a reserved `RoleAssignment` scope for
machine identities) with its own rotatable credential, scoped to exactly the five endpoints above, rate
limited independently of any human user, and fully audited with `actorType: SERVICE` on every call —
distinguishable from human `AuditEvent` actors. This entity is a prerequisite for every service-account-
authed row in the table above; none of those rows can be built until it exists.

### Open design questions this document raises for Slice's team, presented as options (not decided here)

`BOT_SECURITY_MODEL.md` §4 and `BOT_API_REQUIREMENTS.md` §2 both frame the delegated-token-exchange
mechanism as an explicit open question with two named alternatives, and §3 frames the service-account
credential shape the same way. This document presents both, deliberately not choosing, because
choosing would mean "inventing a mechanism Slice hasn't approved" (`BOT_SECURITY_MODEL.md` §4's own
stated constraint):

| Open question | Option A | Option B | This document's position |
|---|---|---|---|
| Delegated access for user-scoped bot calls (§2) | A dedicated `POST /v1/bot/tokens/exchange` endpoint (table above) that mints a short-lived, narrowly-scoped token per request | A scoped service-to-service delegation model (e.g., the bot presents its service-account credential plus the target `userId`/`discordUserId` on every user-scoped call, with Slice resolving scope per-call rather than issuing a standalone token) | Proposes Option A's shape (table above) as the concrete, reviewable default because it best matches the "short-lived, narrowly-scoped, never a long-lived credential on the bot" requirement, but does not assume it is pre-approved — Slice's team may prefer Option B, and either choice is acceptable as long as it meets `BOT_SECURITY_MODEL.md` §1 and §4's constraints |
| Service-account credential shape (§3) | A rotatable API key | An mTLS client certificate | No position taken — both satisfy "rotatable, scoped, independently rate-limited, fully audited"; the choice depends on Slice's existing infrastructure conventions, which this build guide has not inspected for machine-credential precedent |

This document's own completion (§26) is blocked until Slice's team resolves both rows above and reflects
the resolution in a deployed staging environment.

## 12. Commands / events / jobs delivered

None. Per §7/§8, this document delivers zero Discord commands, events, or jobs — those are Document
005 (`/account link`, `/account unlink`, `/account status`) and Document 006 (the permission
integration that consumes this document's linked-account state for `/watchlist`, `/notifications`,
`/portfolio`, `/admin *`). For traceability, the `COMMAND_CATALOGUE.md` rows that *depend on* this
document's domain model (without being built by it) are:

| Command | Impl doc that builds it | Domain-model dependency on this document |
|---|---|---|
| `/account link` | 005 | Challenge issuance/state machine (§7, §11) |
| `/account unlink` | 005 | Unlink transition, 1:1 uniqueness invariant (§7) |
| `/account status` | 005 | Link-status read path (`GET /v1/bot/discord-link/:discordUserId` or `GET /v1/session`/`GET /v1/me` once linked) |
| `/watchlist add/remove/list`, `/notifications *`, `/portfolio` | 009, 010 | Delegated-token-exchange contract (§11) |
| `/admin link-lookup` | 013 | `GET /v1/bot/discord-link/:discordUserId` contract (§11) |

## 13. Permission rules

Per `PERMISSION_MATRIX.md`:

- `/account link`, `/account status`: Discord-side gate is "any member"; Slice-side gate is "none
  (self-service)" — no privileged Slice permission is required to start or check a link, because
  linking is how a user first establishes which Slice account they are.
- `/account unlink` (self): Discord-side gate is "any member"; Slice-side gate is "self-token match" —
  the requester must be the Discord user the link belongs to.
- `/account unlink` (support): Discord-side gate is "bot support/admin role"; Slice-side gate is
  "Slice `ADMIN` + recent-auth" — `PERMISSION_MATRIX.md` marks this explicitly as "two-gate, both
  required," meaning a Discord admin role alone is never sufficient to unlink another user's account.

This document does not itself implement a permission check (it builds no command), but it is the
source of the invariant every downstream document must respect: **a Discord-side role or permission
check is always a UX gate, never a substitute for Slice's own authorization response.** Concretely for
this domain model: possessing a bot support/admin Discord role is what lets a user *attempt* an
admin-path unlink; whether that attempt succeeds is decided entirely by Slice's `POST
/v1/bot/discord-link/unlink` admin-token path enforcing `ADMIN` + recent-auth server-side, not by
anything the bot decided locally.

## 14. Security requirements

Cited directly from `BOT_SECURITY_MODEL.md` §1 (account linking), the section this document's domain
model exists to satisfy:

- **Link challenge:** a short-lived (≤10 minute), single-use, cryptographically random token bound to
  the requesting Discord user ID, shown only in an ephemeral Discord message — never in a public
  channel, never DM'd unencrypted-in-plaintext-and-logged, never echoed back into any bot log line.
- **Completion on the Slice web app:** the user is already authenticated with a real session there;
  Slice atomically creates the mapping, invalidates the token (success or failure — always single-use),
  and writes an `AuditEvent`.
- **Replay prevention:** the token is invalidated on first use regardless of outcome; expired tokens are
  rejected with a generic error — no distinction between "expired" and "already used" is leaked (this
  is why §17 below defines a single generic rejection error rather than two distinguishable ones).
- **CSRF-style linking-attack prevention:** the token is bound server-side to the Discord user ID that
  requested it; it cannot be redeemed to link a *different* Discord account than the one that generated
  it, even under a tricked-victim scenario.
- **Discord user verification:** the bot never trusts a client-supplied Discord ID for anything
  security-relevant — it always uses the ID Discord itself attaches to the interaction object, never a
  value from a modal/option/custom ID that a user could tamper with.
- **1:1 enforcement:** a unique constraint in both directions (one Discord account ↔ one Slice account)
  on the Slice-side `DiscordLink` table — attempting to link a second Slice account from an
  already-linked Discord account, or vice versa, is rejected with a clear "already linked" error, never
  silently overwritten.
- **Unlink/relink:** self-service or admin-with-recent-auth only (§13); relinking after unlink requires
  the full challenge flow again, with no shortcut or grace-period bypass.
- **No password collection in Discord, ever:** no Slice access token, refresh token, session cookie, or
  password is ever placed in a Discord message, embed, button custom ID, modal, or log line — this
  document's §10 bot-owned tables are designed specifically to have no field capable of holding any of
  those.

Additionally, from `BOT_SECURITY_MODEL.md` §2 (guild authorization): the link is **global to the
Discord account**, not per-guild — a user linked in one server is recognized as linked in any other
server the bot is installed to. This is an explicit product decision reflected in the domain model
(§7): the `DiscordLink` mapping keys on `discordUserId` alone, with no `guildId` column, and per-guild
bot configuration (tickets, moderation) stays entirely separate per `BOT_DATA_OWNERSHIP.md`.

From `BOT_SECURITY_MODEL.md` §4 (bot token and Slice credential safety): the bot needs exactly two new
credential types that do not exist in Slice today — a service-account credential for non-impersonating
calls, and a mechanism (open question, §11) for short-lived, narrowly-scoped, user-impersonating
access. If Slice's team chooses a model requiring request signing (HMAC or mTLS), the bot's API client
implements it as a single, centrally-located concern, never duplicated per-command (`BOT_ARCHITECTURE.md`).

From `BOT_SECURITY_MODEL.md` §6: a Discord admin/moderator role never implies Slice `ADMIN` permission,
and conversely a Slice account status change (e.g., `SUSPENDED`) never automatically triggers a
Discord-side action unless a future, explicitly product-approved policy says so — this document does
not design or assume any such policy.

From `BOT_SECURITY_MODEL.md` §7: any command gated by Slice's "recent-auth" requirement cannot be
satisfied by a stale link record; this build guide's stated approach (also reflected in `PERMISSION_MATRIX.md`)
is to simply not expose those specific mutations in Discord in early phases rather than attempt to
simulate freshness the bot cannot actually guarantee.

From `BOT_SECURITY_MODEL.md` §8–9: a compromised or orphaned Discord account is handled by severing the
link (admin-assisted unlink, recent-auth required); the bot never attempts to protect or act on the
underlying Slice account beyond removing the mapping, and a link left orphaned by a deleted Discord
account is surfaced to admins for cleanup, never used as a trigger to delete Slice data.

## 15. Idempotency and rate limits

| Operation | Idempotency | Rate limit | Source |
|---|---|---|---|
| `POST /v1/bot/discord-link/challenge` | Not idempotent by design — a repeated call while a prior code is still valid is expected to return a fresh code, per the rate limit below controlling abuse instead | 3 per hour per `discordUserId` | `BOT_API_REQUIREMENTS.md` §1, `COMMAND_CATALOGUE.md` `/account link` row |
| `POST /v1/me/discord-link/complete` | Idempotency key required | Standard (web-app session rate limits apply, not a bot-specific figure) | `BOT_API_REQUIREMENTS.md` §1 |
| `POST /v1/bot/discord-link/unlink` | Idempotent (already-unlinked is a success no-op, not an error) | 5 per hour per `discordUserId` | `COMMAND_CATALOGUE.md` `/account unlink` row |
| `GET /v1/bot/discord-link/:discordUserId` | n/a (read) | Rate limited; exact figure to be set by Slice's team, not invented here | `BOT_API_REQUIREMENTS.md` §1 |
| `POST /v1/bot/tokens/exchange` | n/a (each call is a fresh, short-lived grant, not a retryable mutation in the idempotency-key sense) | To be set by Slice's team commensurate with impersonation-adjacent sensitivity | `BOT_API_REQUIREMENTS.md` §2 |

Consistent with `BOT_ARCHITECTURE.md`'s idempotency-key derivation rule, once Document 005/006 build
against this contract, any deterministic key they generate must be derived from
`(discordUserId, command, targetResourceId, nonce)` with `nonce` fixed per logical user intent — this
document does not need to derive a key itself since it ships no mutating code, but the contract in §11
is written so that future code can.

## 16. Audit requirements

- Every Slice-side mutation this contract defines (`complete`, `unlink`, `exchange`) writes a Slice
  `AuditEvent` — this is Slice's own responsibility once built, not something the bot can fabricate or
  substitute for.
- Service-account-authed calls must be distinguishable from human actors in Slice's audit trail:
  `actorType: SERVICE`, per `BOT_API_REQUIREMENTS.md` §3's requirement on the requested `ServiceAccount`
  entity.
- The bot additionally writes its own local, non-authoritative `LinkAuditCorrelation` row (§10) on
  challenge issuance, link completion (as reported back to the bot), and unlink requests — for
  correlating a Discord interaction with a Slice request ID and audit event during support
  investigations, never as a competing record of whether a link is or was valid
  (`BOT_DATA_OWNERSHIP.md`'s "Audit events" row, `BOT_SECURITY_MODEL.md` §5).
- No audit log line — Slice-side or bot-side — may ever contain the raw challenge code, a Slice
  access/refresh token, or a password, per `BOT_SECURITY_MODEL.md` §10's redaction rule.

## 17. Error behavior

`ERROR_CATALOGUE.md` does not yet contain rows for this document's linking-specific error cases (its
existing rows cover generic Slice error codes like `VALIDATION_FAILED`, `AUTHENTICATION_REQUIRED`,
`RATE_LIMITED`, etc., which still apply to any transport-level failure of these new endpoints). This
document defines the linking-specific cases and their Discord-facing copy pattern, following the
catalogue's existing style (never echo raw Slice error bodies, never distinguish security-sensitive
states an attacker could use for enumeration):

| Case | Discord-facing message | Notes |
|---|---|---|
| Challenge requested while already linked | "This Discord account is already linked to a Slice account. Run `/account unlink` first if you need to relink." | Not an enumeration risk — the requester is asking about their own account |
| Challenge code expired or already used (completion side, surfaced to the web app, not the bot) | "That code isn't valid. Request a new one from `/account link`." | Deliberately generic per `BOT_SECURITY_MODEL.md` §1 — never distinguishes "expired" from "already used" |
| Challenge requested too frequently | "You're doing that too fast — try again in {Retry-After}." | Matches `ERROR_CATALOGUE.md`'s existing `RATE_LIMITED` pattern exactly |
| Unlink requested for a Discord account with no active link | "This Discord account isn't linked to a Slice account." | Idempotent success framing preferred where the operation itself is idempotent (§15); this copy is used only if the bot chooses to surface the no-op explicitly rather than silently confirming success |
| Attempt to link a second Slice account to an already-linked Discord account, or vice versa | "That Slice account is already linked to a different Discord account. Contact support if you believe that's wrong." | Reflects the 1:1 uniqueness invariant (§14); never silently overwrites |
| Command requiring a linked account, run while unlinked | "You'll need to link your Slice account first." plus a button that runs `/account link` | Matches `COMMAND_CATALOGUE.md`'s UI standards "Account-link prompts" rule |

Any transport-level failure of the new endpoints (network error, 5xx, unrecognized code) falls back to
`ERROR_CATALOGUE.md`'s existing generic rows (`PERSISTENCE_UNAVAILABLE`/`CONTROL_STORE_UNAVAILABLE` →
"Slice is having a moment — try again shortly"; unrecognized → "Something went wrong on our end — we've
logged it (ref: `{requestId}`)."), per the catalogue's inherited Migration M6 rule: the raw exception
object is never interpolated into a user-facing string.

## 18. Interaction UX

This document builds no command, so it specifies no wireframe — that is Document 005's deliverable.
What it does specify, because it is part of the domain model rather than the UI, are the UX
*constraints* any future command built against this contract must satisfy:

- The challenge code must be rendered only inside an **ephemeral** Discord message (never a public
  channel, never a DM that could be screen-shared or forwarded without the user's awareness that it's
  sensitive-adjacent), consistent with `BOT_SECURITY_MODEL.md` §1.
- The message showing the code must state its expiry plainly (using Discord's native relative-timestamp
  markdown, `<t:unix:R>`, per `COMMAND_CATALOGUE.md`'s UI standards) and must direct the user to the
  Slice web app to complete linking — the bot never presents a Discord-native "enter code here" input
  for the *completion* step, because completion is defined (§7, §14) as happening on Slice's own
  authenticated web session, not inside Discord.
- Any command that requires a linked account and is invoked by an unlinked user must use the "you'll
  need to link your account first" pattern with a `/account link`-triggering button (§17), never a bare
  error.
- No component (button, select, modal) built against this contract may ever carry the challenge code,
  a Slice token, or a raw Slice user ID in its custom ID — custom IDs stay opaque, bot-generated
  resource references, per `BOT_SECURITY_MODEL.md` §3.

## 19. Implementation file plan

Proposed layout for the parts of this document's deliverable that do carry forward into code (the
domain types and the request-contract types), for Document 002/005/006 to build against — no file
listed here is created by this document itself, since this document is documentation-only:

| Path (proposed) | Purpose |
|---|---|
| `src/domain/accountLink/linkState.ts` | Type definitions for the challenge/pending/linked/unlinked state machine (§7) — types only, no business logic beyond exhaustive state-transition typing |
| `src/domain/accountLink/linkStatusCache.ts` | `LinkStatusCache` repository interface and TTL logic (§10) — explicitly documented as non-authoritative in its own module doc comment |
| `src/domain/accountLink/linkAuditCorrelation.ts` | `LinkAuditCorrelation` writer interface (§10, §16) |
| `src/api/sliceClient/discordLink.ts` | Typed client methods for the four bot-only endpoints in §11, added to Document 002's Slice API client module, guarded behind a feature check that fails loudly (not silently) if called before Slice's endpoints exist |
| `src/api/sliceClient/tokenExchange.ts` | Typed client method for `POST /v1/bot/tokens/exchange` (§11), including the fixed scope allowlist as a typed union, not a free-form string |

## 20. Numbered implementation steps

1. Circulate this document's §11 (request contract) and its "open design questions" table to Slice's
   backend team as a formal, standalone request — not folded into an unrelated ticket — referencing
   `BOT_API_REQUIREMENTS.md` §1–3 as the originating spec.
2. Obtain explicit sign-off from Slice's backend team on: (a) the `DiscordLink` table shape, (b) the
   `ServiceAccount` entity shape (API key vs. mTLS, §11), and (c) the delegated-token-exchange mechanism
   (Option A vs. Option B, §11).
3. Once Slice's team has a design, confirm the four bot-only endpoints and the token-exchange endpoint
   are deployed and reachable on at least a staging Slice environment.
4. Implement the domain types in §19 (`linkState.ts`, `linkStatusCache.ts`, `linkAuditCorrelation.ts`) —
   types and pure state-machine transition logic only, no Discord command code.
5. Extend Document 002's Slice API client with the typed methods in §19
   (`discordLink.ts`, `tokenExchange.ts`), matching the exact request/response shapes Slice's team
   actually deployed (not the originally-proposed shapes, if they diverged during design review).
6. Implement the bot-owned persistence tables from §10 (`LinkStatusCache`, `LinkAuditCorrelation`)
   against whichever bot-owned datastore Document 001 selected.
7. Write a contract test (§22) that calls the real staging endpoints and asserts the response shapes
   match this document's §11 tables exactly, failing loudly on drift.
8. Only after steps 1–7 are all done — including Slice's staging deployment — mark this document's
   completion checklist (§26) fully checked; do not check off the Slice-endpoint-dependent boxes based
   on the bot-side domain model alone.

## 21. Unit tests

Per `TEST_STRATEGY.md`'s "Account-link token lifecycle (expiry, single-use, 1:1 enforcement) against a
fake service layer":

- State-machine transition tests: every legal transition (`NONE → PENDING`, `PENDING → LINKED`,
  `LINKED → UNLINKED`, `UNLINKED → PENDING` on relink) succeeds; every illegal transition (e.g.,
  `LINKED → LINKED` for a second account, `UNLINKED → LINKED` without a fresh challenge) is rejected.
- `LinkStatusCache` TTL tests: a cache entry older than 60 seconds is treated as a miss, never as
  "not linked"; a cache read is never consulted by any code path that also performs a mutation.
- Token-exchange scope allowlist tests: a request for any scope outside the six named values
  (`watchlist:read`, `watchlist:write`, `notifications:read`, `notifications:write`, `portfolio:read`,
  `profile:read`) is rejected at the typed-client boundary before a network call is even attempted.
- Error-mapping tests: each row in §17's table maps from its corresponding Slice response to the exact
  specified Discord-facing copy, and no test path ever asserts a raw exception string reaches the
  mapped output.

## 22. Integration tests

Per `TEST_STRATEGY.md`: "Once the bot-only endpoints (§1–3 of BOT_API_REQUIREMENTS.md) exist on a
disposable Slice instance, integration tests cover the full link → delegated-token-exchange →
watchlist-mutation path end-to-end." Concretely for this document's scope:

- A contract test against a real (disposable/staging) Slice instance asserting `POST
  /v1/bot/discord-link/challenge`, `POST /v1/me/discord-link/complete`, `POST
  /v1/bot/discord-link/unlink`, and `GET /v1/bot/discord-link/:discordUserId` return exactly the
  shapes specified in §11 — this test **cannot pass** until Slice's team has deployed the endpoints,
  and its continued failure is the correct, expected signal that this document has not fully closed.
  It is treated as an expected-failing test with a documented reason, not a skipped test, so it does
  not silently stop signaling once Slice's team's status changes.
- Rate-limit integration test: issue 4 challenge requests for the same `discordUserId` within an hour
  against the (eventual) staging instance and assert the 4th is rejected with `RATE_LIMITED` and a
  correct `Retry-After`.
- 1:1-enforcement integration test: attempt to complete a second link for an already-linked Discord
  user and assert the "already linked" rejection (§17), never a silent overwrite of the existing
  mapping.
- `LinkStatusCache`/`LinkAuditCorrelation` integration tests against the bot's own real disposable
  database (no Slice dependency for these two, since they are bot-owned).

## 23. Discord interaction tests

None specific to this document — it ships no command, button, select, or modal. Document 005 owns the
Discord-interaction-level tests for `/account link`, `/account unlink`, `/account status` once it is
built against this document's contract; this document's job is limited to making sure that contract is
precise enough for those tests to be meaningful.

## 24. Manual QA checklist

Because this document ships no runnable command, its own "manual QA" is a document/contract review, not
a click-through:

- [ ] Confirm every endpoint in §11 has an explicit method, auth type, request body, response body,
      idempotency behavior, rate limit, and audit requirement — no row left as "TBD."
- [ ] Confirm the two open design questions (§11) are presented as options, not silently decided.
- [ ] Confirm no bot-owned table in §10 has a field capable of holding a Slice password, session
      cookie, access token, or refresh token.
- [ ] Confirm the 1:1 uniqueness invariant, single-use/replay-prevention rule, and generic
      expired-vs-used error framing (§14, §17) are all present and consistent with each other.
- [ ] Once Slice's team deploys the endpoints to staging: manually run the challenge → web-app
      completion → `GET /v1/bot/discord-link/:discordUserId` sequence by hand and confirm the response
      shapes match §11 exactly, before any Document 005 code is written against them.

## 25. Verification commands

No application code exists yet for this document to lint, typecheck, or test at the repository level
(per §3, no repository exists). Once Document 001/002 exist and this document's domain types/client
methods (§19) are implemented against a real or staging Slice deployment, the same commands named in
`TEST_STRATEGY.md` apply, scoped to this document's files:

```
npm run lint
npm run typecheck
npm run test:unit -- src/domain/accountLink
npm run test:integration -- discordLink   # requires a disposable/staging Slice instance with §11's endpoints deployed
npm run build
```

## 26. Completion checklist

Split deliberately into the two halves this document itself insists on distinguishing:

**Spec work (achievable now, blocked on nothing but this document's own writing):**

- [ ] Account-linking domain model (challenge/pending/linked/unlinked state machine) fully specified
      (§7, §14)
- [ ] Bot-owned, non-authoritative persistence (`LinkStatusCache`, `LinkAuditCorrelation`) specified
      with explicit non-authority statements (§10)
- [ ] Full request/response contract for `BOT_API_REQUIREMENTS.md` §1–3 written, endpoint by endpoint,
      with no unresolved "TBD" fields (§11)
- [ ] Both open design questions (delegated-token-exchange mechanism, service-account credential shape)
      presented as options for Slice's team, not silently decided (§11)
- [ ] Linking-specific error cases and their Discord-facing copy defined, consistent with
      `ERROR_CATALOGUE.md`'s existing style (§17)
- [ ] This document's request circulated to Slice's backend team (§20 step 1)

**Slice-dependent closure (cannot be checked until Slice's own team acts):**

- [ ] Slice's backend team has signed off on the `DiscordLink` table shape, the `ServiceAccount` entity
      shape, and the delegated-token-exchange mechanism (§20 step 2)
- [ ] All five endpoints in §11's "Bot-only service endpoints" table are deployed and reachable on at
      least a staging Slice environment (§20 step 3)
- [ ] The contract test in §22 passes against that staging environment (not merely written — passing)
- [ ] Rate-limit and 1:1-enforcement integration tests (§22) pass against that staging environment

This document's overall status may not be marked COMPLETE while any box in the second group is
unchecked, regardless of how complete the first group is.

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md`: flip this document's row from NOT STARTED only once
  *all* of §26 is checked (both groups) — not on spec completion alone, to avoid falsely signaling to
  Document 005/006 that they may proceed against a contract Slice hasn't actually built yet.
- `CURRENT_STATE.md`: update the "Known blockers" section once Slice's team has deployed the §11
  endpoints to staging, so the blocker note for Documents 005/006/009/010/013 reflects reality.
- `BOT_API_REQUIREMENTS.md`: once Slice's team's actual deployed shapes are confirmed (§20 step 5), any
  divergence from the originally-proposed shapes in §1–3 should be reconciled back into that document
  so it stops describing a proposal and starts describing what was actually built.
- `MASTER_CHECKLIST.md`: check the "New Slice backend endpoints (BOT_API_REQUIREMENTS.md §1–3) built
  and verified by Slice's own team" row under "Production readiness" once §26's second group is fully
  checked.

## 28. Final report format

An implementer closing this document reports:

1. **Spec deliverables status** — whether §7/§10/§11/§14/§17 (the bot-side-writable half) are complete,
   with links/paths to the exact sections.
2. **Slice coordination status** — whether the request was circulated (§20 step 1), whether Slice's
   team has responded, and the resolution (if any) of the two open design questions in §11.
3. **Slice deployment status** — whether the five endpoints exist on a named Slice environment
   (staging or otherwise), with that environment identified explicitly (never assumed).
4. **Contract-drift note** — any place where Slice's actual deployed endpoint shapes diverged from this
   document's §11 tables, and whether `BOT_API_REQUIREMENTS.md` was reconciled per §27.
5. **Explicit statement of whether this document is fully COMPLETE per §26**, distinguishing "spec
   complete, Slice deployment pending" from "fully complete" — never conflating the two.
6. **Next document** — confirmation that Document 005 remains blocked until this report states full
   completion, per `IMPLEMENTATION_ORDER.md`.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
