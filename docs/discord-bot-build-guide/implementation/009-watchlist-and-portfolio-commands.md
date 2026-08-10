# 009 — Watchlist and portfolio commands

## 1. Metadata

- **Document number:** 009
- **Title:** Watchlist and portfolio commands
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 005 (Account-linking Discord commands), 006 (Permission and
  authorization integration)
- **Blocks (this build guide):** none directly. This document is a prerequisite *reference* for any
  future Phase 2+ `/portfolio` showcase work (P&L/ROI/diversification), which is gated on Slice Doc
  013 (NOT STARTED) and is not part of this build guide's 18 implementation documents.
- **Slice backend dependency:** Slice Doc 008 (VERIFIED) — watchlist and portfolio-read endpoints.
- **Can start today:** Blocked — this document cannot close until account linking (Implementation
  Documents 005 and 006) has closed, because every command in scope requires a linked Slice account
  and a working delegated-token-exchange path (BOT_API_REQUIREMENTS.md §2). Spec review of this
  document can happen in parallel with 005/006, but the code it describes cannot be implemented or
  merged before 005/006's own completion checklists are satisfied.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend. This Discord bot is a
**companion client to Slice** — it calls Slice's HTTP API (`BOT_ARCHITECTURE.md`), it never queries
Slice's Postgres/Prisma directly, it never duplicates a Slice business rule, and it never becomes a
second backend or a second source of truth for a user's data. Per `IMPLEMENTATION_ORDER.md`, this is
Implementation Document 009 in Track A (the track blocked on new Slice backend work for account
linking): 004 → 005 → 006 → **009** → 010 → 013. This document delivers the `/watchlist add`,
`/watchlist remove`, `/watchlist list`, and `/portfolio` commands, all self-only, all requiring a
linked account, all read/mutate against Slice's existing VERIFIED Doc 008 endpoints — no bot-owned
persistence is introduced. `/portfolio` in this document is strictly the **honest DEMO/UNAVAILABLE
state**; it never renders P&L, ROI, or diversification, because Slice's own `GET /v1/me/portfolio`
returns an `authority` field of `DEMO` or `UNAVAILABLE` today, with no live valuation authority in
production (BOT_API_REQUIREMENTS.md, BOT_PRODUCT_SPEC.md §4/§12).

## 3. Current implementation audit

