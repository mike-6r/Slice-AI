# 003 — Discord interaction framework and command registry

## 1. Metadata

- **Document number:** 003
- **Title:** Discord interaction framework and command registry
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 001 (Repository reconciliation and bot foundation), 002 (Slice
  API client and shared contracts)
- **Blocks (this build guide):** every later document that registers a command against this
  framework — 004 (spec work only; its Discord commands land in 005), 005, 006, 007, 008, 009, 010,
  011, 012, 013, 014, and transitively 015–018, since none of those can register a command, button,
  select, or modal without the router and registry this document builds
- **Slice backend dependency:** none
- **Can start today:** Yes

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend; the Discord bot being built
from this guide is a **companion client to Slice** — it calls Slice's HTTP API for every read or
write that touches Slice data, never queries Slice's Postgres/Prisma directly, and never duplicates
a Slice business rule. Per `IMPLEMENTATION_ORDER.md`, this is Document 003 of 18: it lands
immediately after Document 001 (repository/bot foundation — the Discord client, config loader,
process lifecycle) and Document 002 (the typed Slice API client and shared contracts), and before
any document that ships an actual user-facing command family. Its job is narrow and load-bearing:
build the generic slash-command/component/modal machinery — registration, dispatch, the
3-second-ack defer pattern, shared embed/pagination/confirmation-dialog components, and a
consistent error-embed renderer — that every subsequent command-bearing document (007, 008, 011,
012, 014, and eventually the account-linking-gated documents 005/006/009/010/013) builds on top of.
This document also ships the two commands that need nothing but the framework itself: `/help` and
`/invite`, both bot-owned with zero Slice API dependency.

## 3. Current implementation audit

Per `CURRENT_STATE.md`, **no Discord bot code exists anywhere** as of this document's writing —
there is no repository, no `package.json`, no `src/`, nothing beyond this documentation tree. This
document is written on the assumption, required by `IMPLEMENTATION_ORDER.md`'s strict one-at-a-time
sequencing, that Implementation Document 001 and Implementation Document 002 have each independently
closed against their own completion checklists before an implementer starts this one. This document
does not itself verify that closure — that is 001's and 002's own responsibility, checked against
their own stop conditions.

Based strictly on their titles and scope as recorded in `IMPLEMENTATION_ORDER.md` /
`PROMPT_INDEX.md`, and the responsibilities `BOT_ARCHITECTURE.md`'s architecture overview assigns to
"entry point" and "Slice API client" concerns, this document assumes the following are in place by
the time it starts (without independently re-verifying their internals):

- From 001: a buildable TypeScript project, a `src/main.ts` entry point that constructs the
  discord.js client with only the intents actually required, a typed/`zod`-validated config loader,
  graceful-shutdown handling, and `/health`/`/ready` HTTP endpoints.
- From 002: a single typed Slice API client module (wrapping the "already available" endpoints from
  `BOT_API_REQUIREMENTS.md`), shared DTO/contract types, and the plumbing for attaching auth,
  `Idempotency-Key`, and a request ID to outgoing calls.

Nothing about the interaction router, command registry, shared UI components, or `/help`/`/invite`
commands exists yet — that is the entirety of this document's deliverable.

## 4. Old bot behavior migrated

Per `OLD_BOT_FEATURE_INVENTORY.md` and `OLD_TO_NEW_MIGRATION_MATRIX.md`, this document's scope
covers the old bot's **command framework, help/social commands, and generic UI-helper patterns** —
explicitly not any Infria-specific feature:

| Old bot row | Feature | Migration status | What this document does about it |
|---|---|---|---|
| #1 | Bot bootstrap / cog loader (`main.py`, loads every `.py` in `cogs/`, no ordering guarantees, `Intents.all()`) | REMOVE | Not rebuilt here (it is 001's concern) — noted only because this document's command registry is the direct replacement for the old bot's undifferentiated cog-loading approach: commands are declared, typed, and registered explicitly, never auto-discovered by directory scan |
| #9 | Custom help (`!help [command]`, full list gated behind `ban_members` with the in-code comment "so people can't steal ideas") | REMOVE | Replaced outright by `/help`, built in this document. Discord's native slash-command description/autocomplete metadata does the discoverability job; the new `/help` is available to **any member** — obscurity-as-security is not carried forward |
| #6 | Socials link (`!social`, static embed from config) | REWRITE | Replaced by `/invite`, built in this document, using the shared embed builder instead of the old bot's config-driven `Functions.embedFormatter` |
| #20 | Ban list pagination (`!banlist`, `discord.ext.buttons` legacy **reaction** paginator) | REWRITE | The shared button-based paginator this document builds (`BOT_ARCHITECTURE.md`'s "Pagination components") is the direct, generic replacement later reused by `/asset search`, `/watchlist list`, `/notifications list`, `/collector search`, `/mod banlist` (Doc 012), and admin audit lookups (Doc 013) — none of which will use a reaction paginator |
| #28 | Global error handler (`cogs/ErrorHandler.py`, generic branch echoes raw exception text to the end user) | REWRITE (Migration M6) | The consistent error-embed renderer this document builds implements M6's design: known error codes map to friendly copy per `ERROR_CATALOGUE.md`, the unrecognized branch never interpolates a raw exception and instead shows a generic message with a correlatable request ID |
| #29 | Shared embed builder / string templater (`cogs/Functions.py`, config-driven `discord.Embed` construction with token substitution) | PRESERVE (concept only) | Reimplemented from scratch as a typed embed-builder module per `COMMAND_CATALOGUE.md`'s "UI standards" — no code or config-template format is ported |
| #30 | Moderator check / DM helper / **reaction confirmation** / `wait_for`-based response waiting (`cogs/Functions.py`) | REWRITE | The `reactionConfirmation`/`waitResponse` blocking, unbounded-wait patterns are explicitly not carried forward. This document's confirmation-dialog component uses Discord buttons with a mandatory timeout, matching Migration M7's design |

