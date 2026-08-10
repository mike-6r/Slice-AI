# 018 — Deployment, production hardening, and final launch checklist

## 1. Metadata

- **Document number:** 018
- **Title:** Deployment, production hardening, and final launch checklist
- **Status:** NOT STARTED (every implementation document in this build guide starts in this state;
  this build guide is documentation-only and contains no completed implementation work)
- **Depends on (this build guide):** 001–017, all of them, each closed against its own completion
  checklist — not just documented, actually built, tested, and signed off. This document does not
  re-open or re-scope any of 001–017; it operationalizes what they produced.
- **Blocks (this build guide):** none — this is the last implementation document in
  `IMPLEMENTATION_ORDER.md` / `PROMPT_INDEX.md`.
- **Slice backend dependency:** none. This document deploys the bot as already scoped by 001–017; it
  does not require any new Slice backend work beyond what those documents already depended on
  (`BOT_API_REQUIREMENTS.md` §1–3 for account linking, already a prerequisite of Documents 004–006,
  009, 010, 013).
- **Can start today:** Blocked — per `IMPLEMENTATION_ORDER.md`'s own table, this is explicitly
  "Last." It cannot start until 001–017 have each individually reached their own stop condition and
  completion checklist, in order. As of this document's authorship, `CURRENT_STATE.md` records that
  **no implementation has begun at all** ("documentation complete, zero code written") — so today,
  the honest status of this document's prerequisite is "not met," and this document itself is a
  specification for launch, not a launch that has happened.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`); the Discord bot
being built from this guide is a **companion client** to Slice — it calls Slice's HTTP API through a
typed client, never queries Slice's Postgres/Prisma directly, and never becomes a second backend or a
second source of truth for anything Slice already owns (`BOT_ARCHITECTURE.md`, `BOT_DATA_OWNERSHIP.md`).
This document is the eighteenth and final entry in `IMPLEMENTATION_ORDER.md`. Documents 001–015 built
the bot's foundation, API client, command families, background jobs, and bot-owned community features;
Document 016 added observability and audit correlation; Document 017 delivered the automated and
Discord-interaction-level test suite plus an E2E pass against a disposable Slice test environment. This
document does not add product functionality. It takes `DEPLOYMENT_PLAN.md`'s environment/runtime/
secrets/rollout/rollback design — written before any code existed — and turns it into a concrete,
step-by-step runbook for moving the now-finished, now-tested codebase through dev → staging →
production, with the production hardening and final go/no-go checklist that gates the only truly
irreversible step in this whole build guide: turning the bot on for real Discord users.

## 3. Current implementation audit

This section describes the state this document **assumes** as its starting point — i.e., what must
already be true, per Documents 001–017's own completion checklists, before this document's steps are
run for real. It is written prescriptively because, as of this build guide's own authorship, none of
001–017 have actually executed (`CURRENT_STATE.md`); an implementer picking this document up must
first confirm every item below is genuinely true against a real, running codebase and real, passing
test output — not assume it because this document says so.

Assumed pre-018 state, by prior document:

| Prior document | What must already exist |
|---|---|
| 001 | Repository scaffold, typed config loader, Discord client with minimal intents, `/health`/`/ready` endpoints, graceful shutdown |
| 002 | Typed Slice API client (auth, `Idempotency-Key`, request-ID correlation, `Retry-After` handling) |
| 003 | Interaction router, command registry, event registry, `/help`, `/invite` |
| 004–006 | Account-linking domain, Discord commands, permission/authorization integration — closed only if Slice's new bot-only endpoints (`BOT_API_REQUIREMENTS.md` §1–3) exist and are verified on at least a staging Slice environment |
| 007–008 | Marketplace/asset commands, collector/Vault commands |
| 009–010 | Watchlist/portfolio commands, notification commands (pull-based only) |
| 011–012 | Support/ticket migration, moderation suite migration |
| 013 | Admin read-only operational commands |
| 014 | Community/engagement features (suggestions, giveaways, polls, FAQ, roadmap, news feed) |
| 015 | Background jobs (ticket sweep, mute expiry, giveaway tick, market digest, price-alert poll, prediction scoring, news poll) |
| 016 | Observability, audit correlation, operational controls (structured logs, request-ID propagation end to end, alerting) |
| 017 | Full unit/integration/Discord-interaction test suite green, E2E pass against a disposable Slice test environment, `TEST_STRATEGY.md` verification commands all passing |

If any of the above is not actually true — a document "on paper" but not truly closed, a flaky test
suite, an unmerged branch — this document's rollout steps (Section 20) must not proceed past dev. This
document does not re-verify 001–017's own internal correctness; it verifies that the finished product
is *deployable and safe to expose*, which is a different, narrower question.

## 4. Old bot behavior migrated

None — the old Python bot (Infria) had no formal deployment plan, no containerization, no secret
manager, and no staged/flagged rollout process to migrate. Its relevant legacy here is negative: the
old bot's known security findings (`project-state.json`'s `criticalSecurityFindingsInOldBot`) —
hardcoded plaintext production MySQL credentials in `cogs/SQL.py`, a hardcoded Tebex API secret in
`cogs/Tebex.py`, missing permission checks on giftcard lookup and giveaway reroll/end/delete, raw
exception text surfaced to users, and deprecated username#discriminator matching in unban — are the
exact failure modes this document's production-hardening steps (Section 14, Section 20) exist to
verify are **absent** from the new codebase before launch, not because there is a deployment process
to port forward, but because the same category of mistake (secrets in source, missing auth checks,
leaked internals) is the most common way a companion bot becomes an incident regardless of language or
framework.

## 5. Slice features supported

This document introduces no new Slice feature usage; it deploys what 001–017 already built against the
Slice feature areas and backend document statuses recorded in `project-state.json`'s
`sliceBackendStatus`:

- **completedDocuments:** 001, 002, 003, 004, 005, 006, 007, 008, 010, 011 — these back the account
  session/status, catalogue, market, watchlist, notification (read/mark-read), collector, and vault
  features the bot exposes today.
- **partialDocuments:** 009, 009A — portfolio/finance groundwork; the bot's `/portfolio` command must
  keep rendering Slice's own honest `authority: DEMO/UNAVAILABLE` state, per `BOT_PRODUCT_SPEC.md` §4
  and never synthesize a number Slice itself doesn't return.
- **notStartedDocuments:** 012, 013, 014, 015, 017 (Slice's own Doc 017, distinct from this build
  guide's Doc 017), 018 (Slice's own Doc 018, distinct from this document) — ownership, finance/
  portfolio authority, trading, governance, outbox/realtime/notification-delivery, and Slice's own
  production launch gate are all unbuilt on Slice's side. Every bot feature gated on these stays
  undeployed at launch (Section 20, Section 26).
- **deferredDocuments:** 016 — wallet/compliance is formally deferred pending provider approval; no
  wallet-adjacent bot command exists to deploy.

This document's own launch gate (Section 20 step 7, Section 26) is explicitly **not** the same gate as
Slice's own Doc 018 — passing this bot's launch checklist never substitutes for, or implies, Slice's
own production readiness for money-touching features.

## 6. Files to read before starting

- `DEPLOYMENT_PLAN.md` (primary input — environments, runtime, secrets, rollout sequence, rollback)
- `BOT_SECURITY_MODEL.md` (all sections, especially §4 bot token/service-account/delegated-token
  safety, §10 logging redaction, §11 admin confirmation)
- `BOT_API_REQUIREMENTS.md` (which endpoints are VERIFIED vs. new-endpoint-required vs. bot-only, and
  which — §4, notification delivery — is explicitly not built)
- `BOT_ARCHITECTURE.md` (runtime shape: gateway process vs. worker process, `/health`/`/ready`
  convention, feature-flag philosophy, BullMQ jobs)
- `BOT_DATA_OWNERSHIP.md` (what's bot-owned vs. Slice-owned, relevant to what actually needs a secret/
  connection string in production)
- `COMMAND_CATALOGUE.md` (Phase 2+ table — the authoritative list of what must remain undeployed)
- `BOT_PRODUCT_SPEC.md` (client-requested-feature-wishlist reality-check table — the authoritative
  list of what needs a product/legal decision before it can ever be designed further)
- `PERMISSION_MATRIX.md`, `ERROR_CATALOGUE.md`, `TEST_STRATEGY.md`, `EVENT_AND_JOB_CATALOGUE.md`
- `MASTER_CHECKLIST.md`'s "Production readiness" section (this document exists to operationalize it)
- `CURRENT_STATE.md` and `project-state.json` (ground truth on what's actually been built when this
  document is actually run, not what this build guide assumed)
- Each of Implementation Documents 001–017, specifically their own §26 "Completion checklist" and §27
  "Documentation updates" — to confirm each one's own definition of "done" was actually satisfied.

## 7. Strict scope

- A concrete, step-by-step runbook that operationalizes `DEPLOYMENT_PLAN.md`'s rollout sequence:
  dev guild → staging (guild-scoped commands) → production (global commands, flagged off by default,
  enabled per guild after QA sign-off).
- Secret provisioning procedure for the Discord bot token, the Slice service-account credential
  (`BOT_API_REQUIREMENTS.md` §3), and the bot's own DB/Redis connection strings — where each secret
  lives, how it's injected, and how it's rotated.
- Production hardening: rate-limit tuning (bot-local cooldowns plus honoring Slice's own
  `RateLimit-*`/`Retry-After`), DoS considerations specific to a public, multi-guild Discord bot, and
  a dependency/security audit pass of the finished codebase (`npm audit`, secret-scanning, permission-
  check regression pass against `PERMISSION_MATRIX.md`).
- The final launch checklist mirroring `MASTER_CHECKLIST.md`'s "Production readiness" section,
  including an explicit, dated restatement of every feature that remains gated/undeployed at the
  moment of launch, so launch cannot silently ship something that was supposed to stay gated.
- Rollback runbook: how a feature flag is flipped off in an incident, why command deregistration is
  the secondary (not primary) rollback mechanism given Discord's global-command propagation delay.

## 8. Out of scope

- Building, modifying, or fixing any command, job, or feature from Documents 001–017 — if this
  document surfaces a defect during hardening, the fix belongs to the originating document's own
  scope, reopened separately, not patched inline here.
- Building any new Slice backend endpoint. This document deploys against endpoints Documents 004–006
  already required Slice's team to ship; if they still don't exist when this document is reached, this
  document cannot close for the account-linking-dependent command families (Section 20 step 3 gate).
- Any Phase 2+ feature from `COMMAND_CATALOGUE.md`'s Phase 2+ table (wallet/balance commands,
  achievement badges tied to real £/trade data, full portfolio showcase, trade transparency feed,
  "Buy Shares"/market-feed listings, push notification delivery, governance/voting commands).
- Any item from `BOT_PRODUCT_SPEC.md`'s client-wishlist table classified **NEEDS PRODUCT/LEGAL
  DECISION** (wallet-connect button, "Verified Investor" role, `#requesting` peer boards, `#offering`
  sell/buy templates, `#market-feed` funding-progress listings, undervalued-scanner confidence
  ratings, AI market-impact predictions on the news feed).