Before this document starts, the following must already exist from prior implementation documents
(per their own completion checklists — this document does not re-verify their work, only assumes it
per `IMPLEMENTATION_ORDER.md`'s dependency graph):

- From 001–003: repository skeleton, Discord interaction framework, command registry, the shared
  embed-builder and paginator components (`BOT_ARCHITECTURE.md`).
- From 002: the typed Slice API client module, extended incrementally per document — at the start of
  this document it already supports the read-only "already available" endpoint set
  (`BOT_API_REQUIREMENTS.md`).
- From 004: the account-linking domain model and the bot-only service endpoints' client-side typed
  bindings (challenge/complete/unlink/lookup, and the token-exchange endpoint shape), whatever state
  those endpoints are actually in on the target Slice environment (full closure of 004 may still be
  pending Slice's own team — see 004's own status).
- From 005: `/account link`, `/account unlink`, `/account status` commands, and the account-link
  Discord UX (the button that runs `/account link` referenced throughout `COMMAND_CATALOGUE.md`'s UI
  standards).
- From 006: the permission/authorization integration layer — the fresh-per-interaction Slice
  permission/status check, and the delegated-token-exchange call path
  (`POST /v1/bot/tokens/exchange`, BOT_API_REQUIREMENTS.md §2) that lets a command act as the linked
  Slice user for a specific allowlisted scope.
- Nothing watchlist- or portfolio-specific exists yet. No `/watchlist *` or `/portfolio` command is
  registered, no watchlist/portfolio call is wired into the Slice API client, and no watchlist- or
  portfolio-shaped embed exists. This document creates all of that from the state left by 001–006.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. `OLD_BOT_FEATURE_INVENTORY.md`'s 31-row inventory
of the old Infria bot (a `discord.py 1.6.0` bot for an unrelated FiveM/GTA roleplay community) contains
no feature resembling a watchlist, a portfolio view, or any per-user asset-tracking concept of any
kind — its persisted domains are gangs/factions (`cogs/Gangs.py`), a Tebex donation store
(`cogs/Tebex.py`), tickets (`cogs/Tickets.py`), moderation (`cogs/Moderation.py`), verification
(`cogs/Verification.py`), giveaways (`cogs/Giveaways.py`), and a game-perk submission flow
(`cogs/Trailer.py`) — none of which map to watchlist or portfolio functionality. `project-state.json`
confirms zero rows in the old-bot inventory were tagged `REPLACE` for any Slice-specific capability;
watchlist and portfolio, like the rest of the Slice-relevant surface, are being designed fresh, not
migrated. This is stated honestly rather than forcing a mapping that isn't real.

## 5. Slice features supported

- **Watchlist** (Slice Doc 008, **VERIFIED**): `GET /v1/me/watchlist`,
  `PUT/DELETE /v1/me/watchlist/:assetId`. Per `BOT_PRODUCT_SPEC.md` §4, the mutating endpoints are
  naturally idempotent — a unique `(userId, assetId)` constraint means add-twice and remove-twice both
  no-op to success.
- **Portfolio read** (Slice Doc 008, **VERIFIED** as a read endpoint; the underlying valuation
  *authority* it depends on is **NOT STARTED** — Slice Doc 013): `GET /v1/me/portfolio?range`. Per
  `BOT_API_REQUIREMENTS.md`, this endpoint "always renders `authority: DEMO/UNAVAILABLE` honestly."
  There is no live portfolio valuation in Slice today. This document's `/portfolio` command surfaces
  exactly that honest state and nothing more.
- **Account linking / delegated authorization** (Implementation Documents 004–006, whose own Slice
  backend dependency is the new bot-only endpoints in `BOT_API_REQUIREMENTS.md` §1–3): required as a
  precondition for every command in this document's scope, since watchlist and portfolio are both
  self-scoped, user-token-authorized reads/mutations, never public data.

## 6. Files to read before starting

- `COMMAND_CATALOGUE.md` — the `/watchlist add`, `/watchlist remove`, `/watchlist list`, and
  `/portfolio` rows in full (options, permission, linked-account requirement, ephemeral/public,
  backend calls, rate limit, audit, idempotency, error cases), and the "UI standards" section at the
  bottom (account-link prompts, pagination, ephemeral defaults, disabled/unavailable-feature
  rendering).
- `BOT_API_REQUIREMENTS.md` — the "already available" table rows for
  `GET /v1/me/portfolio?range` and `GET /v1/me/watchlist`, `PUT/DELETE /v1/me/watchlist/:assetId`;
  §2 (bot-scoped delegated reads/writes, the `watchlist:read`, `watchlist:write`, `portfolio:read`
  scopes and the `POST /v1/bot/tokens/exchange` mechanism this document's commands depend on).
- `BOT_SECURITY_MODEL.md` §1 (account linking), §3 (custom-ID/ownership re-verification), §4 (bot
  token and Slice credential safety, specifically the user-scoped delegated-token requirement), §6
  (Discord role possession ≠ Slice permission).
- `BOT_DATA_OWNERSHIP.md` — the `Watchlist` and `Portfolio / ownership / finance / trading` rows,
  confirming both are Slice-authoritative with zero bot-side persistence.
- `PERMISSION_MATRIX.md` — the `/watchlist *`, `/notifications *`, `/portfolio` row.
- `ERROR_CATALOGUE.md` — every row, with particular attention to `PORTFOLIO_AUTHORITY_UNAVAILABLE`,
  `ASSET_NOT_FOUND`, `AUTHENTICATION_REQUIRED`/`ACCESS_TOKEN_EXPIRED`,
  `REFRESH_TOKEN_INVALID`/`REFRESH_TOKEN_REUSED`/`SESSION_REVOKED`, `RATE_LIMITED`,
  `IDEMPOTENCY_KEY_CONFLICT`/`REQUEST_IN_PROGRESS`.
- `BOT_PRODUCT_SPEC.md` §4 (Watchlist) and §12 plus the client-wishlist table's `/portfolio` and
  `#portfolio-showcase` rows — both state explicitly that the full showcase (P&L, ROI,
  diversification) is Phase 2+, gated on Slice Doc 013, and that Phase 1 ships only the honest
  unavailable-state version.
- `BOT_ARCHITECTURE.md` — the Slice API client conventions (auth attachment, `Idempotency-Key`
  generation, `Retry-After` handling), the shared pagination component, and the embed-builder module.
- `OLD_BOT_FEATURE_INVENTORY.md` — confirmed here (§4 above) to contain no watchlist/portfolio
  predecessor; read only to verify that absence, not for reusable behavior.
- `TEST_STRATEGY.md` — the unit/integration/Discord-interaction/manual-QA expectations this
  document's own test sections (21–24) must satisfy.
- Slice source/doc cross-reference: Slice's own backend build guide, Doc 008 (watchlist and
  portfolio-read implementation) and, for context only (not a dependency of this document), Doc 013
  (finance/portfolio authority, NOT STARTED) — confirming why `authority` can only be `DEMO` or
  `UNAVAILABLE` today.

## 7. Strict scope

- `/watchlist add <asset>` — adds one asset to the linked user's Slice watchlist via
  `PUT /v1/me/watchlist/:assetId`.
- `/watchlist remove <asset>` — removes one asset via `DELETE /v1/me/watchlist/:assetId`.
- `/watchlist list [page]` — paginated read of the linked user's watchlist via
  `GET /v1/me/watchlist`, using the shared cursor-based paginator component.
- `/portfolio` — reads `GET /v1/me/portfolio` and renders the response honestly: if `authority` is
  `DEMO`, the embed visibly labels every figure as demo/simulated data; if `authority` is
  `UNAVAILABLE` (including the `PORTFOLIO_AUTHORITY_UNAVAILABLE` error case), the embed shows a plain
  "portfolio tracking isn't live on Slice yet" message with no numeric fields at all.
- The account-link enforcement path shared by all four commands: an unlinked user invoking any of
  them receives the standard account-link prompt (short explanation + a button that runs
  `/account link` directly, per `COMMAND_CATALOGUE.md`'s UI standards) instead of any Slice API call.
- The Slice API client extensions needed to call the four endpoints above (typed request/response
  models, delegated-token-exchange usage for the `watchlist:read`, `watchlist:write`,
  `portfolio:read` scopes).
- Deterministic `Idempotency-Key` derivation for the two mutating calls (`/watchlist add`,
  `/watchlist remove`).
- Error mapping for every `ERROR_CATALOGUE.md` row reachable from these four commands, including the
  watchlist-specific "not in watchlist" no-op-success case and the portfolio-specific
  `PORTFOLIO_AUTHORITY_UNAVAILABLE` honest-state case.
- Unit, integration, and Discord-interaction tests, and a manual QA checklist, scoped to these four
  commands only.

## 8. Out of scope

- Any P&L, ROI, cost-basis, gain/loss, or diversification display on `/portfolio` — explicitly
  Phase 2+, gated on Slice Doc 013 (NOT STARTED), per `COMMAND_CATALOGUE.md`'s Phase 2+ table and
  `BOT_PRODUCT_SPEC.md`'s client-wishlist row for `#portfolio-showcase`. This document does not
  render, estimate, or stub any of these fields, even behind a "coming soon" label — the entire
  Phase-2 numeric surface simply does not exist in this document's embeds.
- Watchlist **price alerts** or any push/notify-on-price-move behavior — that is
  `/notifications *` (Implementation Document 010) and the `price-alert-poll` job
  (`EVENT_AND_JOB_CATALOGUE.md`), not this document.
- Any market-data command (`/asset search`, `/asset view`, `/market movers`) — those are
  Implementation Document 007's scope; this document only references an asset by ID/slug as an
  autocomplete/option input, it does not implement asset search or asset detail rendering.
- Collector/profile commands (`/collector search`, `/collector view`, `/profile`) —
  Implementation Document 008.
- Account linking/unlinking/status itself — Implementation Document 005; this document only consumes
  the linked-account state 005 produces.
- The delegated-token-exchange mechanism's own implementation — Implementation Document 006; this
  document only calls it for the `watchlist:read`, `watchlist:write`, and `portfolio:read` scopes,
  it does not build the exchange endpoint's client plumbing from scratch.
- Any bot-owned persistence for watchlist or portfolio data — per `BOT_DATA_OWNERSHIP.md`, both
  remain 100% Slice-authoritative; this document introduces zero new bot-side tables.
- Admin-facing portfolio/watchlist lookups for support purposes — not in `COMMAND_CATALOGUE.md`'s
  admin command set (`/admin audit`, `/admin status-history`, `/admin link-lookup`), and not added
  here.
- Any push notification of watchlist or portfolio changes to Discord — blocked on Slice Doc 017 and
  a new `DISCORD` channel type per `BOT_API_REQUIREMENTS.md` §4, out of scope for every document in
  this build guide's Phase 1.

## 9. Dependencies

- No new runtime/library dependency beyond what Implementation Documents 001–003 already introduced
  (discord.js v14+, the typed Slice API client, the shared pagination and embed-builder components,
  BullMQ is not needed by this document since it introduces no scheduled job).
- Depends at runtime on the delegated-token-exchange service call
  (`POST /v1/bot/tokens/exchange`, BOT_API_REQUIREMENTS.md §2) built out by Implementation Document
  006 — this is a genuinely new pattern for Slice and, per that section, requires the Slice backend
  team's explicit design sign-off; this document assumes 006 has already secured that sign-off and
  shipped a working exchange call, it does not re-negotiate the mechanism.
- Depends on Slice Doc 008's watchlist and portfolio-read endpoints being reachable on whatever Slice
  environment the bot is pointed at (dev/staging/production) — VERIFIED in Slice's own backend build
  guide, but still a live network dependency at both integration-test and runtime.

## 10. Bot-owned persistence

None. Per `BOT_DATA_OWNERSHIP.md`, watchlist and portfolio are both rows in the table where
"Authority" is Slice (and, for portfolio, explicitly "Slice (once built)" with the bot holding "zero
authority over any of it"). This document's commands are pure pass-through: every read hits
`GET /v1/me/watchlist` or `GET /v1/me/portfolio` fresh, every mutation hits
`PUT`/`DELETE /v1/me/watchlist/:assetId` fresh, and no response is cached in a bot-owned store beyond
the transient, short-TTL Discord interaction state (pagination cursor held in-memory/in-component for
the lifetime of a single paginated message) that `BOT_DATA_OWNERSHIP.md` already classifies as
bot-owned, ephemeral, and never a system of record.

## 11. Slice API dependencies

| Endpoint | Method | Tag (per BOT_API_REQUIREMENTS.md) | Used by |
|---|---|---|---|
| `GET /v1/me/watchlist` | GET | Already available (VERIFIED) | `/watchlist list` |
| `PUT /v1/me/watchlist/:assetId` | PUT | Already available (VERIFIED), idempotent mutation | `/watchlist add` |
| `DELETE /v1/me/watchlist/:assetId` | DELETE | Already available (VERIFIED), idempotent mutation | `/watchlist remove` |
| `GET /v1/me/portfolio?range` | GET | Already available (VERIFIED as a read; underlying valuation authority NOT STARTED — always returns `authority: DEMO/UNAVAILABLE`) | `/portfolio` |
| `POST /v1/bot/tokens/exchange` | POST | Bot-only service endpoint, proposed/not yet built independently of this document — built by Implementation Document 006. Scopes consumed here: `watchlist:read`, `watchlist:write`, `portfolio:read` | All four commands, to obtain the short-lived user-scoped token before calling the endpoints above |
| `GET /v1/me` | GET | Already available (VERIFIED) | Fresh account-status re-check before any mutation, per `BOT_SECURITY_MODEL.md` §6/§7 (never trust a cached "linked and active" state for a mutating command) |

No new endpoint is proposed by this document. Every endpoint above is either already specified in
`BOT_API_REQUIREMENTS.md`'s "already available" table or is the token-exchange endpoint whose
existence this document depends on but does not itself design (Implementation Document 006's scope).

## 12. Commands / events / jobs delivered

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases |
|---|---|---|---|---|---|---|---|---|---|---|
| `/watchlist add` | Add asset to watchlist | `asset` | any member | yes | ephemeral | `PUT /v1/me/watchlist/:assetId` | standard | optional | required | asset not found |
| `/watchlist remove` | Remove asset | `asset` | any member | yes | ephemeral | `DELETE /v1/me/watchlist/:assetId` | standard | optional | required | not in watchlist (no-op success) |
| `/watchlist list` | Paginated watchlist | `page` | any member | yes | ephemeral | `GET /v1/me/watchlist` | standard | n/a | n/a | empty list |
| `/portfolio` | Portfolio (honest DEMO/UNAVAILABLE) | — | any member | yes | ephemeral | `GET /v1/me/portfolio` | standard | n/a | n/a | `PORTFOLIO_AUTHORITY_UNAVAILABLE` → friendly "not available yet" |

(Table reproduced from `COMMAND_CATALOGUE.md`, filtered to this document's scope. No event or
scheduled job is delivered by this document — `EVENT_AND_JOB_CATALOGUE.md` lists no watchlist/
portfolio job in Phase 1; watchlist-driven alerting is `price-alert-poll`, owned by a different
feature area and out of this document's scope per §8 above.)

## 13. Permission rules

Per `PERMISSION_MATRIX.md`'s row for `/watchlist *`, `/notifications *`, `/portfolio`: the
Discord-side gate is "any member" (no special Discord role required to invoke the command), and the
Slice-side gate is "self-token via delegated exchange (BOT_API_REQUIREMENTS.md §2), requires linked
account." Concretely for this document:

- The Discord-side check is purely "is this a recognized, current Discord interaction" — no Discord
  role/permission requirement gates any of the four commands.
- The Slice-side check is the actual authorization boundary: the command handler must hold a valid
  linked-account mapping (Implementation Document 005) and must successfully complete a
  delegated-token exchange scoped to exactly the operation being performed
  (`watchlist:read`/`watchlist:write`/`portfolio:read`) before calling the underlying endpoint. A
  missing or invalid link, or a failed/expired exchange, results in the account-link prompt or the
  session-refresh error message (§17), never a silent fallback to any other authority.
- Per `PERMISSION_MATRIX.md`'s stated rule and `BOT_SECURITY_MODEL.md` §6: a Discord role check is
  always a gate, never a substitute for the corresponding Slice-side check. None of these four
  commands has a Discord role gate to begin with, so the Slice-side self-token check is the *only*
  authorization boundary in play — it must never be skipped, cached beyond a single interaction, or
  inferred from the user simply having previously linked their account.
- These commands never accept a `member` option to view someone else's watchlist or portfolio — they
  are self-only in every case (unlike `/profile`, which has an explicit other-member view mode per
  `COMMAND_CATALOGUE.md`; watchlist and portfolio have no such mode because that data is private).

## 14. Security requirements

Cited from `BOT_SECURITY_MODEL.md`:

- **§1 (Account linking):** every one of these four commands first confirms a valid, current
  Discord↔Slice link exists. The bot never trusts a client-supplied Discord ID — it always uses the
  ID Discord itself attaches to the interaction object (§1) when resolving the linked account.
- **§3 (Interaction/custom-ID integrity):** `/watchlist list`'s pagination buttons use opaque,
  bot-generated custom IDs (never a raw Slice user ID or asset ID exposed as a guessable value); every
  button handler re-verifies that the interacting Discord user matches the resource owner before
  acting on a Previous/Next click, since a forged or replayed custom-ID payload must not be able to
  page through a different user's watchlist.
- **§4 (Credential safety):** watchlist/portfolio calls use the **user-scoped** delegated token
  obtained via `POST /v1/bot/tokens/exchange` (§2 of BOT_API_REQUIREMENTS.md), never the bot's
  service-account credential — these are private, per-user reads/mutations, not public catalogue
  data. The exchanged token is short-lived (≤5 minutes per its spec), used only for the single call
  it was requested for, and never persisted to any bot-owned store, log line, embed, or custom ID.
- **§5 (Idempotency/rate limits/audit):** both mutating calls carry a deterministic
  `Idempotency-Key`; Slice's own rate limiting and `Retry-After` are honored without local retry
  storms; every Slice-side mutation is already audited by Slice itself, and the bot additionally logs
  its own local correlation entry (Discord user ID, command, outcome, Slice request ID) without
  duplicating Slice's audit record.
- **§6 (Role possession ≠ permission):** no Discord role is ever treated as proof that a user is
  entitled to see or mutate a particular Slice account's watchlist/portfolio — the only proof is a
  successful, fresh delegated-token exchange tied to that Discord user's own linked Slice account.
- **§10 (Logging redaction / PII):** no watchlist asset list, portfolio figure, or the exchanged token
  itself is ever written to a structured log at anything beyond a redacted/summary level (e.g.,
  "watchlist add succeeded for discordUserId=X, assetId=Y" — never the token, never a raw response
  body dump). No email address or session identifier appears in any embed these commands produce.

## 15. Idempotency and rate limits

- **`/watchlist add`:** `Idempotency-Key` derived per `BOT_ARCHITECTURE.md`'s convention —
  `(discordUserId, command="watchlist.add", targetResourceId=assetId, nonce)` — where `nonce` is
  fixed for a single logical user intent (i.e., a duplicate Discord-gateway delivery or an accidental
  double-click of a retry button reuses the same key; an explicit new invocation of `/watchlist add`
  for the same asset after a prior success is expected to no-op to success per Slice's own
  `(userId, assetId)` uniqueness, not to be treated as a conflict). This mirrors `BOT_PRODUCT_SPEC.md`
  §4's stated design: no client-side idempotency key is strictly required beyond what Slice's own
  unique constraint already guarantees, but the bot still passes the header on every mutation per
  the architecture's standing convention.
- **`/watchlist remove`:** same derivation with `command="watchlist.remove"`. A remove of an asset
  not currently on the watchlist is a no-op success (per `COMMAND_CATALOGUE.md`'s stated error case
  for this command), not an error — the embed still confirms "removed" language consistent with the
  user's intent rather than surfacing a confusing "not found."
- **`/watchlist list` and `/portfolio`:** read-only, no idempotency key required (n/a per
  `COMMAND_CATALOGUE.md`'s table).
- **Rate limits:** all four commands use Slice's "standard" rate limit tier (no elevated or reduced
  limit called out for this command family in `BOT_API_REQUIREMENTS.md`'s "already available" table).
  The bot's local pre-check (BOT_ARCHITECTURE.md) avoids calling Slice at all for a request the bot
  can already tell is throttled from a recent `Retry-After` value; on a live `RATE_LIMITED` (429)
  response the bot surfaces the standard rate-limit message (§17) reading Slice's `Retry-After`
  header, and never auto-retries a mutating call that returned `IDEMPOTENCY_KEY_CONFLICT` /
  `REQUEST_IN_PROGRESS` (409).

## 16. Audit requirements

- Watchlist mutations (`/watchlist add`, `/watchlist remove`) are tagged **optional** audit per
  `COMMAND_CATALOGUE.md` — Slice's own API call is the authoritative record if Slice chooses to write
  one for these endpoints (per Doc 008); the bot does not require or assume a Slice `AuditEvent` row
  exists for every watchlist mutation, but if Slice returns one, the bot correlates via the returned
  Slice request ID.
- Watchlist reads (`/watchlist list`) and the portfolio read (`/portfolio`) are **n/a** for audit —
  reads are not separately audited per `COMMAND_CATALOGUE.md`'s table, consistent with
  `BOT_SECURITY_MODEL.md` §5's framing that Slice-side audit applies to mutations.
- Regardless of Slice-side audit status, the bot's own **operational log** (not a competing audit
  record, per `BOT_DATA_OWNERSHIP.md`'s "Audit events" row and `BOT_SECURITY_MODEL.md` §5) records,
  for every invocation of these four commands: Discord user ID, guild ID, command name and relevant
  option (asset ID for add/remove; page for list), outcome (success/error code), latency, and the
  Slice request ID if one was returned — enabling correlation without duplicating Slice's own audit
  trail as a second source of truth.
- No watchlist asset list or portfolio figure is itself treated as an audit payload — the operational
  log records that an action happened and its outcome, not a full dump of the returned data.

## 17. Error behavior

Cited from `ERROR_CATALOGUE.md`, filtered to the codes reachable from this document's four commands:

| Slice error code | HTTP | Discord-facing message | Applies to |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | "That input doesn't look right — check the details and try again." | `/watchlist add`/`remove` with a malformed asset reference |
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | 401 | "Your linked session needs refreshing — try again in a moment." | All four (delegated-token expiry mid-flow); bot silently retries the delegated-token exchange once (GET only, never a mutation) before showing this |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | 401 | "Your Slice link needs to be re-established — run `/account link`." | All four, if the underlying link itself is no longer valid |
| `ACCOUNT_RESTRICTED` | 403 | "This action isn't available on your account right now. Contact support if you think that's wrong." | `/watchlist add`/`remove` if the linked account is restricted |
| `ASSET_NOT_FOUND` | 404 | "Couldn't find that — double check and try again." | `/watchlist add` (and `/watchlist remove` for an asset ID that no longer resolves) |
| `PORTFOLIO_AUTHORITY_UNAVAILABLE` | 503 | "Portfolio tracking isn't live on Slice yet — hang tight." | `/portfolio` — this is the **expected, default** response today, never shown as a generic error |
| `IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS` | 409 | "That's already being processed — give it a second." | `/watchlist add`/`remove` on a rapid double-submit |
| `RATE_LIMITED` | 429 | "You're doing that too fast — try again in {Retry-After}s." | All four |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | 503 | "Slice is having a moment — try again shortly." | All four, retried once automatically for the GET-only calls (`list`, `/portfolio`) per `BOT_ARCHITECTURE.md`, never retried for the mutating calls |
| Unrecognized/unexpected error | any | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | All four, fallback branch only; full detail logged server-side only |

Document-specific error cases not already covered verbatim in `ERROR_CATALOGUE.md`:

- **`/watchlist remove` on an asset not currently on the watchlist:** per `COMMAND_CATALOGUE.md`'s
  stated error case, this is a **no-op success**, not a 404 — Slice's `DELETE` is idempotent by
  design (unique `(userId, assetId)` constraint). The embed confirms removal-intent success language
  (e.g., "That asset isn't on your watchlist — nothing to remove.") rather than any error styling.
- **`/watchlist list` on an empty watchlist:** not an error — a plain "Your watchlist is empty. Use
  `/watchlist add` to start tracking an asset." embed, ephemeral, no pagination controls shown.
- **Unlinked-account case for any of the four commands:** not a Slice error at all — the bot detects
  "no linked account" locally (via 005/006's linked-account check) before ever calling Slice, and
  responds with the standard account-link prompt (§18) instead of surfacing any `ERROR_CATALOGUE.md`
  row.

All error responses follow the catalogue's stated rule: never echo the raw Slice error body, stack
trace, or internal identifier; the generic/unrecognized branch never interpolates a raw exception
object into the user-facing string (the specific bug this rule was written to prevent, per
`OLD_TO_NEW_MIGRATION_MATRIX.md` M6, referenced in `ERROR_CATALOGUE.md`'s closing rule).

## 18. Interaction UX

**`/watchlist add <asset>`**
- Options: `asset` (required) — an autocomplete-backed reference to a Slice asset (slug or ID; the
  autocomplete source itself is Implementation Document 007's `/asset search` data, consumed here
  read-only as an input helper, not re-implemented).
- Defers immediately (respecting Discord's 3-second ack window), then calls the Slice endpoint.
- On success: ephemeral embed, "Added to your watchlist" with the asset's name/slug, a footer with
  `asOf`/`source` if the underlying asset row is itself DEMO-priced, matching `COMMAND_CATALOGUE.md`'s
  UI standard that every embed sourced from a live Slice call carries a `source`/`asOf` footer.
- On `ASSET_NOT_FOUND`: ephemeral, friendly not-found message (§17), no partial embed.

**`/watchlist remove <asset>`**
- Same `asset` option and defer pattern.
- On success (including the not-on-watchlist no-op case): ephemeral embed confirming the asset is not
  on the watchlist, phrased identically whether it was actually removed or already absent (per
  §17 above) — the user-visible outcome ("it's not on your watchlist now") is the same either way,
  since Slice's response does not need to be interpreted differently to the end user.

**`/watchlist list [page]`**
- Optional `page` option (defaults to first page); uses the shared button-based paginator component
  (`BOT_ARCHITECTURE.md`) wrapping Slice's cursor-based `{items, nextCursor, hasMore}` shape.
- Ephemeral embed: one line per watchlisted asset (name, slug, and its own `dataStatus`/`asOf` if the
  API includes valuation context per asset — never a bare unlabeled price), Previous/Next buttons
  disabled at bounds, page position shown in the footer per `COMMAND_CATALOGUE.md`'s stated
  pagination standard.
- On an empty watchlist: no pagination controls, single "empty" message (§17).

**`/portfolio`**
- No options.
- Defers immediately, then calls `GET /v1/me/portfolio`.
- If `authority: "DEMO"`: ephemeral embed with a **visibly distinct neutral/warning color** (per
  `COMMAND_CATALOGUE.md`'s UI standards — "a distinct neutral/warning color for caveated data (DEMO
  labels)") and a prominent "DEMO DATA" label on every figure shown, with the response's own
  `asOf`/`source` footer. This document does not enumerate specific DEMO figures beyond what Slice's
  own response includes, since the exact DEMO payload shape belongs to Slice Doc 008/013's own
  contract, not this document's invention — the rendering rule is: whatever numeric fields Slice
  returns under `authority: DEMO`, every one of them is labeled, never presented as bare numbers.
- If `authority: "UNAVAILABLE"` (or the `PORTFOLIO_AUTHORITY_UNAVAILABLE` error is returned):
  ephemeral embed, plain-text "Portfolio tracking isn't live on Slice yet — hang tight." message,
  **no numeric fields, no chart, no placeholder zeroes** — a true disabled/unavailable state per
  `COMMAND_CATALOGUE.md`'s UI standard ("rendered as a visibly disabled button or a plain-text 'not
  available yet' message with the reason ... never a silently missing feature or a broken
  click-through").
- This command never shows P&L, ROI, gain/loss, or diversification in any form, per §8 above — there
  is no hidden/disabled UI affordance for these fields either, since surfacing even a disabled button
  for a Phase-2 capability risks implying it exists sooner than Slice Doc 013 ships.

**Account-link prompt (shared by all four commands, unlinked-user path)**
- Per `COMMAND_CATALOGUE.md`'s UI standards: a short ephemeral explanation ("You'll need to link your
  Slice account to use this.") plus a button that runs `/account link` directly — the exact prompt
  component Implementation Document 005 builds; this document reuses it verbatim, it does not define
  a second copy of the same UX.

## 19. Implementation file plan

(Proposed layout only — file/module boundaries an implementer follows; no code is written by this
document.)

| File | Purpose |
|---|---|
| `src/commands/watchlist/add.ts` | `/watchlist add` handler: input validation, linked-account/permission pre-check, calls the watchlist service, builds the response embed |
| `src/commands/watchlist/remove.ts` | `/watchlist remove` handler, same shape as `add.ts` |
| `src/commands/watchlist/list.ts` | `/watchlist list` handler, wires the shared paginator to `GET /v1/me/watchlist` |
| `src/commands/portfolio/view.ts` | `/portfolio` handler: calls the portfolio service, branches on `authority`/error code to the DEMO vs. UNAVAILABLE embed |
| `src/services/watchlistService.ts` | Application-service layer: orchestrates delegated-token exchange + the Slice API client calls for watchlist add/remove/list, derives the `Idempotency-Key` for mutations |
| `src/services/portfolioService.ts` | Application-service layer: orchestrates delegated-token exchange + the Slice API client call for portfolio read, normalizes the `DEMO`/`UNAVAILABLE` branches into a typed view-model the command handler renders |
| `src/api/slice/watchlist.ts` | Slice API client module extension: typed bindings for `GET /v1/me/watchlist`, `PUT/DELETE /v1/me/watchlist/:assetId` |
| `src/api/slice/portfolio.ts` | Slice API client module extension: typed binding for `GET /v1/me/portfolio?range` |
| `src/embeds/watchlistEmbeds.ts` | Embed builders for add-success, remove-success/no-op, list-page, empty-list |
| `src/embeds/portfolioEmbeds.ts` | Embed builders for the DEMO-labeled state and the UNAVAILABLE state — two builders only, no third "full showcase" builder exists in this file |
| `test/unit/commands/watchlist.*.test.ts` | Unit tests per §21 |
| `test/unit/commands/portfolio.test.ts` | Unit tests per §21 |
| `test/integration/watchlistAndPortfolio.test.ts` | Integration tests per §22 |
| `test/discord-interaction/watchlistAndPortfolio.test.ts` | Interaction-simulation tests per §23 |

## 20. Numbered implementation steps

1. Confirm Implementation Documents 005 and 006 have closed against their own completion checklists
   in the target environment (linked-account state and delegated-token-exchange call path both
   working end-to-end) before starting any code in this document.
2. Add the typed Slice API client bindings for `GET /v1/me/watchlist`,
   `PUT/DELETE /v1/me/watchlist/:assetId`, and `GET /v1/me/portfolio?range`, matching Slice Doc 008's
   response DTOs exactly (no bot-invented field).
3. Implement `watchlistService.ts`: given a Discord user ID, resolve the linked Slice account (via
   005's linked-account lookup), request a `watchlist:read` or `watchlist:write` scoped token via
   `POST /v1/bot/tokens/exchange`, call the target endpoint, and return a typed result or a typed
   error.
4. Implement `portfolioService.ts` the same way for `portfolio:read`, additionally normalizing the
   response into a `{state: "DEMO", figures: ...}` or `{state: "UNAVAILABLE"}` view-model — no other
   state is representable in this type.
5. Derive the `Idempotency-Key` generation helper for watchlist mutations per §15, and unit-test its
   determinism before wiring it into the service layer.
6. Register the four slash commands (`/watchlist add`, `/watchlist remove`, `/watchlist list`,
   `/portfolio`) in the command registry from Implementation Document 003, each declaring: linked
   account required = true, ephemeral default = true, no Discord permission requirement.
7. Implement the shared "linked-account pre-check → account-link prompt" gate as a single reusable
   guard function called by all four command handlers (do not duplicate the check four times).
8. Implement `add.ts`/`remove.ts` handlers: defer, run the pre-check, call `watchlistService`, map the
   result/error to the corresponding embed builder from `watchlistEmbeds.ts`.
9. Implement `list.ts`: defer, run the pre-check, wire the shared paginator component to
   `watchlistService`'s list call, handling the empty-list case explicitly.
10. Implement `portfolio/view.ts`: defer, run the pre-check, call `portfolioService`, branch strictly
    on the normalized `state` value to the DEMO or UNAVAILABLE embed builder — assert at the type
    level that no third branch is reachable.
11. Wire error mapping for every code in §17's table into the shared error-handling layer
    (`BOT_ARCHITECTURE.md`'s error-mapping module), adding only the document-specific cases not
    already generically handled.
12. Write unit tests (§21), integration tests (§22), and Discord-interaction tests (§23).
13. Run the verification commands (§25) and fix any failure before proceeding.
14. Walk the manual QA checklist (§24) in a real dev guild against a non-production Slice environment.
15. Update the documentation cross-references listed in §27.
16. Stop per §29 — do not begin Implementation Document 010 or any other document as part of closing
    this one.

## 21. Unit tests

- `Idempotency-Key` derivation for `/watchlist add` and `/watchlist remove`: same logical intent
  (same Discord user, same asset, same action, no explicit user-initiated retry) always produces the
  same key; an explicit retry-after-error produces a new key; two different assets or two different
  actions never collide.
- Error-mapping unit tests covering every row in §17's table: given a simulated Slice error code, the
  handler produces the exact expected Discord-facing copy, and never interpolates the raw error
  object into the message.
- `/watchlist remove` no-op-success formatting: given a simulated "not currently on watchlist"
  response, the embed renders the same success-styled copy as an actual removal, not an error style.
- `/watchlist list` pagination math: given a simulated `{items, nextCursor, hasMore}` payload,
  Previous/Next button disabled-state and footer page text are computed correctly at both bounds and
  mid-list.
- `/watchlist list` empty-state: given zero items, no pagination controls are attached to the embed.
- `/portfolio` view-model normalization: given `authority: "DEMO"` with sample figures, the DEMO
  branch is selected and every figure carries the DEMO label; given `authority: "UNAVAILABLE"` or a
  `PORTFOLIO_AUTHORITY_UNAVAILABLE` error, the UNAVAILABLE branch is selected and the resulting
  embed-input contains zero numeric fields.
- Linked-account pre-check guard: given no linked account, all four command handlers short-circuit to
  the account-link prompt without ever invoking the Slice API client (asserted via a call-count of
  zero on the fake client).
- Permission/authorization unit tests confirming no Discord role/permission object is read by any of
  these four handlers (there is none to check, per §13 — asserted as an explicit negative test so a
  future change can't silently add one without updating `PERMISSION_MATRIX.md`).

## 22. Integration tests

- Against a disposable local Slice instance (mirroring Slice's own Doc 002 pattern, per
  `TEST_STRATEGY.md`): full `/watchlist add` → `GET /v1/me/watchlist` shows the asset → `/watchlist
  remove` → `GET /v1/me/watchlist` no longer shows it, exercised through the real command handlers
  and the real (non-fake) Slice API client.
- Idempotency: issuing the same `/watchlist add` twice against the disposable instance results in one
  logical watchlist entry (Slice's own unique constraint enforced), and the bot surfaces the same
  success embed both times, not an error on the second call.
- `/watchlist remove` against an asset never added: real 200/no-op response from the disposable
  instance renders the no-op-success embed, not an error.
- `/portfolio` against the disposable instance's real (today always DEMO/UNAVAILABLE) response:
  asserts the actual returned `authority` value drives the branch, not a bot-side assumption.
- Delegated-token-exchange path: once the bot-only endpoints (§1–3 of `BOT_API_REQUIREMENTS.md`)
  exist on the disposable instance (dependent on Implementation Document 006's own closure), the full
  link → token-exchange → watchlist-mutation path is exercised end-to-end, per `TEST_STRATEGY.md`'s
  stated integration scope.
- Rate-limit integration test: deliberately exceed the standard rate limit against the disposable
  instance and confirm the bot surfaces the friendly rate-limit message with the correct
  `Retry-After` value read from the real response header.
- Error-injection integration tests for `ASSET_NOT_FOUND` (watchlist add against a non-existent
  asset ID) and `PORTFOLIO_AUTHORITY_UNAVAILABLE` (the disposable instance's default portfolio
  response) confirming the exact catalogue copy is produced end-to-end, not just at the unit level.

## 23. Discord interaction tests

- Simulated slash-command payloads for `/watchlist add`, `/watchlist remove`, `/watchlist list`, and
  `/portfolio` run through the real interaction router and command handlers (discord.js
  interaction-simulation tooling, no live gateway connection), asserting: ephemeral flag is always
  `true` for all four, embed field shape matches the relevant builder, and the command defers within
  the simulated 3-second window before any Slice call.
- Simulated button-click payloads for `/watchlist list`'s Previous/Next pagination, asserting: correct
  page is rendered, disabled-state at bounds is reflected in the actual component payload (not just
  computed in isolation as in §21), and a forged custom ID referencing a different Discord user's
  paginator state is rejected (per `BOT_SECURITY_MODEL.md` §3's ownership re-verification rule).
- Simulated account-link-prompt button click (unlinked-user path) for each of the four commands,
  asserting it correctly triggers the `/account link` flow built in Implementation Document 005, not
  a bot-owned duplicate of that flow.
- Simulated interaction with a stale/expired delegated token, asserting the single silent GET-retry
  behavior (for `/watchlist list` and `/portfolio` only) versus the no-retry behavior for the two
  mutating commands, per §17's table.

## 24. Manual QA checklist

- [ ] `/watchlist add` on a real (non-production) Slice environment, linked account: asset appears in
      `/watchlist list` immediately after.
- [ ] `/watchlist add` on an asset already on the watchlist: succeeds with the same success copy, no
      duplicate entry created (verify via `/watchlist list`).
- [ ] `/watchlist remove` on a present asset: removed, confirmed via `/watchlist list`.
- [ ] `/watchlist remove` on an absent asset: no-op success copy shown, no error styling.
- [ ] `/watchlist list` with zero, one, and more-than-one-page of entries: empty state, single-page
      state, and pagination Previous/Next behavior (including disabled state at both bounds) all
      correct.
- [ ] `/portfolio` on the real test environment: confirm the actual returned `authority` (expected
      `DEMO` or `UNAVAILABLE` today) renders the corresponding honest embed, with **no P&L/ROI/
      diversification field visible anywhere**, and no numeric field appears if `UNAVAILABLE`.
- [ ] All four commands, unlinked account: confirm the account-link prompt (explanation + working
      `/account link` button) appears instead of any Slice call being attempted (verify via request
      logs — zero outbound calls for the target endpoints).
- [ ] Rate-limit QA: deliberately trigger Slice's documented rate limit on the watchlist mutation
      endpoints and confirm the friendly message with correct `Retry-After`, not a raw 429.
- [ ] Error QA: deliberately request `/watchlist add` on a non-existent asset ID and confirm the exact
      catalogue copy, no raw error text.
- [ ] Security QA: after a full pass through all four commands, grep the bot's structured logs and the
      test guild's message/embed history for any Slice access/refresh token, the exchanged delegated
      token, or a raw email address — confirm none appear anywhere.
- [ ] Confirm every embed sourced from a live Slice call in this document's commands carries the
      `asOf`/`source` footer per `COMMAND_CATALOGUE.md`'s UI standard.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run build
```

## 26. Completion checklist

- [ ] `/watchlist add`, `/watchlist remove`, `/watchlist list`, `/portfolio` all implemented per §7's
      strict scope, nothing from §8's out-of-scope list included.
- [ ] No bot-owned persistence introduced (§10 confirmed by code review — no new table/model/migration
      exists anywhere in this document's file set).
- [ ] Every Slice API call in §11's table uses the delegated-token-exchange path for the correct scope,
      never the bot's service-account credential.
- [ ] Every mutating call carries a deterministic `Idempotency-Key` per §15.
- [ ] Every error code in §17's table is mapped and unit/integration tested; no raw Slice error text,
      stack trace, or internal identifier appears in any user-facing string.
- [ ] `/portfolio` renders only the DEMO-labeled or UNAVAILABLE state — code review confirms no
      P&L/ROI/diversification field, computation, or hidden/disabled UI affordance exists anywhere in
      `portfolioEmbeds.ts` or `portfolioService.ts`.
- [ ] Unlinked-account path verified to short-circuit before any Slice call, for all four commands.
- [ ] Unit tests (§21), integration tests (§22), and Discord-interaction tests (§23) all pass.
- [ ] Manual QA checklist (§24) fully walked in a real dev guild against a non-production Slice
      environment, all boxes checked.
- [ ] Verification commands (§25) all pass with zero errors/warnings.
- [ ] No Slice source, Prisma schema, migration, or API was changed by this document's work.
- [ ] No old-bot source was touched (none was reused — §4 confirmed no predecessor).

## 27. Documentation updates

- `PROMPT_INDEX.md` — flip this document's row (009) status from `NOT STARTED` to `COMPLETE` once the
  completion checklist (§26) above is fully satisfied, not before.
- `IMPLEMENTATION_ORDER.md` — no structural change needed (dependencies/order are unaffected by this
  document's own completion), but its "Exact next document" pointer should be advanced past 009 once
  closed, per the guide's stated "one document at a time" discipline.
- `CURRENT_STATE.md` — update the "Known blockers" section: the line noting Documents 004–006, 009,
  010, 013 as blocked on new Slice backend endpoints should be revised to drop 009 once this document
  and its 005/006 dependencies have actually closed against a real environment (not based on this
  document alone).
- `MASTER_CHECKLIST.md` — no change to the "Review completion" section (that section describes this
  build guide's own authoring, already complete); the "Production readiness" section's unchecked items
  remain unchecked until the corresponding real-world conditions (endpoint build-out, Doc 012–014
  shipping, etc.) are independently verified, not simply because this document closed.
- `COMMAND_CATALOGUE.md` — no content change needed; its existing rows for these four commands already
  accurately describe what this document builds. If implementation surfaces any deviation from the
  catalogue (e.g., a field Slice's real response doesn't actually include), the catalogue must be
  corrected to match reality, not the other way around.

## 28. Final report format

The implementer's completion report for this document must follow this structure, mirroring the
top-level build guide's own final report format, scoped to Document 009:

1. **Summary** — one paragraph: what was built (`/watchlist add/remove/list`, `/portfolio`), against
   which Slice environment, and confirmation that account linking (005/006) was verified closed first.
2. **Scope delivered** — checklist mirroring §7, each item marked done/not-done.
3. **Scope explicitly not delivered** — restate §8's list verbatim as a confirmation nothing there was
   accidentally built.
4. **Slice API calls exercised** — the table from §11, each row annotated with pass/fail from real
   integration-test runs against the disposable Slice instance.
5. **Test results** — pass/fail counts for unit (§21), integration (§22), and Discord-interaction
   (§23) suites, plus the manual QA checklist (§24) with each box's real outcome.
6. **Verification command output** — pass/fail for each command in §25.
7. **Deviations** — any point where the real Slice API response, error behavior, or account-linking
   state differed from what this document assumed, and how it was resolved (must never be resolved by
   fabricating data or silently expanding scope beyond §7).
8. **Completion checklist** — §26 reproduced with final checked/unchecked state.
9. **Documentation updates applied** — confirmation of which §27 updates were actually made, with
   diffs/links.
10. **Stop confirmation** — explicit statement that Implementation Document 010 was not started as
    part of closing this one.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
