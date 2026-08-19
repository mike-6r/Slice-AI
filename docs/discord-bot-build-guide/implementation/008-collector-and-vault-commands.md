# Implementation Document 008: Collector and Vault commands

## 1. Metadata

- **Document number:** 008
- **Title:** Collector and Vault commands
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 002 (Slice API client and shared contracts), 003 (Discord
  interaction framework and command registry)
- **Blocks (this build guide):** 009 (Watchlist and portfolio commands — `/profile`'s self/other-view
  pattern and its embed layout are the template `/portfolio`'s self-view reuses), 015 (Background jobs
  and scheduled digests — no market-digest job in this document's scope reads collector/vault data
  today, but 015 is sequenced after 007 and 008 land so a future digest job can safely reuse this
  document's read patterns without redesign)
- **Slice backend dependency:** Slice Doc 008 (VERIFIED) — `GET /v1/collectors`, `GET
  /v1/collectors/:slug`, `GET /v1/collectors/:slug/assets`, `GET /v1/vault/events`, `GET
  /v1/vault/summary`, and `GET /v1/me` (already VERIFIED per Doc 003/004, reused here only for
  `/profile` self-view identity resolution)
- **Can start today:** Yes

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`) that is the single
source of truth for users, assets, market data, collector profiles, and vault events. The Discord bot
being built from this guide is a **companion client** to Slice: it calls Slice's HTTP API exclusively,
never queries Slice's Postgres/Prisma directly, never duplicates a Slice business rule, and never
becomes a second backend (`docs/qa/README.md` ground rules, `BOT_ARCHITECTURE.md` "Bot must never do"). This
document sits in Track B of `IMPLEMENTATION_ORDER.md` — it has no dependency on the account-linking
work in Track A (Documents 004–006) because every command it delivers reads **public** Slice data. It
runs in parallel with Document 007 (Marketplace and asset commands), both built directly on top of
Document 002's Slice API client and Document 003's interaction framework, and both required before
Document 015's market-digest job track can be scheduled.

## 3. Current implementation audit

Nothing bot-specific exists yet beyond what Documents 001–003 establish (repository scaffold, the
typed Slice API client and shared contracts, and the Discord interaction framework/command registry).
No command handler, embed builder instance, or pagination component has been written for any command
family, including this one. This document is the first to implement any collector- or vault-facing
read path; it builds directly on the generic Slice API client module, the generic paginator component,
and the generic embed-builder module Document 002/003 are specified to deliver, without assuming any
collector/vault-specific code exists before this document starts.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. `OLD_BOT_FEATURE_INVENTORY.md` and
`OLD_TO_NEW_MIGRATION_MATRIX.md` were reviewed specifically for anything resembling a public
collector/investor-profile display or a vault/custody-activity feed. The old bot (Infria,
`discord.py==1.6.0`) is an unrelated FiveM/GTA roleplay-community bot with zero product overlap with
Slice (`docs/qa/README.md`, `OLD_BOT_FEATURE_INVENTORY.md` "Source and scope"). Its 31 inventoried features
cover bootstrap, role management, announcements, suggestions, bug reports, help, gang/faction
leaderboards and strikes, a Tebex store integration, DM-based anti-bot verification, tickets,
moderation, auto-moderation, giveaways, a trailer/perk-submission workflow, and shared helper/error
patterns. None of these is a collector profile, an investor profile, or a vault/custody event feed —
the closest conceptual neighbor is row #15 (reaction-triggered DM verification), and that is a
generic anti-bot/anti-raid check with no external identity or profile data attached, migrated instead
into the account-linking design in Documents 004/005, not into this document. Row #27
(trailer/perk-submission approval workflow) is the only other candidate reviewed, and it maps to
Slice's own submission-review workflow (Doc 010 of Slice's backend), not to anything public-facing —
it is out of this document's scope entirely. This document's five commands (`/collector search`,
`/collector view`, `/vault latest`, `/vault summary`, `/profile`) are designed fresh, informed only by
Slice's own Doc 008 API surface, per `BOT_PRODUCT_SPEC.md` §6–7.

## 5. Slice features supported

- **Collector profiles** — Slice Doc 008, status **VERIFIED**. `PublicCollectorProfile.isPublic`
  defaults `false`; only explicitly opted-in collectors are visible through `GET /v1/collectors` and
  `GET /v1/collectors/:slug` (`BOT_PRODUCT_SPEC.md` §6).
- **Vault events** — Slice Doc 008, status **VERIFIED** (public feed), with the public event
  projection additionally shaped by Doc 011 (valuation/custody/insurance — self-reported COMPLETE per
  its own document; see the 010/011 status discrepancy noted in `CURRENT_STATE.md` and
  `project-state.json`). `VaultPublicEvent.sourceRef` is a private field and is never rendered
  (`BOT_PRODUCT_SPEC.md` §7).
- **Session/identity read** — `GET /v1/me`, already VERIFIED per Slice Doc 003/004, reused only to
  resolve the requester's own linked account for `/profile` self-view; this document does not
  introduce or depend on any new identity endpoint.
- This document introduces **no mutation** against any Slice feature area — every command it delivers
  is a read.

## 6. Files to read before starting

- `BOT_API_REQUIREMENTS.md` — "Already available" table rows for `GET /v1/collectors`, `/:slug`,
  `/:slug/assets`, `GET /v1/vault/events`, `/summary`, and `GET /v1/session`/`GET /v1/me`.
- `BOT_ARCHITECTURE.md` — Slice API client conventions, pagination component, embed-builder module,
  deferred-response pattern, structured logging/request-ID propagation.
- `BOT_PRODUCT_SPEC.md` §6 (Collector profiles) and §7 (Vault activity) — the exact honesty
  constraints (no fabricated holdings, no win-rate/ROI/portfolio-value fields, `sourceRef` never
  rendered, insurance claims never exceed the allowlisted `insurance{status, insuredAmount?,
  expiresAt?}` shape).
- `COMMAND_CATALOGUE.md` — the `/collector search`, `/collector view`, `/vault latest`, `/vault
  summary`, and `/profile` rows in full, plus "UI standards" (footer/`asOf`/`source` convention,
  ephemeral-vs-public defaults, pagination component, error-embed style).
- `BOT_DATA_OWNERSHIP.md` — "Collector profiles" and "Vault events" rows (Slice-authoritative,
  bot read-only) and the "Discord interaction state" row (bot-owned, ephemeral, short TTL, never a
  system of record) that grounds this document's optional cache design (§10 below).
- `PERMISSION_MATRIX.md` — "Marketplace/collector/vault reads" row.
- `BOT_SECURITY_MODEL.md` §6 (Discord role possession ≠ Slice permission) and §10 (logging redaction).
- `ERROR_CATALOGUE.md` — `PROFILE_NOT_FOUND` / `COLLECTOR_NOT_FOUND`, `PROFILE_NOT_PUBLIC`,
  `RATE_LIMITED`, `MARKET_DATA_UNAVAILABLE`/`PERSISTENCE_UNAVAILABLE`/`CONTROL_STORE_UNAVAILABLE`, and
  the unrecognized/unexpected-error rows.
- `TEST_STRATEGY.md` — unit/integration/Discord-interaction/manual-QA expectations relevant to
  read-only public-data commands.
- Document 002's own completion state (Slice API client and shared contracts) and Document 003's own
  completion state (interaction framework, command registry, pagination component, embed builder) —
  both must be read once those documents exist, to confirm the exact module interfaces this document
  builds against rather than re-guessing them.

## 7. Strict scope

- `/collector search <query?> <focus?>` — searches public collector profiles via `GET
  /v1/collectors`, paginated, public response.
- `/collector view <slug>` — shows one public collector profile via `GET /v1/collectors/:slug` and
  `GET /v1/collectors/:slug/assets`, public response. Never shows a non-public profile, with one
  narrow exception: a linked requester viewing **their own** profile through `/profile` (not through
  `/collector view` directly — see §8).
- `/vault latest <type?> <assetId?>` — recent public vault events via `GET /v1/vault/events`,
  paginated, public response.
- `/vault summary` — aggregate vault statistics via `GET /v1/vault/summary`, public response.
- `/profile <member?>` — alias behavior over the same collector-view data path: self-view when the
  requester is linked (ephemeral), or another guild member's view when that member is linked **and**
  their Slice collector profile is public (public response). Unlinked self-view explains why a linked
  account is required and offers `/account link`. An unlinked or not-public target member produces the
  same `PROFILE_NOT_PUBLIC`/not-linked messaging as `/collector view`, never a silent fallback.
- Shared pagination component usage (from Document 003) for `/collector search` and `/vault latest`.
- Shared embed-builder usage (from Document 003) for all five commands, including the `source`/`asOf`
  footer convention on every embed sourced from a live Slice API call.
- Error-mapping for every `ERROR_CATALOGUE.md` row reachable by these five commands.
- Optional, justified short-TTL read cache for these five commands' Slice responses (§10), reducing
  duplicate calls to Slice's public collector/vault endpoints under normal interactive use — not a
  system of record, never serving stale-beyond-TTL data as current.

## 8. Out of scope

- Any Slice mutation of any kind — this document is 100% read-only against Slice, matching
  `BOT_DATA_OWNERSHIP.md`'s "Collector profiles: Slice, bot is read-only" and "Vault events: Slice,
  bot is read-only" rows.
- Account linking itself (`/account link`, `/account unlink`, `/account status`) — that is Document
  005's scope. This document's `/profile` self-view **consumes** the linked-account state via `GET
  /v1/me` but does not implement the linking flow.
- Exposing a non-public collector profile to any requester other than that profile's own linked
  owner via `/profile`. `/collector view <slug>` never bypasses `isPublic` for any requester,
  including the profile owner themselves — if an owner wants to see their own non-public profile data,
  that is `/account status`'s job (Document 005), not this document's.
- Any financial-performance field on a collector profile (win-rate, ROI, total invested, portfolio
  value) — `PublicCollectorProfile` has no such fields today (`BOT_PRODUCT_SPEC.md` §6, "Investor
  Profiles" wishlist row), and none is fabricated here.
- Any claim of insurance coverage beyond the exact allowlisted `insurance{status, insuredAmount?,
  expiresAt?}` shape Doc 011's public projection returns (`BOT_PRODUCT_SPEC.md` §7).
- `/portfolio` (Document 009 — requires account linking, Docs 005/006, and is additionally gated on
  Slice Doc 013 for anything beyond an honest unavailable-state card).
- `/watchlist *`, `/notifications *` (Documents 009/010 — both require account linking).
- Any push/notification delivery referencing vault or collector data — no such mechanism exists
  (`BOT_API_REQUIREMENTS.md` §4, `BOT_ARCHITECTURE.md` "Notification delivery" note).
- A `market-digest`-style scheduled job pulling vault/collector data — no such job exists in
  `EVENT_AND_JOB_CATALOGUE.md`'s scheduled-jobs table today; only `market-digest` (Doc 007-scoped) and
  `price-alert-poll` are defined, neither of which reads collector/vault data. Document 015 is where
  any future job design would be scoped, not this document.
- Any bot-owned persistence beyond the optional short-TTL cache justified in §10 — no ticket,
  moderation, suggestion, or engagement-feature persistence of any kind belongs to this document.

## 9. Dependencies

- Document 002's typed Slice API client module (no new HTTP client is introduced here; this document
  adds typed methods/DTOs for the five endpoints in §11 to that existing client).
- Document 003's interaction framework: command registry, deferred-response helper, shared
  pagination component, shared embed-builder module, ephemeral/public response defaults, and the
  central error-mapping middleware (`ERROR_CATALOGUE.md`).
- No new runtime dependency (npm package) is introduced by this document. If Document 002 or 003
  already introduced a cache library (e.g., an in-process LRU or a Redis client for bot-owned state),
  this document reuses that same mechanism for its optional cache (§10) rather than introducing a
  second one.

## 10. Bot-owned persistence

**Optional only — justified against `BOT_DATA_OWNERSHIP.md`.**

This document may introduce a short-TTL, in-process (or shared Redis, if Document 002/003 already
provisions one for other read-heavy commands) read-through cache for the five Slice calls in §11:

- **What it stores:** the raw JSON response body of `GET /v1/collectors` (per query+focus+page key),
  `GET /v1/collectors/:slug` and `.../assets` (per slug), `GET /v1/vault/events` (per type+assetId+page
  key), and `GET /v1/vault/summary`, each keyed by its exact request parameters.
- **TTL:** 60 seconds, matching the cadence at which this data plausibly changes and short enough that
  no interactive user could reasonably perceive it as stale (`BOT_DATA_OWNERSHIP.md`'s "Discord
  interaction state" row: "Ephemeral, short TTL, never a system of record" — this cache follows the
  identical justification, extended from pagination-cursor state to response-body state, because both
  are disposable, re-derivable-from-Slice-at-any-time data with zero authority of their own).
- **Why this does not violate `BOT_DATA_OWNERSHIP.md`'s rule:** the rule states "if a row ever becomes
  ambiguous... the default answer is Slice, unless the data has zero product/financial/identity
  meaning outside of Discord itself." A 60-second cache entry has zero independent meaning — it is
  never read after Slice would itself return a materially different answer for practical purposes, it
  is never treated as authoritative if a fresh Slice call is available (a cache miss or expiry always
  triggers a real Slice call, never a stale fallback on error — a `MARKET_DATA_UNAVAILABLE`-class Slice
  failure is surfaced as a friendly error per `ERROR_CATALOGUE.md`, not silently served from an expired
  cache entry), and it is never itself the source of a `source`/`asOf` embed footer claim — the footer
  always reflects the underlying Slice response's own `asOf`/`source` fields, not the cache's fetch
  time, so a cached response is never misrepresented as fresher than it is.
- **What it explicitly does NOT do:** it does not cache per-user state (nothing in this document's
  scope is user-scoped — every endpoint here is public), it does not become a fallback data source on
  Slice outage, it does not persist across a bot restart (in-process cache) or, if backed by Redis
  instead, it carries the same 60-second TTL there with no extended retention, and it is never queried
  or written by any other implementation document's commands.
- **If Document 002/003 does not provision a shared cache mechanism by the time this document starts:**
  this document ships without the cache (every call goes straight to Slice) — the cache is explicitly
  an optional performance optimization, not a functional requirement, and "None" is an acceptable
  outcome for this section if the implementer judges it unnecessary at this data volume.

If no cache is built, this section's answer is: **None — every read in this document's scope calls
Slice live, with no bot-owned persistence of any kind.**

## 11. Slice API dependencies

| Endpoint | Tag (per `BOT_API_REQUIREMENTS.md`) | Auth | Used by |
|---|---|---|---|
| `GET /v1/collectors` | Already-available (VERIFIED) | public | `/collector search` |
| `GET /v1/collectors/:slug` | Already-available (VERIFIED) | public | `/collector view`, `/profile` (other member and self) |
| `GET /v1/collectors/:slug/assets` | Already-available (VERIFIED) | public | `/collector view`, `/profile` (other member and self) |
| `GET /v1/vault/events` | Already-available (VERIFIED) | public | `/vault latest` |
| `GET /v1/vault/summary` | Already-available (VERIFIED) | public | `/vault summary` |
| `GET /v1/me` | Already-available (VERIFIED, per Slice Doc 003/004) | token (self) | `/profile` self-view only — to resolve the requester's own linked Slice collector slug; not otherwise used in this document |

No new-endpoint-required and no bot-only-service-endpoint call is introduced by this document. `/profile`
self-view's use of `GET /v1/me` requires the requester to already be linked (Document 005's domain);
this document consumes that state, it does not create it. If the requester is unlinked, `/profile`
self-view never calls `GET /v1/me` with a fabricated identity — it short-circuits to the not-linked
message defined in §17/§18 before any Slice call is attempted.

## 12. Commands / events / jobs delivered

Pulled directly from `COMMAND_CATALOGUE.md`, filtered to this document's scope:

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases | Old-bot predecessor | Impl doc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/collector search` | Search public collectors | `query`, `focus` | any member | no | public | `GET /v1/collectors` | standard | n/a | n/a | empty results | — | 008 |
| `/collector view` | Public collector profile | `slug` | any member | no | public | `GET /v1/collectors/:slug`, `.../assets` | standard | n/a | n/a | not public, not found | — | 008 |
| `/vault latest` | Recent public vault events | `type`, `assetId` | any member | no | public | `GET /v1/vault/events` | standard | n/a | n/a | empty results | — | 008 |
| `/vault summary` | Vault summary stats | — | any member | no | public | `GET /v1/vault/summary` | standard | n/a | n/a | none | — | 008 |
| `/profile` | Alias of `/collector view` for self, or another member if linked | `member?` | any member | for self-view | ephemeral (self) / public (other) | same as `/collector view` | standard | n/a | n/a | not linked, not public | — | 008 |

No event or job is delivered by this document — no row in `EVENT_AND_JOB_CATALOGUE.md`'s scheduled-jobs
table belongs to Document 008; the closest candidate (`market-digest`) is Document 007/015-scoped and
does not read collector or vault data.

## 13. Permission rules

Per `PERMISSION_MATRIX.md`'s "Marketplace/collector/vault reads" row: **Discord-side gate = any
member; Slice-side gate = none (public API).** All five commands in this document are reachable by
any guild member with no Discord role requirement and no Slice account link requirement, with the
single stated exception of `/profile` self-view, which requires a linked account (per
`COMMAND_CATALOGUE.md`'s `/profile` row, "Linked account required: for self-view").

Two rules from `BOT_SECURITY_MODEL.md` §6 apply explicitly to this document even though it has no
admin-tier command:

- **Discord role possession is never treated as proof of Slice permission.** This document has no
  privileged command, so this mostly manifests as a negative requirement: no command in this document
  ever checks a Discord role as a gate for viewing collector/vault data, because Slice itself imposes
  no permission on these public endpoints — adding a Discord-side gate here would be an unjustified,
  undocumented restriction not present in `PERMISSION_MATRIX.md`.
- **A Slice permission is never assumed from Discord state.** `/profile` self-view's "linked" check is
  not a Discord-side check at all — it is a fresh `GET /v1/me` (or the bot's own resolved-link lookup
  if Document 005's linking domain exposes one) at interaction time, never a cached "this Discord user
  is linked" flag held longer than the single interaction.

## 14. Security requirements

Per `BOT_SECURITY_MODEL.md`:

- **§2 Guild authorization** — none of this document's commands depend on guild-specific
  configuration; they behave identically in any guild the bot is installed to, consistent with the
  Discord↔Slice identity mapping being global to the Discord account, not per-guild (relevant only to
  `/profile` self-view's linked-account lookup).
- **§3 Interaction forgery** — no button/select/modal with a mutating action exists in this document
  (pagination buttons on `/collector search` and `/vault latest` are navigation-only, not mutating);
  the general rule still applies — every interaction handled is a genuine Discord interaction object
  from the interaction framework (Document 003), never accepted from any other source.
- **§4 Bot token and Slice credential safety** — all five Slice calls in this document use the bot's
  **service-account credential** (BOT_API_REQUIREMENTS.md §8; per `BOT_SECURITY_MODEL.md` §4.1, "calls
  that don't impersonate a specific user"), because every one of them is a public read with no
  per-user authorization, **with one exception**: `/profile` self-view's `GET /v1/me` call is a
  user-scoped call and must use a token tied to the linked Slice user's own permission set (§4.2), not
  the bot's service identity — this document does not invent a new mechanism for that; it consumes
  whatever delegated-token mechanism Document 004/005/006 establishes (`BOT_API_REQUIREMENTS.md` §2).
  If that mechanism is not yet available when this document is implemented, `/profile` self-view is
  the one command in this document that cannot fully close until Document 006 lands — see §26.
- **§6 Discord role ≠ Slice permission** — restated from §13 above; no command in this document treats
  a Discord role as a substitute for a Slice-side check, and none needs to, since Slice imposes no
  permission on these endpoints.
- **§10 Logging redaction, PII exposure** — no email address, token, or session cookie is ever logged
  or rendered by any command in this document. A collector profile's public slug, display name, and
  any allowlisted public fields Slice's own API returns are not "PII" in the sense this section
  guards against (they are already public-by-consent, per `isPublic`), but the bot still never
  logs a full raw Slice response body at a log level a support engineer wouldn't already need for
  correlation — structured logs carry the request ID and outcome, not the full payload, matching the
  general logging convention Document 002/003 establish.
- **No admin confirmation or type-to-confirm step applies to this document** — nothing here is
  destructive or mutating, so `BOT_SECURITY_MODEL.md` §11 (admin action confirmation) does not apply.

## 15. Idempotency and rate limits

- **Idempotency:** not applicable — this document performs zero mutations, and `BOT_ARCHITECTURE.md`'s
  `Idempotency-Key` scheme applies only to mutating Slice calls. No command in this document attaches
  or requires an `Idempotency-Key`.
- **Rate limits:** "standard," per every row in `COMMAND_CATALOGUE.md`'s Rate limit column for this
  document's commands — meaning the bot applies no additional command-specific throttling beyond (a)
  Slice's own documented rate limits on `GET /v1/collectors*` and `GET /v1/vault/*`, honored via
  `Retry-After` (`BOT_ARCHITECTURE.md` "Slice API client" responsibilities; `ERROR_CATALOGUE.md`'s
  `RATE_LIMITED` row), and (b) the interaction framework's own generic per-user cooldown (Document 003)
  applied uniformly across all read commands to prevent obvious command-spam, not a bespoke limit
  invented for this document. `/profile` self-view's `GET /v1/me` call inherits whatever rate limit
  Document 004/005 defines for that endpoint's bot-facing usage — this document does not redefine it.

## 16. Audit requirements

- **Slice-side:** none of this document's calls are audited by Slice, because none of them is a
  mutation (`GET` requests are explicitly "n/a (read)" in `BOT_API_REQUIREMENTS.md`'s Audit column for
  every endpoint this document uses, including `GET /v1/me`).
- **Bot-side operational log:** every command invocation in this document logs, at the bot's own
  structured-logging layer (Document 001/002 convention), the Discord user ID, command name and
  resolved options (query/focus/slug/type/assetId/page/target member, as applicable), the Slice
  request ID returned in the response (for correlation, not for a competing audit trail per
  `BOT_SECURITY_MODEL.md` §5's "never duplicates Slice's audit record as a second source of truth"),
  and the outcome (success, empty-result, or the specific error code from `ERROR_CATALOGUE.md`). This
  is operational observability, not an audit requirement — nothing here writes a new audit-equivalent
  record anywhere.

## 17. Error behavior

Per `ERROR_CATALOGUE.md`, the following rows are reachable from this document's commands:

| Slice error code | HTTP | Discord-facing message | Reachable from |
|---|---|---|---|
| `PROFILE_NOT_FOUND` / `COLLECTOR_NOT_FOUND` | 404 | "Couldn't find that — double check and try again." | `/collector view <slug>`, `/vault latest` with an invalid `assetId`, `/profile <member>` when the target has no resolvable collector slug |
| `PROFILE_NOT_PUBLIC` | 404 | "That collector hasn't made their profile public." | `/collector view <slug>` on a non-public profile, `/profile <member>` when the target member is linked but their profile is not public |
| `RATE_LIMITED` | 429 | "You're doing that too fast — try again in {Retry-After}s." | any of the five commands under sustained use |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | 503 | "Slice is having a moment — try again shortly." | any Slice call in this document during a Slice-side outage; retried once automatically since every call here is a GET (`BOT_ARCHITECTURE.md`'s "retry idempotent GETs only" rule) |
| Unrecognized/unexpected error | any | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | any unmapped failure from any of the five calls |

**Error cases specific to this document, not already a distinct row in `ERROR_CATALOGUE.md`:**

- **Empty results** (`/collector search` with no matches, `/vault latest` with no events matching the
  filter) is not an error at all — it is a successful response with zero items. The embed renders a
  plain "No collectors matched your search." / "No vault events found for that filter." message in the
  same public embed style, never routed through the error-mapping middleware.
- **Not-linked self-view** (`/profile` with no `member` option, requester has no linked Slice account)
  is not a Slice error code (the bot never calls `GET /v1/me` with no identity to resolve) — it is a
  bot-side short-circuit using the exact "Account-link prompts" pattern from `COMMAND_CATALOGUE.md`'s
  UI standards: "a short explanation and a button that runs `/account link` directly." Copy: "You'll
  need to link your Slice account to view your own profile — tap below to get started." with a
  `/account link`-launching button.
- **Not-linked other-member view** (`/profile @someone` where `@someone` has no linked Slice account)
  is distinct from `PROFILE_NOT_PUBLIC` (that member simply cannot be resolved to any collector slug
  at all) and uses its own copy: "That member hasn't linked a Slice account." — never implying the
  member exists on Slice but chose privacy, since the bot genuinely cannot tell the difference between
  "not linked" and "linked to a private profile" without conflating the two into a single safe
  response. Because leaking "linked but private" vs. "not linked at all" for another user could itself
  be an information-disclosure concern (confirming a specific Discord identity's Slice-linkage status
  to third parties), the bot uses the **same generic message** for both "not linked" and "linked but
  not public" when the target is **someone other than the requester**: "That member's profile isn't
  available." Only the requester's own self-view distinguishes "not linked" (with a link prompt) from
  "not public" (their own profile is never non-public to themselves in a meaningful sense, since
  self-view of one's own linked account always succeeds once linked, showing exactly what a public
  viewer would see if `isPublic` is true, or a `PROFILE_NOT_PUBLIC`-styled note if the account is
  linked but not yet made public — a self-view still ultimately reflects `GET
  /v1/collectors/:slug` for the requester's own slug, it does not bypass Slice's own `isPublic` gate
  even for its own owner, per §8).

**Rule inherited from Migration M6 (`ERROR_CATALOGUE.md` closing rule):** the generic/unrecognized
branch in this document never interpolates a raw exception object, Slice response body, or stack trace
into any user-facing string, for any of the five commands.

## 18. Interaction UX

All five commands respect Discord's 3-second ack window via an immediate `defer` before any Slice
call (`BOT_ARCHITECTURE.md`), showing a lightweight "Loading…" state only if the call is slow enough to
be noticeable (`COMMAND_CATALOGUE.md` UI standards).

- **`/collector search <query?> <focus?>`** — public response. Embed: title "Collector search", one
  line per result (display name, slug, one-line specialism/focus tag if Slice returns one), footer
  with `source`/`asOf` and page position (e.g., "Page 1 of 3 · Source: Slice · as of <t:...:R>").
  Shared pagination component (Previous/Next buttons, disabled at bounds) if more than one page.
  Empty state per §17.
- **`/collector view <slug>`** — public response. Embed: collector display name and slug as title,
  headline/specialism field if present, a compact list of public holdings from `.../assets` (asset
  name + one-line detail per Slice's own allowlisted projection — never a fabricated valuation
  rollup), footer with `source`/`asOf`. `PROFILE_NOT_PUBLIC`/`COLLECTOR_NOT_FOUND` per §17.
- **`/vault latest <type?> <assetId?>`** — public response. Embed: title "Recent vault activity", one
  line per event (event type, related asset if present, Discord relative timestamp `<t:unix:R>` per
  `COMMAND_CATALOGUE.md`'s timestamp convention — never a raw internal `sourceRef`), footer with
  `source`/`asOf` and page position. Shared pagination component if more than one page. Empty state per
  §17.
- **`/vault summary`** — public response. Single embed, no pagination: aggregate stats exactly as
  Slice's `GET /v1/vault/summary` returns them (counts/totals per Slice's own allowlisted shape — this
  document does not invent additional derived stats), footer with `source`/`asOf`.
- **`/profile <member?>`** — self-view (no `member` option, or `member` = the requester) is
  **ephemeral**; other-member view is **public**, matching `/collector view`'s own visibility, since a
  linked-and-public profile is, by definition, meant to be publicly visible (`COMMAND_CATALOGUE.md`'s
  `/profile` row: "ephemeral (self) / public (other)"). Layout otherwise reuses `/collector view`'s
  embed exactly (same fields, same footer convention) — this is the reuse pattern Document 009's
  `/portfolio` self-view is expected to follow structurally (see §1 Blocks). Not-linked and
  not-public states render per §17's specific copy, as a plain-text ephemeral message (self) or public
  message (other-member target) with no misleading partial data.
- **Pagination boundaries:** Previous disabled on page 1, Next disabled on the last page, matching
  `COMMAND_CATALOGUE.md`'s "Previous/Next buttons disabled at bounds" rule, reusing Document 003's
  shared pagination component wrapping Slice's cursor-based `{items, nextCursor, hasMore}` shape
  exactly as `BOT_ARCHITECTURE.md` specifies.
- **No DEMO-label footer is required on any embed in this document** — unlike market/asset data
  (Document 007), collector and vault reads carry no `dataStatus: DEMO` concept in Slice's Doc 008
  response shape; only the generic `source`/`asOf` footer applies, per `COMMAND_CATALOGUE.md`'s "every
  embed sourced from a live Slice API call carries a footer with the data's `asOf` timestamp and
  `source`" rule (a strict subset of the DEMO-labeling rule, not the same rule).

## 19. Implementation file plan

Proposed layout, consistent with `BOT_ARCHITECTURE.md`'s "one module per command family; no business
logic in the handler" convention (exact paths are illustrative — the real repository layout is
established by Document 001 and must be followed if it differs):

| File | Purpose |
|---|---|
| `src/commands/collector/search.ts` | `/collector search` command handler — input parsing, calls the application service, renders the paginated embed |
| `src/commands/collector/view.ts` | `/collector view` command handler |
| `src/commands/vault/latest.ts` | `/vault latest` command handler |
| `src/commands/vault/summary.ts` | `/vault summary` command handler |
| `src/commands/profile/profile.ts` | `/profile` command handler — resolves self vs. other-member target, delegates to the same application service as `/collector view` |
| `src/services/collectorService.ts` | Application service: validates input, calls the Slice API client's collector methods, applies the optional cache (§10) if provisioned, maps errors, builds response DTOs |
| `src/services/vaultService.ts` | Application service: same responsibilities for vault events/summary |
| `src/api/sliceClient.collectors.ts` | Typed methods added to Document 002's Slice API client: `getCollectors`, `getCollector`, `getCollectorAssets` |
| `src/api/sliceClient.vault.ts` | Typed methods added to Document 002's Slice API client: `getVaultEvents`, `getVaultSummary` |
| `src/ui/embeds/collectorEmbeds.ts` | Embed builders for collector search/view, using Document 003's shared embed-builder module |
| `src/ui/embeds/vaultEmbeds.ts` | Embed builders for vault latest/summary |
| `src/ui/embeds/profileEmbeds.ts` | Embed builder wrapping `collectorEmbeds.ts`'s view builder with the self/other ephemeral-vs-public and not-linked/not-public variants |
| `test/unit/collectorService.test.ts` | Unit tests per §21 |
| `test/unit/vaultService.test.ts` | Unit tests per §21 |
| `test/unit/profileService.test.ts` | Unit tests per §21 |
| `test/integration/collectorAndVaultCommands.test.ts` | Integration tests per §22 |
| `test/discord/collectorAndVaultInteractions.test.ts` | Discord interaction tests per §23 |

## 20. Numbered implementation steps

1. Confirm Document 002's Slice API client module interface and Document 003's command
   registry/pagination/embed-builder module interfaces are in their stated completed state; read
   both documents' own completion checklists before writing any code.
2. Add typed request/response DTOs for `GET /v1/collectors`, `GET /v1/collectors/:slug`, `GET
   /v1/collectors/:slug/assets`, `GET /v1/vault/events`, `GET /v1/vault/summary` to the shared
   contracts location Document 002 establishes.
3. Add the five typed client methods (`getCollectors`, `getCollector`, `getCollectorAssets`,
   `getVaultEvents`, `getVaultSummary`) to the Slice API client, using the bot's service-account
   credential per §14.
4. Implement `collectorService.ts` and `vaultService.ts`: input validation (query length, slug format,
   `type`/`assetId` filter validation, page/cursor validation), the optional cache read-through per
   §10 (or explicitly omit it, documenting that decision in the PR/commit if omitted), the
   error-mapping call into the shared middleware from Document 003, and response-DTO construction.
5. Register `/collector search`, `/collector view`, `/vault latest`, `/vault summary`, `/profile` in
   the command registry (Document 003), each with its exact options/permission/ephemeral-default from
   §12, and each deferring immediately per §18.
6. Implement the five command handlers, each calling only its application service — no direct Slice
   API client call and no business logic inside a command handler file, per `BOT_ARCHITECTURE.md`'s
   layering.
7. Implement `collectorEmbeds.ts` and `vaultEmbeds.ts` using the shared embed-builder module, including
   the `source`/`asOf` footer and pagination footer per §18.
8. Implement `profileEmbeds.ts` reusing `collectorEmbeds.ts`'s view-embed builder, adding only the
   self/other-member resolution and the not-linked/not-public branches per §17.
9. Implement `/profile`'s target resolution: no `member` option or `member` = requester → self-view
   path (resolve the requester's own linked slug via `GET /v1/me`, short-circuiting to the not-linked
   message per §17 if unresolvable, never calling `GET /v1/me` for an unlinked user with a fabricated
   identity); `member` = another guild member → other-view path (resolve that member's linked slug via
   whatever link-lookup mechanism Document 004/005/006 exposes, short-circuiting to the generic "not
   available" message per §17 if unresolvable or not public).
10. Wire every reachable `ERROR_CATALOGUE.md` row from §17 through the shared error-mapping middleware;
    confirm no code path in any of the five handlers can reach a raw exception string.
11. Write unit tests (§21), integration tests (§22), and Discord interaction tests (§23).
12. Run the verification commands (§25) and confirm the completion checklist (§26).

## 21. Unit tests

Against a fake, typed Slice API client (no network), per `TEST_STRATEGY.md`'s unit-test scope:

- `collectorService`: query/focus/page input validation (valid and invalid combinations); slug format
  validation for `/collector view`; correct DTO mapping from a sample `GET /v1/collectors` /
  `GET /v1/collectors/:slug` / `.../assets` response; correct error-code mapping for
  `COLLECTOR_NOT_FOUND`, `PROFILE_NOT_PUBLIC`, `RATE_LIMITED`, and an unrecognized error code; empty
  result-set handling (not routed as an error).
- `vaultService`: `type`/`assetId` filter validation; correct DTO mapping from a sample `GET
  /v1/vault/events` / `GET /v1/vault/summary` response, explicitly asserting `sourceRef` is never
  present in the mapped output DTO even if present in the raw fixture; empty result-set handling; same
  error-code mapping coverage as above.
- `profileService`/`profileEmbeds` resolution logic: self-view with no linked account → not-linked
  message, never a `GET /v1/me` call (assert the fake client records zero calls in this case); self-
  view with a linked, public profile → same DTO shape as `/collector view`; self-view with a linked,
  non-public profile → `PROFILE_NOT_PUBLIC`-equivalent branch, never bypassing `isPublic`; other-member
  view with an unlinked target and other-member view with a linked-but-private target both resolve to
  the identical generic "not available" message (assert message-string equality between the two cases,
  regression-testing the information-disclosure rule in §17).
- Optional-cache logic (if built): TTL expiry triggers a fresh Slice call; a Slice failure while a
  fresh call is in flight never falls back to serving an expired cache entry; cache key uniqueness
  across distinct query/focus/page or type/assetId/page combinations.
- Pagination math: page-boundary button disabling (Previous on page 1, Next on last page) against a
  fake `{items, nextCursor, hasMore}` fixture set, including a single-page (no pagination needed) case.
- Embed construction: footer always reflects the fixture's own `asOf`/`source` fields, never the local
  clock or cache fetch time.

## 22. Integration tests

Against a **disposable local Slice instance** (`TEST_STRATEGY.md` integration-test scope), exercising
this document's endpoints from `BOT_API_REQUIREMENTS.md`'s "already available" table:

- `/collector search` end-to-end against a seeded disposable Slice instance with a mix of public and
  non-public collector fixtures, asserting only public collectors are ever returned (this is Slice's
  own behavior being verified, not re-implemented bot-side — the bot must never additionally filter
  client-side in a way that could mask a Slice-side leak, but the integration test confirms Slice's
  `isPublic` filtering is actually honored end-to-end through the bot's client).
- `/collector view` against a public slug (success path) and a non-public slug (confirms
  `PROFILE_NOT_PUBLIC` surfaces correctly end-to-end, not just in the unit-test fake).
- `/vault latest` and `/vault summary` against seeded vault-event fixtures, confirming `sourceRef` is
  absent from the live Slice response's public projection (or, if present in the raw payload, is never
  forwarded into the bot's rendered embed — whichever is actually true of the disposable instance's
  behavior, verified rather than assumed).
- `/profile` self-view end-to-end against a disposable Slice instance with a real linked-account
  fixture (requires Document 004/005/006's linking mechanism to exist on that disposable instance;
  if those bot-only endpoints are not yet built when this document is implemented, this specific
  integration test is explicitly deferred and documented as blocked, not skipped silently — see §26).
- Rate-limit behavior: deliberately exceed Slice's documented rate limit against the disposable
  instance and confirm the bot surfaces the `RATE_LIMITED` friendly message with the correct
  `Retry-After` value read from Slice's response header, not a hardcoded number.

## 23. Discord interaction tests

Simulated interaction payloads run through the real interaction router and command handlers, without a
live Discord gateway connection (`TEST_STRATEGY.md`):

- Slash-command parsing for all five commands, including optional-argument omission (`/collector
  search` with no query, `/vault latest` with no filters, `/profile` with no member).
- Pagination button click simulation for `/collector search` and `/vault latest`, asserting the
  correct next page of results renders and button disabled-state updates correctly at both bounds.
- Ephemeral-flag assertion: `/collector search`, `/collector view`, `/vault latest`, `/vault summary`,
  and `/profile` (other-member target) all assert `ephemeral: false`; `/profile` (self, no member
  option) asserts `ephemeral: true`.
- `/profile` target-resolution branch coverage: no-option (self), explicit self-mention, another
  member who is linked+public, another member who is unlinked, another member who is linked+private —
  five distinct simulated interactions, asserting the exact response shape (embed vs. plain message,
  ephemeral flag, message copy) for each.
- Account-link-prompt button: simulate a self-view not-linked interaction, assert the response
  includes a component whose click triggers `/account link`'s entry point (per `COMMAND_CATALOGUE.md`'s
  "Account-link prompts" UI standard), without asserting anything about `/account link`'s own internal
  behavior (that belongs to Document 005's own test suite).

## 24. Manual QA checklist

Run by hand in a dev guild against a real (non-production) Slice environment, per `TEST_STRATEGY.md`'s
manual-QA section:

- [ ] `/collector search` with a query matching multiple public collectors — pagination works,
      Previous/Next disable correctly at bounds.
- [ ] `/collector search` with a query matching zero collectors — empty-state message shown, not an
      error embed.
- [ ] `/collector view <public-slug>` — full profile renders with correct fields and footer.
- [ ] `/collector view <non-public-slug>` — `PROFILE_NOT_PUBLIC` friendly message shown, no data
      leaked.
- [ ] `/collector view <nonexistent-slug>` — `COLLECTOR_NOT_FOUND` friendly message shown.
- [ ] `/vault latest` with no filters — recent events render with correct relative timestamps
      (`<t:unix:R>`), no `sourceRef` or any internal identifier visible anywhere in the embed.
- [ ] `/vault latest` with a `type` filter and with an `assetId` filter — results correctly scoped.
- [ ] `/vault summary` — aggregate stats render, footer shows correct `source`/`asOf`.
- [ ] `/profile` (self, account linked, profile public) — ephemeral, matches `/collector view` layout
      for the requester's own slug.
- [ ] `/profile` (self, account linked, profile not public) — ephemeral, correct not-public messaging,
      no data leaked beyond what a public viewer would see.
- [ ] `/profile` (self, account not linked) — ephemeral, correct not-linked messaging with a working
      `/account link` button.
- [ ] `/profile @otherMember` (linked, public) — public response, correct data.
- [ ] `/profile @otherMember` (linked, not public) — public response, generic "not available" message,
      confirmed to be textually identical to the unlinked case below.
- [ ] `/profile @otherMember` (not linked) — public response, generic "not available" message,
      confirmed to be textually identical to the not-public case above (grep the two transcript
      messages for equality).
- [ ] Rate-limit QA: deliberately trigger Slice's documented rate limit on `GET /v1/collectors` and
      confirm the bot surfaces the friendly message with correct `Retry-After`, not a raw 429.
- [ ] Error QA: deliberately trigger `COLLECTOR_NOT_FOUND`, `PROFILE_NOT_PUBLIC`, and an unrecognized
      error and confirm the exact mapped message from §17, never raw error text.
- [ ] Security QA: grep the test guild's message history and the bot's structured logs after a full
      pass through the above, confirming no Slice token, email address, or raw internal ID ever
      appears anywhere.

## 25. Verification commands

```
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run build
```

## 26. Completion checklist

Mirroring `MASTER_CHECKLIST.md`'s style, specific to this document — all boxes unchecked until the
work is actually done:

- [ ] `/collector search`, `/collector view`, `/vault latest`, `/vault summary`, `/profile` all
      registered in the command registry with the exact options/permissions/ephemeral defaults from §12.
- [ ] All five commands call only the application service layer from a command handler — no direct
      Slice API client call inside any command handler file.
- [ ] `/collector view` and `/profile` never expose a non-public profile to any requester other than
      that profile's own linked owner via self-view.
- [ ] `/profile` other-member view produces textually identical output for "unlinked target" and
      "linked-but-private target" (information-disclosure rule from §17).
- [ ] Every reachable `ERROR_CATALOGUE.md` row from §17 is mapped correctly; no raw exception, stack
      trace, or Slice response body ever reaches a user-facing message.
- [ ] `VaultPublicEvent.sourceRef` never appears in any rendered embed.
- [ ] No financial-performance field (win-rate, ROI, total invested, portfolio value) appears on any
      collector-profile embed.
- [ ] No insurance claim beyond the exact `insurance{status, insuredAmount?, expiresAt?}` shape appears
      on any vault-event embed.
- [ ] Every embed sourced from a live Slice call carries a `source`/`asOf` footer reflecting the Slice
      response's own fields, never the bot's local clock or cache fetch time.
- [ ] Optional cache (§10), if built, never serves stale-beyond-TTL data on a Slice failure, and is
      documented as either built or explicitly omitted.
- [ ] Unit tests (§21), integration tests (§22), and Discord interaction tests (§23) all pass.
- [ ] Manual QA checklist (§24) fully run in a dev guild against a non-production Slice environment,
      including the rate-limit, error, and security QA passes.
- [ ] Verification commands (§25) all pass with zero errors/warnings introduced by this document's code.
- [ ] `/profile` self-view's dependency on Document 004/005/006's delegated-token/link-resolution
      mechanism is explicitly confirmed available (or explicitly flagged as blocked, with the rest of
      this document's four public-only commands still shippable independently, since `/profile` is the
      only command in this document with any account-linking dependency).

## 27. Documentation updates

- Flip this document's row in `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md` from NOT STARTED to
  COMPLETE once the completion checklist (§26) is fully satisfied — not before.
- Update `CURRENT_STATE.md`'s "What happens next" section if this document closes before Document 007
  (Track B's two documents are parallel, not ordered relative to each other) to note which of the two
  closed first, since Document 015 depends on both.
- No change is needed to `BOT_API_REQUIREMENTS.md`, `BOT_ARCHITECTURE.md`, `BOT_SECURITY_MODEL.md`,
  `BOT_DATA_OWNERSHIP.md`, `PERMISSION_MATRIX.md`, `ERROR_CATALOGUE.md`, or `COMMAND_CATALOGUE.md`
  unless implementation reveals a factual correction to one of them (e.g., an endpoint response shape
  that differs from what was documented) — in that case, the correction is made to the specific
  top-level document, not silently absorbed into this one.

## 28. Final report format

The implementer's completion report for this document must include, in this order:

1. **Status:** COMPLETE or BLOCKED (with the specific blocking reason — most likely Document
   004/005/006's delegated-token mechanism not yet existing, affecting `/profile` self-view only).
2. **Commands delivered:** list of the five commands with a one-line confirmation each command was
   registered, tested, and manually QA'd.
3. **Deviations from this document:** any point where the actual implementation differs from §7–§20
   above, with the reason (e.g., a Slice response shape difference discovered during integration
   testing).
4. **Cache decision (§10):** whether the optional short-TTL cache was built, and if so, its final TTL
   and storage mechanism (in-process vs. shared Redis).
5. **Test results:** pass/fail summary for unit, integration, Discord-interaction, and manual QA, with
   a link/path to the actual test output.
6. **Completion checklist (§26):** the checklist reproduced with every box's final state.
7. **Documentation updates made:** confirmation of which files listed in §27 were actually updated.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