- Slice's own Doc 018 production launch gate — that is Slice's team's process for Slice itself, not
  something this document performs or substitutes for.
- Designing a new CI/CD platform, container orchestrator, or secret manager from scratch — this
  document assumes Slice's own `server/` deployment conventions exist and reuses them
  (`BOT_ARCHITECTURE.md`: "same base image conventions as Slice's `server/`").

## 9. Dependencies

- Container build tooling matching Slice's `server/` base image conventions (`BOT_ARCHITECTURE.md`).
- A deployment secret manager already used by Slice's own infrastructure (this document does not
  introduce a new one) capable of holding the Discord bot token, the Slice service-account credential,
  and the bot DB/Redis connection strings, with access-controlled read and an audit trail of reads.
- `npm audit` (or the monorepo's equivalent dependency-audit tool, per `BOT_ARCHITECTURE.md`'s
  "Package management/security" row) as a CI gate.
- A secret-scanning tool (e.g., gitleaks-equivalent already used elsewhere in Slice's CI, if one
  exists) run over the full bot repository history before first production deploy, specifically to
  catch the old bot's class of mistake (hardcoded credentials) before it can recur.
- Discord's application-command deployment API (via discord.js) for guild-scoped (dev/staging) vs.
  global (production) command registration.
- The orchestration platform's health-check integration, consuming the bot's `/health`/`/ready`
  endpoints (`BOT_ARCHITECTURE.md`, mirroring Slice's Doc 001/002 convention).
- Whatever alerting/monitoring stack Document 016 wired the bot's structured logs and metrics into —
  this document configures production-specific alert thresholds on top of it, it does not build a new
  observability pipeline.

## 10. Bot-owned persistence

No new tables. This document reuses the per-guild configuration row already established as bot-owned
in `BOT_DATA_OWNERSHIP.md` ("Guild configuration ... channel IDs ... — Bot") and already carrying,
per `BOT_ARCHITECTURE.md`'s "Configuration" note, "feature flags per command family" since Document
001's foundation work. This document's only persistence-adjacent deliverable is operational: a
documented convention (not a schema change) for how a guild's feature-flag row is flipped from
off → on during the per-guild flagged rollout (Section 20 step 6), and a record of *who* flipped it
and *when*, written to the bot's own operational log (Section 16) — not a new database table.

## 11. Slice API dependencies

This document calls no new Slice endpoint. It verifies, at deploy time, that every endpoint already
required by Documents 002–017 is reachable, correctly scoped, and correctly rate-limit-aware in each
environment, per `BOT_API_REQUIREMENTS.md`'s own tagging:

| Endpoint group | Tag (per `BOT_API_REQUIREMENTS.md`) | This document's job |
|---|---|---|
| `GET /v1/session`, `/v1/me`, catalogue/market/collector/vault reads, watchlist, notifications | Already available (VERIFIED) | Confirm production base URL, TLS, and auth wiring point at Slice's real production API, not staging |
| `POST /v1/bot/discord-link/challenge`, `POST /v1/me/discord-link/complete`, `POST /v1/bot/discord-link/unlink`, `GET /v1/bot/discord-link/:discordUserId` | New endpoint required — bot-only, service-account auth | Confirm these exist and are verified on Slice's **production** environment (not just staging) before enabling `/account link` in any production guild; if not yet shipped to production, account-linking-dependent command families stay flagged off there even if staging is fully green |
| `POST /v1/bot/tokens/exchange` | New endpoint required — bot-only, service-account auth, genuinely new pattern requiring Slice backend sign-off | Same as above — this is the mechanism `/watchlist`, `/notifications`, `/portfolio` mutations/reads depend on for a linked user; it must be live in production, not merely designed, before those command families go live |
| Service-account credential/authentication itself | New credential type required (`BOT_API_REQUIREMENTS.md` §3, no `ServiceAccount` entity exists in Slice's identity model as of any Slice document 003–018) | Confirm Slice has actually provisioned a production service-account credential scoped to exactly the bot-only endpoints above, rate-limited independently of human users, and audited with `actorType: SERVICE` — before that credential is placed in the bot's production secret manager |
| `GET /v1/bot/notifications/outbox` (notification delivery) | Not built — flagged as a design dependency on Slice's own Doc 017 + a new `DISCORD`/`WEBHOOK` channel value | Confirm this remains absent from the production deploy; no code path in the bot should attempt to call it |

## 12. Commands / events / jobs delivered

None. This document ships zero new commands, events, or jobs from `COMMAND_CATALOGUE.md` /
`EVENT_AND_JOB_CATALOGUE.md`. Its job is to deploy, flag-gate, and harden the complete Phase 1 set
already delivered by Documents 003, 005, 007, 008, 009, 010, 011, 012, 013, 014, and the background
jobs from Document 015 — and to confirm, by cross-checking the command registry actually deployed
against `COMMAND_CATALOGUE.md`'s Phase 1 table and Phase 2+ table, that nothing from the Phase 2+ table
is present in the deployed global command set.

## 13. Permission rules

`PERMISSION_MATRIX.md`'s rule applies unchanged: a Discord-side role/permission check is always a UX
gate, never a substitute for the corresponding Slice-side check on any command touching Slice data.
This document adds one deployment-specific corollary: **a feature flag is also only a UX/availability
gate, never an authorization mechanism.** Enabling a command family for a guild via feature flag makes
the command visible/invokable in that guild; it grants no permission beyond what `PERMISSION_MATRIX.md`
already defines for that command. Conversely, disabling a flag is not a security control against a
user who already has the underlying Slice permission — it is purely a rollout/incident-response
mechanism (`DEPLOYMENT_PLAN.md`'s rollback section). Production secret access itself follows the same
principle by analogy: whichever human operators can read the Slice service-account credential or bot
token from the secret manager is a separate, minimal access-control list, audited by the secret
manager's own access logs (Section 14) — Discord admin role possession never grants secret-manager
access, and secret-manager access never implies Slice `ADMIN` permission.

## 14. Security requirements

Cites `BOT_SECURITY_MODEL.md` throughout; this document's specific obligations:

- **§4 (bot token and Slice credential safety):** the Discord bot token, the Slice service-account
  credential, and the bot DB/Redis connection strings are provisioned directly into the deployment
  secret manager for each environment (dev/staging/production are separate secrets, never shared or
  copied across environments) and are never written to source control, CI logs, or the bot's own
  structured logs. Rotation procedure: any suspected compromise triggers immediate rotation of the
  affected secret and, for the bot token specifically, immediate re-authentication of the Discord
  gateway connection with the new token; for the Slice service-account credential, rotation follows
  whatever procedure Slice's backend team documents alongside provisioning the credential type itself
  (`BOT_API_REQUIREMENTS.md` §3 — this build guide does not invent that procedure).
- **Secret-scanning gate:** before the first production deploy, run a full-history secret scan over
  the bot repository. This is the direct, named mitigation for the old bot's worst finding — hardcoded
  plaintext MySQL credentials and a hardcoded Tebex API secret in source (`project-state.json`). Zero
  tolerance: any finding blocks production deploy until remediated and the finding's git history is
  addressed (credential rotated at minimum; history scrub only if the secret manager owner requires
  it).
- **Dependency/security audit:** `npm audit` (or the monorepo-standard equivalent) run against the
  finished codebase with zero unresolved high/critical advisories before production deploy;
  medium/low advisories documented with an explicit accept/defer decision, not silently ignored.
- **Permission-check regression pass:** manually re-verify, against `PERMISSION_MATRIX.md` row by row,
  that every admin-gated command (`/admin audit`, `/admin status-history`, `/admin link-lookup`) and
  every previously-missing-check the old bot had (giveaway subcommands, Tebex giftcard lookup) has its
  Discord-side gate **and** its fresh Slice-side check (where applicable) actually wired in the final
  build — this is a direct regression test against the specific class of bug the old bot shipped with.
- **§10 (logging redaction):** production log aggregation is spot-checked before launch to confirm no
  raw email, password, token, or session cookie appears in any log line the bot emits, consistent with
  the redaction rule already required of every prior document.
- **§11 (admin action confirmation):** confirm every destructive bot-owned command (ban, ticket
  force-delete, blacklist) still requires its type-to-confirm/button-confirm step in the production
  build — this is a regression check, not new design.
- **Least-privilege service-account scope:** confirm, before placing the production service-account
  credential in the secret manager, that its granted scope is exactly the bot-only endpoints in
  `BOT_API_REQUIREMENTS.md` §1–3 and nothing broader (no accidental grant of general admin endpoints).
- **Environment isolation:** confirm the production bot process cannot reach Slice's staging API and
  vice versa (base URL and credential pairing verified per environment, not just per deploy pipeline
  stage), preventing a staging QA action from ever writing to production Slice data or a misconfigured
  production deploy from silently testing against staging.

## 15. Idempotency and rate limits

This document performs no new mutations, so no new idempotency-key scheme is introduced; it verifies
the existing scheme (`(discordUserId, command, targetResourceId, nonce)`, `BOT_ARCHITECTURE.md`) is
intact in the production build and adds production-specific rate-limit and DoS hardening on top of
`BOT_SECURITY_MODEL.md` §5:

- **Discord-side global rate limit awareness:** Discord enforces a global rate limit across the whole
  bot application (shared across every guild it's installed in), separate from any per-route limit.
  Production must configure the bot's own outbound-request layer to respect this shared budget so that
  activity in one large guild cannot starve interaction responses in another — this is a DoS
  consideration specific to a *public, multi-guild* bot that a single-tenant service doesn't face.
- **Per-user, per-guild, and global command-invocation cooldowns:** in addition to Slice's own
  `RateLimit-*`/`Retry-After` enforcement (already honored per `BOT_ARCHITECTURE.md`), production adds
  a local cooldown per Discord user per command family (already specified per-command in
  `COMMAND_CATALOGUE.md`, e.g., "3/hour" for `/account link` challenge generation) so that a single
  compromised or malicious guild cannot fan out enough command invocations to exhaust the bot's shared
  Slice API budget for every other guild — a noisy-neighbor DoS scenario unique to a companion bot
  serving many independent Discord communities against one shared backend identity.
- **BullMQ worker backpressure:** production job workers (Document 015's jobs) are configured with
  bounded concurrency and a dead-letter queue after N failed attempts (already specified per job in
  `EVENT_AND_JOB_CATALOGUE.md`); this document's addition is tuning those bounds for production load
  and alerting (Section 16) when the dead-letter queue grows, rather than letting a stuck job silently
  retry forever and starve other scheduled work.
- **Circuit breaker on sustained Slice API failure:** if Slice's API returns `MARKET_DATA_UNAVAILABLE`/
  `PERSISTENCE_UNAVAILABLE`/`CONTROL_STORE_UNAVAILABLE` (`ERROR_CATALOGUE.md`) beyond a short
  threshold, the bot's production configuration trips a local circuit breaker that fails fast with the
  existing friendly "Slice is having a moment" message rather than continuing to queue retried GETs
  against a backend that is already degraded — protecting Slice's own recovery, not just the bot's own
  responsiveness.
- **Guild-join throttling:** since the bot is a public Discord application, a burst of new-guild
  installs (or a scripted install-and-spam pattern) is a plausible abuse vector; production applies a
  soft cap/alert on `guildCreate` rate so an anomalous spike is visible to operators before it
  translates into Slice API load from many newly-onboarded guilds at once.

## 16. Audit requirements

- Every Slice-side mutation the bot triggers remains audited entirely by Slice itself (unchanged from
  every prior document) — this document introduces no new Slice `AuditEvent` writes.
- Deployment and rollout actions are logged to the bot's own operational log (never a Slice
  `AuditEvent`, since they are not Slice mutations): who provisioned or rotated a secret (secret
  manager's own access log, referenced not duplicated), who deployed which build/commit to which
  environment, and — most importantly for this document's per-guild rollout model — who flipped which
  feature flag on or off for which guild, and when, with the reason (initial QA enablement, or
  incident rollback).
- Secret-manager read access itself is audited by the secret manager, not the bot; this document's
  obligation is only to confirm that audit capability exists and is enabled for the bot's secrets
  before first production use, not to build a new audit mechanism.
- The production launch checklist sign-off itself (Section 26) is recorded as a dated, named
  artifact (who signed off, against which commit/build, on which date) so a later incident review can
  establish exactly what was known and approved at launch time.

## 17. Error behavior

No new error codes are introduced. This document's obligation is to verify, in each environment before
promotion, that `ERROR_CATALOGUE.md`'s full mapping behaves correctly end-to-end against that
environment's real Slice API (not a fake/stub client) — this is the first time the mapping is exercised
against real staging/production error responses rather than the disposable test instance from Document
017. Production-specific error cases this document adds:

- **Secret unavailable/expired at boot:** if the bot cannot obtain a required secret (bot token, Slice
  service-account credential, DB/Redis connection string) at startup, `/ready` returns a non-200 and
  the process does not silently run in a partially-configured state — it fails closed, loud, and
  observable, rather than accepting interactions it cannot safely fulfill.
- **Slice production API unreachable during a promotion step:** if a rollout step's post-deploy smoke
  check (Section 20) cannot reach Slice's production API, the promotion is aborted and the previous
  version/flag-state is left in place — this document never promotes "optimistically" on the
  assumption connectivity will recover.
- **Feature-flag misconfiguration:** if a guild's flag state is ambiguous (flag row missing, corrupt)
  the command family defaults to **off**, never to "on by accident" — mirroring `DEPLOYMENT_PLAN.md`'s
  "flagged off by default" philosophy at the failure-mode level, not just the initial-state level.

## 18. Interaction UX

No new interactions are introduced. This document's UX obligation is verification, not design: for
every command family still flagged off or Phase-2-gated at launch, the command must not be registered
in Discord's global command set at all — not registered-but-permission-denied, not registered-and-
erroring, simply absent — per `COMMAND_CATALOGUE.md`'s "Disabled/unavailable features" UI standard
("rendered as a visibly disabled button or a plain-text 'not available yet' message ... never a
silently missing feature or a broken click-through"). Concretely at launch:

- Every Phase 1 command that is flagged **off** for a given guild during the phased per-guild rollout
  (Section 20 step 6) must, if invoked anyway (e.g., a user typing the command name from memory or
  documentation before it's enabled for their guild), either not autocomplete/appear at all (guild-
  scoped command deregistration) or respond with the existing "not available yet" pattern already
  specified in `COMMAND_CATALOGUE.md` — never a raw Discord "unknown interaction" or unhandled
  exception.
- No Phase 2+ command (`/balance`, any wallet/trade/governance command, achievement badges tied to
  real £, full `/portfolio` showcase, trade transparency feed, "Buy Shares") is registered anywhere in
  production, staging, or dev at launch — their absence from the registered command set is itself part
  of this document's verification (Section 20 step 9, Section 26).

## 19. Implementation file plan

| File/path | Purpose |
|---|---|
| `infra/docker/Dockerfile.gateway` | Container build for the Discord gateway/interaction-handling process, same base image conventions as Slice's `server/` (`BOT_ARCHITECTURE.md`) |
| `infra/docker/Dockerfile.worker` | Container build for the BullMQ background-job worker process(es), deployed/scaled independently of the gateway process |
| `infra/deploy/dev.yaml`, `infra/deploy/staging.yaml`, `infra/deploy/production.yaml` | Per-environment deployment manifests (base URL, secret references, scaling parameters, health-check wiring) |
| `scripts/register-commands.ts` | Registers the command set against Discord's application-command API, guild-scoped for dev/staging, global for production, reading the current feature-flag defaults so Phase 2+ commands are never included |
| `scripts/verify-secrets.ts` | Startup/pre-deploy check confirming every required secret is present and minimally well-formed (never logs the secret value itself) before allowing a deploy to proceed |
| `config/feature-flags.ts` | Declarative list of command families and their default-off production state, consumed by the command registry and by per-guild enablement tooling |
| `docs/runbooks/launch-runbook.md` | The human-readable runbook version of Section 20 below, kept in the actual bot repository (not this build guide) once the bot repository exists, for on-call use during rollout/incident response |
| `docs/runbooks/rollback-runbook.md` | The human-readable runbook version of Section 20 step 10 / `DEPLOYMENT_PLAN.md`'s rollback section |

## 20. Numbered implementation steps

1. **Confirm prerequisite closure.** Verify, against each of Documents 001–017's own §26 completion
   checklists, that every item is genuinely checked against real, merged, tested code — not assumed.
   Do not proceed past this step on an incomplete or self-reported-only status (the same caution
   `project-state.json` already flagged once, re: Slice's own Docs 010/011 self-reporting COMPLETE).
2. **Run the full verification suite** (Section 25) against the finished codebase on the target commit;
   confirm zero failing tests, zero lint/typecheck errors, a clean build.
3. **Run the dependency/security audit and secret-scanning gate** (Section 14) against the same commit;
   resolve or explicitly document-and-accept every finding before proceeding.
4. **Deploy to dev guild** against local/staging Slice, guild-scoped command registration
   (`DEPLOYMENT_PLAN.md` environment 1). Confirm `/health` and `/ready` both report healthy, confirm a
   representative command from each family (account, marketplace, watchlist, notifications, collector,
   vault, support, moderation, community) responds correctly.
5. **Deploy to staging** against Slice's staging environment, guild-scoped commands, feature flags
   mostly on for QA (`DEPLOYMENT_PLAN.md` environment 2):
   a. Confirm the new bot-only endpoints (`BOT_API_REQUIREMENTS.md` §1–3) are live and verified on
      Slice staging before enabling any account-linking-dependent command family; if they are not yet
      shipped there, those command families stay flagged off in staging too, and this document
      records that as a known gap rather than working around it.
   b. Run the full manual QA checklist (Section 24) in the staging guild against staging Slice.
   c. Run the rate-limit and error-mapping QA from `TEST_STRATEGY.md`'s "Manual QA" section against
      real staging responses (not the disposable test instance).
6. **Deploy to production, globally registered, every new command family flagged off by default**
   (`DEPLOYMENT_PLAN.md` environment 3). Confirm `/health`/`/ready` report healthy against production
   Slice and the production bot DB/Redis before any flag is enabled anywhere.
7. **Per-guild flagged enablement.** For each production guild, enable command families one at a time
   only after a named human has signed off on that guild's own manual QA pass in that guild (not a
   generic "staging passed" assumption) — record the sign-off per Section 16's audit requirement.
   Account-linking-dependent families (`/account`, `/watchlist`, `/notifications`, `/portfolio`) are
   enabled only in guilds where Slice's production account-linking endpoints are confirmed live
   (cross-check against step 5a's production-readiness confirmation, since staging readiness does not
   imply production readiness).
8. **Enable production hardening controls** (Section 15): per-user/per-guild/global cooldowns, circuit
   breaker thresholds, BullMQ worker concurrency/dead-letter bounds, guild-join throttling and
   alerting — confirm each is actually active (not just configured) via a synthetic test in production
   (e.g., deliberately exceed a cooldown and confirm the friendly rate-limit message appears).
9. **Verify the negative space.** Confirm, by inspecting the actually-registered global command list,
   that no Phase 2+ command (`COMMAND_CATALOGUE.md`'s Phase 2+ table) and no
   **NEEDS PRODUCT/LEGAL DECISION** item (`BOT_PRODUCT_SPEC.md`'s wishlist table) is present anywhere
   in the production command set. This is the step that directly satisfies this document's mandate to
   never let launch silently ship something meant to stay gated.
10. **Publish the rollback runbook and confirm it works.** Deliberately flip one non-critical feature
    flag off in staging and confirm the command family disappears/degrades gracefully within the
    expected propagation window, without deleting any bot-owned data (tickets, moderation history) —
    verifying `DEPLOYMENT_PLAN.md`'s rollback design ("feature flags are the primary rollback
    mechanism ... to avoid Discord's global-command propagation delay working against an incident
    response") actually holds before relying on it in a real incident.
11. **Run the final launch checklist** (Section 26) and obtain explicit, dated, named sign-off before
    declaring the bot launched in any given production guild.
12. **Update this build guide's own tracking documents** (Section 27) to reflect the real, verified
    outcome — never a self-reported "done" without the underlying evidence, per this document's own
    step 1 caution.

## 21. Unit tests

- Feature-flag resolution logic: given a guild's flag row (present/missing/corrupt), the resolver
  returns the command family's enabled state, defaulting to **off** on any ambiguity (Section 17).
- Secret-presence validation logic (`scripts/verify-secrets.ts`): given a mock environment with a
  missing/malformed secret, the check fails closed with a clear, non-secret-leaking error.
- Circuit-breaker state-machine logic: given a simulated sequence of Slice API failures, the breaker
  trips after the configured threshold and resets after the configured cool-down, independent of any
  real network call.
- Command-set diff logic: given the full `COMMAND_CATALOGUE.md`-derived command list and a target
  environment's flag configuration, the computed "commands to register" set never includes a command
  tagged Phase 2+ or NEEDS PRODUCT/LEGAL DECISION.

## 22. Integration tests

- `scripts/register-commands.ts` run against a disposable/sandbox Discord application (or discord.js's
  command-registration mocking) for each environment's manifest, asserting the registered set exactly
  matches the expected Phase 1-only, environment-appropriate list.
- Health/readiness endpoint integration test: with the bot DB/Redis or Slice API deliberately
  unreachable (via the disposable test harness from Document 017), `/ready` returns non-200; once
  reachable again, it returns 200 without requiring a process restart.
- BullMQ worker backpressure integration test: flood a job queue in a disposable Redis instance beyond
  the configured concurrency bound and confirm bounded processing plus dead-letter behavior after the
  configured failure count.

## 23. Discord interaction tests

- Simulated interaction against a command family that is flagged **off** for a given guild: assert the
  bot's response matches the "not available yet" pattern (or the command is simply absent from the
  simulated guild-scoped registry), never an unhandled exception or raw Discord error.
- Simulated rapid-fire interactions from the same simulated Discord user, exceeding the configured
  per-user cooldown: assert the friendly rate-limit message appears with the correct computed
  `Retry-After`-equivalent value, and that no duplicate Slice mutation is attempted underneath it.

## 24. Manual QA checklist

Run in the staging guild against Slice's staging environment before any production promotion, and
re-run a reduced version in each production guild before that guild's flags are enabled:

- [ ] Full command pass across every Phase 1 family (account, marketplace, watchlist, notifications,
      collector, vault, support, moderation, community, admin read-only) per `TEST_STRATEGY.md`'s
      manual QA section.
- [ ] Rate-limit QA: deliberately trigger both Slice's documented limits and the bot's new local
      cooldowns; confirm friendly messages with correct `Retry-After`, never a raw 429.
- [ ] Error QA: deliberately trigger each mapped `ERROR_CATALOGUE.md` code against the real staging
      Slice API; confirm no raw error text, stack trace, or internal identifier ever appears.
- [ ] Security QA: grep staging structured logs and Discord message/embed/custom-ID history after a
      full pass for any Slice token, password, session cookie, or raw email address — zero matches
      required.
- [ ] Secrets QA: confirm the staging deploy is using staging-scoped secrets only (no shared/reused
      production credential), by inspecting the secret manager's environment binding, not by trusting
      configuration intent.
- [ ] Negative-space QA: attempt to invoke every Phase 2+ command name and every
      NEEDS-PRODUCT/LEGAL-DECISION feature by hand in the staging guild; confirm each is either
      genuinely absent from the command list or explicitly shows a "not available yet" state — never a
      working, undocumented feature.
- [ ] Rollback QA: flip a flag off mid-QA-session and confirm no in-flight interaction crashes, no
      bot-owned data is lost, and the command family's absence is immediately visible to a user who
      tries it.
- [ ] Health/readiness QA: manually break connectivity to Slice's API (or the bot DB/Redis) in a
      controlled staging window and confirm `/ready` correctly reports unhealthy, then recovers.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run test:e2e           # Document 017's Discord-interaction E2E suite
npm run build
npm audit --production
# secret-scanning tool, per whatever Slice's own CI already standardizes on
npm run register-commands -- --env=dev
npm run register-commands -- --env=staging
npm run register-commands -- --env=production --dry-run   # verify computed set before real registration
docker build -f infra/docker/Dockerfile.gateway .
docker build -f infra/docker/Dockerfile.worker .
curl -sf https://<env-host>/health
curl -sf https://<env-host>/ready
```

## 26. Completion checklist

Mirrors `MASTER_CHECKLIST.md`'s "Production readiness" section, restated here as this document's own
close-out gate, all boxes unchecked until genuinely true:

- [ ] Discord bot implementation actually begun and closed through Document 017 (not just documented)
- [ ] New Slice backend endpoints (`BOT_API_REQUIREMENTS.md` §1–3) built and verified by Slice's own
      team, **on production**, not only staging, before account-linking-dependent families go live in
      any production guild
- [ ] Full verification suite (Section 25) green on the exact commit being deployed
- [ ] Dependency/security audit clean (zero unresolved high/critical) and secret-scanning gate clean
- [ ] Dev guild deploy validated
- [ ] Staging deploy validated, full manual QA checklist (Section 24) passed
- [ ] Production deploy live with every command family flagged off by default
- [ ] Production hardening controls (cooldowns, circuit breaker, worker backpressure, guild-join
      throttling) confirmed active via synthetic test, not just configured
- [ ] Per-guild enablement performed only after that guild's own signed-off QA pass
- [ ] Rollback runbook tested and confirmed working before relying on it
- [ ] Negative-space verification passed: no Phase 2+ command, and no NEEDS-PRODUCT/LEGAL-DECISION
      feature, present in any registered command set
- [ ] **Explicit, dated restatement recorded at launch time** of every feature still gated/undeployed:
  - [ ] All of `COMMAND_CATALOGUE.md`'s Phase 2+ table: `/balance`/wallet commands, achievement badges
        tied to real £/trade/hold data (gated on Slice Docs 012/014), full `/portfolio` P&L/ROI/
        diversification showcase (gated on Slice Doc 013), trade transparency/recent-sales feed
        (gated on Slice Doc 014, plus a privacy design pass), "Buy Shares"/market-feed listings and
        peer request-offer boards (gated on Slice Docs 012+014+016+018 **and** a separate product/
        legal decision), push notification delivery to Discord (gated on Slice Doc 017 + a new
        `DISCORD` channel type that does not exist in any Slice document today), governance/voting
        commands (gated on Slice Doc 015).
  - [ ] Everything in `BOT_PRODUCT_SPEC.md`'s wishlist table marked **NEEDS PRODUCT/LEGAL DECISION**:
        the `#start-here` "Connect Wallet" button, the "Verified Investor" role, `#requesting` peer
        boards, `#offering` sell templates with "Buy"/"Message Seller" buttons, `#market-feed`
        funding-progress/"Buy Shares" listings, the daily "Top 10 Undervalued" scanner with a
        fabricated confidence rating, and AI-generated market-impact predictions on the news feed.
  - [ ] Explicit confirmation that Slice's own backend remains, per `project-state.json`'s
        `sliceBackendStatus` as re-checked at actual launch time (not the snapshot in this build
        guide): Docs 012, 013, 014, (Slice) 015, (Slice) 017, and (Slice) 018 not-started or not yet
        sufficient to unblock the above, and Doc 016 still deferred pending provider approval — and
        that this status was re-verified against Slice's own current state at launch time, not assumed
        unchanged from when this build guide was written.
- [ ] Named, dated human sign-off recorded for the production launch decision.

## 27. Documentation updates

- `CURRENT_STATE.md` — flip from "documentation complete, zero code written" to an accurate
  description of what is actually live in production, by guild, with a link/reference to this
  document's sign-off record; explicitly restate the gated-feature list from Section 26 so a future
  reader of `CURRENT_STATE.md` alone (without reading this whole document) still sees it.
- `PROMPT_INDEX.md` — flip Document 018's row from NOT STARTED to its true status, and flip every
  other row (001–017) from NOT STARTED to COMPLETE only if each is independently verified true (per
  this document's own step 1 caution) — never flipped as a batch based on this document merely
  running.
- `MASTER_CHECKLIST.md` — check off the "Production readiness" section's boxes one by one, each only
  as it becomes genuinely true, mirroring this document's own Section 26.
- `project-state.json` — update `codingStarted`, add a `productionLaunch` object recording the launch
  date(s) per guild, the commit/build deployed, and a `gatedFeaturesAtLaunch` array mirroring Section
  26's restatement, so any future automated or human reader of this build guide's machine-readable
  summary sees the gated list without re-deriving it from prose.
- `DEPLOYMENT_PLAN.md` — no content change expected (this document operationalizes it, not revises
  it); if real rollout reveals `DEPLOYMENT_PLAN.md`'s design was wrong in some way, that correction is
  made there explicitly, with a note of what changed and why, rather than silently diverging from it
  in practice.

## 28. Final report format

The implementer's completion report for this document must include, in this order:

1. **Prerequisite verification summary** — confirmation that Documents 001–017 were checked against
   their own completion checklists, with any discrepancy found and how it was resolved before
   proceeding.
2. **Environment-by-environment rollout log** — dev, staging, and each production guild, with the date,
   commit/build, and outcome of each deploy step from Section 20.
3. **Hardening verification summary** — results of the dependency/security audit, secret-scanning gate,
   and each production hardening control's synthetic test (Section 20 step 8).
4. **Negative-space verification result** — the actual registered command list from each environment,
   with explicit confirmation no Phase 2+ or NEEDS-PRODUCT/LEGAL-DECISION item is present.
5. **Gated-features-at-launch restatement** — the full list from Section 26, dated, as actually
   confirmed against Slice's real state at launch time.
6. **Completion checklist** (Section 26) with every box's true/false state.
7. **Sign-off** — named human, date, and the exact commit/build approved for production.
8. **Open issues, if any** — anything deferred or found during hardening that needs follow-up,
   explicitly not silently dropped.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
