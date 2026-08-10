# 016 — Observability, audit correlation and operational controls

## 1. Metadata

- **Document number:** 016
- **Title:** Observability, audit correlation and operational controls
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 002 (Slice API client and shared contracts — request-ID
  propagation origin), 003 (interaction framework — router is where correlation IDs are minted), 004
  (account-linking domain), 005 (account-linking commands), 006 (permission/authorization
  integration), 007 (marketplace/asset commands), 008 (collector/vault commands), 009
  (watchlist/portfolio commands), 010 (notification commands), 011 (support/ticket migration), 012
  (moderation suite migration), 013 (admin read-only operational commands), 014 (community/engagement
  features), 015 (background jobs and scheduled digests) — every command family and job this document
  instruments must already exist
- **Blocks (this build guide):** 017 (Testing and Discord interaction E2E — its error-path and
  audit-correlation test cases assume this document's logging/metrics contracts already exist)
- **Slice backend dependency:** none — this document adds no new Slice endpoint calls; it consumes
  Slice's existing typed error envelope and `AuditEvent` request-ID conventions (Docs 001, 004–008,
  already VERIFIED) purely as read/log inputs
- **Can start today:** Blocked — requires documents 002–015 to have landed first, since this document
  instruments command families, jobs, and error paths that do not exist until then

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`) that is
authoritative for every product, financial, and identity concept. The Discord bot being planned in
this build guide is a **companion client to Slice** — it never becomes a second backend, never
duplicates Slice's business rules, and never queries Slice's Postgres/Prisma directly; every read or
write goes through Slice's HTTP API. Per `IMPLEMENTATION_ORDER.md`, this document (016) is a
cross-cutting layer that sits **across** everything built in Documents 002–015: it does not add new
user-facing commands. Instead it defines how every command, button, modal, and background job that
those documents deliver becomes observable, traceable end-to-end from a Discord interaction through
to a Slice API call and back, how operators detect and respond to problems in production, and how the
bot's own operational logging correlates with — but never duplicates — Slice's own `AuditEvent`
stream. This document runs after Track A (004–006, 009, 010, 013), Track B (007, 008, 015's
market-digest jobs), and Track C (011, 012, 014, 015's ticket/mute/giveaway jobs) have all landed, and
it directly precedes Document 017 (testing) and Document 018 (deployment/launch hardening).

## 3. Current implementation audit

Before this document starts, Documents 001–015 have (per their own completion checklists) delivered:
a Discord interaction framework and command registry (003) that already mints a bot-local request ID
per interaction at the router layer per `BOT_ARCHITECTURE.md`'s "Structured logging / request IDs"
section; a typed Slice API client (002) that already attaches a correlation identifier to outbound
calls and receives Slice's own returned request ID; command handlers across 005–014 that already call
`ERROR_CATALOGUE.md`'s mapping layer on failure; and background jobs (015) that already have
per-job-run failure handling (retry/backoff/dead-letter, per `EVENT_AND_JOB_CATALOGUE.md`). What does
**not** yet exist before this document: a formalized structured-logging schema enforced consistently
across every command/job module; metrics collection and dashboards; alerting thresholds; a
feature-flag/emergency-disable operational surface beyond the per-command-family flags described in
`BOT_ARCHITECTURE.md` and `DEPLOYMENT_PLAN.md`; and a documented procedure for correlating a bot log
line with a specific Slice `AuditEvent` row during a support investigation. This document formalizes
and wires together conventions that 002–015 already gesture at individually, without re-opening or
re-implementing any of those documents' own scope.

## 4. Old bot behavior migrated

- `OLD_BOT_FEATURE_INVENTORY.md` row 28, `cogs/ErrorHandler.py` ("Global error handler") — status
  **REWRITE**. The old bot's generic `OtherError` branch echoed the raw exception message directly
  into a user-facing embed (`f'```py\n{error}```'`), which the inventory explicitly flags as able to
  "leak internal error detail (e.g., DB error text) to any user." `OLD_TO_NEW_MIGRATION_MATRIX.md`
  M6 specifies the reused concept ("map errors to friendly embeds") and the fix ("drop the
  raw-exception-to-user leakage; log full detail server-side/to a private channel only"), with the
  explicit completion criterion: "no code path can put a raw exception message, stack trace, SQL
  fragment, or [backend response body] [in front of an end user]." This document is the structured-
  logging and operational-controls half of that fix: Document 003 and each command-family document
  (005–014) already own the *per-command* mapping (mapping a known Slice error code to a friendly
  string, per `ERROR_CATALOGUE.md`); this document owns the *system-wide guarantee* that the unknown/
  unexpected branch can never bypass that mapping, that full exception detail always lands in the
  bot's own structured log (never Discord) with a request ID the user-facing message can safely
  quote, and that this guarantee is continuously verified (§21–24) rather than assumed once and
  forgotten.
- No other old-bot row maps to this document's scope. The old bot had no metrics/dashboards, no
  alerting, and no feature-flag system (`main.py` and its cogs load unconditionally at startup with
  no runtime toggle) — those are new capabilities with no old-bot predecessor, not migrations.

## 5. Slice features supported

This document touches no new Slice feature area directly — it is instrumentation of the bot's own
call sites into Slice, not a new Slice integration. It relies on the following, already-VERIFIED per
`CURRENT_STATE.md`/`project-state.json`, Slice backend conventions as read-only inputs to its
correlation model:

- Slice's structured error envelope (`code`, `message`, a request/correlation identifier) — VERIFIED,
  defined across Slice backend Docs 001, 004–008 (all in `sliceBackendStatus.completedDocuments`),
  consumed (not re-implemented) by `ERROR_CATALOGUE.md` and by this document's correlation-ID
  threading.
- Slice's `AuditEvent` model — VERIFIED, written by Slice itself on every mutation the bot triggers
  (BOT_SECURITY_MODEL.md §5). This document defines how the bot's own local log entry references a
  Slice `AuditEvent`/request ID for support correlation; it never reads, re-writes, or duplicates the
  `AuditEvent` table itself.
- Slice Doc 016 (wallet/deposit/withdrawal) is **DEFERRED** per `project-state.json` — this document
  does not instrument any wallet-adjacent flow because no such command exists anywhere in
  `COMMAND_CATALOGUE.md`.

## 6. Files to read before starting

- `BOT_SECURITY_MODEL.md` §5 (idempotency/rate-limit/audit bot-side obligations), §10 (logging
  redaction, DM privacy, ticket privacy), §11 (admin action confirmation)
- `BOT_ARCHITECTURE.md` — "Structured logging / request IDs", "Audit correlation", "Error handling",
  and the `/health`/`/ready` convention
- `DEPLOYMENT_PLAN.md` — environments, rollout sequence, rollback (feature flags as the primary
  rollback mechanism)
- `EVENT_AND_JOB_CATALOGUE.md` — every scheduled job's failure-handling column
- `ERROR_CATALOGUE.md` — the full Slice-error-code-to-Discord-message mapping table and its closing
  rule ("the generic/unrecognized branch must never interpolate the raw exception object into a
  user-facing string")
- `BOT_DATA_OWNERSHIP.md` — the "Audit events" row ("Bot writes its own *correlated* local log entry,
  never a competing audit record")
- `COMMAND_CATALOGUE.md` — the "Audit" column for every command, to know exactly which commands
  already carry an audit obligation from Slice's side vs. which are bot-local-only
- `OLD_BOT_FEATURE_INVENTORY.md` row 28 and `OLD_TO_NEW_MIGRATION_MATRIX.md` M6 (see §4 above)
- `PERMISSION_MATRIX.md` — to know which commands require fresh-checked Slice permissions (relevant
  to what an authorization-failure metric should track)
- `TEST_STRATEGY.md` — "Security QA" (grepping logs for leaked secrets) and the manual QA "Error QA"
  pass, which this document's log schema must make mechanically checkable
- Implementation documents 002–015 themselves, specifically each one's §16 ("Audit requirements") and
  §17 ("Error behavior"), to confirm this document is formalizing what they already committed to, not
  inventing new per-command behavior

## 7. Strict scope

- A structured-logging schema (field names, required fields, redaction rules) used by every command
  handler, event handler, and background job across the whole bot codebase.
- A correlation-ID model: how a bot-local request ID is minted at the interaction router (Doc 003),
  threaded through the application-service layer and the Slice API client (Doc 002), attached to
  outbound Slice calls, and logged alongside Slice's own returned request ID — for both successful and
  failed calls.
- A hard, code-level and process-level guarantee (building on Doc 003/each command document's own
  per-command error mapping) that no raw exception, stack trace, SQL fragment, or Slice response body
  ever reaches a Discord-facing message, closing the `ErrorHandler.py` class of bug for good, including
  for *future* command families added after this document lands.
- Metrics collection: command invocation count, command latency (p50/p95/p99), command error rate
  (by Slice error code and by "unrecognized" bucket), Discord API error rate, background job
  success/failure/duration, gateway connection state, `/ready` dependency health.
- Dashboard definitions (what is shown, not the dashboarding tool's pixel-level layout) built from
  those metrics.
- Alerting thresholds and their target (on-call channel/rotation) for the conditions operations must
  react to.
- A runbook-style operational-controls section: feature-flag toggles per command family (extending
  `BOT_ARCHITECTURE.md`'s and `DEPLOYMENT_PLAN.md`'s default-off philosophy into a documented runtime
  control surface), and an emergency single-command or single-family disable procedure independent of
  Discord's own command-deregistration propagation delay.
- A documented procedure for correlating a bot-side log entry with the corresponding Slice
  `AuditEvent` row during a support investigation, explicitly reconciling (not duplicating) the two
  systems' audit trails.
- Extension of the `/health`/`/ready` endpoints (introduced conceptually in `BOT_ARCHITECTURE.md`
  and `DEPLOYMENT_PLAN.md`) with the specific dependency checks this document requires them to report.

## 8. Out of scope

- Any new user-facing Discord command, button, or modal — this document instruments existing surfaces
  from 002–015, it does not add product surface.
- Choosing or provisioning a specific metrics/log aggregation vendor/product (e.g., a specific APM
  SaaS) — this document specifies the schema and the operational contract; the concrete tool choice is
  an infrastructure decision left to Document 018 (deployment/production hardening), consistent with
  reusing "the same base image conventions as `server/`" per `BOT_ARCHITECTURE.md`.
- Any change to Slice's own logging, metrics, or `AuditEvent` implementation — this document is
  strictly read/consume-only against Slice's existing conventions.
- A new Slice endpoint for audit correlation — none is required; correlation is achieved purely by the
  bot logging the request/correlation ID Slice's existing error envelope and audit writes already
  expose (BOT_SECURITY_MODEL.md §5).
- The `notification-delivery-consumer` job's observability — it is explicitly "Phase 2, not built"
  per `EVENT_AND_JOB_CATALOGUE.md` and out of scope until Slice Doc 017 and a `DISCORD` channel type
  ship.
- Building the actual feature-flag storage backend from scratch — it reuses the bot-owned persistence/
  config mechanism already established by Doc 001/003 (typed config loader, per-guild config in
  `BOT_DATA_OWNERSHIP.md`'s "Guild configuration" row); this document defines the flag taxonomy and
  operational procedure around it, not a new database technology.

## 9. Dependencies

- No new third-party runtime dependency is strictly required to implement the schema and correlation
  model itself (it can be built on Node's standard structured-logging patterns, e.g. a JSON-line
  logger already implied by "reuse Slice's existing structured-logging/request-ID conventions" in
  `BOT_ARCHITECTURE.md`).
- A metrics client library compatible with whatever collector Document 018 selects (e.g., a
  Prometheus-client-style library or an OpenTelemetry SDK) is anticipated but the specific package is
  an infrastructure choice deferred to Document 018, consistent with §8's scope boundary.
- No new Slice-side dependency — this document calls no new Slice endpoint.
- Reuses the BullMQ technology already selected for background jobs (`BOT_ARCHITECTURE.md`,
  `EVENT_AND_JOB_CATALOGUE.md`) for job-metric emission; does not introduce a second job/queue
  technology.

## 10. Bot-owned persistence

- **New table: `FeatureFlag`** (bot-owned, no Slice equivalent) — `key` (unique, e.g.
  `command.watchlist`, `command.mod.ban`, `job.market-digest`), `enabled` (boolean, default `false`
  per the default-off philosophy in `DEPLOYMENT_PLAN.md`), `scope` (`GLOBAL` or `guildId`-scoped, per
  `BOT_SECURITY_MODEL.md` §2's rule that guild-scoped config must never be mixed with the global
  Discord↔Slice identity mapping), `updatedBy` (Discord user ID of the operator who last toggled it),
  `updatedAt`, `reason` (free-text operator note, e.g. "disabled pending incident #123"). This is the
  storage layer behind §14/16's operational-controls procedure.
- **New table: `OperationalAuditLog`** (bot-owned, strictly distinct from Slice's `AuditEvent`,
  per `BOT_DATA_OWNERSHIP.md`'s "Audit events" row: "Bot writes its own *correlated* local log entry,
  never a competing audit record") — records bot-operational actions that have no Slice counterpart:
  feature-flag toggles, emergency command disables, and job dead-letter acknowledgements. Fields:
  `id`, `actorDiscordUserId`, `action` (`FLAG_TOGGLED` / `COMMAND_DISABLED` / `JOB_DEAD_LETTER_ACK`),
  `target` (flag key / command name / job name), `previousState`, `newState`, `reason`, `createdAt`.
  This table is explicitly **not** an audit trail for Slice-side mutations (those remain solely
  Slice's `AuditEvent`, referenced only by correlation ID, per §16) — it exists only for actions that
  are entirely bot-local and have zero Slice-side record.
- Structured log lines themselves (the per-interaction/per-job JSON log entries defined in §16) are
  **not** stored in a bot-owned relational table — they are written to the process's structured log
  stream (stdout, per standard container-log conventions matching `server/`) and shipped to whatever
  log aggregation platform Document 018 provisions. Only the two tables above are bot-owned persistent
  state; the log stream itself is operational infrastructure, not application data.

## 11. Slice API dependencies

This document introduces **zero new Slice API calls**. It only formalizes how the bot logs and
measures calls that Documents 002–015 already make. For completeness, the table below restates those
existing calls' correlation-relevant contract (auth/audit columns exactly as tagged in
`BOT_API_REQUIREMENTS.md`) rather than adding anything new:

| Slice API surface | Tag (per BOT_API_REQUIREMENTS.md) | Relevance to this document |
|---|---|---|
| Every "Already available" endpoint (§ "Already available" table, `BOT_API_REQUIREMENTS.md`) | VERIFIED | Every call's response (success or the Slice error envelope) is logged with its returned request ID per §16; no new call added |
| `POST /v1/bot/discord-link/challenge`, `/v1/me/discord-link/complete`, `/v1/bot/discord-link/unlink`, `GET /v1/bot/discord-link/:discordUserId` | bot-only-service-endpoint, proposed, not yet built (BOT_API_REQUIREMENTS.md §1) | If/when built, their audit writes on Slice's side are what this document's correlation procedure (§16) points support staff to via the logged request ID; this document does not depend on them existing to close, since it only needs *a* request-ID convention, already present on VERIFIED endpoints, to demonstrate the correlation pattern |
| `POST /v1/bot/tokens/exchange` | bot-only-service-endpoint, proposed, not yet built (BOT_API_REQUIREMENTS.md §2) | Same as above — pattern applies once built; the correlation-ID logging convention this document specifies is endpoint-agnostic and requires no change when this endpoint ships |

## 12. Commands / events / jobs delivered

This document delivers **no new commands, events, or jobs** to `COMMAND_CATALOGUE.md` or
`EVENT_AND_JOB_CATALOGUE.md`. It instruments the full set already delivered by 005–015. For traceability,
every row in `COMMAND_CATALOGUE.md` (Phase 1, Admin, Support/community) and every row in
`EVENT_AND_JOB_CATALOGUE.md`'s "Scheduled jobs" table gains, as a cross-cutting requirement from this
document and not as a new catalogue row:

- A structured log line on invocation (start) and on completion (success/error) per §16's schema.
- A latency measurement from interaction-received to response-sent (or job-start to job-end).
- An error-outcome classification (mapped Slice error code / Discord-side failure / unrecognized) fed
  into the metrics described in §16's "Metrics" subsection.
- Coverage by the feature-flag mechanism described in §16's "Operational controls" subsection, keyed
  by the same command-family granularity `BOT_ARCHITECTURE.md` already describes ("feature flags per
  command family... new bot features ship flagged off by default in production").

No row in either catalogue file is edited by this document; this is a behavioral overlay, not a new
surface.

## 13. Permission rules

- This document adds **one new operator-facing capability**: toggling a `FeatureFlag` or issuing an
  emergency command disable (§16). Per `PERMISSION_MATRIX.md`'s pattern for bot-owned-only
  capabilities with no Slice concept to check against ("Bot-owned-only commands... use Discord-side
  gates exclusively"), this capability is gated by a **bot admin role** (the same Discord-side role
  used for `/admin audit`, `/admin status-history`, `/admin link-lookup` per `COMMAND_CATALOGUE.md`'s
  Admin table) — it is explicitly **not** gated on a Slice-side permission, since feature flags and
  command-disable state are pure bot-operational data with no Slice counterpart (`BOT_DATA_OWNERSHIP.md`
  confirms "Guild configuration" and equivalent operational state are bot-owned).
- Reading dashboards/metrics is an infrastructure-access concern (who can reach the metrics/log
  platform), not a Discord permission — it is out of this document's Discord-permission scope and is
  governed by whatever access control Document 018's infrastructure choice provides.
- Consistent with `PERMISSION_MATRIX.md`'s standing rule, restated here because it is directly
  relevant to this document's audit-correlation work: **a Discord role check is always a gate, never a
  substitute for the corresponding Slice-side check** when a command touches Slice data. This
  document's logging must record *both* the Discord-side permission-gate outcome and (where
  applicable) the fresh Slice-side authorization result for every privileged interaction, specifically
  so that an authorization-bypass attempt (Discord role present, Slice check failed, or vice versa) is
  visible in the metrics/alerting this document defines (§16), not just in the individual command's
  own error handling.

## 14. Security requirements

- Directly extends `BOT_SECURITY_MODEL.md` §10 ("Logging redaction, DM privacy, ticket privacy"): "No
  log line, embed, or transcript ever contains a raw email address, password, token, or session
  cookie. Structured logs redact known-sensitive field names by default." This document's schema (§16)
  is the concrete mechanism that satisfies that sentence — every logger call goes through a shared
  serializer that allowlists loggable fields (Discord user ID, command name, Slice request ID, error
  code, latency) and redacts/omits anything not on that allowlist by default, rather than trusting
  each of the ~40 commands across 005–014 to individually remember not to log a token.
- Directly extends `BOT_SECURITY_MODEL.md` §5: "the bot additionally logs its own local action
  (Discord user, command, outcome, Slice request ID) for correlation, but never duplicates Slice's
  audit record as a second source of truth" — this is the exact contract §16's "Audit correlation
  model" implements.
- Directly closes the class of bug identified in `OLD_BOT_FEATURE_INVENTORY.md` row 28 (raw exception
  leakage): this document requires that the *only* code path capable of producing Discord-facing error
  text is the shared error-mapping module already specified per-command in Docs 005–014 and
  centrally in `ERROR_CATALOGUE.md`; the structured logger is the *sole* destination for full
  exception detail (message, stack, any Slice response body), and a static/lint-level check (§21) is
  defined specifically to catch a future command handler that bypasses the mapper and calls
  `interaction.reply`/`editReply` with a raw caught error.
- Bot token, Slice service-account credential, and any future delegated-token material must never
  appear in a log line under any circumstance — the redaction allowlist in §16 is deny-by-default, not
  a blocklist of known-bad field names, specifically to be robust against a future field name the
  allowlist's author didn't anticipate.
- Feature-flag and emergency-disable actions (§16) are themselves security-relevant operational
  actions (e.g., disabling `/mod ban` mid-incident, or disabling account-linking during a suspected
  token-exchange abuse pattern) and are therefore written to the bot-owned `OperationalAuditLog`
  (§10) with the acting Discord user ID — an emergency disable is never anonymous.
- Metrics/dashboards must never surface PII (no email, no raw Discord username-in-clear beyond what a
  Discord ID already implies) in a label or tag that could end up in a wide-access dashboarding tool;
  aggregate counts and Discord/Slice IDs only.

## 15. Idempotency and rate limits

- This document performs no new Slice mutation, so it introduces no new `Idempotency-Key` scheme of
  its own for Slice calls; it only logs the `Idempotency-Key` already generated by each mutating
  command per `BOT_ARCHITECTURE.md`'s existing derivation rule (`(discordUserId, command,
  targetResourceId, nonce)`) as one of the structured-log fields (§16), so a duplicate-key conflict
  (`IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS`, per `ERROR_CATALOGUE.md`) is visible in the
  error-rate metrics broken out by Slice error code.
- The one bot-owned mutation this document *does* introduce — toggling a `FeatureFlag` — is
  idempotent by nature (setting `enabled` to a given value twice in a row is a no-op after the first
  write) and does not require a synthetic idempotency key; it is rate-limited only by the same
  Discord-side interaction-component cooldown pattern used for other admin actions (a short
  per-operator cooldown to prevent accidental double-submission from a slow client, not a security
  control).
- No new Slice-side rate limit is introduced. This document's metrics explicitly track how often the
  bot's existing rate-limit handling (`RATE_LIMITED` / 429, `Retry-After` honoring, per
  `ERROR_CATALOGUE.md` and `BOT_ARCHITECTURE.md`) triggers, as an input to the alerting thresholds in
  §16, but does not change the rate-limit behavior itself.

## 16. Audit requirements

### Structured logging schema

Every command handler, button/select/modal handler, event handler, and background job run emits a
single structured (JSON) log line per logical unit of work, with at minimum:

| Field | Description |
|---|---|
| `timestamp` | ISO 8601 |
| `level` | `debug` / `info` / `warn` / `error` |
| `requestId` | Bot-local correlation ID, minted once at the interaction router (Doc 003) or at job-run start, and threaded unchanged through every downstream call for that unit of work |
| `sliceRequestId` | Slice's own returned request/correlation ID, when a Slice call was made — the join key for correlating a bot log line to a Slice `AuditEvent` row |
| `discordUserId` | Present, never a raw email/username-with-discriminator lookup |
| `guildId` | Present for guild-scoped interactions, absent for DMs |
| `command` / `job` | Command name (e.g. `watchlist.add`) or job name (e.g. `market-digest`) |
| `outcome` | `success` / `slice_error:{code}` / `discord_error` / `unrecognized_error` |
| `latencyMs` | Time from interaction-received/job-start to response-sent/job-end |
| `idempotencyKey` | Present for mutating calls only |
| `errorDetail` | **Only present at `level: error`, never surfaced to Discord.** Full exception message, stack, and (if present) Slice's raw error response body |

A single shared serializer enforces this shape; no command/job module constructs its own ad hoc log
line, which is the structural fix that prevents a future command from reintroducing the
`ErrorHandler.py`-style leak by simply forgetting to redact.

### Audit correlation model — reconciling, not duplicating, Slice's `AuditEvent` stream

- Every Slice-side mutation the bot triggers is already audited by Slice itself via its own
  `AuditEvent` write (Docs 004–008's audit model, already VERIFIED). This document's logging
  **never** re-creates that record. The bot's structured log line for that interaction carries
  `sliceRequestId` — the same identifier Slice's error envelope/response already returns — as its sole
  linkage to that `AuditEvent` row.
- A support engineer investigating an incident starts from either side and joins on that ID: from a
  Discord report ("this command failed for user X at roughly this time"), search the bot's structured
  logs by `discordUserId`/`command`/time window to find `requestId` and `sliceRequestId`; from a Slice
  `AuditEvent` row, the same `sliceRequestId` (or, where Slice's audit metadata includes it, the
  bot-originated `requestId` if the API accepts a correlation header per `BOT_ARCHITECTURE.md`'s
  client design) locates the matching bot log line.
- Commands the `COMMAND_CATALOGUE.md` "Audit" column marks `n/a (read)` (e.g., `/asset search`,
  `/collector view`, `/market movers`) still get a structured log line under this document's schema
  (for latency/error metrics) but carry no `sliceRequestId`-to-`AuditEvent` linkage claim, since no
  Slice audit write occurs for a pure read — this document never implies an audit trail exists where
  `COMMAND_CATALOGUE.md` says none does.
- Commands marked `yes` or `limited` in `COMMAND_CATALOGUE.md`'s Audit column (e.g., `/account link`,
  `/account unlink`, `/notifications read`) get the full correlation: the bot's log line plus Slice's
  own `AuditEvent` are two independently-written, cross-referenceable records of the same real-world
  action — never the same record duplicated, per `BOT_DATA_OWNERSHIP.md`'s explicit rule.
- Bot-owned-only actions with no Slice counterpart at all (ticket lifecycle, moderation actions,
  giveaway management, suggestion status changes, feature-flag toggles) are recorded **only** in the
  bot's own persistence (ticket transcripts, moderation-history table per `BOT_DATA_OWNERSHIP.md`, or
  the new `OperationalAuditLog` from §10) — there is no Slice `AuditEvent` to correlate against, and
  this document does not fabricate one.

### Metrics

- **Command metrics** (per command name, per guild where meaningful): invocation count, latency
  histogram (p50/p95/p99), success rate, error rate broken down by `outcome` bucket (mapped Slice error
  code / Discord-side failure / unrecognized).
- **Job metrics** (per job name, per `EVENT_AND_JOB_CATALOGUE.md` row): run count, duration, success/
  failure/retry/dead-letter counts.
- **Gateway/dependency health:** Discord gateway connection state (connected/reconnecting/down) and
  duration of any disconnect; Slice API reachability (derived from the `/ready` check, §16
  "Operational controls" below); bot DB/Redis reachability.
- **Unrecognized-error rate:** a dedicated top-level metric (not just a sub-bucket) for the
  `unrecognized_error` `outcome` value, because a sustained non-zero rate here is precisely the signal
  that would have caught an `ErrorHandler.py`-style regression before it reached a user — this metric
  is the direct operational descendant of that finding.

### Dashboards

- A "command health" dashboard: per-command-family latency and error-rate trends over the rolling
  24h/7d window, so a regression introduced by a specific command family is attributable.
- A "job health" dashboard: per-job success/failure/duration trend, dead-letter queue depth.
- An "operational status" dashboard: current `FeatureFlag` state (what's enabled/disabled and by
  whom, sourced from `OperationalAuditLog`), current gateway/Slice/DB reachability, current
  unrecognized-error rate.

### Alerting thresholds

| Condition | Threshold | Target |
|---|---|---|
| Unrecognized-error rate | >0 sustained for 5 minutes | On-call channel — investigate immediately; this is the ErrorHandler.py-class regression signal |
| Command error rate (any single command) | >10% over a rolling 15-minute window with ≥20 invocations | On-call channel |
| Command p95 latency | >5s sustained for 10 minutes (Discord's own 3s ack window means anything approaching this degrades UX even with deferral) | On-call channel |
| Job failure (any job reaching dead-letter, per `EVENT_AND_JOB_CATALOGUE.md`'s "alert admin channel" convention) | any occurrence | Admin channel (mirrors the job catalogue's own stated failure handling — this document formalizes it as an alert rule rather than leaving it as prose) |
| Discord gateway disconnected | >2 minutes continuous | On-call channel |
| `/ready` reporting not-ready (any dependency down) | >2 minutes continuous | On-call channel |
| Slice `RATE_LIMITED` (429) rate | sustained spike vs. rolling baseline | Informational — investigate whether the bot's local rate-limit pre-checks (BOT_ARCHITECTURE.md) need tuning, not necessarily a Slice-side problem |

### Operational controls (runbook)

- **Feature-flag toggles:** every command family (and, where needed, an individual high-impact
  command) is gated by a `FeatureFlag` row (§10). Extends `BOT_ARCHITECTURE.md`'s "feature flags per
  command family (mirrors Slice's own Doc 018 default-off flag philosophy)" and
  `DEPLOYMENT_PLAN.md`'s "every new command family shipped flagged off by default and enabled
  guild-by-guild after QA" into a documented, admin-role-gated runtime procedure: an admin runs a
  bot-owned admin command (or uses an internal ops tool, per Document 018's eventual choice) to flip a
  flag, which takes effect on the next interaction without a redeploy or Discord command
  re-registration.
- **Emergency command disable:** per `DEPLOYMENT_PLAN.md`'s "Rollback" section — "Command
  deregistration is immediate (guild-scoped) or delayed (global) — feature flags are the primary
  rollback mechanism for behavior, not command removal, to avoid Discord's global-command propagation
  delay working against an incident response" — the emergency procedure is: (1) flip the relevant
  `FeatureFlag` to disabled, which the interaction router checks *before* invoking the command
  handler and responds with a plain "this feature is temporarily unavailable" ephemeral message
  (never a raw error); (2) this takes effect immediately for every guild regardless of Discord's
  global-command registration propagation delay; (3) the toggle and its `reason` are written to
  `OperationalAuditLog` (§10); (4) only after the incident is resolved and root-caused is the flag
  re-enabled, and only by the same admin-role gate.
- **Reconciling audit trails during an investigation:** the documented procedure is exactly the
  correlation model above — never manually copy Slice `AuditEvent` data into the bot's own store "for
  convenience," always join on `sliceRequestId`/`requestId` at investigation time.

## 17. Error behavior

- This document does not introduce any new Slice error code or Discord-facing error message; it
  relies entirely on the mapping already defined in `ERROR_CATALOGUE.md`. Its own contribution to
  error behavior is purely about *where full detail goes* (structured log, per §16) versus *what the
  user sees* (the existing friendly mapping, or — for the unrecognized branch —
  `ERROR_CATALOGUE.md`'s exact specified copy: `"Something went wrong on our end — we've logged it
  (ref: {requestId})."`, where `{requestId}` is this document's `requestId` field, giving the user a
  safe token to quote to support that a support engineer can then use to find the full `errorDetail`
  in the structured log and the linked `sliceRequestId`/`AuditEvent`, per §16's correlation model).
