# Implementation Document 007 — Marketplace and asset commands

## 1. Metadata

- **Document number:** 007
- **Title:** Marketplace and asset commands
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 002 (Slice API client and shared contracts), 003 (Discord
  interaction framework and command registry)
- **Blocks (this build guide):** 015 (Background jobs and scheduled digests) — specifically its
  `market-digest` and `price-alert-poll` jobs, which reuse this document's Slice market-data
  fetch/formatting/data-status-badge logic rather than re-implementing it
- **Slice backend dependency:** Slice's own backend build guide Docs 006 (catalogue) and 007
  (market reads) — both VERIFIED per `project-state.json`'s `sliceBackendStatus` and
  `BOT_API_REQUIREMENTS.md`'s "already available" table
- **Can start today:** Yes

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend; the Discord bot being built
against it is a **companion client, never a second backend** — it calls Slice's HTTP API for every
read and write, never queries Slice's Postgres/Prisma directly, and never duplicates a Slice
business rule (`docs/qa/README.md` ground rules, `BOT_ARCHITECTURE.md` "Bot must never do"). This document
sits in Track B of `IMPLEMENTATION_ORDER.md`'s parallelizable tracks — the "no Slice backend
dependency beyond what's already VERIFIED" track alongside Document 008 (Collector and Vault
commands) — and is one of only two Phase 1 command groups (with 008) that can close without
account-linking (004–006) existing. It builds the bot's first read-only, unauthenticated,
public-data command surface: catalogue/market browsing (`/asset search`, `/asset view`,
`/market movers`, and the movers half of `/top`), and in doing so establishes the shared
`dataStatus` (DEMO/DELAYED/LIVE) badge rendering pattern that every later market-data surface in
this build guide — including Document 015's scheduled digest and alert jobs — must reuse rather than
reinvent.

## 3. Current implementation audit

Per `CURRENT_STATE.md`, **no Discord bot code exists anywhere** as of this document's authorship —
there is no repository, no `package.json`, no `src/`. This document's own declared dependencies —
002 (Slice API client and shared contracts) and 003 (Discord interaction framework and command
registry) — are themselves listed as NOT STARTED in `PROMPT_INDEX.md`/`IMPLEMENTATION_ORDER.md`.
Per this build guide's own sequencing rule ("Run implementation documents strictly in order... Do
not begin the next document until the current one's completion checklist is satisfied" —
`IMPLEMENTATION_ORDER.md`), **an implementer must not begin this document's actual coding until 002
and 003 have each independently closed their own completion checklists.** This document does not
itself flip 002 or 003 to complete, and does not authorize skipping them.

This document assumes, once 002 and 003 close, the codebase provides (per `BOT_ARCHITECTURE.md`):
a typed Slice API client module (auth attachment, request-ID correlation, single-retry-on-401 for
idempotent GETs, `Retry-After` handling); a command registry with declarative command definitions
(name/description/options/permission/ephemeral-default); an interaction router that defers every
interaction inside Discord's 3-second ack window before any Slice call; a shared pagination
component; and a shared embed-builder module skeleton. None of that is built by this document —
this document only records what it expects to consume from 002/003 and what it adds on top.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. `OLD_BOT_FEATURE_INVENTORY.md` and
`OLD_TO_NEW_MIGRATION_MATRIX.md` were searched in full for any row resembling market/catalogue
browsing, price data, or asset search; none exists. The old Python bot (Infria) served an unrelated
FiveM/GTA roleplay community (gangs/factions, a Tebex store) and had no collectibles-marketplace
concept of any kind — `project-state.json`'s `oldBotFeatureCount` of 31 features and its
`oldBotMigrationStatusCounts` (12 REMOVE, 14 REWRITE, 2 MERGE, 1 REPLACE, 1 UNKNOWN) account for
every old-bot feature elsewhere in this build guide's scope; none map here. This document's five
commands are wholly new product surface, not a migration.

## 5. Slice features supported

- **Slice Doc 006 (catalogue) — VERIFIED.** Supplies `GET /v1/categories`, `.../sets`,
  `GET /v1/grading-companies`, `.../grades`, and `GET /v1/catalogue/assets/:slug` — all public, no
  auth, no permission gate (`BOT_API_REQUIREMENTS.md` "already available" table).
- **Slice Doc 007 (market reads) — VERIFIED.** Supplies `GET /v1/market/assets`, `/:slug`,
  `/:slug/history`, `/:slug/similar`, `/summary`, `/movers`, and `/:slug/order-book`,
  `/:slug/recent-trades` — all public, no auth, no permission gate. Market values are real API
  responses that explicitly carry `source`, `status` (`dataStatus`: `DEMO`/`DELAYED`/`LIVE`),
  `asOf`, and optionally `confidence` (`BOT_PRODUCT_SPEC.md` §3). With no live data provider wired
  today, every response is expected to come back `dataStatus: DEMO` — this document's embeds must
  say so honestly on every render, never presenting a bare number.