**Explicitly REMOVE/REWRITE and why, per the assignment's framing:**

- **Prefix commands (`!`)** are removed outright, not rewritten. The old bot registered zero slash
  commands (`discord.py==1.6.0`, no slash-command support in that era). This document's registry is
  slash-command/component/modal-only from the start — there is no prefix-command fallback, no
  message-content parsing, and therefore no need for the `MESSAGE CONTENT` privileged intent the old
  bot's `Intents.all()` implicitly requested.
- **Reaction-based UI** (`on_raw_reaction_add` ticket/verification entry points, `reactionConfirmation`,
  the `discord.ext.buttons` ban-list paginator, giveaway reaction entry) is removed as an interaction
  mechanism everywhere this framework is used, for two concrete, cited reasons: (1) reactions carry
  **no built-in per-click permission scoping** — any user who can react can trigger the handler, so
  every reaction-based flow in the old bot had to re-implement its own author/role check inside the
  handler, inconsistently (row #26's missing checks on `reroll`/`end`/`delete` are a direct
  consequence); (2) reaction state and any in-flight "waiting for a reaction" logic **does not survive
  a bot restart** — the old bot's verification flow (row #15) and ticket Q&A intake (row #16) both
  relied on in-memory state or `wait_for` calls that are silently lost on any restart, with no
  recovery path. Discord's persistent-component (button/select) custom-ID pattern, which this
  framework standardizes on, survives restarts because state is reconstructed from the custom ID
  against bot-owned persistence rather than held in process memory.

## 5. Slice features supported

None. This document's own deliverables (`/help`, `/invite`, and the framework itself) make zero
Slice API calls — `/help` and `/invite` are both bot-owned per `COMMAND_CATALOGUE.md`'s Phase 1
table ("Backend calls: none (bot-owned)" for both rows). The framework this document builds is
Slice-agnostic by design: it has no knowledge of any specific Slice feature area, and its job is
solely to give later documents (007 Marketplace/asset — Slice Docs 006/007 VERIFIED; 008
Collector/Vault — Slice Doc 008 VERIFIED; 009/010 — gated on account linking; 011/012/014 — no Slice
dependency) a consistent place to plug in. Per `project-state.json`'s `sliceBackendStatus`, Slice
backend documents 001–008, 010, and 011 are complete, but none of that status is consumed by this
document — it is recorded here only to confirm no Slice feature claim is being made.

## 6. Files to read before starting

- `README.md`, `CURRENT_STATE.md`, `project-state.json` — build-guide status and ground rules.
- `IMPLEMENTATION_DOCUMENT_TEMPLATE.md` — the structure this document (and every implementer
  following it) must obey.
- `IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md` — this document's place in the 18-document sequence
  and what 004+ will expect from it.
- `BOT_ARCHITECTURE.md` — the architecture overview this document implements the "Interaction
  Router," "Command registry," "Interaction response helpers," and "Pagination components" bullets
  of, in full.
- `BOT_SECURITY_MODEL.md` §3 (slash command permissions, role spoofing, interaction forgery) and §10
  (logging redaction) — the security constraints this framework must enforce structurally, not just
  per-command.
- `PERMISSION_MATRIX.md` — confirms `/help` and `/invite` sit outside any Slice-side gate, and
  states the general rule (Discord-side check is a gate, never a substitute for a Slice-side check)
  this framework's permission hooks must support for later documents.
- `ERROR_CATALOGUE.md` — the exact error-code-to-copy table the error-embed renderer must be able to
  render generically.
- `COMMAND_CATALOGUE.md` — read in full, especially the "UI standards" section (brand colors,
  footer/timestamp conventions, buttons-not-reactions, modals-not-`wait_for`, shared pagination,
  ephemeral defaults, confirmation dialogs, destructive-action type-to-confirm, disabled-feature
  rendering, rate-limit messaging, account-link prompts) and the `/help`/`/invite` rows of the Phase
  1 table.
- `OLD_BOT_FEATURE_INVENTORY.md` rows #1, #6, #9, #20, #28, #29, #30 and `OLD_TO_NEW_MIGRATION_MATRIX.md`
  M6 and M7 — what is explicitly not being carried forward, and why.
- `TEST_STRATEGY.md` — the Discord-interaction-test approach (simulated interaction payloads, no live
  gateway) this document's test plan must follow.
- `DEPLOYMENT_PLAN.md` — Environments section, for the guild-scoped-vs-global command registration
  split.
- `BOT_DATA_OWNERSHIP.md` — the "Discord interaction state (in-flight confirmations, pagination
  cursors held in component state)" row, which fixes this document's persistence answer at "bot,
  ephemeral, short TTL, never a system of record."