- Error case specific to this document: a failure in the logging/metrics pipeline itself (e.g., the
  log shipper is down) must **never** block or fail a command — logging is fire-and-forget relative to
  the user-facing response; if a log write fails, the bot degrades to a local fallback (e.g., write to
  local stdout only, skip the metrics emission) rather than surfacing any error to the Discord user or
  delaying the interaction response.
- Error case specific to this document: a `FeatureFlag` lookup failure (e.g., bot DB unreachable) must
  fail **closed** for flags defaulting to disabled and **open** (i.e., proceed) for flags whose last-
  known state was enabled only if a fresh check cannot be performed within a bounded timeout — this
  is stated explicitly here because `DEPLOYMENT_PLAN.md`'s default-off philosophy would otherwise be
  silently violated by an implementer who assumes "flag missing" means "allow."

## 18. Interaction UX

- Feature-flag admin surface: an ephemeral admin-only response listing current `FeatureFlag` rows
  (key, enabled state, scope, last-updated-by/when) with a select menu to choose a flag and a
  Confirm/Cancel button pair to toggle it — following `COMMAND_CATALOGUE.md`'s "Confirmation dialogs"
  UI standard (visible summary of the action, short timeout, no single-click destructive/impactful
  action), since disabling a command family is operationally impactful even though it isn't a
  Slice-side mutation.