- Order-book/recent-trades already return Slice's own honest placeholder
  (`availability: "NOT_AVAILABLE_UNTIL_TRADING"`) ahead of Doc 014 (trading, NOT STARTED) — this
  document mirrors that placeholder verbatim rather than omitting the field or fabricating a book
  (`BOT_PRODUCT_SPEC.md` §3).

## 6. Files to read before starting

- `docs/qa/README.md`, `CURRENT_STATE.md`, `project-state.json` — ground truth and current state
- `IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md` — this document's place in the sequence
- `implementation/002-slice-api-client-and-shared-contracts.md` (must be closed first) — the typed
  Slice API client this document's commands call
- `implementation/003-discord-interaction-framework-and-command-registry.md` (must be closed first)
  — the command registry, interaction router, and shared pagination/embed-builder skeleton this
  document builds on
- `BOT_PRODUCT_SPEC.md` §3 (Marketplace search) — the authoritative feature-area reality check
- `BOT_ARCHITECTURE.md` — Slice API client, interaction response helpers, pagination components
- `BOT_SECURITY_MODEL.md` §3–4 — interaction-forgery protection, credential model (to confirm what
  does and does not apply to unauthenticated public reads)
- `BOT_DATA_OWNERSHIP.md` — market data authority rule and the "Discord interaction state" bucket
  used to justify this document's optional cache
- `BOT_API_REQUIREMENTS.md` "already available" table — exact endpoints, auth, and rate-limit
  columns for catalogue/market reads
- `COMMAND_CATALOGUE.md` — `/asset search`, `/asset view`, `/market movers`, `/top` rows in full,
  plus the "UI standards" section (footer/timestamp/pagination/ephemeral rules)
- `PERMISSION_MATRIX.md` — "Marketplace/collector/vault reads" row
- `ERROR_CATALOGUE.md` — full table (this document maps a subset of it)
- `EVENT_AND_JOB_CATALOGUE.md` — `market-digest`/`price-alert-poll` job rows (context for why this
  document blocks 015)
- `TEST_STRATEGY.md` — unit/integration/Discord-interaction/manual-QA expectations this document
  must satisfy

## 7. Strict scope

- `/asset search` — options `category`, `set`, `gradingCompany`, `gradeMin`, `gradeMax`,
  `priceMin`, `priceMax`, `sort`, filtering `GET /v1/market/assets`, paginated results, public.
- `/asset view <slug>` — asset detail (`GET /v1/market/assets/:slug`) plus similar assets
  (`GET /v1/market/assets/:slug/similar`), public.
- `/market movers <kind> <limit>` — gainers/losers/active via `GET /v1/market/movers`, public.
- `/top movers` — the movers half of `/top` per `COMMAND_CATALOGUE.md`'s explicit clarification
  ("`/top movers` (real, Phase 1) vs. `/top investors` (Phase 2, gated on Slice Doc 013)"), same
  backend call and rendering as `/market movers`, registered as its own subcommand.
- A shared `dataStatus` badge/label formatter (DEMO/DELAYED/LIVE) and a shared `asOf` footer
  renderer, used by all four commands above and designed for reuse by Document 015's
  `market-digest`/`price-alert-poll` jobs.
- Category/set/grading-company/grade lookups (`GET /v1/categories`, `.../sets`,
  `GET /v1/grading-companies`, `.../grades`) to populate `/asset search`'s filter options and
  validate/autocomplete user input, plus `GET /v1/catalogue/assets/:slug` for the metadata portion
  of `/asset view`.
- Honest rendering of Slice's order-book/recent-trades `NOT_AVAILABLE_UNTIL_TRADING` placeholder
  inside `/asset view`.
- An optional, justified, short-TTL in-process read-through cache in front of the above GET calls
  (see §10).

## 8. Out of scope

- `/account link`, `/account status`, or any other account-linking command (Documents 004–006).
- `/watchlist *`, `/notifications *`, `/portfolio` (Document 009/010) — anything requiring a linked
  account or a delegated user token.
- `/collector search`, `/collector view`, `/vault latest`, `/vault summary`, `/profile` (Document
  008) — a parallel, independently-scoped Track B document, not built here.
- `/top investors` — explicitly Phase 2, gated on Slice Doc 013 (NOT STARTED); this document does
  not register it as a subcommand, does not stub it as a disabled button, and does not imply it
  exists in any way. `/top` in this document's scope offers only `movers`.
- The `market-digest`, `price-alert-poll`, and `prediction-scoring` scheduled jobs
  (`EVENT_AND_JOB_CATALOGUE.md`) — those are Document 015's scope; this document only produces the
  fetch/format/badge logic Document 015 will import.
- `GET /v1/market/assets/:slug/history` — listed as an already-available endpoint in
  `BOT_API_REQUIREMENTS.md` but not cited against any command in `COMMAND_CATALOGUE.md`'s Phase 1
  table; not built here since no command in this document's scope calls it.
- Any mutation of any kind — this document is 100% read-only against Slice.
- Admin commands (`/admin audit`, etc. — Document 013).
- Any wallet/order/trading-adjacent surface (explicitly out of scope for the whole build guide until
  Slice Docs 012–014/016/018 clear).

