# Implementation Document 017: Testing and Discord interaction E2E

## 1. Metadata

- **Document number:** 017
- **Title:** Testing and Discord interaction E2E
- **Status:** NOT STARTED (this build guide is documentation-only and contains no completed
  implementation work)
- **Depends on (this build guide):** 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012,
  013, 014, 015, 016 — every prior implementation document
- **Blocks (this build guide):** 018 (Deployment, production hardening, and final launch checklist)
- **Slice backend dependency:** a disposable Slice test environment (staging or ephemeral) to run
  true end-to-end tests against real (non-production) Slice data — never production
- **Can start today:** Blocked — until Implementation Documents 001–016 have each independently
  closed their own completion checklists (per `IMPLEMENTATION_ORDER.md` row 017, "After the above
  land"). This document does not authorize starting itself early; it is written now purely as
  planning/specification, per this build guide's documentation-only scope.

## 2. Project context

Slice is a collectibles/marketplace platform with a TypeScript backend (`server/`); the Discord bot
being planned in this build guide is a **companion client** to Slice — it never becomes a second
backend, never duplicates business rules, and every read or write goes through Slice's HTTP API
(`BOT_ARCHITECTURE.md`). Per `IMPLEMENTATION_ORDER.md`, this is Implementation Document 017 of 18:
the comprehensive testing pass across the entire bot, run once every command family, background
job, and cross-cutting concern (account linking, marketplace/collector/vault reads, watchlist,
notifications, admin reads, support/ticket migration, moderation, community/engagement features,
background jobs, observability/audit correlation) has landed from Documents 001–016. It sits
immediately before Document 018 (deployment/production hardening/final launch checklist) in the
dependency chain, and its output — a pass/fail coverage matrix and a go/no-go gate — is the input
018's launch checklist consumes. This document does not re-derive a test strategy from first
principles; it **operationalizes `TEST_STRATEGY.md`** (already written at the top level of this
build guide) across the finished bot's full, real command surface as catalogued in
`COMMAND_CATALOGUE.md`.

## 3. Current implementation audit

Before this document starts, per `IMPLEMENTATION_ORDER.md` and each prior document's own template
section 26 ("Completion checklist"), the following must already exist and have closed their own
document-scoped test plans (unit/integration/Discord-interaction/manual QA, per each document's own
sections 21–24):

- **001–003:** repository foundation, Slice API client, interaction framework and command registry
  (`/help`, `/invite`).
- **004–006:** account-linking domain, Discord commands (`/account link/unlink/status`), and
  permission/authorization integration — closed only if the new bot-only endpoints
  (`BOT_API_REQUIREMENTS.md` §1–3) exist and have been verified by Slice's own team, per
  `MASTER_CHECKLIST.md`'s "Production readiness" section.
- **007–008:** marketplace/asset commands (`/asset search`, `/asset view`, `/market movers`,
  `/top movers`) and Collector/Vault commands (`/collector search/view`, `/vault latest/summary`,
  `/profile`).
- **009–010:** watchlist/portfolio commands (`/watchlist add/remove/list`, `/portfolio`) and
  notification commands (`/notifications list/unread/read/read-all`).
- **011–012:** support/ticket migration (`/support open/close` + lifecycle buttons) and the
  moderation suite (`/mod kick/ban/mute/unmute/purge/warn/warns/lockdown/unlock/banlist/unban`).
- **013:** admin read-only operational commands (`/admin audit/status-history/link-lookup`).
- **014:** community/engagement features (`/suggest`, `/giveaway start/reroll/end/delete`, `/poll`,
  `/faq`, `/roadmap`).
- **015:** background jobs (`ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick`,
  `market-digest`, `price-alert-poll`, `prediction-scoring`, `news-feed-poll`).
- **016:** observability, audit correlation (bot-local request IDs correlated to Slice request IDs),
  and operational controls (feature flags, per-guild enablement).

Each of those documents' own sections 21–24 already produced **command-scoped** unit, integration,
and Discord-interaction tests, plus a document-scoped manual QA checklist. What does **not** yet
exist before this document starts: a single **cross-cutting coverage matrix** proving every command
in `COMMAND_CATALOGUE.md` has all four coverage types closed with no gaps introduced by documents
landing out of their originally-assumed order or dropping a test category under time pressure; a
**real discord.js interaction-simulation E2E harness** wired to a **disposable Slice staging
environment** (as opposed to each document's own per-command fake-client/mocked-gateway tests); a
**regression suite** guarding specifically against the old bot's catalogued defects; and the
**go/no-go gate** Document 018 needs before it writes the production launch checklist. All of that
is this document's own deliverable, not an assumption about what already exists.

## 4. Old bot behavior migrated

This document has no single old-bot feature row of its own (it is a testing pass, not a command
migration), but its regression suite (§20, §26) exists specifically to lock in fixes to defects
`OLD_BOT_FEATURE_INVENTORY.md` and `project-state.json`'s `criticalSecurityFindingsInOldBot`
catalogued in the old Python bot (Infria, discord.py 1.6.0), reimplemented behaviorally per
`OLD_TO_NEW_MIGRATION_MATRIX.md` (never code-ported):

- **Giveaway winner-selection bug (reaction-index-0):** `TEST_STRATEGY.md`'s unit-test section
  explicitly calls out "giveaway winner selection given an arbitrary entry set — explicitly
  regression-testing the old bot's reaction-index-0 bug." This document's regression suite carries
  that test forward as a permanent guard, not a one-time check performed only in Document 014/015.
- **Raw exception leakage (Migration M6):** the old bot's `ErrorHandler.py` generic branch
  interpolated raw exception text into user-facing messages. `ERROR_CATALOGUE.md`'s closing rule
  ("the generic/unrecognized branch must never interpolate the raw exception object into a
  user-facing string") is asserted by a standing regression test across every command's error path,
  not just the commands built in the document that originally implemented error mapping.
- **Missing permission checks on Tebex giftcard lookup and Giveaways reroll/end/delete:** the old
  bot shipped destructive/sensitive subcommands with no permission gate. `PERMISSION_MATRIX.md`'s
  row "`/giveaway *` | bot admin role only, every subcommand (fixes old bot's missing checks)" is
  asserted by a standing regression test enumerating every giveaway subcommand, not just `start`.
- **Hardcoded plaintext credentials (`cogs/SQL.py`, `cogs/Tebex.py`):** not a runtime-testable bug in
  the traditional sense, but this document's security QA pass (§24) includes a static/log-based
  check that no equivalent secret ever appears in the new bot's source, environment dump, or
  structured logs, consistent with `BOT_SECURITY_MODEL.md` §4 and §10.
- **Deprecated `username#discriminator` matching in `Moderation.py` unban:** regression-tested by
  asserting `/mod unban` resolves strictly by Discord user ID, never a parsed tag string.

Every other old-bot feature row (REMOVE/REWRITE/MERGE/REPLACE/UNKNOWN, per
`project-state.json`'s `oldBotMigrationStatusCounts`) was already the responsibility of the
implementation document that built its replacement; this document does not re-litigate individual
feature migrations, only the defect classes above that are cross-cutting by nature.

## 5. Slice features supported

Per `project-state.json`'s `sliceBackendStatus` (audited 2026-08-07): Slice backend documents 001,
002, 003, 004, 005, 006, 007, 008, 010, 011 are **VERIFIED complete**; 009 and 009A are
**PARTIAL**; 012, 013, 014, 015, 017, 018 are **NOT STARTED**; 016 is **DEFERRED**. This document's
integration and E2E tests can therefore only exercise, against a disposable Slice environment, the
endpoints listed as "already available" in `BOT_API_REQUIREMENTS.md` (backed by Docs 004–008,
010–011) plus whatever subset of the new bot-only endpoints (§1–3, requiring Slice backend
sign-off independent of this build guide) exist on that disposable environment at test time. Any
command whose Slice feature area is NOT STARTED or DEFERRED (portfolio's full showcase — Doc 013;
trade transparency — Doc 014; wallet-adjacent anything — Doc 016; push notification delivery — Doc
017) is explicitly **not** tested here beyond its already-shipped honest-unavailable-state behavior
(e.g., `/portfolio`'s `PORTFOLIO_AUTHORITY_UNAVAILABLE` path), because no further behavior exists to
test — testing a capability Slice hasn't built would be testing a fabrication, which
`IMPLEMENTATION_DOCUMENT_TEMPLATE.md`'s accuracy rules forbid.

## 6. Files to read before starting

- `TEST_STRATEGY.md` — the primary input; this document operationalizes it, does not replace it.
- `COMMAND_CATALOGUE.md` — full command list (Phase 1, admin, support/community, Phase 2+ gated) and
  UI standards section, the source for the coverage matrix in §12.
- `BOT_ARCHITECTURE.md` — especially "Test doubles" and "Integration tests" bullets (fake Slice
  client, disposable local Slice instance, discord.js test utilities/mocked gateway).
- `DEPLOYMENT_PLAN.md` — environments (dev guild / staging / production) and rollout sequence,
  which frames where this document's disposable Slice environment fits relative to staging.
- `ERROR_CATALOGUE.md` — every mapped error code, for exhaustive error-path test coverage.
- `PERMISSION_MATRIX.md` — every capability's Discord-side and Slice-side gate, for permission-gate
  test coverage.
- `BOT_SECURITY_MODEL.md` — all 11 sections, for the security QA checklist (§24) and regression
  items in §4/§14.
- `BOT_DATA_OWNERSHIP.md` — to distinguish tests that seed bot-owned fixtures from tests that must
  hit a real (disposable) Slice environment.
- `BOT_API_REQUIREMENTS.md` — every endpoint tag (already-available / new-endpoint-required /
  bot-only-service-endpoint), for the Slice API dependency table in §11.
- `EVENT_AND_JOB_CATALOGUE.md` — gateway events and scheduled jobs, for the coverage matrix's job
  rows.
- `MASTER_CHECKLIST.md` and `project-state.json` — current Slice backend document status, so no test
  is planned against a Slice capability that doesn't exist yet.
- Each of `implementation/001-*.md` through `implementation/016-*.md` — specifically each one's own
  sections 21 ("Unit tests"), 22 ("Integration tests"), 23 ("Discord interaction tests"), and 24
  ("Manual QA checklist"), which are the inputs this document audits, consolidates, and fills gaps
  in — this document does not discard or duplicate that work, it indexes and extends it.

## 7. Strict scope

- A **command-by-command test coverage matrix**, built directly from `COMMAND_CATALOGUE.md`'s full
  command list (Phase 1, admin, support/community) plus `EVENT_AND_JOB_CATALOGUE.md`'s events and
  jobs, marking unit / integration / Discord-interaction / manual-QA coverage status per row, with
  an explicit note on which prior implementation document is the source of truth for each test.
- The **end-to-end test harness design**: how discord.js interaction simulation is wired to a real
  command-handler stack, and how that stack is pointed at a disposable Slice staging/ephemeral
  environment (never production) for true E2E runs, distinct from the per-document mocked/fake-client
  tests already specified in Documents 001–016.
- The **regression suite structure**: how old-bot-defect regression tests (§4) and
  cross-cutting invariants (error-mapping, permission gates, idempotency, no-secret-leakage) are
  organized so they run on every future change, not just once.
- The **go/no-go gate definition**: the explicit, checkable criteria this document's own coverage
  matrix and regression/E2E run must satisfy before Document 018 is allowed to proceed to
  production-hardening and the final launch checklist.

## 8. Out of scope

- Writing or executing any actual test code, CI configuration, or test infrastructure-as-code — this
  is a planning/specification document only, per this build guide's documentation-only scope.
- Building or provisioning the disposable Slice test environment itself — that is Slice's own
  infrastructure responsibility; this document specifies what the bot's test suite needs from it,
  not how Slice stands it up.
- Deployment, production hardening, secret rotation, or the final launch checklist — that is
  Document 018's scope entirely.
- Testing any Phase 2+ gated feature (`/balance`, achievement badges beyond "Early Supporter",
  `/portfolio` full showcase, trade transparency feed, "Buy Shares"/marketplace-feed listings,
  push-notification delivery, governance commands) — per `TEST_STRATEGY.md`'s own "Non-goals"
  section, no test suite is written for features not implemented in this build guide.
- Formal penetration testing or third-party security audit — `BOT_SECURITY_MODEL.md` compliance is
  checked here via QA/regression tests the bot team runs itself; an external audit, if desired, is a
  separate engagement outside this build guide's scope.
- Load/performance/soak testing beyond confirming documented rate limits are honored — no capacity
  planning or stress-testing methodology is defined here.
- Any change to Slice's backend, Prisma schema, or API — this document only consumes a disposable,
  non-production Slice environment; it never modifies Slice source.

## 9. Dependencies

- **discord.js test utilities / a mocked gateway**, per `BOT_ARCHITECTURE.md`'s "Integration tests"
  bullet, for constructing realistic `Interaction` objects (slash command, button, select, modal
  submit) without a live Discord gateway connection.
- **The hand-written fake Slice API client** (typed against the same interface as the real client,
  per `BOT_ARCHITECTURE.md`'s "Test doubles" bullet), reused from Documents 002/007–015's own unit
  test suites, for this document's cross-cutting unit-test audit.
- **A disposable Slice instance/environment** — for integration tests, this mirrors "how Slice's own
  backend tests spin up disposable Postgres/Redis per Doc 002" (`TEST_STRATEGY.md`); for E2E and
  manual QA, this is a real (non-production) Slice staging or ephemeral deployment with seeded,
  non-production data.
- **A disposable bot-owned database** (Postgres/SQLite or KV store per `BOT_DATA_OWNERSHIP.md`) for
  integration-testing tickets, moderation, giveaways, suggestions, and other bot-owned persistence.
- **The same test runner/assertion library as the rest of Slice's TypeScript stack**
  (`BOT_ARCHITECTURE.md`: "Same test runner/assertions as the rest of the repo") — this document does
  not introduce a second test framework.
- **BullMQ test tooling** (or equivalent deterministic job-clock control) for testing scheduled-job
  logic (`ticket-inactivity-sweep`, `mute-expiry`, `giveaway-tick`, `market-digest`,
  `price-alert-poll`, `prediction-scoring`, `news-feed-poll`) without waiting on real wall-clock
  cadences.
- A structured-log capture/query tool for the security QA grep pass (§24) across bot logs and
  Discord message history in the test guild.

## 10. Bot-owned persistence

None new. This document introduces no new tables/collections; it consumes the bot-owned schemas
already introduced by Documents 011–015 (ticket channel/thread mapping and claim state, moderation
history, suggestion state machine, giveaway state, guild configuration, prediction-game submissions,
per `BOT_DATA_OWNERSHIP.md`) purely as **fixture/seed targets** inside a disposable bot-owned test
database. No schema change, migration, or new persistence concept is proposed here.

## 11. Slice API dependencies

Every Slice endpoint the finished bot calls, per `BOT_API_REQUIREMENTS.md`, with its existing tag
and this document's test-coverage disposition on the disposable Slice environment:

| Endpoint | Tag (`BOT_API_REQUIREMENTS.md`) | Coverage disposition in this document |
|---|---|---|
| `GET /v1/session`, `GET /v1/me` | already-available (VERIFIED) | Integration + E2E against disposable Slice instance |
| `GET /v1/categories`, `.../sets`, `GET /v1/grading-companies`, `.../grades`, `GET /v1/catalogue/assets/:slug` | already-available (VERIFIED) | Integration + E2E |
| `GET /v1/market/assets`, `/:slug`, `/:slug/history`, `/:slug/similar`, `/summary`, `/movers` | already-available (VERIFIED) | Integration + E2E, incl. `market-digest`/`price-alert-poll` job tests |
| `GET /v1/market/assets/:slug/order-book`, `/recent-trades` | already-available (VERIFIED) | Integration + E2E — asserts the honest "not available until trading" placeholder renders, not a fabricated order book |
| `GET /v1/collectors`, `/:slug`, `/:slug/assets` | already-available (VERIFIED) | Integration + E2E |
| `GET /v1/vault/events`, `/summary` | already-available (VERIFIED) | Integration + E2E |
| `GET /v1/me/portfolio?range` | already-available (VERIFIED) | Integration + E2E — asserts `PORTFOLIO_AUTHORITY_UNAVAILABLE` is surfaced honestly, never faked |
| `GET /v1/me/watchlist`, `PUT/DELETE /v1/me/watchlist/:assetId` | already-available (VERIFIED) | Integration + E2E, incl. idempotency-key conflict path |
| `GET /v1/me/notifications`, `PATCH .../:id/read`, `POST .../read-all` | already-available (VERIFIED) | Integration + E2E |
| `GET /v1/admin/audit-events`, `GET /v1/admin/users/:id/status-history` | already-available (VERIFIED) | Integration + E2E, incl. fresh-permission-check regression (never cached) |
| `GET /v1/me/discord-link` | new-endpoint-required | Integration test conditional on the endpoint existing on the disposable Slice env at test time; otherwise marked BLOCKED in the coverage matrix, not silently skipped |
| `POST /v1/bot/discord-link/challenge` | bot-only-service-endpoint (proposed, not yet built as of this document's writing) | Same as above — conditional; full account-link E2E path requires this to exist |
| `POST /v1/me/discord-link/complete` | bot-only-service-endpoint (proposed) | Same — this call happens on the Slice web app, not the bot, but the E2E harness must simulate/seed its effect (the resulting `DiscordLink` row) to test everything downstream |
| `POST /v1/bot/discord-link/unlink` | bot-only-service-endpoint (proposed) | Conditional, as above |
| `GET /v1/bot/discord-link/:discordUserId` | bot-only-service-endpoint (proposed) | Conditional, as above |
| `POST /v1/bot/tokens/exchange` | bot-only-service-endpoint (proposed, requires backend sign-off per `BOT_API_REQUIREMENTS.md` §2) | Conditional — this is the single highest-leverage endpoint for E2E coverage of every account-scoped command; its absence is a named go/no-go blocker (§20) |
| Service-account authentication itself (§3 of `BOT_API_REQUIREMENTS.md`) | bot-only, not yet a real Slice entity | Conditional — integration/E2E tests that call any endpoint above as the bot's service identity are blocked until this credential type exists on the disposable Slice environment |
| `GET /v1/bot/notifications/outbox` (notification delivery) | bot-only-service-endpoint, explicitly **not built in this iteration** | **No test written** — per §8, Phase 2+/not-yet-built endpoints are out of scope |

Where a row above is conditional and the endpoint does not exist on the disposable Slice environment
at the time this document's test suite runs, the coverage matrix (§12) marks that command's
integration/E2E cells as **BLOCKED (Slice dependency)**, never as passing, and that blocker is
carried into the go/no-go gate (§20) rather than silently waived.

## 12. Commands / events / jobs delivered

This document delivers no new commands. It delivers the **full test coverage matrix** across every
command in `COMMAND_CATALOGUE.md` and every event/job in `EVENT_AND_JOB_CATALOGUE.md`. "U" = unit,
"I" = integration, "D" = Discord-interaction, "M" = manual QA. A cell is one of: **Y** (covered,
already delivered by the cited impl doc and re-verified here), **NEW** (gap this document closes),
or **BLOCKED** (cannot be closed until a named Slice dependency exists — never marked Y).

### Phase 1 — account, marketplace, watchlist, notifications, collectors, vault

| Command | Impl doc | U | I | D | M | Notes |
|---|---|---|---|---|---|---|
| `/account link` | 005 | Y | BLOCKED | Y | BLOCKED | I/M blocked until `POST /v1/bot/discord-link/challenge` + token-exchange exist on the disposable Slice env |
| `/account unlink` | 005 | Y | BLOCKED | Y | BLOCKED | same dependency, plus admin-assisted path needs recent-auth support |
| `/account status` | 005 | Y | Y | Y | Y | `GET /v1/session`/`/v1/me` already available |
| `/asset search` | 007 | Y | Y | Y | Y | — |
| `/asset view` | 007 | Y | Y | Y | Y | — |
| `/market movers` | 007 | Y | Y | Y | Y | — |
| `/watchlist add` | 009 | Y | BLOCKED | Y | BLOCKED | requires linked account → token-exchange dependency |
| `/watchlist remove` | 009 | Y | BLOCKED | Y | BLOCKED | same |
| `/watchlist list` | 009 | Y | BLOCKED | Y | BLOCKED | same |
| `/notifications list` | 010 | Y | BLOCKED | Y | BLOCKED | same |
| `/notifications unread` | 010 | Y | BLOCKED | Y | BLOCKED | same |
| `/notifications read` | 010 | Y | BLOCKED | Y | BLOCKED | same |
| `/notifications read-all` | 010 | Y | BLOCKED | Y | BLOCKED | same |
| `/collector search` | 008 | Y | Y | Y | Y | public, no linked account needed |
| `/collector view` | 008 | Y | Y | Y | Y | — |
| `/vault latest` | 008 | Y | Y | Y | Y | — |
| `/vault summary` | 008 | Y | Y | Y | Y | — |
| `/portfolio` | 009 | Y | Y | Y | Y | tests the honest `PORTFOLIO_AUTHORITY_UNAVAILABLE` state; not blocked since this is what actually ships |
| `/profile` (self) | 008 | Y | BLOCKED | Y | BLOCKED | self-view requires linked account |
| `/profile` (other member) | 008 | Y | Y | Y | Y | public-collector path, no link required |
| `/help` | 003 | Y | n/a (bot-owned, no Slice call) | Y | Y | — |
| `/invite` | 003 | Y | n/a | Y | Y | — |

### Admin (read-only)

| Command | Impl doc | U | I | D | M | Notes |
|---|---|---|---|---|---|---|
| `/admin audit` | 013 | Y | Y | Y | Y | fresh-permission-check regression required (never cached) |
| `/admin status-history` | 013 | Y | Y | Y | Y | same |
| `/admin link-lookup` | 013 | Y | BLOCKED | Y | BLOCKED | depends on `GET /v1/bot/discord-link/:discordUserId` existing |

### Support / community (bot-owned, no Slice dependency)

| Command | Impl doc | U | I | D | M | Notes |
|---|---|---|---|---|---|---|
| `/support open` | 011 | Y | Y | Y | Y | bot-owned persistence only |
| `/support close` + claim/add/remove/escalate buttons | 011 | Y | Y | Y | Y | includes persistent-component restart-recovery test |
| `/mod kick` | 012 | Y | Y | Y | Y | — |
| `/mod ban` | 012 | Y | Y | Y | Y | type-to-confirm regression test |
| `/mod mute` / `/mod unmute` | 012 | Y | Y | Y | Y | includes `mute-expiry` job coverage |
| `/mod purge` | 012 | Y | Y | Y | Y | — |
| `/mod warn` / `/mod warns` | 012 | Y | Y | Y | Y | — |
| `/mod lockdown` / `/mod unlock` | 012 | Y | Y | Y | Y | — |
| `/mod banlist` / `/mod unban` | 012 | Y | Y | Y | Y | unban resolves by Discord ID only — old-bot regression (§4) |
| `/suggest` (submit) | 014 | Y | Y | Y | Y | — |
| `/suggest` (status change) | 014 | Y | Y | Y | Y | — |
| `/giveaway start` | 014 | Y | Y | Y | Y | — |
| `/giveaway reroll` / `end` / `delete` | 014 | Y | Y | Y | Y | permission-gate regression test on every subcommand (§4) + reaction-index-0 winner-selection regression |
| `/poll` | 014 | Y | Y | Y | Y | — |
| `/faq` | 014 | Y | n/a | Y | Y | static content |
| `/roadmap` (view) | 014 | Y | n/a | Y | Y | — |
| `/roadmap`/`/faq` (admin edit) | 014 | Y | Y | Y | Y | — |
| `/top movers` | 007 | Y | Y | Y | Y | — |
| `/top investors` | not implemented (Phase 2, gated on Slice Doc 013) | n/a | n/a | n/a | n/a | out of scope per §8 |

### Events and jobs (`EVENT_AND_JOB_CATALOGUE.md`)

| Event/job | Impl doc | U | I | D/E2E | M | Notes |
|---|---|---|---|---|---|---|
| `interactionCreate` router | 003 | Y | n/a | Y | Y | routing correctness for every command family above |
| `guildMemberAdd` (onboarding) | 014 | Y | Y | Y | Y | bot-owned |
| `messageCreate` (scoped auto-mod) | 012 | Y | Y | Y | Y | only where auto-mod enabled per guild |
| `guildCreate` / `guildDelete` | 001 | Y | Y | n/a | Y | per-guild config lifecycle |
| `ticket-inactivity-sweep` | 015 | Y | Y | n/a (job, no Discord interaction) | Y | deterministic-clock unit test + integration against disposable bot DB |
| `mute-expiry` | 015 | Y | Y | n/a | Y | — |
| `giveaway-tick` | 015 | Y | Y | n/a | Y | reaction-index-0 regression lives here (winner selection) |
| `market-digest` | 015 | Y | Y | n/a | Y | asserts DEMO labeling never dropped; skip-on-failure path tested |
| `price-alert-poll` | 015 | Y | Y | n/a | Y | same DEMO-labeling assertion |
| `prediction-scoring` | 015 | Y | Y | n/a | Y | — |
| `news-feed-poll` | 015 | Y | Y | n/a | Y | failure isolation from Slice-backed features tested explicitly |
| `notification-delivery-consumer` | Phase 2, not built | n/a | n/a | n/a | n/a | out of scope per §8 |

## 13. Permission rules

This document's Discord-interaction and integration tests are the enforcement mechanism for every
row of `PERMISSION_MATRIX.md`, not a new set of rules. Specific test obligations:

- For every command with **both** a Discord-side gate and a Slice-side gate (account-scoped and
  admin commands), the Discord-interaction test suite must include a case where the Discord-side
  gate passes but the Slice-side check would fail (e.g., a user with a bot support role whose linked
  Slice account is not `ADMIN`/`SUPPORT`) — the test asserts the command is still denied, proving
  the Discord role is a UX gate only, never a substitute, per `BOT_ARCHITECTURE.md`'s permission
  module description and `PERMISSION_MATRIX.md`'s closing rule.
- For `/admin audit`, `/admin status-history`, `/admin link-lookup`, a specific regression test
  confirms the Slice-side role check is re-fetched on every invocation (two consecutive calls in the
  same test both hit the fake/disposable Slice client — never cached) per `BOT_SECURITY_MODEL.md`
  §6.
- For bot-owned-only commands (`/mod *`, `/support` lifecycle, `/giveaway *`), tests assert the
  Discord-side gate alone is sufficient and no Slice call is made at all, consistent with
  `PERMISSION_MATRIX.md`'s note that these commands are "explicitly decoupled from Slice."
- For `/giveaway reroll/end/delete`, a standing regression test (§4) enumerates every subcommand
  individually — the old bot's bug was a missing check on specific subcommands, so "the command
  family has a permission check" is not sufficient; each subcommand needs its own assertion.

## 14. Security requirements

This document's security QA pass operationalizes `BOT_SECURITY_MODEL.md` end to end:

- **§1 (account linking):** integration/E2E tests (where the token-exchange dependency is
  unblocked) assert: token expiry (≤10 minutes) is enforced, tokens are single-use (a second
  completion attempt with the same code fails generically), a token cannot be redeemed for a
  different Discord user than the one that requested it (CSRF-style attack test), and 1:1
  enforcement (attempting a second link from an already-linked Discord account or Slice account is
  rejected, not silently overwritten).
- **§3 (custom ID opacity):** a static/regression test asserts no button/select/modal custom ID ever
  contains a raw Slice user ID, email, or sequential identifier — every custom ID is checked against
  an opaque-ID pattern.
- **§4 (token/credential safety):** the security QA grep pass (§24) scans bot structured logs and
  the test guild's message history after a full manual QA pass for any Slice access token, refresh
  token, session cookie, password, service-account credential, or bot token substring — zero matches
  is a hard go/no-go requirement (§20).
- **§10 (logging redaction, DM privacy, ticket privacy):** tests assert known-sensitive field names
  are redacted in structured logs by default, a failed DM (closed DMs) produces exactly one
  in-channel notice and no retry loop, and ticket channels are visible only to opener/claimed
  staff/explicitly-added users (a permission-overwrite assertion in the integration suite).
- **§11 (admin action confirmation):** every destructive command in the coverage matrix (§12) has a
  Discord-interaction test asserting the confirm/cancel step is required and a bare single click
  never executes the action; the highest-impact subset (ban, ticket force-delete) additionally
  asserts the type-to-confirm text match.

## 15. Idempotency and rate limits

- **Idempotency:** a unit test suite (carried forward from `TEST_STRATEGY.md`'s unit-test bullet)
  asserts the `Idempotency-Key` derivation `(discordUserId, command, targetResourceId, nonce)` is
  deterministic across repeated calls with the same logical intent, and changes only when the user
  explicitly retries after an error — never on every Discord gateway retry. This is re-verified
  against the full command set in §12 (every mutating command), not just the command family that
  originally implemented idempotency handling. Integration tests against the disposable Slice
  environment additionally assert `IDEMPOTENCY_KEY_CONFLICT`/`REQUEST_IN_PROGRESS` (409) responses
  are surfaced as the friendly "already being processed" message and never trigger an automatic
  bot-side retry.
- **Rate limits:** manual QA (§24) deliberately triggers each of Slice's documented per-command rate
  limits (`COMMAND_CATALOGUE.md`'s rate-limit column: e.g., 3/hour for `/account link` challenge
  generation, 5/hour for `/account unlink`, "standard" for reads/mutations) and confirms the bot
  surfaces the friendly `RATE_LIMITED` message with the correct `Retry-After` value read from Slice's
  response header, never a raw 429. Bot-owned local cooldowns (tickets, giveaways) are tested
  independently of Slice's own rate limiting, per `BOT_ARCHITECTURE.md`.

## 16. Audit requirements

- Every Slice-side mutation the bot triggers in an integration/E2E test against the disposable Slice
  environment is asserted to have produced a Slice `AuditEvent` (queried back via
  `GET /v1/admin/audit-events` where the test's service/admin identity permits), confirming the bot
  never silently swallows a failed audit write.
- Every such mutation is additionally asserted to have produced the bot's own correlated local log
  line (Discord user, command, outcome, Slice request ID) per `BOT_ARCHITECTURE.md`'s audit
  correlation design (built in Document 016) — the test confirms the two records can be joined by
  request ID, without the bot's local log duplicating Slice's audit record as a second source of
  truth (`BOT_SECURITY_MODEL.md` §5).
- The security QA grep pass (§24, §14) doubles as an audit-log-redaction check: sensitive field names
  must never appear even inside an audit-adjacent log line.

## 17. Error behavior

Every row of `ERROR_CATALOGUE.md` gets an explicit, exhaustive test, not a spot-check:

- **Unit level:** for every mapped Slice error code, a test feeds the fake Slice client's error
  response into each relevant command handler and asserts the exact Discord-facing copy from
  `ERROR_CATALOGUE.md` is produced — byte-for-byte, not a paraphrase — and that no field beyond an
  explicitly safe, user-facing field name is echoed.
- **Integration/E2E level (where unblocked):** where the disposable Slice environment can genuinely
  produce a given error naturally (e.g., requesting a non-public collector for `PROFILE_NOT_PUBLIC`,
  an unpublished asset for `ASSET_NOT_PUBLIC`, a nonexistent slug for `*_NOT_FOUND`), the test
  triggers it for real rather than only via the fake client, closing the gap between "the mapping
  code is correct" and "the mapping code actually fires on Slice's real response shape."
  `PORTFOLIO_AUTHORITY_UNAVAILABLE` (503) is included here as an **expected, honest state**, not an
  error case to "fix."
  `MARKET_DATA_UNAVAILABLE`/`PERSISTENCE_UNAVAILABLE`/`CONTROL_STORE_UNAVAILABLE` are tested for the
  documented single-retry-on-GET behavior.
- **Discord-interaction level:** the M6 regression (§4) — a standing test that feeds a genuinely
  unrecognized/unexpected error object into the generic branch and asserts the response is exactly
  "Something went wrong on our end — we've logged it (ref: `{requestId}`)" with the raw object never
  interpolated — runs against every command in the coverage matrix that has an error path, using a
  shared test helper rather than one-off per-command copies, so it cannot silently regress in one
  command family while passing in another.
- **Discord-side failures** (missing permissions to act, channel deleted, DM closed) are tested
  separately from Slice-side failures, asserting the context-aware message is used and the generic
  Slice-error message never fires for a Discord-side cause.

## 18. Interaction UX

This document introduces no new UI; it defines the assertions checked against every embed/component
already specified by `COMMAND_CATALOGUE.md`'s "UI standards" section and each prior document's own
§18. Cross-cutting UX invariants asserted across the **entire** command set in §12, not per-command
in isolation:

- Every embed sourced from a live Slice API call carries a footer with `asOf` and `source`; every
  bot-owned embed carries a plain "Slice" footer with no fabricated data-source claim — asserted for
  every command that renders an embed.
- Ephemeral-vs-public default matches `COMMAND_CATALOGUE.md`'s table exactly per command (asserted
  in the Discord-interaction test for each row of §12) — account-scoped/private data is always
  ephemeral, genuinely public data is always public.
- Every mutating command's response uses a component (button/select/modal), never a raw reaction —
  asserted as a standing regression across the whole command set (a direct fix over the old bot).
- Every command defers within Discord's 3-second ack window before any Slice call — asserted via a
  timing check in the Discord-interaction harness (the simulated interaction's `deferReply`/`reply`
  call must occur before the fake/disposable Slice client is invoked).
- Pagination components (shared paginator) are tested once for the shared implementation, then
  spot-verified for each command that uses it (`/asset search`, `/watchlist list`,
  `/notifications list`, `/collector search`, admin audit lookups) — Previous/Next disabled at
  bounds, page position shown in the footer.
- Persistent components (ticket/suggestion/giveaway buttons) are round-tripped through a simulated
  bot restart in the Discord-interaction suite, confirming state is recovered from bot-owned
  persistence, never memory (`TEST_STRATEGY.md`'s explicit "Persistent-component tests" bullet).
- Disabled/unavailable-feature rendering (e.g., `/portfolio`'s unavailable state, order-book/
  recent-trades placeholders) is asserted to show the reason text, never a silently missing feature
  or a broken click-through.

## 19. Implementation file plan

Proposed test-tree layout (paths illustrative of the layout this document specifies, not code
written by this document):

| Path | Purpose |
|---|---|
| `tests/unit/commands/**` | Command-handler unit tests against the fake Slice client, one directory per command family, mirroring Documents 005–014's own scope |
| `tests/unit/jobs/**` | Scheduled-job logic unit tests (deterministic clock), including the reaction-index-0 regression |
| `tests/unit/idempotency/**` | Idempotency-key derivation tests across every mutating command |
| `tests/unit/error-mapping/**` | Exhaustive `ERROR_CATALOGUE.md` mapping tests, including the shared M6 regression helper |
| `tests/integration/slice-api/**` | Command handlers against the disposable Slice instance, one file per endpoint group from §11 |
| `tests/integration/bot-db/**` | Bot-owned persistence tests (tickets, moderation, giveaways, suggestions) against a disposable bot database |
| `tests/discord-interaction/**` | Simulated interaction payloads through the real router, one file per command family, including permission-gate and ephemeral/public assertions |
| `tests/discord-interaction/persistent-components/**` | Restart-recovery round-trip tests for ticket/suggestion/giveaway buttons |
| `tests/e2e/**` | Full-stack tests against a disposable Slice staging/ephemeral environment plus discord.js interaction simulation, gated by the conditional endpoints in §11 |
| `tests/regression/**` | Standing regression suite for §4's old-bot-defect items, run on every future change regardless of which command family touched it |
| `tests/fixtures/**` | Shared seed data (non-production Slice accounts/assets/collectors, bot-owned guild config) for integration/E2E runs |
| `tests/security-qa/**` | Automated portion of the security QA grep pass (log/message-history scanning helpers) supporting the manual pass in §24 |
| `docs/discord-bot-build-guide/implementation/017-testing-and-discord-interaction-e2e.md` | This document itself |

## 20. Numbered implementation steps

1. Confirm Documents 001–016 have each closed their own completion checklist (§26 of each); record
   any document that closed with a known gap in its own §21–24 as an explicit input to step 2.
2. Build the full coverage matrix (§12) by cross-referencing every command in `COMMAND_CATALOGUE.md`
   and every event/job in `EVENT_AND_JOB_CATALOGUE.md` against what Documents 001–016 actually
   delivered; mark each cell Y / NEW / BLOCKED per §12's definitions — never mark a cell Y without a
   citable prior test.
3. For every NEW cell, write the missing unit/integration/Discord-interaction test in the
   appropriate directory from §19, following the same conventions (fake Slice client for unit,
   disposable Slice instance for integration, discord.js interaction simulation for
   Discord-interaction) already established by the document that owns that command family.
4. Stand up the E2E harness: wire the real command-handler stack (interaction router → command
   handler → application service → real Slice API client) to discord.js's interaction-simulation
   tooling on one side and a disposable, non-production Slice staging/ephemeral environment
   (seeded with non-production test data) on the other — never production, per this document's
   named Slice backend dependency.
5. For each conditional/BLOCKED row in §11/§12, check whether the named Slice bot-only endpoint now
   exists on the disposable environment; if yes, move it from BLOCKED to a real E2E test; if no,
   leave it BLOCKED and carry it into the go/no-go gate (step 9) as an explicit, named blocker — never
   silently mark it passing.
6. Assemble the regression suite (§4, `tests/regression/**`) as a suite that runs independently of
   which command family is currently being changed, so a future change to, say, Document 012's
   moderation code cannot silently reintroduce the reaction-index-0 bug or the missing-permission-
   check bug from an unrelated code path.
7. Run the manual QA checklist (§24) once in a real dev/test guild against the disposable Slice
   environment: full Phase 1 command pass, rate-limit QA, error QA, security QA grep pass.
8. Consolidate results: coverage matrix completion percentage, regression suite pass/fail, manual QA
   sign-off, and the explicit list of any still-BLOCKED rows with their named Slice dependency.
9. Apply the go/no-go gate: this document's coverage matrix and regression/E2E run pass the gate only
   if (a) every command whose Slice dependency is unblocked (already-available per
   `BOT_API_REQUIREMENTS.md`) shows Y across all four coverage types; (b) the entire regression suite
   passes with zero known-old-bot-defect recurrences; (c) the security QA grep pass finds zero
   secret/token leaks; (d) rate-limit and error QA both pass; (e) every still-BLOCKED command is
   explicitly named with its blocking Slice dependency, not silently omitted. A gate that passes
   with named, documented blockers is a **conditional go** (those specific commands stay
   feature-flagged off per `DEPLOYMENT_PLAN.md`'s default-off philosophy); a gate with an
   unaccounted-for gap, a regression-suite failure, or any secret leak is a **no-go**.
10. Hand the consolidated coverage matrix, regression suite results, and go/no-go determination to
    Document 018 as its required input for the production launch checklist.

## 21. Unit tests

Operationalizing `TEST_STRATEGY.md`'s unit-test section across the whole finished bot (§12's "U"
column, cross-referenced to §19's `tests/unit/**` tree):

- Command-handler logic for every command in §12 against the fake, typed Slice API client (no
  network): input validation, permission pre-checks, error-mapping (every code in
  `ERROR_CATALOGUE.md`, per §17), embed construction, pagination math.
- Idempotency-key derivation for every mutating command (§15): deterministic per logical intent,
  changes only on explicit retry — asserted for the full mutating-command set, not a sample.
- Scheduled-job logic in isolation for every job in §12's events/jobs table: `mute-expiry` timing
  against a controlled clock, `giveaway-tick` winner selection given an arbitrary entry set
  (explicit reaction-index-0 regression, §4), `ticket-inactivity-sweep` window boundaries,
  `market-digest`/`price-alert-poll` DEMO-labeling and skip-on-failure behavior,
  `prediction-scoring` correctness against a fixed market snapshot.
- Account-link token lifecycle (expiry, single-use, 1:1 enforcement) against a fake service layer —
  covers the logic even while integration/E2E coverage of the real endpoints remains BLOCKED per
  §11.

## 22. Integration tests

Operationalizing `TEST_STRATEGY.md`'s integration-test section across the whole finished bot:

- Real bot command handlers against a disposable local/staging Slice instance for every endpoint
  tagged "already-available" in §11 — full read coverage (marketplace, catalogue, collector, vault,
  market movers, admin audit/status-history) plus the safe mutations that don't require the
  account-linking dependency (none of the Phase 1 mutating commands are Slice-dependency-free except
  where account-linking is already closed; where it is not yet closed, those specific rows stay
  BLOCKED per §11/§12, never faked as passing).
- Once the bot-only endpoints (§1–3 of `BOT_API_REQUIREMENTS.md`) exist on the disposable Slice
  instance, integration tests cover the full link → delegated-token-exchange → watchlist-mutation
  path end-to-end, exactly as `TEST_STRATEGY.md` specifies — this is the single test that, once
  green, unblocks the largest number of BLOCKED rows in §12 simultaneously.
- Bot-owned persistence (tickets, moderation, giveaways, suggestions) tested against a real
  disposable bot database — full CRUD/state-machine coverage, not just the happy path (e.g., a
  ticket close attempted twice, a giveaway rerolled after it already ended).
- Background-job integration tests run each job against both the disposable Slice instance (for
  market-data-dependent jobs) and the disposable bot database (for bot-owned-state jobs), asserting
  the documented failure-handling behavior from `EVENT_AND_JOB_CATALOGUE.md` (retry with backoff,
  dead-letter after N failures, alert admin channel; skip-and-log on Slice API failure without
  posting stale data as current).

## 23. Discord interaction tests

Operationalizing `TEST_STRATEGY.md`'s Discord-interaction-test section across the whole finished
bot:

- Simulated interaction payloads (slash command, button click, select, modal submit) for **every**
  command and component in §12 run through the real interaction router and command handlers,
  asserting the exact response shape: ephemeral flag matches `COMMAND_CATALOGUE.md`'s table,
  embed fields match §18's invariants, component state (enabled/disabled buttons, select options)
  is correct — all without a live Discord gateway connection.
- Persistent-component tests: every ticket, suggestion, and giveaway button's custom ID is
  round-tripped through a simulated bot restart to confirm state is recoverable from bot-owned
  persistence, not memory (`TEST_STRATEGY.md`'s explicit bullet, extended here to cover every
  persistent component introduced by Documents 011/014, not just one example).
- Permission-gate tests (§13): both the Discord-side-only commands and the dual-gated commands get
  an explicit "Discord gate passes, Slice gate would fail" test case.
- The M6 error-regression test (§17) and the reaction-index-0 regression test (§21) are re-asserted
  at the Discord-interaction layer, not just the unit layer, confirming the correct behavior survives
  all the way through the router and response-formatting code, not just the isolated business logic.

## 24. Manual QA checklist

A human runs this checklist by hand in a real dev/test guild against a disposable, non-production
Slice environment before sign-off, directly operationalizing `TEST_STRATEGY.md`'s manual QA section:

- [ ] Full pass through every Phase 1 command (§12's first table) in the test guild: account
      link/unlink (if unblocked), `/account status`, watchlist add/remove/list, notifications read
      flows, `/portfolio` honest-unavailable state, asset/collector/vault reads with correct DEMO
      labeling where applicable.
- [ ] Full pass through admin read-only commands (`/admin audit/status-history/link-lookup`) as a
      test admin account, confirming fresh-permission-check behavior.
- [ ] Full pass through the support/ticket lifecycle: open each of the seven categories, claim,
      add/remove participant, escalate, close, confirm transcript storage and channel visibility.
- [ ] Full pass through the moderation suite: kick, ban (with type-to-confirm), mute/unmute
      (including waiting out or fast-forwarding a real `mute-expiry` cycle), purge, warn/warns,
      lockdown/unlock, banlist, unban (by Discord ID only).
- [ ] Full pass through community features: `/suggest` submit + status change, `/giveaway start`
      through a real `giveaway-tick` cycle including reroll/end/delete each individually
      permission-gated, `/poll`, `/faq`, `/roadmap` (view and admin edit).
- [ ] Full pass through background-job-driven behavior observed live: `market-digest` posts on
      schedule with DEMO labeling intact, `price-alert-poll` pings the opt-in role correctly,
      `news-feed-poll` posts new items independent of any Slice outage simulated during the same
      window.
- [ ] **Rate-limit QA:** deliberately trigger Slice's documented rate limits (e.g., spam
      `/account link` past 3/hour) and confirm the bot surfaces the friendly message with the
      correct `Retry-After`, never a raw 429.
- [ ] **Error QA:** deliberately trigger each mapped error code in `ERROR_CATALOGUE.md` (request a
      non-public collector, an unpublished asset, an already-linked account, a conflicting
      idempotency key) and confirm the correct friendly message every time, with no raw error text
      ever appearing.
- [ ] **Security QA:** after the full pass above, grep the bot's structured logs and the test
      guild's Discord message history for any Slice token/secret/session cookie/password/
      service-account credential substring — zero matches required.
- [ ] Confirm every BLOCKED row from §12 is still accurately BLOCKED (i.e., not accidentally working
      due to an undocumented endpoint having shipped) or has moved to Y with a corresponding
      integration/E2E test added per step 5 of §20.

## 25. Verification commands

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration      # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run test:discord-interaction
npm run test:regression       # standing old-bot-defect regression suite, §4/§20/§21/§23
npm run test:e2e              # requires SLICE_E2E_BASE_URL pointed at a disposable, non-production
                               # Slice staging/ephemeral environment — refuses to run against any
                               # URL matching the production Slice API base
npm run build
```

## 26. Completion checklist

- [ ] Every command in `COMMAND_CATALOGUE.md` and every event/job in `EVENT_AND_JOB_CATALOGUE.md`
      appears in the coverage matrix (§12) with an accurate, non-fabricated Y/NEW-now-closed/BLOCKED
      status per coverage type.
- [ ] No cell in the coverage matrix is marked Y without a citable test in the file tree from §19.
- [ ] The E2E harness (§20 step 4) is wired to a disposable, non-production Slice environment only —
      no production Slice base URL is reachable from the E2E test configuration.
- [ ] The regression suite (§4, §20 step 6, `tests/regression/**`) exists as a suite independent of
      any single command family and passes in full.
- [ ] The manual QA checklist (§24) has been run to completion in a real test guild with a signed-off
      result, including the rate-limit, error, and security QA sub-passes.
- [ ] Every still-BLOCKED row is explicitly named with its blocking Slice dependency (from §11) —
      none are silently omitted from the final report.
- [ ] The go/no-go gate (§20 step 9) has been explicitly applied and its determination (go /
      conditional go / no-go) is recorded with its reasoning.
- [ ] No test or fixture ever uses production Slice data or a production Slice credential.
- [ ] No Slice source, Prisma schema, migration, or API was modified in the course of writing or
      running this document's tests.
- [ ] `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`,
      `npm run test:discord-interaction`, `npm run test:regression`, and `npm run build` all pass;
      `npm run test:e2e` passes for every unblocked row and reports (not silently skips) every
      BLOCKED row.

## 27. Documentation updates

- `IMPLEMENTATION_ORDER.md` and `PROMPT_INDEX.md`: flip row 017's status to COMPLETE only once the
  completion checklist (§26) is fully satisfied and the go/no-go determination is recorded — a
  conditional go with named blockers is still a valid COMPLETE state for this document itself (the
  blockers are Slice-side, not a failure of this document's own scope), but the blockers must be
  visible in the row's notes.
- `CURRENT_STATE.md`: update to reflect that the full-bot testing pass has run, citing the go/no-go
  result and any still-BLOCKED command list as a named entry under "Known blockers," consistent with
  its existing style (e.g., the existing bullets about Documents 004–006/009/010/013 needing new
  Slice endpoints).
- `project-state.json`: update `sliceBackendStatus` if the audit performed in step 1/5 of §20
  reveals any Slice backend document's status has changed since this file's last audit date; add a
  new field or note recording this document's go/no-go outcome for Document 018 to consume.
- `MASTER_CHECKLIST.md`: under "Production readiness," check off "Discord bot implementation begun"
  only in the sense that testing occurred — the checklist's other unchecked items (new Slice
  endpoints built and verified, Slice Doc 017 shipping a Discord channel type, Slice Docs 012–014,
  Slice Doc 016/018) remain unchecked exactly as accurately reflected by this document's BLOCKED
  rows; this document does not check off a box it has no evidence for.

## 28. Final report format

The implementer's completion report for this document must include, in this order:

1. **Coverage summary:** total commands/events/jobs in `COMMAND_CATALOGUE.md`/
   `EVENT_AND_JOB_CATALOGUE.md`, count and percentage Y across all four coverage types, count and
   list of any NEW-closed-this-document, count and named list of BLOCKED with their Slice
   dependency.
2. **Regression suite result:** pass/fail, with explicit confirmation the reaction-index-0,
   raw-exception-leakage (M6), missing-permission-check, and username#discriminator regression tests
   specifically ran and passed.
3. **Manual QA result:** sign-off status per checklist section (§24), including the security QA grep
   pass result (must state "zero matches" explicitly, not just "passed").
4. **E2E harness confirmation:** explicit statement that the E2E suite's Slice base URL was
   disposable/non-production for every run, with the environment identifier used (never a
   production identifier).
5. **Go/no-go determination:** go / conditional go / no-go, with the reasoning from §20 step 9 and
   the exact list of any conditions attached, formatted so Document 018 can consume it directly as
   its launch-checklist input.
6. **Documentation updates applied:** which of §27's files were actually updated and how.
7. **Completion checklist:** the full §26 checklist, each item's final state.

## 29. Stop condition

> Stop after completing this document. Do not begin the next implementation document.