- When a disabled command is invoked by a regular member, the router responds ephemeral, single
  consistent embed: "This feature is temporarily unavailable — please try again later," matching
  `COMMAND_CATALOGUE.md`'s existing "Disabled/unavailable features" UI standard ("rendered as a
  visibly disabled button or a plain-text 'not available yet' message with the reason... never a
  silently missing feature or a broken click-through") — extended here to runtime-flag-driven
  disablement, not just permanently-unbuilt Phase 2 features.
- The unrecognized-error embed (existing pattern from `ERROR_CATALOGUE.md`/`COMMAND_CATALOGUE.md`'s
  "Errors" UI standard) is unchanged by this document — this document guarantees what feeds it
  (§16/17), not its visual design.
- No new public-facing (non-admin) UX is introduced by this document.

## 19. Implementation file plan

- `src/observability/logger.ts` — shared structured-logger factory: enforces the schema in §16,
  owns the field allowlist/redaction, exposes `logger.forInteraction(requestId, ...)` /
  `logger.forJob(jobName, ...)` scoped child loggers.
- `src/observability/metrics.ts` — metrics client wrapper (counter/histogram helpers) used by the
  router, application-service layer, and job runners; vendor-agnostic interface so Document 018's
  eventual collector choice doesn't require touching call sites.