## 9. Dependencies

- `discord.js` v14+ — established by Document 003, reused, not reintroduced here.
- The typed Slice API client from Document 002 — reused for the GET calls in §11.
- A schema-validation library (e.g. `zod`) consistent with Document 002's typed-contract approach,
  used to validate command option combinations (e.g. `gradeMin <= gradeMax`,
  `priceMin <= priceMax`) client-side before calling Slice, and to type Slice's response shapes.
- Document 003's shared pagination component and embed-builder skeleton — this document adds
  market-specific embed builders on top, it does not build a second pagination system.
- No new runtime service is introduced (no BullMQ here — that is Document 015's concern; no Redis is
  required, since the optional cache in §10 is in-process by default).

## 10. Bot-owned persistence

**None** — no new tables or collections. Every command in this document's scope is 100% read-only
against Slice; per `BOT_DATA_OWNERSHIP.md`, "Asset catalogue" and "Market data / valuations" are
both Slice-authoritative rows explicitly marked "Bot is read-only" / "Bot renders `source`/`asOf`/
`dataStatus` from the API, never computes its own." This document introduces no schema.

**Optional short-TTL cache (justified, not a system of record).** An implementer may add an
in-process, per-instance cache in front of the GET calls in §11, keyed by the exact normalized
query (all `/asset search` filter parameters + page cursor; `slug` for `/asset view` and
`/similar`; `kind`+`limit` for `/market movers`/`/top movers`), with a TTL of **60 seconds or
less**. This is justified against `BOT_DATA_OWNERSHIP.md`'s own ambiguity rule ("If a row in this
table ever becomes ambiguous... the default answer is Slice, unless the data has zero
product/financial/identity meaning outside of Discord itself") by treating the cache the same way
that document's table already treats "Discord interaction state (in-flight confirmations,
pagination cursors held in component state)": **ephemeral, ≤60s TTL, never a system of record,
never consulted as a fallback when Slice errors.** Concretely:

- The cache never extends, backdates, or fabricates `asOf` — a cached response is served with the
  exact `source`/`asOf`/`dataStatus`/`confidence` values Slice returned at fetch time, unchanged.
- The cache is **not** served as a stale fallback on a Slice 5xx/timeout — a cache miss plus a
  failed live call surfaces the mapped error from `ERROR_CATALOGUE.md` (§17), it never silently
  serves data older than the TTL as if current (mirrors `EVENT_AND_JOB_CATALOGUE.md`'s own rule for
  `market-digest`: "do not post partial/stale data as if current").
- The cache holds zero user-identifying data (these commands are unauthenticated and public; the
  cache key never includes a Discord user ID).
- If omitted entirely, every command in this document simply calls Slice directly on every
  invocation — the cache is a pure performance optimization, never required for correctness.

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Auth | Used by |
|---|---|---|---|
| `GET /v1/categories` | already-available (VERIFIED) | public | `/asset search` `category` filter options |
| `GET /v1/categories/:id/sets` | already-available (VERIFIED) | public | `/asset search` `set` filter options |
| `GET /v1/grading-companies` | already-available (VERIFIED) | public | `/asset search` `gradingCompany` filter options |
| `GET /v1/grading-companies/:id/grades` | already-available (VERIFIED) | public | `/asset search` grade validation/autocomplete bounds |
| `GET /v1/catalogue/assets/:slug` | already-available (VERIFIED) | public | `/asset view` metadata (name, category, set, grading company/grade) |
| `GET /v1/market/assets` | already-available (VERIFIED) | public | `/asset search` results |
| `GET /v1/market/assets/:slug` | already-available (VERIFIED) | public | `/asset view` valuation (`source`/`asOf`/`dataStatus`/`confidence`) |
| `GET /v1/market/assets/:slug/similar` | already-available (VERIFIED) | public | `/asset view` similar-assets section |
| `GET /v1/market/assets/:slug/order-book` | already-available (VERIFIED) | public | `/asset view` — rendered as Slice's honest `NOT_AVAILABLE_UNTIL_TRADING` placeholder |
| `GET /v1/market/assets/:slug/recent-trades` | already-available (VERIFIED) | public | `/asset view` — same honest placeholder |
| `GET /v1/market/movers` | already-available (VERIFIED) | public | `/market movers`, `/top movers` |

**No bot-only service endpoint and no delegated-token exchange is required by this document.**
Every row above has `Auth: public` in `BOT_API_REQUIREMENTS.md`'s "already available" table —
unlike most of Phase 1, none of this document's five commands need the not-yet-provisioned
service-account credential (`BOT_SECURITY_MODEL.md` §4.1) or the not-yet-built delegated-token
exchange (`BOT_API_REQUIREMENTS.md` §2). This is a genuine, verified reason this document's "Can
start today" is unconditionally Yes rather than "spec work only."