## 7. Strict scope

- A **command registry**: a declarative, typed definition format for slash commands (name,
  description, options, permission requirement, whether it requires a linked Slice account,
  ephemeral/public default) that later documents register against, plus a deploy-time script that
  pushes definitions to Discord's application-command API.
- **Environment-aware registration**: guild-scoped registration (instant propagation) for the dev
  guild and staging Discord server, global registration (propagation delay expected) for production,
  driven by a single config flag per `DEPLOYMENT_PLAN.md`'s Environments section — not two divergent
  code paths.
- A **shared interaction router**: the single `interactionCreate` handler that dispatches every slash
  command, button, select menu, and modal submission to the correct registered handler, doing a
  permission pre-check and a rate-limit pre-check before invoking it (`BOT_ARCHITECTURE.md`'s
  "Interaction Router" bullet).
- The **immediate-defer pattern**: every command handler defers its response before doing any
  further work, respecting Discord's 3-second interaction-ack window; a "Loading…" state is shown
  only if a subsequent call is slow enough to be noticeable (`COMMAND_CATALOGUE.md` UI standards).
- Shared, reusable UI components: an **embed builder** (brand colors, `asOf`/`source` footer
  convention for Slice-sourced data vs. plain "Slice" footer for bot-owned content, native relative
  timestamps), a **button-based paginator** (`{items, nextCursor, hasMore}`-shaped, Previous/Next
  disabled at bounds, page position in the footer), and a **confirmation-dialog component**
  (button-based Confirm/Cancel with a visible action summary and a mandatory timeout; a
  type-to-confirm variant for the highest-impact actions).
- A **consistent error-embed renderer**: a single function/module that takes a Slice error code (or
  "unrecognized") and renders the exact copy from `ERROR_CATALOGUE.md`, including the `Retry-After`
  interpolation for `RATE_LIMITED` and the request-ID interpolation for the unrecognized branch;
  never accepts or interpolates a raw exception/stack trace into the rendered embed.
- The **`/help` command**: lists available commands (grouped, matching Discord's own
  category/description metadata) with an optional `command?` argument for per-command detail;
  bot-owned, no Slice call, any member, ephemeral.
- The **`/invite` command**: shows the bot's/server's invite link; bot-owned, no Slice call, any
  member, ephemeral.
- Test doubles and scaffolding needed to unit- and interaction-test the router, registry, components,
  and these two commands without a live Discord gateway or a live Slice instance.

## 8. Out of scope

- Any command that calls the Slice API — that starts at Document 007 (marketplace/asset) and 008
  (collector/vault), both of which depend on this document but are not delivered by it.
- The Slice API client itself, its auth/idempotency-key/retry logic, and shared DTO types — that is
  Document 002's deliverable; this document only consumes an already-built client interface where a
  later document needs one, and delivers nothing that calls it.
- Account linking, the delegated-token-exchange flow, or any "requires linked account" enforcement
  logic beyond a generic hook the registry exposes for later documents to set — that is Documents
  004/005/006.
- Any bot-owned persistent data model (tickets, moderation history, giveaways, suggestions,
  guild config) — those are Documents 011, 012, 014; this document's only state is in-memory,
  short-TTL interaction state (pagination cursors, in-flight confirmations), never a system of
  record, per `BOT_DATA_OWNERSHIP.md`.
- Background jobs / BullMQ workers — Document 015.
- The moderation-suite, ticket-system, or community-feature command families themselves — Documents
  011, 012, 014 build actual commands on top of this framework; this document ships none of their
  commands.
- Any admin/audit command — Document 013.
- Observability/audit-correlation beyond the basic per-interaction request-ID generation
  `BOT_ARCHITECTURE.md` assigns to the router layer — full correlation tooling is Document 016.
- Rewriting or second-guessing anything already decided by Document 001 (bootstrap, config loader,
  client construction) or Document 002 (API client, shared contracts) — this document only builds on
  top of them.

## 9. Dependencies

- **discord.js v14+** — per `BOT_ARCHITECTURE.md`'s technology decision; this document is the first
  to exercise discord.js's application-command registration API, `interactionCreate` event, and
  component/modal builders in depth.
- **Node.js** runtime and **TypeScript**, matching Document 001's project setup — no new language or
  runtime is introduced.
- **zod** (or the schema-validation library Document 001 standardized on for config) for validating
  command-option shapes and the environment flag driving guild-scoped-vs-global registration.
- The **test runner** Document 001 established for the rest of the project (Vitest/Jest-style, per
  `BOT_ARCHITECTURE.md`'s "same test runner/assertions as the rest of the repo") — no second test
  stack is introduced, mirroring the explicit rejection of a second stack in the
  TypeScript-vs-Python architecture decision.
- discord.js's interaction-simulation/test utilities (or an equivalent mocked-gateway approach), per
  `TEST_STRATEGY.md`'s "Discord interaction tests" section — needed to test the router and command
  handlers without a live gateway connection.
- No new external service, queue, or datastore is introduced by this document.

## 10. Bot-owned persistence

None as a durable store. Per `BOT_DATA_OWNERSHIP.md`'s "Discord interaction state (in-flight
confirmations, pagination cursors held in component state)" row, this document's only state is
**ephemeral, short-TTL, in-memory** (or, if Document 001 already provisions Redis for other reasons,
a short-TTL Redis key — never a new table). Nothing here is a system of record:

- **Pagination cursor state**: keyed by the message/component's custom ID, holding the current page
  token and the parameters needed to re-fetch the next/previous page; TTL matches Discord's own
  component-interaction lifetime expectations (component stops being interactive well before any
  long-lived TTL would matter), and a paginator whose state has expired degrades to a friendly
  "this view has expired, run the command again" response rather than an error.
- **Confirmation-dialog state**: keyed by the confirmation component's custom ID, holding just enough
  to know what action Confirm would perform and who is allowed to click it; TTL matches the
  dialog's own visible countdown/timeout, after which the buttons auto-disable.

No user identity, Slice data, or Slice token is ever placed in this state — component custom IDs
remain opaque, bot-generated resource references per `BOT_SECURITY_MODEL.md` §3, never a raw Slice
user ID, email, or token.

## 11. Slice API dependencies

| Endpoint | BOT_API_REQUIREMENTS.md tag | Called by this document's code? |
|---|---|---|
| — | — | **None.** `/help` and `/invite` are both bot-owned per `COMMAND_CATALOGUE.md` ("Backend calls: none (bot-owned)" for both rows), and the framework itself (router, registry, embed/pagination/confirmation components, error renderer) is intentionally Slice-agnostic — it is consumed by, but does not itself call, the Slice API client Document 002 builds. |

The error-embed renderer is built to *render* every code in `ERROR_CATALOGUE.md`'s table generically
(it accepts a code and optional context like `Retry-After`), so that Documents 007+ can call it
without rebuilding error-mapping logic — but this document supplies no command that ever produces
one of those codes itself.

## 12. Commands / events / jobs delivered

