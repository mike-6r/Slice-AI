# Bot architecture

## Technology recommendation: TypeScript + discord.js

**Decision: build the new bot in TypeScript, on `discord.js` v14+, as a standalone Node.js service.**
Do not modernize the Python bot in place.

| Criterion | Python (discord.py/pycord) | TypeScript (discord.js) | Winner |
|---|---|---|---|
| Old code reuse | The old bot is Infria-specific and unrelated to Slice's domain; almost nothing is reusable code, only patterns (see migration matrix) | Same — patterns only | Tie |
| Team/stack alignment | Slice's backend and frontend are both TypeScript (`server/`, `src/`) | Matches exactly — same language, same tooling, same engineers can review both sides | **TypeScript** |
| Typed API contracts | Would need hand-written or generated Python types for Slice's DTOs, with real drift risk against a TS backend | Can share/generate types directly from Slice's existing TypeScript DTO definitions (or a generated OpenAPI/Zod schema) with zero translation layer | **TypeScript** |
| Deployment | Separate runtime/toolchain from the rest of Slice's infra | Same Node runtime, same container base image, same CI patterns as `server/` | **TypeScript** |
| Shared DTO generation | Not natural | Natural — import shared zod schemas/types from a `packages/shared-contracts` style package, or generate a typed client from Slice's own OpenAPI output if/when produced | **TypeScript** |
| Testing | Would introduce a second test stack (pytest) alongside the existing Vitest/Jest-style TS stack | Same test runner/assertions as the rest of the repo | **TypeScript** |
| Discord feature support | discord.py/pycord support slash commands, components, modals fine | discord.js v14 supports the full modern interaction surface equally well | Tie |
| Background jobs | Would need a second job-queue technology (Celery/RQ) distinct from whatever Slice's own Doc 017 BullMQ-based outbox uses | Can reuse the **same BullMQ** technology Slice's own Doc 017 design already specifies for its outbox/notification dispatcher — meaning a future "Discord delivery consumer" can be built with the same primitives the backend team already committed to | **TypeScript** |
| Observability | Separate logging/tracing conventions | Can reuse Slice's existing structured-logging/request-ID conventions (Doc 001) directly | **TypeScript** |
| Package management/security | pip + a second dependency-audit pipeline | npm, same audit tooling (`npm audit`) as the rest of the monorepo | **TypeScript** |
| Future scalability | Would remain a permanently separate technology island | Can eventually live in the same monorepo, share CI, share the shared-contracts package as Slice's backend evolves | **TypeScript** |

**If Python had been chosen instead:** typed Slice API contracts would need to be generated from
Slice's OpenAPI/Zod schemas into Python Pydantic models via a codegen step run in CI, with a
contract-drift test that fails the build if the generated models don't match a fresh pull from the
backend's schema source. This build guide does not pursue that path.

**Behavioral migration, not code migration.** Per `OLD_TO_NEW_MIGRATION_MATRIX.md`, every reused
concept (tickets, moderation, confirmation UX, error-mapping) is described *behaviorally* and
reimplemented from scratch in TypeScript. The old Python bot's source is not ported, copied, or
transliterated — its insecure patterns (hardcoded credentials, missing permission checks, raw
error leakage, blocking `wait_for` without timeouts) must not reappear in the new codebase. The old
bot's files remain solely as a historical behavioral reference (this build guide's inventory/matrix
documents), not as a dependency of the new project.

## Architecture overview

```text
Discord Interaction (slash command / button / modal / select)
        |
        v
Interaction Router  (command registry, permission pre-check, rate-limit pre-check)
        |
        v
Command Handler  (one module per command family; no business logic here)
        |
        v
Bot Application Service  (orchestrates: validates input, calls Slice API client,
                           applies bot-owned persistence, builds response DTO)
        |
        +----------------------------+
        v                            v
Slice API Client (typed)      Bot-owned Persistence (Postgres/SQLite via an ORM,
        |                      or a managed KV store — see BOT_DATA_OWNERSHIP.md)
        v
Slice Backend (HTTP, /v1/*)
```