## 12. Commands / events / jobs delivered

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases | Old-bot predecessor | Impl doc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/asset search` | Search catalogue/market | `category`, `set`, `gradingCompany`, `gradeMin`, `gradeMax`, `priceMin`, `priceMax`, `sort` | any member | no | public | `GET /v1/market/assets` | standard | n/a | n/a | invalid filter, empty results | — | 007 |
| `/asset view` | Asset detail with valuation | `slug` | any member | no | public | `GET /v1/market/assets/:slug`, `.../similar` | standard | n/a | n/a | not found, not published | — | 007 |
| `/market movers` | Top gainers/losers/active | `kind`, `limit` | any member | no | public | `GET /v1/market/movers` | standard | n/a | n/a | none | — | 007 |
| `/top movers` | Movers half of `/top` (see §8 for `/top investors` exclusion) | `kind`, `limit` | any member | no | public | `GET /v1/market/movers` | standard | n/a | n/a | none | — | 007 |

This table is a direct filter of `COMMAND_CATALOGUE.md`'s Phase 1 table to this document's scope
(the `/asset search`, `/asset view`, `/market movers` rows verbatim) plus `/top`'s movers subcommand
per that document's own clarifying note. No event or scheduled job is delivered by this document —
`EVENT_AND_JOB_CATALOGUE.md`'s `market-digest`/`price-alert-poll` rows belong to Document 015.

## 13. Permission rules

Per `PERMISSION_MATRIX.md`'s "Marketplace/collector/vault reads" row: **Discord-side gate is "any
member"; Slice-side gate is "none (public API)."** Concretely:

- Any Discord guild member who can see the channel the command is invoked in can run all four
  commands in this document — no bot-side role check, no linked-account check.
- Slice performs no authorization check on any of these endpoints — they are unauthenticated public
  reads. There is therefore no Slice permission response to defer to for an allow/deny decision.
- The build guide's general rule still holds even though there is no authorization decision to make
  here: *a Discord-side gate is never treated as a substitute for what Slice's API actually
  returns.* Concretely, this document's handlers must not assume a 200 response — Slice can still
  return `VALIDATION_FAILED`, `ASSET_NOT_FOUND`, `ASSET_NOT_PUBLIC`, `RATE_LIMITED`, or a 5xx for
  any of these calls (§17), and the bot must render exactly what Slice says, never inferring success
  from the fact that a Discord member was allowed to invoke the command.
- No admin variant exists for any command in this document's scope.

## 14. Security requirements

Cross-referencing `BOT_SECURITY_MODEL.md`:

- **§3 (interaction forgery):** every interaction handled by this document's commands must be a
  genuine, current Discord interaction object from an authenticated gateway connection or verified
  HTTP-interaction payload — unchanged from the framework Document 003 provides; this document adds
  no new interaction-authenticity surface.
- **§4 (credentials):** as established in §11 above, this document's calls require **no Slice
  credential at all** — no service-account credential, no user-scoped delegated token. If Document
  002's Slice API client defaults to attaching a service-account credential to every outbound call
  once one exists, this document's calls may pass it (harmless, since the endpoints ignore auth),
  but must not be blocked from working if that credential is not yet provisioned, since the
  endpoints are `Auth: public`.
- **PII exposure:** none of this document's commands accept or display any Discord-user-identifying
  or Slice-account-identifying data — every embed shows only public catalogue/market content
  (asset names, categories, grades, prices, movers). No email, no user ID, no session/token data is
  ever in scope for this document.
- **Custom IDs:** pagination buttons on `/asset search` results use opaque, bot-generated custom IDs
  per `BOT_SECURITY_MODEL.md` §3's general rule, even though the underlying data (asset slugs,
  filter parameters) is itself already public — this keeps one consistent custom-ID discipline
  across the whole bot rather than carving out an exception for "this data happens to be public."
- **No admin-confirmation or recent-auth requirement** applies to this document — nothing here is a
  mutation or a privileged read (`BOT_SECURITY_MODEL.md` §7 is not triggered).
- **Redaction:** the optional cache (§10) holds no sensitive field, so no redaction concern applies
  to it; structured logs for this document's commands log only command name, options, Slice request
  ID, HTTP status, and latency — never a raw response body verbatim (consistent with §10's log-line
  discipline generally, applied here defensively even though there is no PII risk today).

## 15. Idempotency and rate limits

- **Idempotency:** not applicable. This document performs zero Slice mutations across all four
  commands — there is no `Idempotency-Key` to derive or attach (`BOT_ARCHITECTURE.md`'s idempotency
  scheme applies only to mutating calls).
- **Rate limits:** "standard," per `COMMAND_CATALOGUE.md`'s rate-limit column for `/asset search`,
  `/asset view`, and `/market movers` — this document does not invent a numeric limit beyond what
  Slice's own API documents at the endpoint level (`BOT_API_REQUIREMENTS.md` marks "Rate limit: yes"
  for every endpoint in §11, without a document-specified number; the bot honors whatever Slice's
  responses declare via `RateLimit-*`/`Retry-After` headers, per `BOT_ARCHITECTURE.md`'s rate-limit
  handling section).
- The bot applies a local pre-check to avoid calling Slice at all for an obviously-throttled caller
  (e.g., a user who just received a 429 on the same command), consistent with
  `BOT_ARCHITECTURE.md`'s "Rate-limit handling" section, and never fans out parallel retries to work
  around a 429.
- Pagination button clicks on `/asset search` results reuse the same underlying rate-limit handling
  as the initial search call — a rapid-fire Next/Previous click sequence is subject to the same
  Slice-side and local-pre-check behavior as a fresh invocation, not treated as exempt.

## 16. Audit requirements

- **No Slice `AuditEvent` is written for any command in this document's scope.** Every endpoint in
  §11 has `Audit: n/a` (read) in `BOT_API_REQUIREMENTS.md` — these are unauthenticated public reads
  with no actor to attribute an audit record to.
- **Bot-side operational logging only** (not a security audit trail): each interaction handled by
  this document's commands logs a structured line containing the bot-local request ID, Discord user
  ID (for support correlation, not for any Slice-side audit purpose), command name, normalized
  options, Slice request ID (if the response included one), HTTP status, whether the optional cache
  (§10) was a hit or miss, and latency. This mirrors `BOT_ARCHITECTURE.md`'s "Audit correlation" and
  "Structured logging" sections, applied here for operability/debugging (e.g., diagnosing "why did
  `/asset search` return zero results") rather than for any compliance record, since there is no
  Slice audit record to correlate against.

## 17. Error behavior

The following `ERROR_CATALOGUE.md` rows apply to this document's scope:

| Slice error code | HTTP | Discord-facing message | Applies to |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | "That input doesn't look right — check the details and try again." | `/asset search` invalid filter combination (e.g. `gradeMin > gradeMax`, unknown `category`/`gradingCompany` value, invalid `sort`) |
| `ASSET_NOT_FOUND` | 404 | "Couldn't find that — double check and try again." | `/asset view` unknown `slug` |
| `ASSET_NOT_PUBLIC` | 404 | "That asset isn't published yet." | `/asset view` on a non-published asset |
| `RATE_LIMITED` | 429 | "You're doing that too fast — try again in {Retry-After}s." | any of this document's four commands, reading Slice's `Retry-After` header |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | 503 | "Slice is having a moment — try again shortly." | any of this document's four commands; retried once automatically since all are GET-only per `BOT_ARCHITECTURE.md` |
| Unrecognized/unexpected error | any | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | fallback for any error not otherwise mapped; per the catalogue's inherited rule, the raw exception object is never interpolated into this string |

**Error cases specific to this document, not literal Slice error codes but explicitly called out in
`COMMAND_CATALOGUE.md`'s "Error cases" column:**

- **`/asset search` empty results (a valid 200 with zero items, not an error):** rendered as its own
  friendly embed state — e.g. "No assets matched those filters — try widening your search" — never
  presented as though something failed, and never silently showing a blank/empty embed.
- **`/market movers` / `/top movers` "none" case:** if Slice returns zero movers for the requested
  `kind` (a legitimate outcome, especially plausible with today's DEMO data), the embed states that
  plainly (e.g. "No mover data available right now") rather than showing an empty list with no
  explanation.

## 18. Interaction UX

All four embeds in this document carry, per `COMMAND_CATALOGUE.md`'s UI standards footer rule, a
footer with the data's `asOf` timestamp (rendered via Discord's native `<t:unix:R>` relative
timestamp markdown) and `source`, plus a visible **DEMO / DELAYED / LIVE** badge on the `dataStatus`
value itself — not just in the footer, since `BOT_PRODUCT_SPEC.md` §3 requires "no generic unlabeled
price field": every price/valuation figure carries its badge inline, adjacent to the number (e.g.
"£123.45 · **DEMO** (estimated)"), not only as a footer caveat someone could miss.

- **`/asset search`:**
  - Options: `category` (autocomplete backed by `GET /v1/categories`), `set` (autocomplete backed
    by `GET /v1/categories/:id/sets`, dependent on `category`), `gradingCompany` (autocomplete
    backed by `GET /v1/grading-companies`), `gradeMin`/`gradeMax` (numbers, validated
    client-side against `GET /v1/grading-companies/:id/grades` bounds before calling Slice),
    `priceMin`/`priceMax` (numbers), `sort` (choice, whose exact enum values are pulled from
    `GET /v1/market/assets`'s own documented sort parameter at implementation time — this document
    does not invent sort values not present in Slice's API contract).
  - Public response, deferred immediately (Discord's 3-second ack window), then edited with results.
  - Results render through the shared pagination component (Document 003): each page is an embed
    with one field per matching asset (name, category/set, grading company + grade if present,
    price with inline DEMO/DELAYED/LIVE badge), Previous/Next buttons disabled at bounds, page
    position in the footer alongside `asOf`/`source`.
  - Invalid filter combinations are caught client-side where the bounds are known (e.g.
    `gradeMin > gradeMax`) before ever calling Slice, and server-side `VALIDATION_FAILED` responses
    are still mapped per §17 as a backstop.

- **`/asset view <slug>`:**
  - Public response, deferred immediately.
  - Primary embed: asset name as title, category/set and grading company/grade as fields, estimated
    value field with inline `dataStatus` badge and `confidence` (if present) shown alongside it,
    footer with `asOf`/`source`.
  - Order-book/recent-trades section: rendered as a field or short block stating "Trading not yet
    available on Slice" — mirroring Slice's own `availability: "NOT_AVAILABLE_UNTIL_TRADING"`
    response exactly, per the "Disabled/unavailable features" UI standard (a plain-text
    not-available message with the reason, never a silently missing field).
  - Similar-assets section: a compact secondary list (name + badged price per entry, same DEMO
    labeling discipline) — a follow-up embed or an additional field block, not a bare unlabeled list.

- **`/market movers <kind> <limit>`:**
  - Public response, deferred immediately.
  - `kind` is a required choice: `gainers` / `losers` / `active`; `limit` bounds the number of rows
    (paginated via the shared component if the result set exceeds one embed's comfortable row count).
  - Each row: rank, asset name, the relevant metric for `kind` (price change % for gainers/losers,
    activity metric for active) with inline `dataStatus` badge, footer with `asOf`/`source`.

- **`/top movers`:**
  - Registered as a subcommand of `/top` (only `movers` — `/top investors` is not registered at all
    in this document's scope, per §8).
  - Same options, same backend call, same embed layout as `/market movers` — a thin alias, not a
    second implementation, so the two commands cannot drift in formatting or badge discipline.

- **Loading state:** every command defers before calling Slice; a lightweight "Loading…" interim
  message is shown only if the call takes long enough to be noticeable, per
  `COMMAND_CATALOGUE.md`'s UI standards.
- **Ephemeral vs. public:** all four commands in this document are public — genuinely public data
  (asset/market data), per the UI standards' explicit "public for anything genuinely public
  (asset/collector/vault data...)" rule. Nothing in this document is ephemeral.

## 19. Implementation file plan

| File | Purpose |
|---|---|
| `src/commands/asset/search.ts` | `/asset search` command definition + handler |
| `src/commands/asset/view.ts` | `/asset view` command definition + handler |
| `src/commands/market/movers.ts` | `/market movers` command definition + handler |
| `src/commands/top/movers.ts` | `/top movers` subcommand definition + handler (thin wrapper reusing the market-movers service) |
| `src/services/marketplace/marketplaceService.ts` | Application service: validates input, calls the Slice API client from Document 002, applies the optional cache, returns response DTOs — no business logic beyond input validation and DTO shaping |
| `src/services/marketplace/marketCache.ts` | Optional short-TTL in-process cache wrapper (§10); a no-op pass-through if omitted |
| `src/ui/badges/dataStatusBadge.ts` | Shared DEMO/DELAYED/LIVE badge formatter — reused by this document's four commands and intended for import by Document 015's digest/alert jobs |
| `src/ui/embeds/assetSearchEmbed.ts` | Embed builder for `/asset search` result pages |
| `src/ui/embeds/assetViewEmbed.ts` | Embed builder for `/asset view` (including the order-book/recent-trades placeholder and similar-assets section) |
| `src/ui/embeds/marketMoversEmbed.ts` | Embed builder shared by `/market movers` and `/top movers` |
| `tests/unit/services/marketplaceService.test.ts` | Unit tests for validation/formatting/badge logic (§21) |
| `tests/unit/ui/dataStatusBadge.test.ts` | Unit tests for the badge formatter across DEMO/DELAYED/LIVE/unknown inputs |
| `tests/integration/marketplace.integration.test.ts` | Integration tests against a disposable Slice instance / fake client (§22) |
| `tests/discord/asset-commands.interaction.test.ts` | Discord interaction-simulation tests for all four commands (§23) |

This document does not create or modify the pagination component, the Slice API client, the command
registry, or the interaction router — those are Document 003/002's files, reused here.

## 20. Numbered implementation steps

1. Confirm Documents 002 and 003 have each closed their own completion checklists; do not proceed
   past this step otherwise.
2. Read `BOT_API_REQUIREMENTS.md`'s catalogue/market rows and confirm the exact request/response
   shapes against Slice's own current API contract (not assumed from this document alone) — resolve
   any drift before writing types.
3. Add typed request/response contracts for the eleven endpoints in §11 to the shared-contracts
   package Document 002 established, if not already present there.
4. Implement `src/ui/badges/dataStatusBadge.ts`: given a `dataStatus`/`source`/`asOf`/`confidence`
   payload, produce the badge text/color and the footer string; cover DEMO, DELAYED, LIVE, and an
   "unknown/missing dataStatus" defensive fallback that still renders honestly rather than assuming
   LIVE.
5. Implement `src/services/marketplace/marketplaceService.ts` with one method per command (`search`,
   `view`, `movers`) that validates input, calls the Document-002 Slice API client, and returns a
   typed DTO — no Discord-specific code in this layer.
6. Implement the optional `src/services/marketplace/marketCache.ts` (§10) as a thin wrapper the
   service layer can call through; verify it never masks a live-call failure with stale data.
7. Implement `src/ui/embeds/assetSearchEmbed.ts`, `assetViewEmbed.ts`, `marketMoversEmbed.ts` using
   the badge formatter from step 4, wired into Document 003's shared pagination component where
   results can exceed one page.
8. Implement the four command modules (`src/commands/asset/search.ts`, `view.ts`,
   `src/commands/market/movers.ts`, `src/commands/top/movers.ts`), registering them against
   Document 003's command registry with `permission: any member`, `linkedAccountRequired: false`,
   `ephemeral: false`.
9. Wire error mapping (§17) into each command handler via the shared error-mapping layer Document
   003 established — no command in this document hand-rolls its own error strings.
10. Wire structured logging (§16) into each command handler via the shared logging conventions
    Document 002/003 established.
11. Write unit tests (§21), integration tests (§22), and Discord interaction tests (§23).
12. Run the verification commands in §25 and fix any failure before proceeding.
13. Perform the manual QA checklist in §24 in a real dev guild against a real (non-production) Slice
    environment.
14. Complete the checklist in §26, then update the documents listed in §27.

## 21. Unit tests

- `dataStatusBadge` formatter: DEMO → visibly-caveated badge/color; DELAYED → distinct badge/color;
  LIVE → distinct badge/color; missing/unrecognized `dataStatus` → defensive honest fallback, never
  defaults to implying LIVE.
- `marketplaceService.search` input validation: `gradeMin > gradeMax` rejected before any Slice
  call; `priceMin > priceMax` rejected before any Slice call; unknown `sort` value rejected or
  passed through for Slice's own `VALIDATION_FAILED` to catch (per whichever validation boundary is
  chosen in step 2/5 above — the test asserts whichever behavior is actually implemented, not both).
- `marketplaceService.view` / `.movers`: correct DTO shaping from a fixture Slice response,
  including the `NOT_AVAILABLE_UNTIL_TRADING` order-book/recent-trades passthrough.
- Pagination math for `/asset search` result paging (page boundaries, disabled-button state at
  first/last page) — reusing Document 003's shared paginator's own unit-tested logic, only the
  page-content mapping is unit-tested here.
- Error-mapping: every `ERROR_CATALOGUE.md` row cited in §17 produces the exact specified
  user-facing string from a given Slice error-code fixture, with no raw exception text interpolated
  (the inherited old-bot-bug regression check per `TEST_STRATEGY.md`).
- Optional cache (§10): a cache hit within TTL returns the exact previously-stored `asOf`/
  `dataStatus` unchanged; a cache entry past TTL is not served; a live-call failure after a cache
  miss is never masked by returning stale data.

## 22. Integration tests

Per `TEST_STRATEGY.md`, integration tests run real command-handler logic against a **disposable
local Slice instance** (or, until that is available, the fake typed Slice API client from Document
002) for every endpoint in §11:

- `/asset search` against a seeded Slice instance with known catalogue/market fixtures: filter
  combinations return the expected asset set; an empty-result filter combination returns the
  friendly empty-state embed, not an error.
- `/asset view` against a published asset slug (full render, including similar assets and the
  honest trading-placeholder) and an unpublished/unknown slug (`ASSET_NOT_PUBLIC`/`ASSET_NOT_FOUND`
  mapped correctly).
- `/market movers` and `/top movers` against seeded mover data for each `kind`, and against a
  zero-movers fixture (the "none" friendly state from §17).
- A forced Slice 503 fixture (`MARKET_DATA_UNAVAILABLE`) confirms the single-retry-on-GET behavior
  from `BOT_ARCHITECTURE.md` fires once, then surfaces the mapped message if the retry also fails.
- A forced Slice 429 fixture confirms `Retry-After` is read and surfaced verbatim in the
  rate-limited message.

## 23. Discord interaction tests

Per `TEST_STRATEGY.md`, simulated interaction payloads (slash command invocation for each of the
four commands, plus pagination button clicks on `/asset search` results) run through the real
interaction router and command handlers without a live Discord gateway connection, asserting:

- Correct `ephemeral: false` on every response in this document's scope.
- Correct embed field structure (title, fields, footer containing `asOf`/`source`) for each command.
- Correct component state on `/asset search` pagination (Previous disabled on page 1, Next disabled
  on the last page, page position shown).
- Option-parsing correctness for every documented option (`category`, `set`, `gradingCompany`,
  `gradeMin`, `gradeMax`, `priceMin`, `priceMax`, `sort` for search; `slug` for view; `kind`,
  `limit` for movers).
- `/top` command registration exposes only the `movers` subcommand — asserting `investors` is not a
  registered subcommand at all (a direct test of §8's exclusion).

## 24. Manual QA checklist

Run in a real test guild against a real (non-production) Slice environment, per `TEST_STRATEGY.md`:

- [ ] `/asset search` with no filters returns a paginated, correctly DEMO-labeled result set.
- [ ] `/asset search` with each individual filter (category, set, gradingCompany, gradeMin/Max,
      priceMin/Max, sort) narrows results as expected.
- [ ] `/asset search` with a filter combination guaranteed to produce zero results shows the
      friendly empty-state message, not an error.
- [ ] `/asset search` pagination Previous/Next buttons work and correctly disable at bounds.
- [ ] `/asset view` on a real published asset shows correct metadata, a visibly DEMO-labeled
      valuation with `asOf`, and a similar-assets section, also DEMO-labeled.
- [ ] `/asset view` on an unpublished asset and on a nonexistent slug both show the correct
      friendly not-found/not-published message.
- [ ] `/asset view`'s order-book/recent-trades section shows "Trading not yet available on Slice"
      (or equivalent), never a fabricated book.
- [ ] `/market movers gainers`, `losers`, and `active` each render correctly with DEMO labeling.
- [ ] `/top movers` renders identically to `/market movers` for the same `kind`.
- [ ] `/top` does not offer an `investors` subcommand anywhere in Discord's command picker.
- [ ] Rate-limit QA: deliberately trigger Slice's documented rate limit on one of this document's
      endpoints and confirm the bot surfaces the friendly message with the correct `Retry-After`,
      never a raw 429.
- [ ] Error QA: confirm no raw Slice error text, stack trace, or internal identifier ever appears in
      any embed produced by this document's commands.
- [ ] Confirm every embed's footer shows a real `asOf` timestamp using Discord's `<t:unix:R>`
      relative-timestamp markdown, and that it renders correctly across at least two Discord
      clients/timezones.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run build
```