Pulled directly from `COMMAND_CATALOGUE.md`'s Phase 1 table, filtered to this document's scope:

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases | Old-bot predecessor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/help` | Command list/usage | `command?` | any member | no | ephemeral | none (bot-owned) | none | n/a | n/a | unknown command | `Main.py !help` (concept only) |
| `/invite` | Bot/server invite link | — | any member | no | ephemeral | none (bot-owned config) | none | n/a | n/a | none | `Main.py !social` (concept only) |

No events or jobs are delivered by this document. `EVENT_AND_JOB_CATALOGUE.md`'s `interactionCreate`
row ("Routes every slash command / button / select / modal submission — Central router,
BOT_ARCHITECTURE.md") is this document's router, but it is infrastructure the framework provides for
later documents to receive events through, not a "delivered feature" in the product sense — no
`guildMemberAdd`, `messageCreate`, `guildCreate`/`guildDelete` handler, or scheduled job is built
here.

## 13. Permission rules

Per `PERMISSION_MATRIX.md`, neither `/help` nor `/invite` appears as a row requiring any gate beyond
"any member" — both are available to every guild member with no Discord-role requirement and no
Slice-side check, consistent with `COMMAND_CATALOGUE.md`'s "Permission: any member" for both. This
is the correct, minimal case for this document's own two commands.

The **framework's permission-pre-check hook**, however, must be built generically enough to support
every later row in `PERMISSION_MATRIX.md` without modification:

- A Discord-side gate (role/permission possession, checked by the router before a handler runs) for
  bot-owned-only command families (`/mod *`, `/support` lifecycle, `/giveaway *`, `/suggest` status
  change — Documents 011/012/014) that have no Slice concept to check against.
- A **Slice-side gate hook** for account-scoped and admin commands (`/watchlist *`, `/notifications
  *`, `/portfolio`, `/admin *` — Documents 009/010/013), which this document does not implement the
  logic of (that is 004/005/006's job) but must expose an extension point for.

**Explicit statement required by the template:** a Discord role/permission check is always a UX gate
only, and is never a substitute for the Slice API's own authorization response. This document's
router never marks an interaction "authorized" against Slice data based solely on the Discord-side
pre-check passing — every later command that touches Slice data must still let the Slice API's own
response (403/`FORBIDDEN`, `ACCESS_RESTRICTED`, etc.) be authoritative. `/help` and `/invite` never
exercise this distinction because they touch no Slice data at all.

## 14. Security requirements

Per `BOT_SECURITY_MODEL.md`, the following apply structurally to the framework this document builds
(not just to `/help`/`/invite`):

- **§3 (interaction forgery):** the router only ever dispatches genuine interaction objects delivered
  by discord.js from an authenticated gateway connection — it never accepts an interaction payload
  from any other source. Every custom ID the confirmation and pagination components generate is an
  **opaque, bot-generated, non-guessable resource reference** — never a raw Slice user ID, email, or
  predictable sequential ID. Every button/select/modal handler built on this framework must
  re-verify that the interacting user matches the resource's owner (or holds an explicit permission
  override) before acting; the framework's component-handler contract requires this check to be
  present, it does not assume "the button was shown to the right person" is sufficient.
- **§10 (logging redaction):** the structured logging the router attaches a per-interaction request
  ID to (per `BOT_ARCHITECTURE.md`'s "Structured logging / request IDs" bullet) must redact known-
  sensitive field names by default — no log line, embed, or error message this framework renders may
  ever contain a raw email, password, token, or session cookie. This is enforced directly in the
  error-embed renderer (§17 below): the "unrecognized error" branch renders only a generic message
  plus request ID, never the underlying error object.
- **Never `Intents.all()`:** the router and registry assume Document 001 constructed the client with
  only the intents this framework and its consumers actually need; this document introduces no new
  intent requirement (`/help` and `/invite` need no privileged intent).
- **No password/token collection in Discord, ever:** neither command built here, nor any shared
  component, ever surfaces a modal or embed field that could be mistaken for a credential-entry
  point — that pattern is reserved (and still constrained) for the account-linking flow in Document
  005, which this document does not touch.

## 15. Idempotency and rate limits

This document performs no Slice mutation, so no `Idempotency-Key` scheme applies to its own commands.
Per `COMMAND_CATALOGUE.md`, both `/help` and `/invite` have **Rate limit: none** — they are static,
bot-owned, side-effect-free reads, so no local cooldown is required beyond Discord's own
per-interaction throughput limits.

The framework nonetheless establishes the **rate-limit pre-check hook** in the router
(`BOT_ARCHITECTURE.md`'s "Rate-limit handling" bullet: a local pre-check to avoid calling Slice for
an obviously-throttled user, plus honoring Slice's `RateLimit-*`/`Retry-After` headers, plus local
Discord-side cooldowns for bot-owned commands like tickets/giveaways) as an extension point every
later document's commands register against — this document does not populate it with any concrete
limit of its own, since it has no command that needs one.

## 16. Audit requirements

`/help` and `/invite` require no audit logging — per `COMMAND_CATALOGUE.md` their Audit column is
`n/a`, consistent with them being pure reads of bot-owned static content with no security or
business relevance.

The framework's router does, however, generate a **bot-local structured log line per interaction**
(command/component name, Discord user ID, guild ID, outcome, and the bot-local request ID) per
`BOT_ARCHITECTURE.md`'s "Structured logging / request IDs" and "Audit correlation" bullets — this is
operational logging, not a Slice `AuditEvent`, and is never treated as a competing audit record for
anything Slice-side (`BOT_DATA_OWNERSHIP.md`: "Audit events — Slice... Bot writes its own
*correlated* local log entry, never a competing audit record"). This logging hook is what later
documents' Slice-mutating commands attach their own audit-relevant detail to; this document only
builds the hook and demonstrates it against two commands that have nothing audit-worthy to log.

## 17. Error behavior

The error-embed renderer this document builds implements every row of `ERROR_CATALOGUE.md` as a pure
function from `(code, context)` to rendered embed text, so later documents never re-derive this
mapping:

| Slice error code | Discord-facing message rendered | Notes enforced by the renderer |
|---|---|---|
| `VALIDATION_FAILED` | "That input doesn't look right — check the details and try again." | Field-level detail included only if the caller supplies a safe, user-facing field name |
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | "Your linked session needs refreshing — try again in a moment." | Renderer does not itself retry — that is the API client's job (Document 002); it only renders after a retry has already failed |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | "Your Slice link needs to be re-established — run `/account link`." | Never says "reused/replayed" |
| `ACCOUNT_RESTRICTED` | "This action isn't available on your account right now. Contact support if you think that's wrong." | Never explains why |
| `FORBIDDEN` | "You don't have permission to do that." | — |
| `PROFILE_NOT_FOUND` / `COLLECTOR_NOT_FOUND` / `ASSET_NOT_FOUND` / `NOTIFICATION_NOT_FOUND` | "Couldn't find that — double check and try again." | — |
| `PROFILE_NOT_PUBLIC` | "That collector hasn't made their profile public." | — |
| `ASSET_NOT_PUBLIC` | "That asset isn't published yet." | — |
| `PORTFOLIO_AUTHORITY_UNAVAILABLE` | "Portfolio tracking isn't live on Slice yet — hang tight." | Rendered as an expected, honest state, never as a generic error |
| `IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS` | "That's already being processed — give it a second." | Renderer marks these as non-retryable by the caller |
| `RATE_LIMITED` | "You're doing that too fast — try again in {Retry-After}s." | Renderer requires the caller to supply `Retry-After`; it does not invent a default |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | "Slice is having a moment — try again shortly." | — |
| Unrecognized/unexpected error | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | The renderer's only fallback branch; it never accepts or interpolates the raw error object — only a `requestId` string is ever rendered |
| Discord-side failure (missing permissions to act, channel deleted, DM closed) | Specific, context-aware message per case | Rendered by a separate, smaller Discord-side error path in the router, never the generic "something went wrong" embed |

Error cases specific to this document's own two commands, not already covered by
`ERROR_CATALOGUE.md` (which is Slice-error-specific):

- `/help <command>` with an argument that doesn't match any registered command: renders "Couldn't
  find that command — run `/help` with no argument to see everything available." (matches
  `COMMAND_CATALOGUE.md`'s stated "unknown command" error case for this row).
- `/invite`: no error case — `COMMAND_CATALOGUE.md` lists "none," and the command has no input to
  validate and no external call that can fail.

**Rule inherited from Migration M6 and enforced by construction:** the renderer's unrecognized/
unexpected branch has no code path that accepts an `Error`/exception object as an argument — only a
string `requestId` — so it is structurally impossible for a caller to accidentally interpolate a raw
exception into a user-facing string through this renderer.

## 18. Interaction UX

**`/help` (no argument):**

- Ephemeral embed, brand-color accent per `COMMAND_CATALOGUE.md` UI standards.
- Title: bot name; body grouped by command family (Account, Marketplace, Collector/Vault, Watchlist,
  Notifications, Support, Moderation, Community, Admin) with a one-line description per command —
  groups with zero commands registered yet (true for most families as of this document, since
  007–014 haven't shipped) are simply omitted rather than shown empty.
- Footer: plain "Slice" footer (bot-owned content, no fabricated data-source claim, per UI
  standards' footer convention).
- No pagination needed at this document's stage (few commands exist); the paginator component is
  still exercised in tests (§21–23) since later documents will need `/help` to paginate once the
  full command set lands, but wiring that in is not required to satisfy this document's own scope.

**`/help <command>`:**

- Same ephemeral embed shape, scoped to one command: full description, options with types/whether
  required, permission requirement, ephemeral/public default, and (if applicable) "requires a linked
  Slice account" notice.
- Unknown `<command>` argument renders the "Couldn't find that command" error case (§17), not a
  generic error embed.

**`/invite`:**

- Ephemeral embed with the invite link as a labeled field, plus a link-style button (not a
  plain-text URL) opening the invite in Discord's own browser flow.
- Plain "Slice" footer, no `asOf`/`source` claim (this is static bot config, not live Slice data).

**Shared components exercised (built here, demonstrated via `/help`/`/invite`, reused starting
Document 007):**

- **Embed builder:** brand accent color, distinct neutral/warning color reserved for DEMO-labeled
  data (unused by this document's own commands, since neither touches Slice data), Discord's
  standard red/green reserved for destructive/success confirmations, native relative timestamps
  (`<t:unix:R>`) wherever a time value is rendered.
- **Paginator:** Previous/Next buttons, disabled at bounds, page position in the footer, wraps a
  `{items, nextCursor, hasMore}`-shaped input — built and unit-tested against synthetic data in this
  document even though `/help`/`/invite` don't need more than one page, so Documents 007–014 can
  adopt it unmodified.
- **Confirmation dialog:** Confirm/Cancel buttons, visible action summary, mandatory timeout
  (auto-cancel on expiry), plus a type-to-confirm variant for the highest-impact-action case — built
  and unit/interaction-tested against a synthetic "confirm this thing" scenario in this document,
  since neither `/help` nor `/invite` is destructive and has no real use for it yet.
- **Error-embed renderer:** demonstrated in tests against every `ERROR_CATALOGUE.md` code plus the
  Discord-side and unrecognized branches (§17, §21–23).

All of the above is ephemeral-by-default per `COMMAND_CATALOGUE.md`'s "Ephemeral messages" rule for
anything account-scoped or private — `/help` and `/invite` are ephemeral here as a deliberate
per-command choice matching their catalogue row (not because they're private, but to avoid
cluttering a shared channel), consistent with the catalogue's row values.

## 19. Implementation file plan

- `src/interactions/router.ts` — the single `interactionCreate` handler: resolves the target command/
  component/modal handler from the registry, runs the permission pre-check and rate-limit pre-check
  hooks, generates the per-interaction request ID, defers the response, invokes the handler, and
  routes any thrown/returned error through the error-embed renderer.
- `src/interactions/registry.ts` — the declarative command/component/modal definition format and the
  in-memory registry commands/components register themselves into.
- `src/interactions/deploy.ts` — the deploy-time script that reads the registry and pushes command
  definitions to Discord's application-command API, guild-scoped or global per the environment flag
  from Document 001's config loader.
- `src/interactions/defer.ts` — the shared immediate-defer helper every command handler calls first.
- `src/components/embed.ts` — the typed embed-builder module (brand colors, footer/timestamp
  conventions).
- `src/components/pagination.ts` — the shared button-based paginator component and its short-TTL
  cursor-state store.
- `src/components/confirmation.ts` — the shared confirmation-dialog component (button + type-to-
  confirm variants) and its short-TTL state store.
- `src/errors/errorEmbed.ts` — the error-code-to-embed renderer implementing `ERROR_CATALOGUE.md`.
- `src/commands/help.ts` — the `/help` command handler.
- `src/commands/invite.ts` — the `/invite` command handler.
- `src/config/inviteConfig.ts` — the small typed config value(s) `/invite` reads (invite URL), validated
  by Document 001's config loader conventions, not hardcoded in the handler.
- `test/interactions/router.test.ts`, `test/interactions/registry.test.ts`,
  `test/components/pagination.test.ts`, `test/components/confirmation.test.ts`,
  `test/errors/errorEmbed.test.ts`, `test/commands/help.test.ts`, `test/commands/invite.test.ts` —
  per §21–23.

## 20. Numbered implementation steps

1. Define the command/component/modal registry's TypeScript types (name, description, options,
   permission requirement, linked-account requirement, ephemeral/public default, handler reference).
2. Implement `registry.ts`'s registration API (`registerCommand`, `registerComponentHandler`,
   `registerModalHandler`) and a lookup function the router will use.
3. Implement `deploy.ts`: read all registered command definitions, resolve the target environment
   (dev/staging → guild-scoped; production → global) from Document 001's config, and call discord.js's
   application-command registration API accordingly. Verify it is idempotent (re-running with no
   definition changes produces no unnecessary Discord API calls where discord.js supports diffing).
4. Implement the immediate-defer helper (`defer.ts`) and document the rule (enforced by convention in
   this codebase, checked in interaction tests) that every command handler calls it before any
   asynchronous work.
5. Implement the embed builder (`embed.ts`): brand accent, DEMO/warning accent, destructive/success
   colors, footer helper (`asOf`/`source` variant vs. plain "Slice" variant), relative-timestamp
   helper.
6. Implement the paginator component (`pagination.ts`) against a `{items, nextCursor, hasMore}` input
   shape, with its short-TTL cursor-state store and Previous/Next button wiring.
7. Implement the confirmation-dialog component (`confirmation.ts`): button variant with mandatory
   timeout, and the type-to-confirm variant, with its short-TTL state store.
8. Implement the error-embed renderer (`errorEmbed.ts`) covering every `ERROR_CATALOGUE.md` row, the
   Discord-side-failure branch, and the unrecognized-error fallback (string `requestId` only, no
   exception object accepted).
9. Implement the interaction router (`router.ts`): resolve handler from the registry, run permission
   pre-check hook (pass-through/no-op for this document's two commands, extension point for later
   documents), run rate-limit pre-check hook (pass-through/no-op here), generate request ID, defer,
   invoke handler, catch/route errors through the renderer, emit the structured log line.
10. Implement `/help` (no-argument and `<command>` argument paths) against the registry's own
    definitions (so its command list is always accurate to what's actually registered, never a
    hand-maintained duplicate list).
11. Implement `/invite` against a typed config value for the invite URL.
12. Wire `/help` and `/invite` into the registry via `registerCommand`, confirm `deploy.ts` picks
    them up.
13. Write unit tests (§21), integration tests (§22), and Discord interaction tests (§23).
14. Run the verification commands (§25) and fix anything failing.
15. Manually register the command set to the dev guild via `deploy.ts` and complete the manual QA
    checklist (§24).

## 21. Unit tests

- Registry: registering a command/component/modal handler makes it resolvable by name/custom-ID
  prefix; registering a duplicate name is rejected with a clear build-time error, not a silent
  overwrite.
- Embed builder: correct accent color selected per content type (brand/DEMO-warning/destructive/
  success); footer renders the `asOf`/`source` variant only when both are supplied, plain "Slice"
  otherwise; timestamp helper emits the exact `<t:unix:R>` format for a given input Date.
- Paginator: page-bounds math (Previous disabled on page 1, Next disabled when `hasMore` is false),
  cursor round-trips correctly through a synthetic multi-page dataset, expired cursor state produces
  the "view has expired" response rather than throwing.
- Confirmation dialog: Confirm/Cancel both route to the correct caller-supplied callback; an
  interaction from a user who isn't the resource owner (or holder of an explicit override) is
  rejected before the callback runs; timeout auto-disables the buttons and rejects a late click.
- Error-embed renderer: every `ERROR_CATALOGUE.md` code renders its exact specified copy; the
  `RATE_LIMITED` case correctly interpolates a supplied `Retry-After` value; the unrecognized branch
  renders only the generic copy plus `requestId`, with no code path able to pass an `Error` object
  into the rendered string (asserted via TypeScript's own type signature, not just a runtime check).
- `/help`: no-argument path lists exactly the commands currently in the registry (asserted against a
  test registry populated with synthetic commands, not the real production command set); `<command>`
  path with a valid name renders that command's full detail; `<command>` path with an invalid name
  renders the "Couldn't find that command" case.
- `/invite`: renders the configured invite URL; a missing/invalid config value fails fast at startup
  (Document 001's config-loader responsibility), not silently at command-invocation time.

## 22. Integration tests

- The full router → registry → handler path exercised against a fake Slice API client (per
  `BOT_ARCHITECTURE.md`'s "Test doubles" — a hand-written fake typed against the same interface as
  the real client) even though `/help`/`/invite` never call it, to prove the router's
  handler-invocation path doesn't implicitly assume a Slice call happens.
- `deploy.ts` run against a disposable/test Discord application (or discord.js's own test tooling) to
  confirm guild-scoped vs. global registration produces the expected API calls for each environment
  flag value, without asserting on live Discord propagation timing.
- Paginator and confirmation-dialog short-TTL state stores tested against whatever storage Document
  001 provisions (in-memory or Redis) to confirm TTL expiry actually removes state, not just that the
  code path handles a missing key gracefully.

## 23. Discord interaction tests

Per `TEST_STRATEGY.md`'s "Discord interaction tests" section — simulated interaction payloads run
through the real router and handlers, asserting exact response shape, without a live gateway:

- Simulated `/help` slash-command interaction (no argument and with a `command` argument) asserts the
  exact ephemeral flag and embed field content.
- Simulated `/invite` slash-command interaction asserts the exact ephemeral flag, embed content, and
  button component shape.
- Simulated button click on a paginator's Next/Previous component asserts the resulting page content
  and correct disabled-state on the bounds.
- Simulated button click on a confirmation dialog's Confirm/Cancel component asserts the correct
  callback firing and the correct rejection when the clicking user doesn't match the resource owner.
- **Persistent-component restart test** (per `BOT_ARCHITECTURE.md`'s persistent-buttons pattern and
  `TEST_STRATEGY.md`'s explicit ask): a paginator/confirmation component's custom ID is round-tripped
  through a simulated router restart (fresh in-process state, same custom ID) to confirm the state it
  needs is either recoverable from the short-TTL store or degrades to the documented "expired, run
  again" response — never throws an unhandled error.
- A simulated slash-command interaction for an **unregistered command name** (defensive test — should
  never happen against a real Discord app, but guards the router itself) asserts a safe, generic
  response rather than a crash.

## 24. Manual QA checklist

Run in a real dev guild, per `TEST_STRATEGY.md`'s manual-QA section, scoped to what this document
actually ships:

- [ ] `deploy.ts` registers `/help` and `/invite` to the dev guild and both appear within Discord's
      guild-scoped propagation window (near-instant).
- [ ] `/help` with no argument renders correctly, ephemeral, only visible to the invoking user.
- [ ] `/help <command>` with a valid command name renders correct detail.
- [ ] `/help <command>` with an invalid command name renders the "Couldn't find that command" message,
      not a generic error or a crash.
- [ ] `/invite` renders the correct invite link and the button opens Discord's own invite-add flow.
- [ ] Triggering a paginator's Next/Previous button against synthetic multi-page test data behaves
      correctly, including at both bounds.
- [ ] Triggering a confirmation dialog against a synthetic destructive-action test scenario shows the
      correct summary, times out correctly if not clicked, and rejects a click from a second test
      user who isn't the resource owner.
- [ ] Restarting the bot process mid-test and then clicking an already-rendered paginator/confirmation
      component produces the documented "expired" behavior, not a crash or a silently wrong action.
- [ ] Grep the bot's structured logs after the full pass to confirm no raw exception text, token, or
      email ever appears (mirrors `TEST_STRATEGY.md`'s Security QA step, scoped to what this
      document could possibly leak).

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

(Per `TEST_STRATEGY.md`'s verification-commands template; this document introduces no new script —
it runs Document 001's established `package.json` scripts against the code this document adds.)

## 26. Completion checklist

Mirroring `MASTER_CHECKLIST.md`'s style, scoped to this document, all boxes unchecked until the work
is actually done:

- [ ] Command/component/modal registry implemented and typed.
- [ ] Environment-aware `deploy.ts` (guild-scoped for dev/staging, global for production) implemented
      and verified against both code paths.
- [ ] Interaction router implemented: defer-first, permission-pre-check hook, rate-limit-pre-check
      hook, request-ID generation, error routing through the renderer.
- [ ] Embed builder, paginator, and confirmation-dialog components implemented per
      `COMMAND_CATALOGUE.md` UI standards.
- [ ] Error-embed renderer implemented, covering every `ERROR_CATALOGUE.md` row plus the Discord-side
      and unrecognized-error branches, with no code path accepting a raw exception object.
- [ ] `/help` implemented (no-argument and `<command>` paths).
- [ ] `/invite` implemented.
- [ ] No prefix (`!`) command support exists anywhere in the codebase.
- [ ] No reaction-based interaction handling exists anywhere in the codebase.
- [ ] Unit tests, integration tests, and Discord interaction tests (§21–23) all passing.
- [ ] Manual QA checklist (§24) completed in a real dev guild.
- [ ] Verification commands (§25) all passing.
- [ ] No Slice source, Prisma schema, migration, or old-bot source modified.
- [ ] No capability claimed beyond what this document actually delivers (no command family from
      007–014 implemented here, no Slice API call made here).

## 27. Documentation updates

- Flip this document's row in `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md` from `NOT STARTED` to
  `COMPLETE` once the completion checklist (§26) is fully satisfied — not before.
- Update `CURRENT_STATE.md`'s "What happens next" section to point at Implementation Document 004 as
  the next document a human decides whether to start, per the build guide's one-at-a-time rule.
- No change is needed to `BOT_ARCHITECTURE.md`, `COMMAND_CATALOGUE.md`, `PERMISSION_MATRIX.md`,
  `ERROR_CATALOGUE.md`, `BOT_SECURITY_MODEL.md`, or `BOT_DATA_OWNERSHIP.md` themselves — this
  document implements what they already specify and introduces no new decision that would change
  their content. If implementation reveals a genuine gap or contradiction in any of them, that gap
  must be recorded back into the relevant top-level document before this document's completion
  checklist can be marked satisfied, per this build guide's accuracy rules.

## 28. Final report format

The implementer's completion report for this document must state, in this order: (1) which of the
§26 completion-checklist items are satisfied and which are not, with a reason for any unchecked item;
(2) the exact test command output summary for §25's five commands; (3) confirmation that no
prefix-command or reaction-based interaction handling exists anywhere in the new codebase; (4)
confirmation that `/help` and `/invite` were manually verified in a real dev guild per §24; (5) any
deviation from this document's Strict Scope (§7) or Out of Scope (§8), with justification; (6) the
exact file list actually created or modified, cross-checked against §19's plan; (7) the recommended
next action, which per `IMPLEMENTATION_ORDER.md` is a human decision on whether to proceed to
Implementation Document 004 — never an automatic continuation.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