- **Entry point:** `src/main.ts` — loads config, constructs the Discord client with only the intents
  actually required (never `Intents.all()` — a direct fix of the old bot's over-broad grant),
  registers command modules, starts the interaction router, starts background job workers, exposes a
  `/health`/`/ready` HTTP endpoint (mirroring Slice's own Doc 001 convention) for the bot's own
  container orchestration.
- **Configuration:** typed config loader (e.g. `zod`-validated env schema) — bot token, Slice API
  base URL, Slice service-account credentials (see BOT_SECURITY_MODEL.md — this does not exist in
  Slice today and is a named new requirement), Redis/DB connection strings for bot-owned state,
  feature flags per command family (mirrors Slice's own Doc 018 default-off flag philosophy — new
  bot features ship flagged off by default in production).
- **Command registry:** declarative command definitions (name, description, options, permission
  requirement, whether it requires a linked account, ephemeral/public default) registered against
  Discord's application-command API on startup/deploy, with a staging-vs-production command-set
  split so new commands can be tested in a dev guild before global rollout.
- **Event registry:** typed event handlers (`interactionCreate`, `guildMemberAdd` for onboarding,
  scheduled-job triggers) registered the same declarative way.
- **Discord client lifecycle:** graceful shutdown (drain in-flight interactions, stop job workers,
  close DB/Redis connections) — a direct fix of the old bot having no visible shutdown handling.
  Automatic reconnect/backoff is handled by discord.js itself; the bot layers structured logging on
  top so reconnect events are observable.
- **Slice API client:** a single typed HTTP client module wrapping every Slice endpoint the bot uses,
  generated or hand-written from Slice's DTO types. Responsibilities: attach auth (see
  BOT_SECURITY_MODEL.md), attach a generated `Idempotency-Key` on every mutation, attach a request
  ID for correlation, retry **idempotent GETs only** on a single 401-triggered refresh (mirroring the
  frontend's own documented "retry GET once, never retry mutations" rule from Doc 009A), surface
  Slice's typed error codes to the error-mapping layer, respect `Retry-After` on 429 without
  hammering the API.
- **Auth/linking module:** owns the account-link challenge/completion flow (BOT_SECURITY_MODEL.md
  §1) and the bot's own session/credential handling for calling Slice as a service identity for
  reads that don't require impersonating a specific user (e.g., public catalogue/market reads).
- **Permission module:** resolves "can this Discord user run this command" from *both* Discord-side
  role/permission checks *and* (for account-scoped commands) a fresh Slice-side permission/status
  check — never trusts a cached Slice status for a mutating command (see BOT_SECURITY_MODEL.md).
- **Rate-limit handling:** local pre-check (avoid calling Slice at all for an obviously-throttled
  user) plus honoring Slice's own `RateLimit-*`/`Retry-After` response headers; local Discord-side
  cooldowns for bot-owned commands (tickets, giveaways) independent of Slice.
- **Idempotency handling:** every mutating Slice call gets a deterministic `Idempotency-Key` derived
  from `(discordUserId, command, targetResourceId, nonce)` where `nonce` is fixed per logical user
  intent (e.g., regenerated only if the user explicitly retries after an error, not on every Discord
  gateway retry).
- **Interaction response helpers:** typed builders for deferred responses (Discord's 3-second
  interaction ack window is always respected — every Slice call happens after an immediate `defer`),
  ephemeral-vs-public defaults per command (COMMAND_CATALOGUE.md), and a single embed-builder module
  (BOT_PRODUCT_SPEC.md UI standards).
- **Pagination components:** shared button-based paginator wrapping Slice's cursor-based pagination
  (`{items, nextCursor, hasMore}`) — one implementation reused by `/asset search`, `/watchlist list`,
  `/notifications list`, `/collector search`, admin audit lookups, etc.
- **Persistent buttons/views:** ticket lifecycle buttons, suggestion status buttons, giveaway entry
  buttons — all use Discord's persistent custom-ID pattern (survive bot restarts) with the custom ID
  containing only opaque bot-owned resource IDs, **never** a Slice token, email, or raw internal ID.
- **Background jobs:** BullMQ-based (matching Slice's own Doc 017 technology choice) for: ticket
  auto-close inactivity sweep, mute-expiry, giveaway timer/winner selection, scheduled market-summary
  digest (polling Slice's real DEMO-labeled data), future notification-delivery consumer once Slice
  ships Doc 017 and a Discord channel type.
- **Notification delivery:** **not implemented in this build guide** beyond the pull-based
  `/notifications` commands, because no push mechanism or Discord channel type exists in Slice today
  (BOT_PRODUCT_SPEC.md §5). The architecture reserves a `NotificationDeliveryConsumer` module stub
  documented for Phase 2, designed to attach to Slice's outbox once it exists.
- **Audit correlation:** every bot-side action that maps to a Slice mutation carries the Slice
  request ID through to the bot's own structured log line, so a support engineer can correlate a
  Discord interaction with a specific Slice `AuditEvent` row.
- **Structured logging / request IDs:** every interaction generates a bot-local request ID at the
  router layer, propagated through the application service and the Slice API client (sent as a
  correlation header if Slice's API accepts one, otherwise logged alongside Slice's own returned
  request ID).
- **Error handling:** see `OLD_TO_NEW_MIGRATION_MATRIX.md` M6 and `ERROR_CATALOGUE.md`.
- **Test doubles:** a hand-written fake Slice API client (typed against the same interface as the
  real client) for unit-testing command handlers without network calls; a real Slice API client
  pointed at a disposable local Slice instance for integration tests (mirroring how Slice's own
  backend tests spin up disposable Postgres/Redis per Doc 002).
- **Integration tests:** exercise real Discord.js interaction objects (via discord.js's test
  utilities / a mocked gateway) against the real command handler stack, with the fake or disposable
  Slice client.
- **Deployment:** containerized (same base image conventions as `server/`), one process for the
  Discord gateway connection, separate process(es) for background job workers (so a gateway
  reconnect never blocks job processing and vice versa).
- **Health/readiness:** `/health` (bot process alive) and `/ready` (Discord gateway connected + Slice
  API reachable + bot DB/Redis reachable), mirroring Slice's own Doc 001/002 convention exactly.

## Bot must never do

- Never open a direct connection to Slice's Postgres database or read/write Prisma models directly.
- Never re-implement a Slice business rule (permission logic, idempotency semantics, money
  formatting) independently — always call the API and trust its answer.
- Never persist a Slice access token, refresh token, or password anywhere (message, embed, custom ID,
  log, database row).
