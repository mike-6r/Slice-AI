# 002 — Slice API client and shared contracts

## 1. Metadata

- **Document number:** 002
- **Title:** Slice API client and shared contracts
- **Status:** NOT STARTED (this build guide is documentation-only and contains no completed
  implementation work)
- **Depends on (this build guide):** 001 (Repository reconciliation and bot foundation)
- **Blocks (this build guide):** 003 (Discord interaction framework and command registry), 007
  (Marketplace and asset commands), 008 (Collector and Vault commands), and — transitively, through
  007/008 and their own dependents — 004, 005, 006, 009, 010, 013, all of which call Slice through
  the client this document builds
- **Slice backend dependency:** Docs 004–008 of Slice's own backend build guide (VERIFIED per
  `project-state.json`'s `sliceBackendStatus.completedDocuments`) — this document builds a
  **read-capable client against Slice's already-available, VERIFIED HTTP surface only**. It does not
  build, call, or assume any of the new bot-only endpoints proposed in `BOT_API_REQUIREMENTS.md`
  §1–3, because those do not exist on any Slice environment yet.
- **Can start today:** Yes

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend exposing a versioned HTTP API
(`/v1/*`). The Slice Discord bot being planned in this build guide is a **companion client** to
Slice: it never opens a direct connection to Slice's Postgres/Prisma layer, never duplicates Slice's
business rules, and never becomes a second backend (`docs/qa/README.md` ground rules,
`BOT_ARCHITECTURE.md` "Bot must never do"). Every one of the bot's reads and writes must go through
Slice's real HTTP API. This document is the single place in the build guide where that HTTP
integration is built: a typed client, its shared request/response contracts, its error-normalization
layer, and its retry/backoff/rate-limit policy. Per `IMPLEMENTATION_ORDER.md`, Document 002 sits
immediately after 001 (repository/bot foundation) and immediately before 003 (interaction framework)
and the two independent command tracks that can start once 001–003 land: Track B (007 Marketplace,
008 Collector/Vault — both depend directly on 002) and, later, the account-linking track (004–006,
009, 010, 013) which also imports this client once its own Slice backend blockers clear. No Discord
command, embed, or interaction handling is built here — this is a pure backend-integration library
consumed by later documents.

## 3. Current implementation audit

Nothing yet. Per `CURRENT_STATE.md`, no Discord bot code exists anywhere — no repository, no
`package.json`, no `src/`. Implementation Document 001 (Repository reconciliation and bot foundation)
is this document's sole dependency and, per `IMPLEMENTATION_ORDER.md`'s one-document-at-a-time rule,
must have closed its own completion checklist before 002's work starts. This document does not
itself execute or re-verify 001's deliverables (that is 001's own stop condition to satisfy); it
assumes 001 has produced a TypeScript/Node.js repository skeleton with lint, typecheck, and unit-test
tooling in place and a typed, `zod`-validated configuration loader consistent with
`BOT_ARCHITECTURE.md`'s "Entry point" / "Configuration" description (bot token, Slice API base URL,
placeholders for the Slice service-account credential that does not exist yet, Redis/DB connection
strings for bot-owned state, per-command-family feature flags). Beyond that base skeleton, there is
no HTTP client, no shared contracts package, no error-mapping layer, and no retry logic anywhere in
the (nonexistent) codebase before this document begins.

## 4. Old bot behavior migrated

None — this document has no old-bot predecessor. The old bot (`Infria`, discord.py 1.6.0) never
called an external HTTP API of any kind; per `OLD_BOT_FEATURE_INVENTORY.md` item 31 and its
"Runtime facts" section, all of its persistence went through a raw `aiomysql`/`pymysql` connection
pool built at import time against a hardcoded, plaintext-credentialed production MySQL database
(`cogs/SQL.py`). `OLD_TO_NEW_MIGRATION_MATRIX.md`'s "Explicitly not migrated" section lists the "raw
MySQL connection pool" as REMOVE with no replacement pattern, and `OLD_BOT_FEATURE_INVENTORY.md` item
31's migration note is explicit: "Slice already has a proper Postgres/Prisma persistence layer; the
bot must talk to Slice through its HTTP API, never open a direct DB connection of its own (see
BOT_ARCHITECTURE.md)." This document is the direct architectural rejection of that old pattern: a
typed HTTP client against a real service API, not a raw, hardcoded database socket. The one
old-bot concept this document's scope does relate to indirectly is error handling
(`OLD_TO_NEW_MIGRATION_MATRIX.md` M6, "Error handling" — REWRITE): M6 specifies the *presentation*
layer's rule that no raw exception, stack trace, or backend response body ever reaches a Discord
user; this document supplies M6's upstream half — normalizing Slice's own error codes into typed
internal error objects before anything reaches a command handler or M6's middleware.

## 5. Slice features supported

This document touches no single Slice feature area on its own; it is the transport and typing layer
underneath every feature area later documents deliver. The endpoints it wraps span:

| Slice feature area | Backend doc(s) | Status (`project-state.json` / `CURRENT_STATE.md`) |
|---|---|---|
| Auth/session (`/v1/session`, `/v1/me`) | Slice Doc 004 | VERIFIED (COMPLETE) |
| Catalogue (`/v1/categories`, `/v1/grading-companies`, `/v1/catalogue/assets/:slug`) | Slice Doc 006/007 | VERIFIED (COMPLETE) |
| Market data (`/v1/market/*`) | Slice Doc 007 | VERIFIED (COMPLETE) — all market responses are DEMO-labeled per `SLICE_FEATURE_COMPATIBILITY.md` §3; the client passes `source`/`asOf`/`dataStatus` through untouched, it never computes or infers them |
| Collectors (`/v1/collectors*`) | Slice Doc 008 | VERIFIED (COMPLETE) |
| Vault (`/v1/vault/*`) | Slice Doc 008 | VERIFIED (COMPLETE) |
| Watchlist (`/v1/me/watchlist*`) | Slice Doc 008 | VERIFIED (COMPLETE) |
| Notifications (`/v1/me/notifications*`) | Slice Doc 008 | VERIFIED (COMPLETE) |
| Portfolio (`/v1/me/portfolio`) | Slice Doc 008 (read), gated by Doc 013 for real data | VERIFIED read endpoint; always returns `authority: DEMO` or `UNAVAILABLE` today because Slice Doc 013 (finance/portfolio authority) is NOT STARTED |
| Admin audit/status-history reads | Slice Doc 005 | VERIFIED (COMPLETE) |
| Bot-only account-linking/token-exchange/service-account endpoints (`BOT_API_REQUIREMENTS.md` §1–3) | Not a Slice backend document — a new proposal | NOT STARTED / does not exist on any Slice environment |

