# 001 — Repository reconciliation and bot foundation

## 1. Metadata

- **Document number:** 001
- **Title:** Repository reconciliation and bot foundation
- **Status:** NOT STARTED (this build guide is documentation-only and contains no completed
  implementation work; see `CURRENT_STATE.md`)
- **Depends on (this build guide):** none — this is the first implementation document
- **Blocks (this build guide):** 002 (Slice API client and shared contracts), 003 (Discord
  interaction framework and command registry)
- **Slice backend dependency:** none
- **Can start today:** Yes

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`) and frontend
(`src/`); its own real, verified backend state — not its roadmap, not its frontend mocks — is the
ground truth this entire bot build guide is built on (`README.md`). The Slice Discord bot being
planned here is a **companion client** to Slice: it will call Slice's HTTP API for every read or
write it ever needs, it will never query Slice's Postgres/Prisma database directly, it will never
duplicate a Slice business rule, and it will never become a second backend
(`BOT_ARCHITECTURE.md`, "Bot must never do"). This document is the first of 18 implementation
documents (`IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md`) and the only one currently approved to
start (`CURRENT_STATE.md`). It creates the bot's own standalone TypeScript repository/project —
separate from Slice's own repository, per `BOT_ARCHITECTURE.md`'s decision to build "a standalone
Node.js service" that could *eventually* share a monorepo with Slice "as Slice's backend evolves"
(not now) — and lays the foundation (scaffolding, process split, config/secrets, a bare Discord
client bootstrap, health endpoints, CI) that every other implementation document builds on. It
delivers no product feature and calls no Slice endpoint.

## 3. Current implementation audit

Nothing. Per `CURRENT_STATE.md`: "No Discord bot code exists anywhere. There is no repository, no
`package.json`, no `src/`, nothing beyond this documentation tree." This is the first
implementation document; there is no prior document's completion state to audit against.

## 4. Old bot behavior migrated

One row from `OLD_BOT_FEATURE_INVENTORY.md` is in scope:

| # | Feature | Source | Migration status | This document's treatment |
|---|---|---|---|---|
| 1 | Bot bootstrap / cog loader | `main.py` startup | **REMOVE** (rebuild bootstrap from scratch on a modern framework) | The old bootstrap loaded every `.py` file in `cogs/` with no ordering guarantees, requested `Intents.all()` unconditionally, granted `jishaku` live code-eval to two hardcoded Discord user IDs, and had no graceful shutdown or health check. None of this is ported. This document rebuilds the bootstrap concept from zero: a typed config loader, a client constructed with an explicit minimal intents list, graceful shutdown, and real `/health`/`/ready` endpoints — none of which existed in the old bot. |

`OLD_TO_NEW_MIGRATION_MATRIX.md`'s "Explicitly not migrated (REMOVE, no replacement)" section
confirms this: "Bot bootstrap/cog-loader pattern ... " is listed first among features with no
migration mapping (M1–M7) because it is infrastructure, not product behavior — there is nothing to
behaviorally preserve, only risks to avoid repeating (`Intents.all()`, no shutdown handling, no
health check, hardcoded owner IDs standing in for real permission checks).

No other old-bot row belongs to this document. Tickets (M1), moderation (M2), auto-moderation
(M3), giveaways (M4), suggestions (M5), error handling (M6), and the shared embed/confirmation
helper (M7) all belong to later documents (011, 012, 014, 003) once the interaction framework
exists.

## 5. Slice features supported

None. This document is pure bot-side foundation and touches no Slice feature area — its Slice
backend dependency is explicitly "none" (`IMPLEMENTATION_ORDER.md` row 001). No Slice endpoint is
called (see §11) and no Slice feature document (backend Docs 001–018) is read for product content
here, only for infrastructure *convention* (see §6). For context only: per `project-state.json`,
Slice's own backend has completed Docs 001–008, 010, 011; partially completed 009/009A; not
started 012–015, 017, 018; and deferred 016 — none of that state gates this document, since this
document neither reads nor writes any Slice product data.

## 6. Files to read before starting

This build guide:

- `README.md`, `CURRENT_STATE.md`, `project-state.json` — overall state and ground rules.
- `IMPLEMENTATION_ORDER.md`, `PROMPT_INDEX.md` — this document's place in the dependency graph.
- `IMPLEMENTATION_DOCUMENT_TEMPLATE.md` — the structure this document (and the completion report)
  must follow.
- `BOT_ARCHITECTURE.md` — in full; this document implements its "Entry point," "Configuration,"
  "Discord client lifecycle," and "Health/readiness" bullets exactly, and must not implement
  anything from its later bullets (Slice API client, auth/linking, permission module, rate-limit
  handling, background job *content*, pagination, persistent buttons) — those belong to later
  documents.
- `BOT_SECURITY_MODEL.md` §4 (bot token / Slice credential safety) and §10 (logging redaction) —
  the only sections of this document that are actionable before any command or Slice call exists.
- `BOT_DATA_OWNERSHIP.md` — confirms no bot-owned table is due yet (first is Doc 011).
- `DEPLOYMENT_PLAN.md` — in full; this document implements its "Runtime" (two-process split,
  `/health`/`/ready`) and "Secrets" sections, and the first line of its "Rollout sequence" ("Deploy
  to dev guild ... Implementation Docs 001–003").
- `OLD_BOT_FEATURE_INVENTORY.md` row 1 and `OLD_TO_NEW_MIGRATION_MATRIX.md`'s "Explicitly not
  migrated" section (see §4 above).
- `TEST_STRATEGY.md` — in full, for the verification-command convention this document must set up.
- `MASTER_CHECKLIST.md` — style reference for §26 of this document.

Slice source/doc paths to read for **convention-matching only** (never for product behavior, since
none is in scope):

- Slice's `server/package.json`, `tsconfig.json`, ESLint/Prettier config, and test-runner config
  (Vitest or Jest — `BOT_ARCHITECTURE.md` documents this only as "the existing Vitest/Jest-style TS
  stack," not a confirmed single tool) — read these directly and mirror them; do not guess or
  invent stricter/looser settings than Slice's own.
- Slice's own backend build guide, `docs/backend-build-guide/implementation/001-*.md` and
  `002-*.md` — these are the "Doc 001/002 convention" `BOT_ARCHITECTURE.md` and `DEPLOYMENT_PLAN.md`
  repeatedly say this bot's `/health`/`/ready` and structured-logging conventions should mirror.
  This document's author has not re-embedded their content verbatim here; read them directly.

## 7. Strict scope

- A new, standalone TypeScript repository/project for the Discord bot, independent of Slice's own
  repository (not a folder inside it).
- Project scaffolding: `package.json`, TypeScript config, lint/format config, test-runner config —
  matching Slice's own `server/` conventions per `BOT_ARCHITECTURE.md`.
- Base directory layout reflecting the gateway-process / worker-process split
  (`DEPLOYMENT_PLAN.md`), with both processes' entry points scaffolded.
- Typed, `zod`-validated environment/config loader: bot token, Discord client ID, log level,
  health-server port, Redis URL (needed now for the worker process's BullMQ connection scaffold),
  and reserved-but-unused config keys for the Slice API base URL and bot database URL (consumed
  starting Docs 002 and 011/012/014 respectively) — fails fast, and never echoes a secret value, on
  invalid/missing config.
- Secrets handling per `BOT_SECURITY_MODEL.md` §4: no bot token or credential in source control;
  `.env.example` with no real values; local secrets excluded via `.gitignore`; production secrets
  documented as living in the deployment secret manager (not implemented here — no deployment
  pipeline exists until Doc 018).
- A minimal Discord client bootstrap (discord.js v14) that logs in with an explicit, minimal
  intents list (never a blanket grant) and reaches Discord's `ready` state, with **zero commands
  registered**.
- Graceful shutdown handling for both processes (SIGTERM/SIGINT: close Discord connection, HTTP
  server, Redis connection).
- `/health` and `/ready` HTTP endpoints on both processes, per `DEPLOYMENT_PLAN.md`'s convention,
  scoped honestly to what exists in this document (see §11 and §18 for exactly which checks
  `/ready` can honestly perform today).
- A minimal structured (JSON-line) logger with redaction of known-sensitive field names, used by
  both processes.
- Baseline CI wiring: lint, typecheck, unit test, and build run on every push/PR.
- A minimal root README for the new bot repository (companion-client framing, env var list without
  real values, local run instructions) — this is the new repo's own README, not a build-guide
  document, and is not a substitute for any section of this file.

## 8. Out of scope

- Any Slice API client code (Doc 002).
- Any Discord command, interaction router, or event/component handler (Doc 003 and beyond) — this
  document's Discord client has no `interactionCreate` handler at all.
- Any bot-owned persistence table, ORM, schema, or migration (first real table arrives in Doc 011;
  a `DATABASE_URL` config key is reserved here but nothing connects to it or defines a schema).
- Any BullMQ queue or job processor — the worker process connects to Redis and starts, but
  registers zero queues (first real job is Doc 015's market-digest job; ticket/mute/giveaway jobs
  depend on Docs 011/012/014).
- Account linking, permission checks, rate-limit handling, idempotency-key generation, pagination,
  persistent buttons, or the embed-builder module (all later `BOT_ARCHITECTURE.md` components).
- Any old-bot feature migration beyond the bootstrap row itself (M1–M7 all belong to later
  documents).
- Containerization/Dockerfile, image publishing, or any production deployment pipeline step — per
  `IMPLEMENTATION_ORDER.md`, deployment/production hardening is Doc 018's scope; this document only
  establishes the process split Doc 018 will later containerize.
- Global or guild-scoped Discord application-command registration of any kind (there are no
  commands to register).
- Any actual coding work beyond this document's own stop condition (§29) — Document 002 does not
  begin as part of this document's completion.

## 9. Dependencies

Runtime/library dependencies newly introduced by this document:

| Dependency | Purpose | Notes |
|---|---|---|
| `typescript` | Language/compiler | Version and strictness mirrored from Slice `server/tsconfig.json`, confirmed at implementation time, not invented here |
| `discord.js` (`^14`) | Discord gateway client | Per `BOT_ARCHITECTURE.md`'s technology decision |
| `zod` | Env/config schema validation | Per `BOT_ARCHITECTURE.md`'s "typed config loader (e.g. `zod`-validated env schema)" |
| `bullmq` + `ioredis` | Worker-process job queue scaffold | Zero queues registered in this document; introduced now only because `DEPLOYMENT_PLAN.md` specifies the worker process as BullMQ-based from the start of the process split |
| Node.js built-in `node:http` (or an equivalently minimal HTTP layer) | `/health`/`/ready` endpoints | Kept deliberately minimal — two routes, no framework decision beyond this document's needs; a fuller HTTP framework is not assumed here since no build-guide document specifies one |
| ESLint + `@typescript-eslint`, Prettier | Lint/format | Exact plugin set mirrored from Slice `server/`'s existing config |
| Test runner (Vitest or Jest — confirm against Slice `server/`'s actual choice) | Unit/integration tests | `BOT_ARCHITECTURE.md` documents this only as "Vitest/Jest-style"; do not guess which one Slice actually uses — read its config |
| `tsx` (or `ts-node`) | Local dev execution of TS entry points | Dev-only dependency |
| CI system matching Slice's own repository's provider | Lint/typecheck/test/build on push/PR | Confirm Slice's actual CI provider by reading its repo before configuring; do not invent one |

No dependency on any Slice-side package, generated client, or shared-contracts package yet — that
begins in Doc 002.

## 10. Bot-owned persistence

None. This document creates no table, collection, schema, or migration. A `DATABASE_URL` config
key is defined in the env schema (so later documents don't have to redesign config loading) but
nothing in this document connects to it, defines an ORM model against it, or reads/writes through
it. Per `BOT_DATA_OWNERSHIP.md`, the first genuinely bot-owned persistence (ticket/moderation
config, guild config) arrives no earlier than Doc 011.

## 11. Slice API dependencies

None. This document calls zero Slice endpoints.

| Endpoint | Tag | Called by this document? |
|---|---|---|
| — | — | No Slice endpoint from `BOT_API_REQUIREMENTS.md` (already-available, new-endpoint-required, or bot-only-service) is called by any code this document produces. |

`SLICE_API_BASE_URL` is reserved as a config key (per §7) so Doc 002's Slice API client can consume
it without another config-loader change, but this document performs no HTTP call to Slice, and the
Discord client's `ready` state and the `/health`/`/ready` endpoints do not depend on Slice
reachability (see §18 for why `/ready` cannot honestly check Slice yet).

## 12. Commands / events / jobs delivered

None.

| Type | Item | Impl doc (per `COMMAND_CATALOGUE.md` / `EVENT_AND_JOB_CATALOGUE.md`) |
|---|---|---|
| Command | — | First commands (`/account link`, `/help`, etc.) start at Doc 003 (`/help`, `/invite`) and Doc 005 onward |
| Discord gateway event | `interactionCreate`, `guildMemberAdd`, `messageCreate` (auto-mod), `guildCreate`/`guildDelete` | All per `EVENT_AND_JOB_CATALOGUE.md`, none handled by this document — the client bootstrap in this document only logs internal lifecycle signals (`ready`, `error`, `warn`, `shardError`) for operability, which are not product-facing gateway events from that catalogue |
| Scheduled job | `ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick`, `market-digest`, `price-alert-poll`, `prediction-scoring`, `news-feed-poll` | All per `EVENT_AND_JOB_CATALOGUE.md`, all deferred to Docs 011/012/014/015 — this document's worker process registers zero BullMQ queues/processors |

## 13. Permission rules

Not applicable to concrete rows of `PERMISSION_MATRIX.md` — this document ships zero commands, so
no capability row from that matrix is reachable yet. The standing rule the matrix closes with still
governs this document's design even though nothing exercises it today: *"a Discord-side role check
is always a gate, never a substitute for the corresponding Slice-side check when a command touches
Slice data."* This document must not build anything (e.g., a permission-module stub) that would
later make it easier to violate that rule; it deliberately does not create a permission module at
all — that begins with `BOT_ARCHITECTURE.md`'s "Permission module" component in Doc 003+.

## 14. Security requirements

From `BOT_SECURITY_MODEL.md`, only §4 and §10 are actionable in this document:

- **§4 (Bot token and Slice credential safety):** "The Discord bot token is stored only in the
  deployment secret manager, never in source control, never logged, rotated on any suspected
  compromise." This document's config loader reads the token from an environment variable only
  (populated by the secret manager in real deployments, by a local `.env` — gitignored — in dev),
  never hardcodes it, and the structured logger (§10 below) never prints it. The Slice
  service-account credential and user-scoped delegated-token mechanism described later in §4 are
  explicitly **not** relevant yet — no Slice call exists in this document.
- **§10 (Logging redaction, DM privacy, ticket privacy):** "No log line, embed, or transcript ever
  contains a raw email address, password, token, or session cookie. Structured logs redact
  known-sensitive field names by default." This document's logger implements that redaction rule
  from day one (field-name-based redaction for keys like `token`, `password`, `secret`,
  `authorization`) even though nothing sensitive is logged yet beyond the bot token itself (which
  must never be a logged field in the first place — redaction is defense-in-depth, not a license to
  log secrets and rely on redaction).
- All other sections of `BOT_SECURITY_MODEL.md` (account linking, guild authorization, slash-command
  permission/role-spoofing, recent-auth, compromised-account handling, deleted accounts, admin
  confirmation) are **not applicable** to this document — none of the surfaces they govern
  (commands, buttons, modals, account links) exist yet.

## 15. Idempotency and rate limits

Not applicable. This document performs no Slice mutation (no Slice call of any kind), so no
`Idempotency-Key` scheme applies. No command exists, so no Discord-side rate limit or cooldown
applies either. `BOT_ARCHITECTURE.md`'s idempotency-key derivation scheme
(`(discordUserId, command, targetResourceId, nonce)`) is a future consumer of this document's
config/logging foundation, not something this document implements.

## 16. Audit requirements

This document introduces the bot's own **operational** structured log only — not a Slice
`AuditEvent` (no Slice call exists to write one) and not a bot-owned audit table (no persistence
exists yet). What must be logged, at this stage:

- Process startup: config validation result (success, or which key failed validation — value
  itself never logged), process type (gateway/worker), version/build identifier if available.
- Discord gateway lifecycle: `ready` (bot tag, guild count), `warn`, `error`, `shardError`,
  reconnect attempts — discord.js handles reconnect/backoff itself; this document's logger makes
  those events observable, per `BOT_ARCHITECTURE.md`'s "Discord client lifecycle" bullet.
- Worker process lifecycle: Redis connection established/lost.
- Graceful shutdown: signal received, each resource closed (Discord client, HTTP server, Redis),
  final exit.
- HTTP health/readiness responses are not logged per-request by default (would be noise from
  orchestrator polling) — only readiness *transitions* (not-ready → ready and back) are logged.

None of this is a Slice `AuditEvent` and none of it is presented as one; per `BOT_SECURITY_MODEL.md`
§5, the bot "never duplicates Slice's audit record as a second source of truth" — trivially true
here since there is no Slice-side action to duplicate.

## 17. Error behavior

`ERROR_CATALOGUE.md` maps *Slice* error codes to Discord-facing messages; none of those rows apply
to this document, since no Slice call and no Discord-facing command response exists yet. The
catalogue's closing rule — "the generic/unrecognized branch must never interpolate the raw
exception object into a user-facing string," inherited from the old bot's `ErrorHandler.py` bug
(Migration M6) — is not yet reachable via Discord (no interaction handler exists), but this
document must not violate its *spirit* at the process level:

- Config validation failure at startup: fail fast with a message naming which environment
  variable(s) are missing/invalid, never the value of any variable, and exit non-zero (not a
  crash loop).
- Discord login failure (invalid token): log a clear, generic "Discord login failed" message
  without printing the token; exit non-zero rather than retrying indefinitely with bad
  credentials.
- Worker process Redis-unreachable at startup: log the failure, keep `/health` at 200 (process is
  alive) and `/ready` at 503 (not ready), retry the connection with backoff — do not crash-loop the
  whole process over a transient Redis outage, and do not silently report ready.
- Health-server port conflict: fail fast with a clear message; do not silently bind to a different
  port than configured.

M6's full interaction-level error-mapping middleware is Doc 003's responsibility, not this
document's — this document only ensures the process-level error paths it introduces don't leak
secrets or raw exceptions, and that its logger is the sink M6's middleware will later write to.

## 18. Interaction UX

Not applicable — this document ships zero Discord commands, buttons, modals, or selects, so there
is no interaction surface to wireframe. The Discord client reaches `ready` with no
`interactionCreate` handler registered at all; a user typing `/` in a guild the bot is in sees no
bot commands. The first interaction UX is delivered by Doc 003 (the interaction framework itself)
and populated starting Doc 005. The `/health` and `/ready` endpoints are plain HTTP JSON responses
for container orchestration, not Discord UX:

- `GET /health` → `200 {"status":"ok"}` once the HTTP server is listening; this never depends on
  Discord or Redis state (liveness only).
- `GET /ready` (gateway process) → `200 {"status":"ready"}` once the Discord gateway has fired
  `ClientReady`; `503 {"status":"not_ready"}` otherwise. It does **not** check Slice API
  reachability (no Slice client exists — added in Doc 002) or bot database reachability (no table
  exists — added whichever of Docs 011/012/014 needs it first); extending `/ready` with those
  checks is explicitly deferred to those documents rather than fabricated here.
- `GET /ready` (worker process) → `200 {"status":"ready"}` once the Redis connection used for the
  BullMQ scaffold responds to a ping; `503` otherwise.

## 19. Implementation file plan

Proposed layout for the new repository (paths relative to its root):

| Path | Purpose |
|---|---|
| `package.json`, `tsconfig.json`, `.eslintrc.*`/`eslint.config.*`, `.prettierrc*`, test-runner config file | Project scaffolding, mirroring Slice `server/`'s conventions |
| `.env.example` | Documents every env var this document's config schema requires, with no real values |
| `.gitignore` | Excludes `.env`, `.env.*.local`, build output, `node_modules` |
| `.nvmrc` (or equivalent) | Pins Node.js version to match Slice `server/`'s |
| `README.md` (new repo's own) | Companion-client framing, env var list, local run instructions |
| `src/config/env.ts` | `zod` schema + loader for all environment variables (§7) |
| `src/lib/logger.ts` | Structured JSON logger with sensitive-field redaction |
| `src/lib/shutdown.ts` | Shared graceful-shutdown helper (registers SIGTERM/SIGINT, runs an ordered list of async cleanup callbacks) |
| `src/http/server.ts` | Minimal HTTP server bootstrap (routes to `/health`, `/ready`) |
| `src/http/health.ts` | `/health` and `/ready` handler logic, parameterized by a readiness-state provider |
| `src/discord/client.ts` | Discord.js `Client` factory with an explicit minimal intents list; no command/event registration beyond internal lifecycle logging |
| `src/gateway/main.ts` | Gateway process entry point: loads config, builds logger, builds Discord client, logs in, starts its `/health`/`/ready` HTTP server, wires graceful shutdown |
| `src/worker/main.ts` | Worker process entry point: loads config, builds logger, connects to Redis for BullMQ (zero queues registered), starts its own `/health`/`/ready` HTTP server, wires graceful shutdown |
| `test/config/env.test.ts` | Unit tests for the config schema (§21) |
| `test/lib/logger.test.ts` | Unit tests for redaction (§21) |
| `test/discord/client.test.ts` | Unit test asserting the exact minimal intents list is used (§21) |
| `test/http/health.test.ts` | Integration tests for `/health`/`/ready` transitions (§22) |
| CI config file (path/format per Slice's confirmed provider) | Runs lint, typecheck, `test:unit`, `test:integration`, build on push/PR |

## 20. Numbered implementation steps

1. Create a new, empty, standalone repository for the bot (separate from Slice's own repository),
   confirming its name/hosting location with the team as part of this document's "reconciliation"
   step — do not nest it inside Slice's own repository.
2. Read Slice `server/`'s `package.json`, `.nvmrc`, `tsconfig.json`, lint/format config, and
   test-runner config; note the exact Node.js version, module system (ESM/CJS), TypeScript
   strictness flags, lint rule set, and test runner in use.
3. Initialize `package.json` and install `typescript`, mirroring the module system and strictness
   confirmed in step 2.
4. Configure `tsconfig.json` mirroring Slice `server/`'s strictness settings.
5. Install and configure ESLint (`@typescript-eslint`) and Prettier mirroring Slice `server/`'s
   config; do not diverge without a documented reason.
6. Install and configure the confirmed test runner (Vitest or Jest, per step 2's finding).
7. Create the base directory layout from §19: `src/config`, `src/lib`, `src/http`, `src/discord`,
   `src/gateway`, `src/worker`, `test/`.
8. Implement `src/config/env.ts`: a `zod` schema covering `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`,
   `DISCORD_DEV_GUILD_ID` (optional, dev-only), `NODE_ENV`, `LOG_LEVEL`, `HEALTH_PORT`,
   `REDIS_URL`, `DATABASE_URL` (reserved, unused), `SLICE_API_BASE_URL` (reserved, unused). Parsing
   failure throws a single error listing which key(s) failed and why, never a value.
9. Add `.env.example` (no real values) and confirm `.gitignore` excludes real secret files.
10. Implement `src/lib/logger.ts`: JSON-line structured logger with a redaction list for known
    sensitive field names (`token`, `password`, `secret`, `authorization`, `cookie`).
11. Implement `src/discord/client.ts`: a discord.js v14 `Client` factory taking an explicit,
    minimal `GatewayIntentBits` array as a parameter (never a blanket/`Intents.all()`-equivalent
    grant) and wiring `ready`/`warn`/`error`/`shardError` to the logger only — no
    `interactionCreate` handler.
12. Implement `src/lib/shutdown.ts`: registers SIGTERM/SIGINT, runs an ordered array of async
    cleanup callbacks (Discord client destroy, HTTP server close, Redis quit), logs each step,
    exits 0 on success.
13. Implement `src/http/health.ts` and `src/http/server.ts` per §18's exact response contracts,
    parameterized so the gateway process supplies "is the Discord gateway ready" and the worker
    process supplies "is Redis reachable."
14. Implement `src/gateway/main.ts`: load config, build logger, build Discord client with the
    minimal intents list, log in, start the HTTP server, register the shutdown handler.
15. Implement `src/worker/main.ts`: load config, build logger, create the BullMQ/`ioredis`
    connection (zero queues/workers registered), start the HTTP server, register the shutdown
    handler.
16. Add npm scripts: `dev:gateway`, `dev:worker`, `build`, `start:gateway`, `start:worker`, `lint`,
    `typecheck`, `test:unit`, `test:integration`.
17. Write the unit tests from §21 and the integration tests from §22.
18. Configure CI (provider confirmed in step 2) to run `lint`, `typecheck`, `test:unit`,
    `test:integration`, `build` on every push/PR.
19. Write the new repository's own root `README.md` (companion-client framing, env var list
    without real values, local run instructions for both processes).
20. Run the full verification command set (§25) locally until green.
21. Perform the manual QA checklist (§24) in a real, disposable dev Discord guild with a real dev
    bot token.
22. Apply the documentation updates in §27.
23. Stop per §29 — do not begin Document 002 in this pass.

## 21. Unit tests

- **Config schema (`test/config/env.test.ts`):** a fully valid env object parses successfully and
  produces the expected typed config; a missing `DISCORD_BOT_TOKEN` throws with a message naming
  only the key, never a value; an invalid `HEALTH_PORT` (non-numeric, out of range) is rejected;
  optional keys (`DISCORD_DEV_GUILD_ID`) are genuinely optional.
- **Logger redaction (`test/lib/logger.test.ts`):** logging an object containing a `token`,
  `password`, `secret`, or `authorization` field emits a redacted placeholder instead of the real
  value in the serialized output; logging a benign field is unaffected.
- **Discord client intents (`test/discord/client.test.ts`):** the client factory is asserted (via
  its constructor arguments/options) to request exactly the minimal intents list this document
  defines, never a wildcard/all-intents grant — a direct regression test against old-bot row 1's
  `Intents.all()` finding.
- **Shutdown ordering (`test/lib/shutdown.test.ts`):** given mocked Discord-client/HTTP-server/Redis
  handles, the shutdown helper calls their close/destroy methods in the documented order and
  resolves; a handle that throws during close still allows the remaining handles to be closed
  (best-effort shutdown, not abort-on-first-error).

## 22. Integration tests

- **`/health` (`test/http/health.test.ts`):** once the HTTP server is listening, `GET /health`
  returns `200` regardless of Discord/Redis state.
- **`/ready` — gateway process:** before a simulated Discord `ClientReady` event fires, `GET /ready`
  returns `503`; after it fires (simulated via a fake/stubbed client emitting the event, not a live
  Discord gateway connection — mirroring `TEST_STRATEGY.md`'s "no live Discord connection" principle
  for infrastructure tests), `GET /ready` returns `200`.
- **`/ready` — worker process:** with a mocked/unreachable Redis connection, `GET /ready` returns
  `503`; with a reachable (test-container or in-memory-fake) Redis, it returns `200`.
- No integration test in this document exercises a live Discord gateway connection or any Slice API
  (none exists to test) — consistent with `TEST_STRATEGY.md`'s integration-test scope, which only
  requires a disposable Slice instance starting with the "already available" endpoints Doc 002+
  introduces.

## 23. Discord interaction tests

Not applicable — no slash command, button, select, or modal exists in this document, and the
interaction router itself is Doc 003's deliverable. There is no interaction payload for
discord.js's interaction-simulation tooling to exercise yet.

## 24. Manual QA checklist

- [ ] Start the gateway process locally with a real dev bot token, pointed at a disposable/dev
      Discord guild; confirm the bot appears online in that guild.
- [ ] Confirm the Discord command picker shows **zero** commands from this bot in that guild.
- [ ] `curl` the gateway process's `/health` — `200`.
- [ ] `curl` the gateway process's `/ready` — `200` once the bot shows online; restart with an
      intentionally invalid token to confirm it never reaches `200` (it should fail login instead,
      per §17 — this validates the negative path without needing precise timing).
- [ ] Send SIGTERM to the gateway process; confirm clean shutdown log lines, the bot goes offline
      in Discord within Discord's normal presence timeout, and no error/stack trace appears.
- [ ] Start the worker process; confirm log lines showing a successful Redis connection; `curl`
      both `/health` and `/ready` — both `200`.
- [ ] Point the worker process at an unreachable `REDIS_URL`; confirm `/health` stays `200`
      (process alive) while `/ready` returns `503`, with no crash loop and no effect on the gateway
      process (independent processes).
- [ ] Grep all local log output and terminal history for the literal bot token string — it never
      appears.
- [ ] Confirm `git status` never shows a real `.env` or other secret file as trackable/staged.
- [ ] Confirm `.env.example` contains no real values.

## 25. Verification commands

```
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