- `src/observability/correlation.ts` — request-ID minting (router-level) and propagation helper
  used by the Slice API client (Doc 002) to attach/read Slice's returned request ID.
- `src/observability/errorMiddleware.ts` — the single choke point every command/button/modal/job
  error passes through before anything reaches Discord; enforces that only `ERROR_CATALOGUE.md`-mapped
  strings or the fixed unrecognized-error copy can ever be sent to `interaction.reply`/`editReply`,
  and that `errorDetail` always goes to the logger, never to Discord.
- `src/featureFlags/featureFlagStore.ts` — reads/writes the `FeatureFlag` table (§10), exposes
  `isEnabled(key, guildId)` used by the router's pre-check (extends Doc 003's existing permission
  pre-check step with a flag pre-check).
- `src/featureFlags/operationalAuditLog.ts` — writes `OperationalAuditLog` rows (§10) on every flag
  toggle/emergency disable/dead-letter acknowledgement.
- `src/commands/admin/featureFlags.ts` — the admin-only command/component handlers described in §18.
- `src/health/ready.ts` — extends the `/health`/`/ready` HTTP handlers (introduced conceptually in
  Doc 001/`BOT_ARCHITECTURE.md`) with the specific dependency checks and metrics this document
  requires them to report (gateway state, Slice API reachability probe, bot DB/Redis reachability).