## 26. Completion checklist

- [ ] Documents 002 and 003 closed before this document's coding began
- [ ] `/asset search`, `/asset view`, `/market movers`, `/top movers` implemented exactly as scoped
      in §7, nothing from §8 implemented alongside them
- [ ] Every embed shows a visible DEMO/DELAYED/LIVE badge inline on every price/valuation figure,
      never a bare unlabeled number
- [ ] Every embed's footer shows `asOf` and `source`
- [ ] Order-book/recent-trades placeholder mirrors Slice's own `NOT_AVAILABLE_UNTIL_TRADING`
      response exactly
- [ ] `/top investors` is not registered anywhere
- [ ] Zero Slice mutations exist in this document's code (grep-verified: no `PUT`/`POST`/`PATCH`/
      `DELETE` call anywhere in the files from §19)
- [ ] No new bot-owned table/collection was introduced; if the optional cache (§10) was implemented,
      it is in-process, ≤60s TTL, and never served as a stale fallback on a live-call failure
- [ ] Every `ERROR_CATALOGUE.md` row cited in §17 is covered by a passing test
- [ ] No raw Slice error text, token, or internal identifier appears in any embed, log, or test
      fixture committed to the repository
- [ ] Unit, integration, and Discord interaction tests from §21–23 all pass
- [ ] Manual QA checklist (§24) completed in a real dev guild
- [ ] Verification commands (§25) all pass