All five must pass before this document is considered complete, per `TEST_STRATEGY.md`'s
verification-command template.

## 26. Completion checklist

- [ ] New standalone bot repository created, confirmed separate from Slice's own repository.
- [ ] `package.json`, `tsconfig.json`, lint/format config, and test-runner config in place,
      mirroring Slice `server/`'s confirmed conventions.
- [ ] Base directory layout (gateway process / worker process split) created per §19.
- [ ] `zod`-validated env/config loader implemented; fails fast and safely (no secret value ever
      echoed) on missing/invalid config.
- [ ] `.env.example` committed with no real values; `.gitignore` excludes real secret files.
- [ ] Structured logger implemented with redaction of known-sensitive field names.
- [ ] Discord client bootstrap implemented with an explicit minimal intents list (never a blanket
      grant) — regression test in place against old-bot row 1's `Intents.all()` finding.
- [ ] Bot logs in and reaches Discord's `ready` state in a dev guild with zero commands registered.
- [ ] Graceful shutdown implemented for both processes.
- [ ] Worker process entry point implemented, connects to Redis, registers zero queues/jobs.
- [ ] `/health` and `/ready` implemented on both processes, scoped honestly to what exists today
      (no fabricated Slice-API or bot-database checks).
- [ ] CI wired to run lint, typecheck, `test:unit`, `test:integration`, and build on every push/PR.
- [ ] Zero bot-owned persistence tables created.
- [ ] Zero Slice API calls made anywhere in this document's code.
- [ ] Zero Discord commands, event handlers (beyond internal lifecycle logging), or jobs
      registered.