## 20. Numbered implementation steps

1. Define and document the structured-log field schema (§16) as a shared TypeScript type/interface in
   `src/observability/logger.ts`, including the field allowlist used for redaction.
2. Implement the shared logger factory and its redaction behavior; unit-test that any field not on
   the allowlist is dropped, not merely masked (deny-by-default, per §14).
3. Implement `correlation.ts`'s request-ID minting at the interaction-router layer (Doc 003's router)
   and job-run-start layer (Doc 015's job runner), and thread it through the application-service call
   signature so every downstream call (including the Slice API client from Doc 002) receives it.
4. Extend the Slice API client (Doc 002) call sites to log `sliceRequestId` from Slice's response
   alongside the bot's own `requestId`, for both success and error responses, without modifying the
   client's existing retry/idempotency logic (Doc 002's own scope).
5. Implement `errorMiddleware.ts` as the single point every command/button/modal/job error path is
   routed through; refactor existing per-command error handling from 005–014 to call this shared
   middleware instead of constructing Discord-facing error text ad hoc (a within-scope refactor of
   *call sites*, not a re-design of `ERROR_CATALOGUE.md`'s mapping table itself).
6. Add a lint rule / static check (see §21) that flags any `interaction.reply`/`editReply`/
   `followUp` call whose argument is not sourced from the error-mapping module or a known-safe
   literal, to catch a bypass of step 5 at review time.
7. Implement the metrics client wrapper and instrument the router (command latency/count/outcome),
   the job runner (job duration/outcome), and the `/ready` handler (dependency health) to emit the
   metrics in §16.
8. Define the alerting rules from §16's threshold table in whatever alerting configuration Document
   018's chosen platform uses (left as a named follow-up task for Document 018 if the platform isn't
   yet selected at this document's implementation time — this document's completion does not block on
   Document 018's tool choice, only on the metrics existing to alert on).
9. Create the `FeatureFlag` and `OperationalAuditLog` tables/migrations in the bot's own database
   (per Doc 001's chosen ORM/store).
10. Implement `featureFlagStore.ts` and wire its `isEnabled` check into the router's existing
    permission pre-check step (Doc 003), defaulting every flag to `false` for any command family not
    explicitly enabled yet, per `DEPLOYMENT_PLAN.md`'s default-off rule.
11. Implement the admin feature-flag command/UI (§18) and its `OperationalAuditLog` write.
12. Extend `/health`/`/ready` to report the dependency-health signals this document's alerting
    depends on.
13. Write the audit-correlation runbook text (the procedure in §16's "Reconciling audit trails"
    subsection) as operator-facing documentation shipped alongside the bot's own README/runbook
    location (not a change to this build guide's top-level docs).
14. Run a full regression pass across every existing command family (005–014) confirming each now
    emits the structured log schema and routes errors through the shared middleware, with no command
    left on ad hoc logging.

## 21. Unit tests

- Logger redaction: given a log call containing a field not on the allowlist (e.g., a raw email,
  a token-shaped string), assert it is omitted from the serialized output, not merely truncated/
  masked.
- Correlation-ID propagation: given a simulated interaction, assert the same `requestId` value
  appears on the router's log line, the application-service log line, and the Slice-API-client log
  line for that single interaction, and that two concurrent interactions never share a `requestId`.
- Error middleware: for every `ERROR_CATALOGUE.md` row, assert the middleware produces exactly the
  specified Discord-facing copy and that the raw input error object is present only in the logged
  `errorDetail`, never in the returned Discord-facing string. Explicit regression test: feed the
  middleware a raw `Error` object with a message containing a fake SQL fragment/stack trace and assert
  the returned Discord-facing string is the fixed unrecognized-error copy with no fragment of the
  input string present anywhere in it — this is the direct regression test for the
  `ErrorHandler.py` finding (§4/§14).
- Static/lint rule (step 6, §20): unit-test the lint rule itself against a fixture file containing a
  bypassing call (`interaction.reply(err.message)`) and assert it flags it, and against a compliant
  call and assert it does not.
- Feature-flag evaluation: `isEnabled` returns `false` for an unset flag key (fail-closed default),
  and the fail-open-on-timeout behavior from §17 is exercised with a simulated slow/unreachable flag
  store.
- Metrics helpers: latency histogram bucketing and outcome-classification logic (mapping a caught
  error to the correct `outcome` value: `slice_error:{code}` / `discord_error` / `unrecognized_error`)
  covered for every case in `ERROR_CATALOGUE.md` plus at least one genuinely unrecognized case.

## 22. Integration tests

- Against a fake/stubbed Slice API client (per `BOT_ARCHITECTURE.md`'s test-double convention): run a
  representative command from each of 005–014 through the full router → handler →
  application-service → Slice-client path, and assert a structured log line matching the §16 schema
  is emitted with correct `requestId`/`sliceRequestId` linkage for both a success and a mapped-error
  response.
- Against the bot's own disposable database (per `TEST_STRATEGY.md`'s integration-test convention):
  toggle a `FeatureFlag` via the admin command, assert `OperationalAuditLog` records it, assert a
  subsequent invocation of a command gated by that flag is correctly allowed/blocked, and assert the
  disabled-feature response matches §18's specified copy exactly (not a raw error).
- `/ready` integration test: simulate each dependency (Discord gateway, Slice API, bot DB/Redis)
  being down independently and assert `/ready` correctly reports not-ready for exactly that
  dependency, matching `BOT_ARCHITECTURE.md`/`DEPLOYMENT_PLAN.md`'s convention that `/ready` returns
  200 only when all three are reachable.
- Job-failure path: force a job run (e.g., a stubbed `market-digest` run) to fail past its configured
  retry count and assert a dead-letter metric increments and (per §16's alert table) the
  admin-channel-alert code path is invoked (mocked in test, not sending a real Discord message).

## 23. Discord interaction tests

- Simulated interaction payloads (per `TEST_STRATEGY.md`'s Discord-interaction-test convention)
  against a command gated by a disabled `FeatureFlag`: assert the response is ephemeral, matches the
  exact "temporarily unavailable" copy from §18, and that the underlying command handler's business
  logic is never invoked (the flag check must short-circuit before the handler runs).
- Simulated interaction that triggers the unrecognized-error branch (e.g., a fake application-service
  throw): assert the resulting interaction response is ephemeral, contains the fixed unrecognized-
  error copy and a `requestId`-shaped reference token, and contains no substring of the original
  thrown error's message.
- Simulated admin feature-flag toggle flow: select menu → Confirm button → assert the resulting
  ephemeral confirmation embed and that a cancel click leaves the flag state unchanged (per the
  Confirm/Cancel UI standard in `COMMAND_CATALOGUE.md`).

## 24. Manual QA checklist

- [ ] Trigger a known mapped Slice error (e.g., search a non-public collector) and confirm the
      friendly message per `ERROR_CATALOGUE.md` appears, and that the structured log for that
      interaction contains the full Slice error detail plus `sliceRequestId`.
- [ ] Force an unrecognized error (e.g., a deliberately broken test build/flag) and confirm the
      generic "something went wrong... (ref: ...)" message appears with **no** trace of internal
      detail anywhere in the Discord message, embed, or component — grep the test guild's message
      history after the pass to confirm, mirroring `TEST_STRATEGY.md`'s existing Security QA step.
- [ ] Toggle a command-family `FeatureFlag` off via the admin surface; confirm the affected command
      immediately (no redeploy) shows the "temporarily unavailable" response for a regular member in
      every guild the bot is installed to, and confirm `OperationalAuditLog` recorded the toggle with
      the correct actor.
- [ ] Toggle the same flag back on; confirm normal behavior resumes immediately.
- [ ] Kill the bot's connection to Slice's API (point at an unreachable URL in a dev environment) and
      confirm `/ready` reports not-ready specifically for the Slice dependency, while `/health` still
      reports the process alive.
- [ ] Disconnect the bot DB/Redis and confirm the same for that dependency, and confirm the
      fail-closed behavior from §17 for any flag lookup during that outage.
- [ ] Force a background job to fail past its retry count in a dev environment and confirm an alert
      fires to the configured admin channel per §16's threshold table.
- [ ] Confirm every dashboard defined in §16 renders with real data after a full manual pass through
      Phase 1 commands (reuses `TEST_STRATEGY.md`'s existing full-command-pass QA step as the data
      source for this check).

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance / fake Slice client per BOT_ARCHITECTURE.md
npm run build
```

## 26. Completion checklist

- [ ] Every command/job module across 005–015 emits the §16 structured-log schema; no ad hoc logging
      remains.
- [ ] The shared error middleware is the sole path to any Discord-facing error text; the lint rule
      from §20 step 6 is active in CI.
- [ ] The regression test from §21 directly reproducing the `ErrorHandler.py`-class leak (raw error
      text fed in, fixed safe copy asserted out) passes.
- [ ] `requestId`/`sliceRequestId` correlation is verified end-to-end for at least one command per
      command family (005–014).
- [ ] `FeatureFlag` and `OperationalAuditLog` tables exist, migrate cleanly, and default every flag to
      `false`.
- [ ] The admin feature-flag toggle UI and emergency-disable procedure are implemented and pass §23's
      interaction tests.
- [ ] `/health`/`/ready` report the dependency signals this document requires.
- [ ] Metrics for command latency/error-rate and job success/failure are emitted and visible on the
      dashboards defined in §16.
- [ ] Alerting rules from §16's threshold table are configured (or explicitly logged as a named
      follow-up for Document 018 if the alerting platform isn't chosen yet — never silently skipped).
- [ ] The audit-correlation runbook procedure is written and points to a real, tested join path
      (`requestId`/`sliceRequestId`), not a hypothetical one.
- [ ] Manual QA checklist (§24) fully passed in a dev guild.
- [ ] No log line, dashboard, or alert payload contains a raw Slice token, password, or session
      cookie, verified by the same grep-based check `TEST_STRATEGY.md`'s Security QA already performs.

## 27. Documentation updates

- `PROMPT_INDEX.md` and `IMPLEMENTATION_ORDER.md`: flip Document 016's status row from `NOT STARTED`
  to `COMPLETE` once this document's own completion checklist (§26) is satisfied — not before, and not
  based on this document's existence alone.
- `CURRENT_STATE.md`: update to reflect that observability/audit-correlation/operational-controls
  work has landed, and that Document 017 (testing) is now the next approved document.
- `MASTER_CHECKLIST.md`: no top-level-guide checklist item changes (that file governs the build
  guide's own authoring completeness, already checked off); this document's own completion is tracked
  via §26 and the two index files above, consistent with how 001–015 are expected to update those
  same files on their own closure.
- No change to `BOT_SECURITY_MODEL.md`, `BOT_ARCHITECTURE.md`, `ERROR_CATALOGUE.md`,
  `COMMAND_CATALOGUE.md`, `EVENT_AND_JOB_CATALOGUE.md`, or `BOT_DATA_OWNERSHIP.md` themselves — this
  document implements what they already specify; if implementation surfaces a genuine gap in one of
  them, that gap is raised back to a human for a top-level-document edit, not silently patched here.

## 28. Final report format

On completion, the implementer reports:

1. **Document:** 016 — Observability, audit correlation and operational controls.
2. **Status:** COMPLETE / BLOCKED — [reason], mirroring this build guide's own top-level status
   conventions.
3. **Summary:** one paragraph — what was instrumented (structured logging, correlation IDs, metrics,
   alerting, feature-flag/emergency-disable controls, audit-correlation runbook) and confirmation that
   no new Slice API surface or Discord command was introduced.
4. **Regression coverage confirmation:** explicit statement that the `ErrorHandler.py`-class raw-
   exception-leak regression test (§21) passes, since this is the single most safety-critical
   assertion this document makes.
5. **Completion checklist:** the §26 list, each item's final state.
6. **Verification command output:** results of the §25 commands.
7. **Manual QA sign-off:** who ran the §24 checklist, when, against which environment.
8. **Open items for Document 017/018:** anything explicitly deferred (e.g., final alerting-platform
   wiring left for Document 018 per §20 step 8), stated plainly, never silently dropped.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