## 27. Documentation updates

- Flip this document's row (007) to COMPLETE in `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md`
  once the completion checklist in §26 is genuinely satisfied — not before.
- Update `CURRENT_STATE.md` to reflect that Track B's first half (007) has landed, and that Document
  015's market-digest/price-alert-poll jobs are now unblocked on this document's side of their
  dependency (015 still separately depends on Document 008 per `IMPLEMENTATION_ORDER.md`).
- Note in `CURRENT_STATE.md`/`project-state.json` (if that file is regenerated at close time) that
  the `dataStatusBadge` module now exists and should be imported, not re-implemented, by Document
  015.
- No change to `BOT_API_REQUIREMENTS.md`, `COMMAND_CATALOGUE.md`, `PERMISSION_MATRIX.md`,
  `ERROR_CATALOGUE.md`, `BOT_SECURITY_MODEL.md`, or `BOT_DATA_OWNERSHIP.md` is needed — this
  document implements exactly what those top-level documents already specify, without altering any
  of their claims.

## 28. Final report format

The implementer's completion report for this document must state, in this order:

1. **Status:** COMPLETE or BLOCKED (with the specific blocking reason, e.g. "002/003 not yet
   closed").
2. **Commands delivered:** the exact list of slash commands/subcommands registered, cross-checked
   against §7/§12.
3. **Slice endpoints called:** the exact list from §11, confirming none beyond that list were added.
4. **Data-status honesty confirmation:** an explicit statement that every embed was manually
   verified to show a DEMO/DELAYED/LIVE badge and `asOf` on every price/valuation figure, with a
   screenshot or transcript reference from the manual QA pass (§24).
5. **Test results:** pass/fail summary for unit, integration, and Discord interaction tests, plus
   confirmation the verification commands (§25) all passed.
6. **Deviations:** any point where the implementation diverged from this document's scope, and why
   (e.g., an actual Slice `sort` enum value discovered during step 2 that wasn't guessable from this
   build guide alone).
7. **Completion checklist:** the §26 checklist, reproduced with boxes actually checked.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