Per `sliceBackendStatus` in `project-state.json`, Slice Docs 001–008, 010, 011 are COMPLETE, 009/009A
are PARTIAL, and 009 (portfolio computation itself, distinct from the `/v1/me/portfolio` read
endpoint's honest-unavailable contract) is why `/v1/me/portfolio` is documented here as returning an
unavailable/demo authority rather than real figures.

## 6. Files to read before starting

- `BOT_ARCHITECTURE.md` — "Slice API client" bullet and the overall architecture diagram (this
  document builds exactly the box labeled "Slice API Client (typed)")
- `BOT_SECURITY_MODEL.md` §4 (bot token and Slice credential safety) — the two credential types
  (service-account, user-delegated) this client's auth layer must be built to accept, even though
  neither is provisioned yet
- `BOT_DATA_OWNERSHIP.md` — confirms this document introduces no new bot-owned system-of-record table
- `BOT_API_REQUIREMENTS.md` — the exact endpoint list (`## Already available`), and §1–3 (bot-only
  endpoints) for the extension points this client's auth layer must leave open without implementing
  them
- `ERROR_CATALOGUE.md` — the exact Slice error codes this document's normalization layer must map
- `COMMAND_CATALOGUE.md` Phase 1 table — every "Backend calls" cell, to confirm the client's method
  surface covers every endpoint a later document will need
- `PERMISSION_MATRIX.md` — confirms which endpoints are public vs. self-token vs. admin-token, which
  drives the credential-provider selection per call
- `TEST_STRATEGY.md` — "Integration tests" section, which specifies this client must be testable
  against a disposable local Slice instance and via a fake/typed test double
- `IMPLEMENTATION_ORDER.md` / `PROMPT_INDEX.md` — confirms 002's position, dependents, and the
  Track A/B/C parallelization this client unblocks
- Slice source: whatever DTO/response-shape definitions Slice's own backend exposes for the endpoints
  in the table below (read-only reference for typing — no Slice source file is modified)

## 7. Strict scope

- A base HTTP client module: request construction, base URL/timeout configuration, correlation/request
  ID attachment, JSON (de)serialization, and a pluggable credential-provider interface.
- Two credential providers implemented now: an **anonymous provider** (no auth header — used for
  every public endpoint) and a **static-token provider** usable only in tests/local development to
  supply a manually-issued Slice token, so integration tests (`TEST_STRATEGY.md`) can exercise
  self-token endpoints against a disposable Slice instance before the bot-only linking/exchange
  endpoints exist.
- A documented, typed **extension point** for a future service-account credential provider and a
  future user-delegated-token provider — interfaces only, no working implementation, because the
  credentials/endpoints they need (`BOT_API_REQUIREMENTS.md` §1–3) do not exist yet. Explicitly: this
  client can inject an `Authorization` header once a real credential is available, but **until
  `BOT_API_REQUIREMENTS.md` §3 (service-account authentication) is built by Slice's team, this client
  can only successfully call Slice's anonymous/public read endpoints in any real deployment.**
- Typed request/response contracts (shared between the gateway process and worker process — per
  `BOT_ARCHITECTURE.md`'s two-process deployment model) for every endpoint listed in section 11,
  built with `zod` schemas (matching `BOT_ARCHITECTURE.md`'s "Configuration" convention and its
  "shared/`packages/shared-contracts`-style package" recommendation) with inferred TypeScript types,
  not hand-duplicated interfaces.
- One typed resource-method group per Slice module (session/me, catalogue, market, collectors, vault,
  watchlist, notifications, portfolio, admin audit/status-history) composed into a single
  `SliceApiClient` class, mirroring `BOT_ARCHITECTURE.md`'s "a single typed HTTP client module
  wrapping every Slice endpoint the bot uses."
- Error normalization: a mapping layer that turns Slice's HTTP status + error-code envelope into a
  fixed set of internal, typed error classes (one per `ERROR_CATALOGUE.md` row), each carrying the
  safe fields a later UI layer needs (`code`, `httpStatus`, `requestId`, `retryAfterSeconds` where
  applicable) and never the raw response body as a user-facing string.
- Retry/backoff policy: single-retry-only semantics for idempotent GETs on a 401-triggered
  credential refresh or on a transient 503, per `BOT_ARCHITECTURE.md` and `ERROR_CATALOGUE.md`; no
  automatic retry of any mutating call; `Retry-After`-aware 429 handling that never auto-retries and
  never fans out parallel requests.
- Idempotency-key derivation utility: a pure function implementing the
  `(discordUserId, command, targetResourceId, nonce)` scheme from `BOT_ARCHITECTURE.md`, exposed for
  later documents' mutating commands to call — this document does not itself call any mutating
  endpoint from a command, since it builds no commands.
- Unit and integration test scaffolding for the client itself (a hand-written fake implementing the
  same `SliceApiClient` interface, for later documents' command-handler unit tests, per
  `BOT_ARCHITECTURE.md`'s "Test doubles").

## 8. Out of scope

- Any Discord-facing code: no slash command, button, modal, embed, or interaction router (that is
  Document 003 onward).
- The bot-only service endpoints themselves (`BOT_API_REQUIREMENTS.md` §1–3: discord-link
  challenge/complete/unlink/lookup, token exchange, service-account auth) — those are Slice backend
  work plus Document 004's domain layer, not this document. This document only leaves the
  credential-provider interface open for them.
- `GET /v1/me/discord-link` (the "new endpoint required" row in `BOT_API_REQUIREMENTS.md`) — that
  endpoint is documented as being for the **Slice web app**, not the bot; this client does not wrap
  it.
- `POST /v1/auth/login`, `/refresh`, `/logout`, `/logout-all` — per `BOT_API_REQUIREMENTS.md`, "not
  called directly by the bot for end users." Not wrapped by this client.
- `PATCH /v1/me/profile` — marked "not exposed in Discord initially (no product need identified)" in
  `BOT_API_REQUIREMENTS.md`; not wrapped here since no consumer needs it yet. Can be added when a
  later document actually needs it, without re-opening this document.
- `GET /v1/market/assets/:slug/order-book`, `/recent-trades` — these ARE included in the client
  (section 11) since `BOT_API_REQUIREMENTS.md` lists them as already-available and 007 renders them
  as an honest placeholder; calling code deciding *how* to render "not available until trading" is
  007's concern, not this document's.
- Any bot-owned persistence table or migration (see section 10 — none).
- Building or registering any Discord application command, permission check, or embed — those are
  003/007/008/etc.
- Actually provisioning a Slice service-account credential or standing up a disposable Slice test
  environment — those are operational/Slice-team actions and Document 017's environment work,
  respectively; this document only writes code that is ready to consume such a credential once it
  exists.

## 9. Dependencies

- **Runtime:** Node.js (matching the version pinned by Document 001's repository skeleton) with the
  native `fetch`/`Request`/`Response` globals (or, if Document 001 pinned an older Node baseline,
  `undici` as the HTTP implementation — decided once, centrally, in the base client module, never
  per-call).
- **`zod`** — schema definition and runtime validation for every request/response contract, matching
  `BOT_ARCHITECTURE.md`'s stated config-loader convention and its "shared zod schemas" recommendation
  for the contracts package; also used to fail loudly (in non-production) if Slice ever returns a
  shape that doesn't match the documented contract, rather than silently passing malformed data
  downstream.
- **TypeScript** — strict mode, matching the rest of the bot repository per Document 001.
- **Test runner** — whatever Document 001 configured (Vitest/Jest-style, per `BOT_ARCHITECTURE.md`'s
  "same test runner/assertions as the rest of the repo" and `TEST_STRATEGY.md`).
- No new third-party SDK for Slice itself: Slice does not publish a client SDK; this document hand-
  builds the typed wrapper directly against Slice's documented `/v1/*` HTTP surface, since
  `BOT_API_REQUIREMENTS.md` shows no OpenAPI/generated-client artifact exists to consume yet
  (`BOT_ARCHITECTURE.md` names this as a possible *future* option, not something available today).
- No queueing/BullMQ dependency here — that belongs to the background-jobs document (015) and is only
  a *consumer* of this client, not a dependency of it.

## 10. Bot-owned persistence

None. This document introduces no new database table, collection, or migration. Checked directly
against `BOT_DATA_OWNERSHIP.md`: every row that table lists as bot-owned (guild configuration, ticket
state, suggestion state, giveaway state, leveling/engagement data, moderation history, roadmap/FAQ
content, news-feed content, and the future `InboxReceipt`-style notification-delivery dedup table) is
either genuinely Discord-operational state with no Slice counterpart, or an explicitly future (Phase
2) concern — none of it is "an HTTP request/response cache." No row in `BOT_DATA_OWNERSHIP.md`
justifies a persistent request-cache table for this client, and this document does not introduce one.
Any in-memory, non-persistent, short-TTL response memoization the client implementation may use
internally (e.g., to avoid redundant catalogue/grading-company lookups within a single interaction) is
an implementation detail with no durability guarantee, is never a system of record, and is explicitly
not a "bot-owned persistence" table under `BOT_DATA_OWNERSHIP.md`'s definition — it holds no rows
that outlive the process and requires no schema.

## 11. Slice API dependencies

Every endpoint below is cited exactly from `BOT_API_REQUIREMENTS.md`'s "Already available" table.
All are tagged **already-available (VERIFIED)**. This document implements a typed method for each;
whether a given method can be *successfully called* today depends on the credential it needs (see the
"Callable today?" column), independent of whether the method itself is implemented.

| Endpoint | Auth needed | Idempotency | Rate limit | Callable today? | Used by (impl doc) |
|---|---|---|---|---|---|
| `GET /v1/session` | token (user) | n/a | yes | No — no credential mechanism exists yet (blocked on §1/§2) | 005 (`/account status`) |
| `GET /v1/me` | token (user) | n/a | yes | No — same blocker | 005 (`/account status`) |
| `GET /v1/categories`, `.../sets` | public | n/a | yes | **Yes — anonymous** | 007 (`/asset search` filters) |
| `GET /v1/grading-companies`, `.../grades` | public | n/a | yes | **Yes — anonymous** | 007 (`/asset search` filters) |
| `GET /v1/catalogue/assets/:slug` | public | n/a | yes | **Yes — anonymous** | 007 (`/asset view`) |
| `GET /v1/market/assets` | public | n/a | yes | **Yes — anonymous** | 007 (`/asset search`) |
| `GET /v1/market/assets/:slug` | public | n/a | yes | **Yes — anonymous** | 007 (`/asset view`) |
| `GET /v1/market/assets/:slug/history` | public | n/a | yes | **Yes — anonymous** | 007 |
| `GET /v1/market/assets/:slug/similar` | public | n/a | yes | **Yes — anonymous** | 007 (`/asset view`) |
| `GET /v1/market/summary` | public | n/a | yes | **Yes — anonymous** | 015 (market-digest job) |
| `GET /v1/market/movers` | public | n/a | yes | **Yes — anonymous** | 007 (`/market movers`), 015 |
| `GET /v1/market/assets/:slug/order-book` | public | n/a | yes | **Yes — anonymous** (renders Slice's own honest placeholder) | 007 |
| `GET /v1/market/assets/:slug/recent-trades` | public | n/a | yes | **Yes — anonymous** (same) | 007 |
| `GET /v1/collectors` | public | n/a | yes | **Yes — anonymous** | 008 (`/collector search`) |
| `GET /v1/collectors/:slug` | public | n/a | yes | **Yes — anonymous** | 008 (`/collector view`, `/profile`) |
| `GET /v1/collectors/:slug/assets` | public | n/a | yes | **Yes — anonymous** | 008 |
| `GET /v1/vault/events` | public | n/a | yes | **Yes — anonymous** | 008 (`/vault latest`) |
| `GET /v1/vault/summary` | public | n/a | yes | **Yes — anonymous** | 008 (`/vault summary`) |
| `GET /v1/me/portfolio?range` | token (user) | n/a | yes | No — blocked on §1/§2 | 009 (`/portfolio`) |
| `GET /v1/me/watchlist` | token (user) | n/a | yes | No — blocked on §1/§2 | 009 (`/watchlist list`) |
| `PUT /v1/me/watchlist/:assetId` | token (user) | required | yes | No — blocked on §1/§2 | 009 (`/watchlist add`) |
| `DELETE /v1/me/watchlist/:assetId` | token (user) | required | yes | No — blocked on §1/§2 | 009 (`/watchlist remove`) |
| `GET /v1/me/notifications` | token (user) | n/a | yes | No — blocked on §1/§2 | 010 (`/notifications list/unread`) |
| `PATCH /v1/me/notifications/:id/read` | token (user) | required | yes | No — blocked on §1/§2 | 010 (`/notifications read`) |
| `POST /v1/me/notifications/read-all` | token (user) | required | yes | No — blocked on §1/§2 | 010 (`/notifications read-all`) |
| `GET /v1/admin/audit-events` | token (ADMIN/SUPPORT) | n/a | yes | No — blocked on §1/§2/§3 | 013 (`/admin audit`) |
| `GET /v1/admin/users/:id/status-history` | token (ADMIN/SUPPORT) | n/a | yes | No — blocked on §1/§2/§3 | 013 (`/admin status-history`) |

No **new-endpoint-required** or **bot-only-service-endpoint** row from `BOT_API_REQUIREMENTS.md` is
implemented in this document (see section 8). The credential-provider interface (section 7) is the
only place this document acknowledges §1–3 exist, and only as an unimplemented extension point for
Document 004.

## 12. Commands / events / jobs delivered

None. `COMMAND_CATALOGUE.md` and `EVENT_AND_JOB_CATALOGUE.md` list no command, event handler, or
scheduled job as owned by this document — every row in both catalogues that calls Slice cites an
"Impl doc" of 003 or later (never 002), consistent with this document's pure-library scope.

## 13. Permission rules

Not applicable at the command layer — this document delivers no command. It does, however, establish
the mechanical split `PERMISSION_MATRIX.md` depends on: which credential a given Slice call carries
(anonymous / user-token / admin-token) is exactly what determines whether Slice enforces "none
(public API)," "self-token," or "Slice `ADMIN`/`SUPPORT`, checked fresh every call" for a given row of
that matrix. This document's credential-provider architecture is what makes "never cached, checked
fresh every call" (`PERMISSION_MATRIX.md`, `/admin *` row; `BOT_SECURITY_MODEL.md` §6) mechanically
possible for later documents: the client attaches whatever credential the caller supplies for that
specific call, it never stores or reuses a previously-successful credential across calls, and it
exposes no method that lets a caller "skip" the credential-provider step for a call that needs one.
Discord-side role/permission gates remain a UX pre-check only, layered on top by 003/013 — this
document's client never treats a Discord role as authorization by itself.

## 14. Security requirements

Cites `BOT_SECURITY_MODEL.md` §4 and §5 directly:

- **No password, access token, refresh token, or session cookie is ever logged, and the static-token
  test provider (section 7) is explicitly test/local-only** — it must be excluded from any production
  build path, and Document 001's environment-schema validation (via `zod`) should reject its presence
  outside a `development`/`test` environment flag.
- The client never persists a Slice access token, refresh token, or credential at rest (`
  BOT_DATA_OWNERSHIP.md` — "Session/auth tokens: ... Bot never persists a Slice access/refresh token
  at rest"). Any in-memory token held for the duration of a single request/response cycle is discarded
  immediately after use, never written to a log line, database row, or cached object surviving past
  that cycle.
- **Request signing is a single, centrally-located concern** (`BOT_SECURITY_MODEL.md` §4): if Slice's
  team eventually requires HMAC-signed or mTLS service-to-service requests for the service-account
  credential (§3), that logic belongs inside this client's single credential-provider/request-signing
  module, never duplicated per resource method or per later command document.
- Structured logs produced by this client redact known-sensitive field names by default (mirroring
  `BOT_SECURITY_MODEL.md` §10's redaction rule) — a logged request/response pair never includes an
  `Authorization` header value, a raw token, or a raw email address, even at debug log level.
- The client never accepts a caller-supplied `Authorization` header value directly from Discord
  interaction data (e.g., a slash-command option) — only from a credential provider instantiated and
  controlled by the bot's own code, closing off a class of forged-header attacks.
- Every outbound request carries a bot-generated correlation/request ID (`BOT_ARCHITECTURE.md`,
  "Structured logging / request IDs"), sent as a header if Slice's API accepts one, and always logged
  alongside whatever request ID Slice's own response returns, so a support engineer can correlate a
  Discord interaction with a specific Slice-side log line or `AuditEvent` without either system
  exposing sensitive data to the other.

## 15. Idempotency and rate limits

- **Idempotency-key scheme:** this document implements (but does not itself invoke, since it issues
  no command-triggered mutation) the deterministic derivation function
  `deriveIdempotencyKey(discordUserId, command, targetResourceId, nonce)` specified in
  `BOT_ARCHITECTURE.md`. `nonce` is fixed per logical user intent and is regenerated only when a later
  command handler explicitly represents a user-initiated retry after an error — never regenerated on
  a Discord gateway-level redelivery of the same interaction. The function is pure, unit-testable
  without I/O, and exported for 009/010's mutating commands (`PUT`/`DELETE /v1/me/watchlist/:assetId`,
  `PATCH /v1/me/notifications/:id/read`, `POST /v1/me/notifications/read-all`) to call. The client's
  request layer accepts an optional `idempotencyKey` parameter on every mutating resource method and
  attaches it as the `Idempotency-Key` header verbatim; it never generates one implicitly, so a caller
  can never accidentally send a mutation without an explicit, traceable key.
- **Rate limits — respecting Slice's, never triggering them from bot-side retries:**
  - On `429` (`RATE_LIMITED` per `ERROR_CATALOGUE.md`), the client never auto-retries. It parses
    Slice's `Retry-After` header (or `RateLimit-*` headers if present) into the normalized error
    object's `retryAfterSeconds` field and returns control to the caller immediately — the decision to
    show a "try again in {N}s" message is the calling command's job (`ERROR_CATALOGUE.md`,
    `COMMAND_CATALOGUE.md` "Rate-limit messages"), not this client's.
  - The client applies a short, per-endpoint, in-memory backpressure window after observing a `429`
    from a given route (not a queue, not a delayed auto-retry) purely to avoid a caller-side bug (e.g.,
    a retry loop bug in a later document) from immediately re-triggering the same limit; this is a
    circuit-breaker, not a retry mechanism, and it never delays or blocks a *different* route's calls.
  - Idempotent `GET` requests get **exactly one** automatic retry, and only for two conditions: (a) a
    `401` (`AUTHENTICATION_REQUIRED`/`ACCESS_TOKEN_EXPIRED`) after one credential-refresh attempt
    through the current credential provider, or (b) a `503` mapped to `MARKET_DATA_UNAVAILABLE` /
    `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE`, after a short fixed delay — both exactly
    as specified in `BOT_ARCHITECTURE.md` and `ERROR_CATALOGUE.md`. No other status code, and no
    mutating method (`PUT`/`PATCH`/`POST`/`DELETE`), is ever auto-retried by this client, matching
    `ERROR_CATALOGUE.md`'s explicit rule for `IDEMPOTENCY_KEY_CONFLICT`/`REQUEST_IN_PROGRESS`: "Bot
    should not auto-retry a conflicting mutation."
  - The client never issues parallel/fanned-out requests to work around a rate limit or a slow
    response; every resource method is a single request per call.

## 16. Audit requirements

This document produces no Slice-side audit trail of its own — Slice's own backend already audits
every mutation the bot triggers via this client (`BOT_SECURITY_MODEL.md` §5: "Every Slice-side
mutation the bot triggers is already audited by Slice itself"). What this document is responsible for
is making that correlation possible and complete for the local, bot-side operational log every later
document writes: every response object the client returns carries whatever request/correlation ID
Slice's response included, so that a command handler's own structured log line (Discord user id,
command, outcome) can include the Slice-side request ID without the client itself deciding what gets
logged or where. The client never writes a competing audit record and never assumes it needs to
duplicate Slice's `AuditEvent` — it only makes the correlation ID available.

## 17. Error behavior

Every row of `ERROR_CATALOGUE.md` is implemented as a distinct internal error class produced by this
document's normalization layer, keyed off Slice's own error `code` field (falling back to HTTP status
when a response carries no recognizable code):

| Slice error code(s) | Internal error class | Fields carried |
|---|---|---|
| `VALIDATION_FAILED` | `SliceValidationError` | `code`, `httpStatus`, `requestId`, safe field-level detail if Slice's response includes a safe user-facing field name |
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | `SliceAuthRequiredError` | `code`, `httpStatus`, `requestId` — raised only after the single GET-retry-on-401 path (section 15) is exhausted |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | `SliceSessionInvalidError` | `code` (normalized, never exposes which of the three it was, matching `ERROR_CATALOGUE.md`'s anti-enumeration note), `httpStatus`, `requestId` |
| `ACCOUNT_RESTRICTED` | `SliceAccountRestrictedError` | `code`, `httpStatus`, `requestId` — no reason field, by design |
| `FORBIDDEN` | `SliceForbiddenError` | `code`, `httpStatus`, `requestId` |
| `PROFILE_NOT_FOUND` / `COLLECTOR_NOT_FOUND` / `ASSET_NOT_FOUND` / `NOTIFICATION_NOT_FOUND` | `SliceNotFoundError` | `code` (which resource type), `httpStatus`, `requestId` |
| `PROFILE_NOT_PUBLIC` | `SliceProfileNotPublicError` | `code`, `httpStatus`, `requestId` |
| `ASSET_NOT_PUBLIC` | `SliceAssetNotPublicError` | `code`, `httpStatus`, `requestId` |
| `PORTFOLIO_AUTHORITY_UNAVAILABLE` | `SlicePortfolioUnavailableError` | `code`, `httpStatus`, `requestId` — explicitly not treated as a generic failure by downstream code |
| `IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS` | `SliceConflictError` | `code`, `httpStatus`, `requestId` |
| `RATE_LIMITED` | `SliceRateLimitedError` | `code`, `httpStatus`, `requestId`, `retryAfterSeconds` |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | `SliceServiceUnavailableError` | `code`, `httpStatus`, `requestId` — raised only after the single GET-retry-on-503 path is exhausted (mutations are never retried and surface immediately) |
| Unrecognized/unexpected `code`, non-JSON body, network failure, timeout | `SliceUnknownError` | `httpStatus` (if any), `requestId` (if any); the **raw body/exception is captured only in the bot's own server-side structured log**, never attached to any field a later document might interpolate into a Discord message |

This document does not construct the Discord-facing copy strings from `ERROR_CATALOGUE.md`'s
"Discord-facing message" column — assembling those embeds is the interaction-framework/command
layer's job (Document 003 and each command document), consistent with `OLD_TO_NEW_MIGRATION_MATRIX.md`
M6's "central interaction-error middleware" living above this client, not inside it. This document's
sole obligation, inherited directly from M6's completion criterion, is that **no code path in this
client ever lets a raw exception message, stack trace, SQL/HTTP fragment, or full backend response
body reach anything outside its own server-side log** — every error object handed to a caller is one
of the typed classes above, never a raw `Error` wrapping unredacted response text.

Discord-side failures (missing bot permissions to post, deleted channel, closed DMs) are out of
scope for this document's error layer entirely — those never originate from a Slice API call and are
handled by the interaction layer per `ERROR_CATALOGUE.md`'s last row.

## 18. Interaction UX

Not applicable — this document delivers no Discord-facing surface (no embed, button, modal, or
ephemeral/public response). "N/A — this document is a backend-integration library with no Discord
interaction surface; see Documents 003, 007, 008 and onward for every command's interaction UX."

## 19. Implementation file plan

```
packages/slice-client/
  src/
    contracts/
      index.ts                # re-exports every schema/type below
      common.ts                # shared envelope types: pagination cursor, error envelope, asOf/source/dataStatus fields
      session.ts                # zod schemas + types for GET /v1/session, /v1/me
      catalogue.ts              # categories, sets, grading-companies, grades, catalogue asset
      market.ts                 # market assets/history/similar/summary/movers/order-book/recent-trades
      collectors.ts              # collectors list/detail/assets
      vault.ts                   # vault events/summary
      watchlist.ts                # watchlist list/add/remove
      notifications.ts             # notifications list/read/read-all
      portfolio.ts                 # portfolio response incl. authority: DEMO/UNAVAILABLE
      admin.ts                     # audit-events, status-history
    errors/
      slice-error-types.ts       # the internal error class hierarchy (section 17)
      map-slice-error.ts         # HTTP status + Slice error code -> internal error class
    auth/
      credential-provider.ts     # interface: AnonymousProvider, StaticTokenProvider (test-only),
                                  # plus documented-but-unimplemented extension points for a future
                                  # ServiceAccountProvider and UserDelegatedTokenProvider (Doc 004+)
    http/
      request.ts                 # low-level fetch/undici wrapper: base URL, timeout, headers, JSON parsing
      retry.ts                   # single-retry-on-401/503 policy for GETs, 429 Retry-After parsing, per-route backpressure
    idempotency.ts               # deriveIdempotencyKey(discordUserId, command, targetResourceId, nonce)
    resources/
      session-resource.ts
      catalogue-resource.ts
      market-resource.ts
      collectors-resource.ts
      vault-resource.ts
      watchlist-resource.ts
      notifications-resource.ts
      portfolio-resource.ts
      admin-resource.ts
    client.ts                    # SliceApiClient — composes every resource, accepts a credential provider
    test-doubles/
      fake-slice-client.ts       # hand-written fake implementing the same interface as SliceApiClient,
                                  # for later documents' command-handler unit tests
    index.ts                     # package entry point — exports SliceApiClient, contracts, error types, fake
  test/
    unit/
      map-slice-error.test.ts
      idempotency.test.ts
      retry-policy.test.ts
    integration/
      public-endpoints.integration.test.ts   # against a disposable local Slice instance, per TEST_STRATEGY.md
      auth-gated-endpoints.integration.test.ts # uses the static-token test provider; documents the
                                                # §1/§2-blocked gap explicitly in a skipped/pending test
  package.json
  tsconfig.json
```

One package (`packages/slice-client`), matching `BOT_ARCHITECTURE.md`'s framing of "a single typed
HTTP client module," with `contracts/` as the shared-typing half explicitly consumable by both the
gateway process and worker process(es) described in `DEPLOYMENT_PLAN.md`'s "Runtime" section — either
process imports this one package, never a copy of it.

## 20. Numbered implementation steps

1. Scaffold `packages/slice-client` inside the repository Document 001 established, with its own
   `package.json`/`tsconfig.json` matching the monorepo/package conventions Document 001 set up.
2. Write `contracts/common.ts`: shared `zod` schemas for the pagination envelope
   (`{items, nextCursor, hasMore}` per `BOT_ARCHITECTURE.md`'s pagination-components description) and
   the market-data caveat fields (`source`, `asOf`, `dataStatus`, optional `confidence`) so every
   later contract composes them rather than redefining them.
3. Write one `contracts/*.ts` file per Slice module listed in section 11, each a `zod` schema plus its
   inferred TypeScript type, matching the documented endpoint's real response shape exactly — no
   invented field is added "for convenience."
4. Write `errors/slice-error-types.ts`: the fixed set of internal error classes from section 17, each
   a minimal class carrying only the safe fields listed, with no field capable of holding an entire
   raw response body.
5. Write `errors/map-slice-error.ts`: a pure function `(httpStatus, responseBody) => SliceError`
   implementing the table in section 17 exactly, defaulting unrecognized codes to `SliceUnknownError`.
6. Write `auth/credential-provider.ts`: the `CredentialProvider` interface (`getAuthHeader(): Promise<Record<string,string> | undefined>`), `AnonymousProvider` (returns `undefined`), and
   `StaticTokenProvider` (test/local only, returns a fixed bearer header) — plus TSDoc comments marking
   `ServiceAccountProvider` and `UserDelegatedTokenProvider` as **not implemented, reserved for
   Document 004**, each with the exact `BOT_API_REQUIREMENTS.md` §2/§3 endpoint it will eventually
   call.
7. Write `http/request.ts`: the base request function — accepts method, path, query, body, a
   `CredentialProvider`, an optional `idempotencyKey`; attaches the bot-generated correlation/request
   ID header; performs the fetch; parses JSON; on a non-2xx response, calls `map-slice-error.ts` and
   throws the resulting typed error; never logs the `Authorization` header value.
8. Write `http/retry.ts`: wraps `request.ts` for GET calls only, implementing the single-retry-on-401
   (after one credential-provider refresh attempt) and single-retry-on-503 (after a short fixed delay)
   rules, the 429 `Retry-After` passthrough with no auto-retry, and the per-route backpressure window
   described in section 15.
9. Write `idempotency.ts`: `deriveIdempotencyKey`, pure and deterministic, with unit tests proving the
   same `(discordUserId, command, targetResourceId, nonce)` tuple always yields the same key and a
   changed `nonce` (only) always yields a different key.
10. Write one `resources/*.ts` per module, each exposing typed async methods (e.g.,
    `getAssetBySlug(slug: string)`, `addToWatchlist(assetId: string, opts: {idempotencyKey: string, credentials: CredentialProvider})`) that call `http/retry.ts` (for GETs) or `http/request.ts`
    directly (for mutations, which are never auto-retried) and validate the response against the
    matching `contracts/*.ts` schema before returning it, throwing `SliceUnknownError` (with detail
    logged server-side only) if Slice's real response ever fails schema validation.
11. Write `client.ts`: `SliceApiClient`, constructed with a base URL and a default `CredentialProvider`,
    composing every resource module, with each method able to accept an optional per-call credential
    override (needed later for admin-token vs. self-token calls from the same process).
12. Write `test-doubles/fake-slice-client.ts`: an in-memory implementation of the exact same public
    interface as `SliceApiClient`, with settable canned responses/errors per method, for later
    documents' command-handler unit tests to import with zero network dependency.
13. Write unit tests (section 21) and integration tests (section 22) against a disposable local Slice
    instance for every endpoint tagged "Callable today: Yes — anonymous" in section 11; write the
    auth-gated endpoints' integration tests as explicitly pending/skipped with a comment citing the
    §1/§2 blocker, so the test suite documents the gap rather than silently omitting it.
14. Run the verification commands (section 25) and confirm the completion checklist (section 26).

## 21. Unit tests

- `map-slice-error.ts`: every row in section 17's table produces the correct internal error class and
  carries the correct fields, for both a well-formed Slice error envelope and a malformed/empty body
  at the same HTTP status; an unrecognized code at any status produces `SliceUnknownError`.
- `deriveIdempotencyKey`: deterministic given identical inputs; changes if and only if `nonce` changes;
  does not change if only Discord's own internal interaction/message ID changes (regression test
  against accidentally keying off gateway-redelivery metadata).
- `http/retry.ts` policy (using a fake transport, no network): a GET retries exactly once on a first
  401 and succeeds on the second attempt if the credential refresh succeeds; a GET does not retry a
  second time if the retry also 401s; a GET retries exactly once on 503 and gives up after that; a
  PUT/PATCH/POST/DELETE is never retried under any of the above conditions; a 429 is never retried and
  its `Retry-After` value is surfaced unchanged on the thrown `SliceRateLimitedError`.
- Contract schema tests: each `contracts/*.ts` schema accepts a representative real-shaped fixture and
  rejects a fixture missing a required field or carrying a field of the wrong type.
- `AnonymousProvider` returns no `Authorization` header; `StaticTokenProvider` returns exactly the
  configured header and is proven (via a repository lint/test rule) to be excluded from any
  non-development/test build.

## 22. Integration tests

Per `TEST_STRATEGY.md`'s "Integration tests" section, run against a **disposable local Slice
instance** (mirroring how Slice's own backend spins up disposable Postgres/Redis per its own Doc
002):

- Every "Callable today: Yes — anonymous" endpoint in section 11's table: a real request against the
  disposable instance returns a response that validates against its `contracts/*.ts` schema, including
  the pagination envelope shape for list endpoints and the `source`/`asOf`/`dataStatus` fields for
  every market-data response.
- A deliberately-triggered `404` (unknown slug) on `GET /v1/market/assets/:slug` and
  `GET /v1/collectors/:slug` maps to `SliceNotFoundError`.
- A deliberately-triggered `429` (if the disposable instance's rate limiter can be configured low
  enough for a test) confirms `Retry-After` parsing and confirms the client does not auto-retry.
- The self-token and admin-token endpoints (`GET /v1/session`, `/v1/me`, watchlist, notifications,
  portfolio, admin audit/status-history) are exercised **only** using the test-only
  `StaticTokenProvider` against a manually-issued test token on the disposable instance — proving the
  client's request/response plumbing and contract validation work correctly for these endpoints even
  though no production credential mechanism exists yet. These tests are explicitly documented as
  validating the client's *mechanics*, not as evidence that the bot can call these endpoints in
  production today (section 11 is the source of truth for that).
- A schema-mismatch test: point a resource method at a fixture response that's missing a documented
  required field and confirm the client raises `SliceUnknownError` rather than returning
  partially-valid data.

## 23. Discord interaction tests

Not applicable — this document has no interaction router, command handler, button, or modal to
simulate. "N/A — see Document 003 onward for Discord interaction-simulation tests; this document's
only consumer-facing test surface is the `fake-slice-client.ts` test double those documents' own
interaction tests will import."

## 24. Manual QA checklist

- [ ] Point the client's base URL at a real local/staging Slice instance and confirm
      `GET /v1/market/movers`, `GET /v1/collectors`, and `GET /v1/vault/summary` (all anonymous)
      return real, schema-valid data end-to-end, with no manual token configuration required.
- [ ] Confirm no `Authorization` header value ever appears in the client's own log output at any log
      level, by grepping a full test run's logs.
- [ ] Using the `StaticTokenProvider` with a manually-issued Slice user token, confirm
      `GET /v1/me/watchlist` round-trips correctly and that the same test token, if reused after
      expiry, produces `SliceSessionInvalidError` (or `SliceAuthRequiredError`, per Slice's actual
      behavior) rather than an unhandled exception.
- [ ] Confirm a simulated 503 response from a local mock causes exactly one retry and then a clean
      `SliceServiceUnavailableError`, observable in logs as two attempts, not more.
- [ ] Confirm a simulated 429 response never triggers a second attempt from the client itself.
- [ ] Confirm `packages/slice-client` has zero import of any Slice Prisma/database package and zero
      import of any Discord.js type — a pure HTTP/typing package with no leakage in either direction.

## 25. Verification commands

```
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md/TEST_STRATEGY.md
npm run build
```

## 26. Completion checklist

- [ ] `packages/slice-client` exists with the file layout in section 19, building cleanly against
      Document 001's repository skeleton.
- [ ] Every endpoint in section 11's table has a typed resource method and a validated `zod` contract.
- [ ] No bot-only endpoint from `BOT_API_REQUIREMENTS.md` §1–3 is implemented; the credential-provider
      extension points for them exist but throw/are documented as unimplemented.
- [ ] Every row of `ERROR_CATALOGUE.md` maps to exactly one internal error class per section 17, with
      unit tests proving the mapping.
- [ ] The retry/backoff policy in section 15 is implemented exactly (single retry on 401/503 for GETs
      only, never on mutations, no auto-retry on 429, `Retry-After` surfaced not consumed).
- [ ] `deriveIdempotencyKey` is implemented, pure, deterministic, and unit-tested.
- [ ] No Slice access/refresh token, password, or session cookie appears in any log line produced by
      this package (manually verified per section 24).
- [ ] `fake-slice-client.ts` exists and implements the exact same public interface as
      `SliceApiClient`, ready for Documents 003/007/008 to import.
- [ ] All commands in section 25 pass.
- [ ] No Slice source file, Prisma schema, or migration was modified by this document's work.
- [ ] This document's own scope boundary held: no Discord command, embed, or interaction handler was
      written.

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md`: flip Document 002's status row from NOT STARTED to
  COMPLETE only once the section 26 checklist above is actually satisfied by real, merged code — not
  based on this document's existence.
- `CURRENT_STATE.md`: update "What happens next" to name Document 003 (and, in parallel per the
  Track B note in `IMPLEMENTATION_ORDER.md`, Documents 007/008) as the next approved action, once 002
  has actually closed.
- No other top-level document requires a status change from this document's work — `BOT_API_REQUIREMENTS.md`, `BOT_SECURITY_MODEL.md`, and `BOT_ARCHITECTURE.md` remain accurate as written and
  need no edit, since this document implements exactly what they already specified rather than
  changing any prior decision.

## 28. Final report format

The implementer's completion report for this document must state, in this order:

1. **Status:** COMPLETE or BLOCKED (with the specific blocking reason, e.g., "Document 001 has not
   itself closed").
2. **What was built:** the package path, the list of resource methods implemented (mapping 1:1 to
   section 11's table), and the error-class list implemented (mapping 1:1 to section 17's table).
3. **What was deliberately not built:** restate section 8's exclusions, and explicitly restate that
   only anonymous/public endpoints are callable in a real deployment today, pending
   `BOT_API_REQUIREMENTS.md` §1–3.
4. **Verification evidence:** the actual output/pass status of every command in section 25.
5. **Completion checklist:** section 26, each item marked done/not-done with evidence (test name,
   file path, or log excerpt) — never marked done on assertion alone.
6. **Any deviation from this document's scope**, with justification, flagged explicitly rather than
   silently folded into "what was built."

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