- [ ] No bot token, Slice credential, or other secret committed to source control or printed in any
      log line.
- [ ] Unit tests (§21) and integration tests (§22) passing.
- [ ] Manual QA checklist (§24) completed in a real dev guild.
- [ ] Documentation updates (§27) applied.

## 27. Documentation updates

Once — and only once — this document's own completion checklist (§26) is satisfied:

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md`: flip row 001's status from `NOT STARTED` to its
  actual closed state, per each file's own status-column convention. Do not mark it complete based
  on this build guide's text alone (`PROMPT_INDEX.md`'s own instruction).
- `CURRENT_STATE.md`: update "What happens next" once a human has reviewed Document 001's actual
  completion and decided whether to proceed to Document 002 — this document's own closure does not
  self-authorize that decision.
- `project-state.json`: update `codingStarted` to reflect that Document 001's code now exists, and
  add the new bot repository's location once created.
- No other top-level document in this build guide (`BOT_ARCHITECTURE.md`, `BOT_SECURITY_MODEL.md`,
  `BOT_DATA_OWNERSHIP.md`, `BOT_API_REQUIREMENTS.md`, `COMMAND_CATALOGUE.md`,
  `PERMISSION_MATRIX.md`, `EVENT_AND_JOB_CATALOGUE.md`, `ERROR_CATALOGUE.md`, `TEST_STRATEGY.md`,
  `DEPLOYMENT_PLAN.md`) requires a status change from this document, since none of their content
  was implemented, only their foundational conventions.

## 28. Final report format

The implementer's completion report for this document must contain, in this order:

1. **Summary** — one paragraph: what was built (repository location, process split, config/health
   foundation), confirming it matches this document's Strict Scope (§7) exactly, with no scope
   creep into Doc 002/003 territory.
2. **Files created/changed** — real, absolute or repo-relative paths, matching or explicitly
   justifying any deviation from §19's file plan.
3. **Commands run and their results** — the exact output/pass-fail of each command in §25.
4. **Manual QA results** — each checklist item from §24, checked or explicitly noted as failed with
   a reason.
5. **Deviations from this specification** — any place implementation differed from this document
   (e.g., a different test runner than assumed, a different CI provider), each with a one-line
   justification tied to evidence read in Slice's own repo (§6).
6. **Completion checklist status** — the §26 checklist, each item marked done or not done.
7. **Explicit statement** that Implementation Document 002 has not been started, per §29.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
