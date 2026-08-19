# Slice Discord 001–018 Reconciliation Audit

Audit date: 2026-08-18  
Scope: `apps/discord-bot/`, only the supporting Slice backend seams needed to establish authority, and read-only VPS/Discord evidence.  
Method: audit only. No code, database, Discord configuration, command synchronization, service, migration, deployment, commit, or push operation was performed.

## Executive Summary

**Evidence-based implementation estimate: 62% (range 57–67%).**

The bot has a substantial, safely bounded companion foundation: a live two-process Discord runtime; 56 source-and-guild-registered slash commands; a reconciled premium/minimal server manifest; human-access verification; secure web handoff account linking; tickets, transcripts and inactivity handling; moderation/automod; bot-owned community progression; and typed, read-only public market/Collector/Vault reads.

It is **not yet release-complete**. The main reason is not command registration or service availability: the candidate cannot be fully regression-validated until a real, isolated PostgreSQL `slice_test` `TEST_DATABASE_URL` is available to the test process. Several intended community and market-delivery features are also still absent or only preference/panel level. Existing unit tests are strong for the implemented foundation, but real-guild interaction coverage remains incomplete.

The percentage is weighted by current product intent and safe completion, not by a raw count of wishlist rows. Product/legal-gated items (wallet/KYC, financial balances, trading, ROI, valuation/scanner and AI prediction authority) are deliberately not counted as missing functionality.

### Status-count basis

The owner wishlist matrix has 55 rows:

| COMPLETE | PARTIAL | MISSING | SUPERSEDED | INTENTIONALLY DEFERRED | BACKEND-GATED |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 28 | 9 | 4 | 2 | 7 | 5 |

`BACKEND-GATED` is reported separately because the product rule is to wait for authoritative Slice backend data rather than simulate it in Discord.

## Current Runtime

| Check | Evidence | Result |
| --- | --- | --- |
| Local repository | `main`, `dd2c7cb` (`fix(account): connect Discord through bot handoff`) | Correct authoritative repository and branch. |
| Local working tree | Three Discord setup files modified and unrelated local audit/archive artifacts present before this audit | Preserved; none were changed by this audit. |
| Active VPS release | `/opt/slice/releases/20260818-dd2c7cb` | Same commit identifier as current local HEAD. |
| Gateway service | `slice-discord.service` | `active`. |
| Worker service | `slice-discord-worker.service` | `active`. |
| Gateway readiness | `127.0.0.1:3111/ready` | HTTP `200`. |
| Worker readiness | `127.0.0.1:3112/ready` | HTTP `200`. |
| Discord command registration | Read-only Discord API inventory | 56 registered development-guild commands. Names exactly match current source inventory. |
| Current deployment QA document | `docs/qa/discord/DISCORD_VPS_DEPLOYMENT_QA.md` dated 2026-08-17 | Historical evidence only: it reports the older 52-command release. It must not be used as proof of current 56-command interaction QA. |

The active service definition does not contain a systemd-unit `SLICE_API_BASE_URL` override. This is **not** evidence that the API environment is absent: the managed environment file was intentionally not printed or inspected for values. It does mean the current audit did not independently prove each authenticated Slice API route from the live bot process.

## Command Inventory

### Registration result

`src/command-inventory.ts` is the shared source of truth used by both runtime and `src/deploy.ts`. The live guild inventory is exactly the same 56 top-level names:

`about, account, achievements, announce, ask, asset, balance, ban, birthday, card, collector, config, daily, faq, help, history, insights, invite, leaderboard, level, market, modcase, modhistory, note, notifications, offer, ops, poll, portfolio, price, pricealert, profile, rep, reputation, request, roadmap, roles, search, setup, slice, status, suggest, suggestion, summary, support, ticket, timeout, top, transactions, trending, unban, untimeout, value, vault, warn, watchlist`.

Response scope below reflects the implemented handler intent. “Private” means ephemeral/self-only response; a command may still create a public community message or Discord-side record when called out in the mutation column. “Live” means name registration and running services were independently observed, **not** that every interaction was manually exercised in a real guild.

| Exact command / subcommands | Source | Response / gate | Slice dependency | Mutation | Automated evidence | Live |
| --- | --- | --- | --- | --- | --- | --- |
| `/setup preview, server, status, refresh, repair, artwork, reset` | `src/commands/setup.ts` | Private; Discord Administrator default permission, owner-scoped confirmation nonce | None for business data | Discord managed resources/panels only; reset destructive after confirmation | `setup-manifest`, `setup-status` | Registered; no apply/reset run in this audit |
| `/config reload` | `src/commands/configuration.ts` | Private; Discord Administrator | Local presentation/config only | Reloads bot config | No dedicated test found | Registered |
| `/account` | `src/commands/onboarding.ts` | Private; self | Bot link-status/challenge API | Link/unlink through backend/web handoff | `onboarding`, `my-slice`, `slice-backend-client` | Registered |
| `/slice` | `src/my-slice.ts` | Private; self | Authenticated My Slice projection | None | `my-slice`, `slice-backend-client` | Registered |
| `/roles` | `src/commands/onboarding.ts`, `src/notification-roles.ts` | Private/persistent panel; verified member | None | Discord notification roles plus bot preference rows | `notification-roles`, `onboarding` | Registered |
| `/faq` | `src/commands/onboarding.ts` | Private; member | None | None | `onboarding` | Registered |
| `/support` | `src/commands/onboarding.ts` | Private; member | Website handoff only where available | Opens ticket flow/link | `onboarding`, `ticket-creation` | Registered |
| `/ops` | `src/staff-operations.ts` | Private; linked Slice staff role is rechecked | Admin operations summary API | No business mutation | `staff-operations`, `slice-backend-client` | Registered |
| `/ticket claim, unclaim, status, priority, transfer, resolve, close, transcript` | `src/commands/tickets.ts` | Private; ticket creator/assigned staff authorization | None | Bot ticket lifecycle, channel controls and transcript | `ticket-*`, integration lifecycle test | Registered |
| `/warn`, `/note`, `/timeout`, `/untimeout`, `/ban`, `/unban`, `/modcase`, `/modhistory` | `src/commands/moderation.ts` | Private; runtime staff + hierarchy protection | None | Discord moderation action and persisted case where applicable | `moderation`, `moderation-commands` | Registered |
| `/level`, `/leaderboard`, `/rep`, `/reputation`, `/achievements`, `/daily` | `src/commands/progression.ts` | Leaderboard public; self/community actions scoped at runtime | None | Bot-owned XP, reputation, daily and achievement state | No dedicated progression unit file found | Registered |
| `/notifications`, `/suggest`, `/suggestion`, `/poll`, `/birthday set, remove, view` | `src/commands/community.ts` | Preferences/birthday private; `suggestion`/`poll` require Manage Guild; community posts public | None | Bot notification preferences, suggestions/votes, polls/votes, birthdays | No dedicated community unit file found | Registered |
| `/card`, `/search`, `/value`, `/price`, `/history`, `/top` | `src/commands/market.ts` | Public read | Public market projection | None | `slice-backend-client`, paginator | Registered |
| `/asset search, view`; `/market movers`; `/collector search, view`; `/vault latest, summary` | `src/commands/market.ts` | Public read; paginator owner-scoped | Typed public Slice market/Collector/Vault API | None | `slice-backend-client`, `paginator` | Registered |
| `/portfolio`, `/balance`, `/transactions`, `/watchlist` | `src/commands/market.ts` | Private; self | Website handoff only | No Discord financial/watchlist mutation | No direct command test found | Registered |
| `/profile view, privacy` | `src/commands/market.ts` | Self view private; other-member view is community-profile limited | Linked self summary only | Bot-owned profile privacy setting | `slice-backend-client` | Registered |
| `/pricealert add, list, remove` | `src/commands/price-alerts.ts` | Private; self | No price-event evaluator yet | Bot-owned alert preference rows only | No dedicated alert test found | Registered |
| `/ask`, `/help`, `/summary`, `/insights`, `/trending`, `/about`, `/status` | `src/commands/intelligence.ts` | Mostly private assistance/status; public informational output where applicable | Read-only/helper services as configured | None | No dedicated unit file found | Registered |
| `/invite`, `/roadmap`, `/announce`, `/request`, `/offer` | `src/commands/gap-sweep.ts` | `announce` Manage Guild; others member or private handoff as appropriate | Website/admin handoffs only | `announce` posts to Discord; request/offer are not market authority | No dedicated unit file found | Registered |

## Component and Interaction Inventory

| Surface | Custom-ID / persistence model | Authorization and restart conclusion |
| --- | --- | --- |
| Setup refresh / apply / reset / cancel | `slice:setup:*`; apply/reset request nonce is process-memory and owner/guild bound | Actor and guild checked. Confirmation expires on restart, which safely requires a fresh preview. |
| Account link/unlink and My Slice | `slice:onboarding:*`, `slice:my-slice:*` | Link challenge is backend-issued, single-use/expiring. Unlink has an explicit confirmation. Handler rechecks link status. |
| Human verification | `slice:verify:human:<nonce>:<selection>`; visual puzzle attachment | Guild/user-bound, answer never appears in embed/file name/custom ID, 4-minute lifetime, 3 attempts and start rate limit. Challenge state is in memory; a restart safely expires it and requires retry. |
| Notification-role selector | `slice:roles:notifications` | Persistent panel ID; allowlist rejects privileged, uneditable, permission-bearing and unknown roles. State/panel ID is Prisma-backed. |
| Customer notification selector | `slice:notifications:customer` | Persistent selector; preference stored in bot state. |
| Ticket creation/intake/controls | `slice:ticket:*`; ticket ID in control ID | Ticket repository is durable; every routed action checks current ticket/guild/actor authorization. Controls are designed to work after restart. |
| Ticket confirmation, priority and transfer | `slice:ticket:<action>:<ticketId>` plus modal/select controls | Authorization runs before actions. Durable ticket ID, but interaction must reference an existing ticket. |
| Suggestions and polls | `slice:community:suggestion:<id>:up|down`; `slice:community:poll:<id>` | Durable IDs; handler re-fetches record and checks guild before voting. |
| Staff panel | `slice:staff:*` | Rechecks backend link and current Slice staff/admin role before showing a handoff. |
| Market paginator | `slice:page:<uuid>:previous|next` | Owner-scoped and expires after 15 minutes; process-memory only, so a restart safely makes the result expire rather than exposing someone else’s view. |
| Permanent panels | `DiscordPanel` persistence plus managed-resource keys | Existing canonical messages are edited in place when IDs are stored; this prevents duplicates during normal reconciliation. |

No giveaway control exists. Therefore there is no giveaway component to audit for persistence or authorization.

## 001–018 Matrix

| Document | Historical intention | Current implementation | Status | Evidence | Remaining work |
| --- | --- | --- | --- | --- | --- |
| 001 Foundation | Reconcile repo and establish a typed bot foundation | TypeScript Discord service, Prisma bot-owned operational state, config, health endpoints and deploy inventory exist | COMPLETE | `apps/discord-bot/src/main.ts`, `worker.ts`, `config.ts`, current active services | Keep repository/QA documents current |
| 002 API contracts | One safe Slice API client and shared projections | `SliceBackendClient` exists; public market/Collector/Vault projections strip unrecognized fields | PARTIAL | `src/slice-backend-client.ts`, `docs/qa/discord/DISCORD_MARKET_COLLECTOR_QA.md` | Validate all live authenticated seams in real-guild QA |
| 003 Interaction registry | Slash command registry and safe interaction routing | Shared `discordCommandInventory` used by runtime/deploy; 56 commands registered live | COMPLETE | `src/command-inventory.ts`, `src/deploy.ts`, read-only Discord inventory | Component E2E coverage |
| 004 Linking domain | One-to-one, short-lived backend-owned Discord link challenges | `DiscordAccountLink`, OAuth/challenge models and bot endpoints exist | COMPLETE | `server/prisma/schema.prisma`, `server/src/modules/identity/discord/*` | Live link/unlink/browser handoff QA |
| 005 Linking commands | Private Discord account status/link/unlink UX | `/account`, onboarding buttons and `/slice` are implemented | PARTIAL | `src/commands/onboarding.ts`, `src/main.ts`, `my-slice.ts` | Account level/joined date status projection and live QA |
| 006 Authorization | Backend authority for Slice-sensitive functions | Staff panel rechecks linked Slice roles; private market/account surfaces avoid Discord-role authority | PARTIAL | `src/main.ts`, `staff-operations.ts` | E2E proof for role changes/link revocation and all privileged routes |
| 007 Asset commands | Honest public marketplace reads | `/asset`, `/market movers`, legacy compatibility reads and paginator are present | COMPLETE | `src/commands/market.ts`, `docs/qa/discord/DISCORD_MARKET_COLLECTOR_QA.md` | Full integration run with isolated DB; manual guild rendering QA |
| 008 Collector and Vault | Public Collector/Vault read-only views | `/collector` and `/vault` use safe public projections | COMPLETE | `src/commands/market.ts`, `slice-backend-client.ts` | Manual guild QA; backend search/filter enhancement only if product requires it |
| 009 Watchlist and portfolio | Private real Slice watchlist/portfolio reads and safe mutations | Private web handoff commands only; no authoritative Discord read/mutation client | PARTIAL | `src/commands/market.ts` | Backend-approved API seam and implementation, if still desired |
| 010 Notifications | Preferences plus backend-authorized delivery | Role preferences, customer selector, D17 polling/acknowledgement worker and receipts exist | PARTIAL | `notification-roles.ts`, `discord-delivery-worker.ts`, `worker.ts` | Live delivery QA; no price-event producer/evaluator |
| 011 Tickets | Private lifecycle, transcript, inactivity close | Persisted tickets, strict routing/authorization, transcript and inactivity worker are present | COMPLETE | `tickets.ts`, `ticket-*`, `worker.ts`, integration test | Real-guild privacy/restart/transcript QA |
| 012 Moderation | Slash moderation with cases and automod | Warn/note/timeout/ban cases, hierarchy protection, spam/duplicate/mentions/invite/scam filtering exist | COMPLETE | `moderation.ts`, `discord-moderation.ts`, `main.ts`, tests | Real-guild enforcement/mod-log failure QA; mute-expiry is not part of current native-timeout implementation |
| 013 Admin read-only operations | Safe operational shortcuts without Discord business authority | `/ops` and staff panel provide linked-role-gated handoffs/read summary | PARTIAL | `staff-operations.ts`, `main.ts` | Live role/authorization QA and bounded admin read coverage |
| 014 Community | Bot-owned engagement features | XP/levels/roles, reputation, daily, achievements, birthdays, suggestions and polls are implemented | PARTIAL | `progression.ts`, `community.ts`, `worker.ts`, Prisma models | Giveaways, a defined meme feature, and dedicated automated coverage |
| 015 Jobs and digests | Scheduled reliable jobs/digests | Ticket scan, community schedule/poll close and delivery polling run in worker intervals | PARTIAL | `worker.ts` | No giveaway tick, mute expiry, market digest, price-alert poll, prediction score or news-feed poll |
| 016 Observability | Safe logging, audit correlation and operational controls | Health endpoints, structured logger use, case/ticket persistence and delivery receipts exist | PARTIAL | `logger.ts`, `main.ts`, `worker.ts`, Prisma operational tables | Evidence of alerting/runbook and live failure drills |
| 017 Tests/E2E | Unit, integration and real Discord interaction validation | 19 unit files/93 tests pass; ticket integration suite exists | PARTIAL | `test/unit`, `test/integration/ticket-lifecycle-prisma.test.ts` | Isolated DB integration suite and manual live-guild interaction matrix |
| 018 Deployment | Hardened reproducible deployment and launch gate | Two systemd services, readiness endpoints and registered guild commands are live | PARTIAL | live read-only status, `docs/qa/discord/DISCORD_VPS_DEPLOYMENT_QA.md` | Candidate full regression pass with real `slice_test`; current live-guild QA evidence |

## Owner Wishlist Matrix

| Requested concept | Classification | Exact evidence / current boundary |
| --- | --- | --- |
| Start-here welcome | COMPLETE | `config/setup.yml` has `verify` and `welcome` panels/channels with a verified gate. |
| Discord verification | COMPLETE | Visual 3×3 proof-of-humanity in `discord-human-verification.ts`; it explicitly is not identity/KYC. |
| Account Level/status/joined date | PARTIAL | `/account` and `/slice` show safe linked account state; dedicated level/joined-date account projection is not evidenced. |
| Account linking | COMPLETE | Backend `DiscordAccountLink`/challenge and private web handoff. |
| Verified Investor role | INTENTIONALLY DEFERRED | Current product rule forbids treating Discord verification/roles as KYC or investor status. |
| Connect Wallet | INTENTIONALLY DEFERRED | Current product rule forbids it absent authority. |
| Tickets | COMPLETE | Persisted private ticket service and panel flow. |
| Ticket transcript | COMPLETE | `TicketTranscriptService`; worker generation on close. |
| Ticket inactivity close | COMPLETE | `TicketInactivityService` worker scan, warning and close/lock. |
| FAQ | COMPLETE | `/faq` and permanent FAQ panel. |
| Roadmap | COMPLETE | `/roadmap` is registered in `gap-sweep.ts`. |
| Notification roles | COMPLETE | Verified-only persistent allowlisted selector and preferences. |
| New Listings | PARTIAL | Notification role/panel exists; no proven automated listing feed. |
| Price Alerts (role preference) | COMPLETE | `Price Alerts` allowlisted notification role exists. |
| Rare Finds/Cards | COMPLETE | `Rare Finds` notification preference role exists. |
| Auctions | COMPLETE | `Auctions` notification preference role exists. |
| Giveaways role | COMPLETE | Permissionless `Giveaways` notification role exists. |
| News role | COMPLETE | Permissionless `Slice News` notification role exists. |
| XP | COMPLETE | Message pipeline awards bot-owned XP after automod check. |
| Levels | COMPLETE | Level progression and milestone roles (`5/10/20/30/50`). |
| Leaderboard | COMPLETE | `/leaderboard` registered with progression repository. |
| Birthday announcements | COMPLETE | Month/day state and worker announcement schedule. |
| Daily rewards | COMPLETE | `/daily` with non-financial community streak state. |
| Reputation | COMPLETE | `/rep`/`/reputation`, grant and cooldown state. |
| Conversation starter | COMPLETE | Daily and weekly community scheduler posts prompts. |
| Suggestions | COMPLETE | Durable suggestion records and up/down voting. |
| Giveaways | MISSING | No command, model, worker tick or component. |
| Polls | COMPLETE | Durable polls, votes and scheduled closing. |
| Memes | PARTIAL | Weekly prompt mentions memes; no actual meme submission/curation/competition feature. |
| Market summaries | PARTIAL | `/summary` and Market Brief role/panel exist; no scheduled authoritative market digest. |
| Price alerts (functional delivery) | PARTIAL | `/pricealert` persists preferences but correctly says backend price-event evaluation is unavailable. |
| Portfolio | BACKEND-GATED | `/portfolio` is a private web handoff, not a Discord portfolio data surface. |
| Profile | PARTIAL | Community profile view/privacy exists; no full authoritative investor profile. |
| Asset/card search/view | COMPLETE | Safe public `/asset`, legacy read commands and public backend projections. |
| Watchlist | BACKEND-GATED | `/watchlist` is only a private website handoff; no Discord mutation/read seam. |
| Notifications | PARTIAL | Role preferences and D17 delivery worker exist; no general self-service notification inbox/read management is evidenced. |
| Help | COMPLETE | `/help` exists and is registered. |
| Invite | COMPLETE | `/invite` exists and is registered. |
| Top movers | COMPLETE | `/market movers` and `/top` compatibility path. |
| Top investors | INTENTIONALLY DEFERRED | Would imply financial/performance authority absent from current design. |
| Balance | BACKEND-GATED | `/balance` is a private web handoff only; no Discord financial display is permitted without backend authority. |
| Investor ROI profile | INTENTIONALLY DEFERRED | Current product rules forbid fake/unauthoritative ROI or win-rate. |
| Achievements | COMPLETE | Bot-owned `DiscordMemberAchievement` and `/achievements`. |
| Analytics | MISSING | No bounded community analytics command/report or job was found. |
| Requesting | SUPERSEDED | `/request` is a community/handoff feature, not marketplace authority; authoritative requests belong in Slice. |
| Offering | SUPERSEDED | `/offer` is not a trading/listing authority; offerings belong in Slice. |
| Trade feed | INTENTIONALLY DEFERRED | Requires authoritative trading phase/data. |
| Market feed | PARTIAL | Managed market channel/panel and announcements exist; no automatic authoritative feed job. |
| Recent sales | BACKEND-GATED | Copy/panel exists but no proven public recent-sales backend projection/feed. |
| Portfolio showcase | BACKEND-GATED | Requires explicit, safe backend portfolio authority and user privacy control. |
| Undervalued scanner | INTENTIONALLY DEFERRED | Product rules disallow confidence/ROI scanner authority. |
| Prediction game | MISSING | No command, model, scoring flow or worker. |
| Prediction leaderboard | MISSING | No prediction state or leaderboard. |
| Pokémon/news feed | PARTIAL | Slice News preference exists; no external/Pokémon news polling or feed. |
| AI market-impact predictions | INTENTIONALLY DEFERRED | Product rules disallow presenting ungrounded market predictions as authority. |

## Background Job Matrix

| Historical job | Classification | Current evidence / boundary |
| --- | --- | --- |
| ticket-inactivity-sweep | IMPLEMENTED | `TicketInactivityService` is invoked by `worker.ts` on startup and configured interval; it warns, transcripts, locks and closes. |
| mute-expiry | MISSING | Native Discord timeouts are supported, but no timeout-expiry scheduler exists or is needed for Discord-native expiry. |
| giveaway-tick | MISSING | No giveaway model/command/worker. |
| market-digest | MISSING | No scheduled authoritative market summary publisher. |
| price-alert-poll | MISSING | `/pricealert` explicitly states backend price-event evaluation is unavailable. |
| prediction-scoring | MISSING | No prediction domain/job. |
| news-feed-poll | MISSING | No news feed provider/poller. |
| notification-delivery-consumer | IMPLEMENTED UNDER DIFFERENT NAME | `DiscordDeliveryWorker` polls backend deliveries every minute, applies linked/preference checks, sends DMs, persists receipts, and acknowledges outcomes. |
| community lifecycle scheduler | IMPLEMENTED | `communityScan()` posts birthdays, daily conversation/weekly community prompts and closes due polls every 15 minutes. |

## Premium Discord Matrix

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| START HERE → verify | COMPLETE in source | `START HERE` and `🔐・verify` are manifest-managed; `@everyone` access is only there. |
| SLICE → welcome, announcements, my-slice, market, roles | COMPLETE in source | All five managed channels in `config/setup.yml`. |
| COLLECTORS → collector-hub, list-a-collectible | COMPLETE in source | Both channels are manifest-managed. |
| COMMUNITY → general, collectibles, community | PARTIAL | `general` and `collectibles` exist; the requested third `community` channel does not. |
| SUPPORT → support | COMPLETE in source | Managed `🎫・support` panel channel. |
| PRIVATE SUPPORT → dynamic tickets | COMPLETE in source | Separate staff category and per-ticket overwrite routing. |
| STAFF → operations, review-queue, support-ops, alerts, bot-logs | PARTIAL | `operations`, `review-queue`, `support-ops`, `bot-logs` exist. No distinct `alerts` channel exists. |
| Reconciliation/preview/status/repair | COMPLETE in source | `/setup preview/server/status/refresh/repair`; managed resource records and idempotent panel editing. |
| Safe reset | PARTIAL | Confirmation and known manual-layout discovery exist; community-required Discord resources may be protected and retained, as intended by Discord. Never run automatically. |
| No deletion of unmanaged resources | COMPLETE by design | Normal apply/repair reconcile only managed/known legacy Slice resources. Reset scope is explicitly limited to managed/recognized Slice layout after confirmation. |
| Permission overwrites and verify visibility | COMPLETE in source | `provisioner.ts` gates categories by verified/staff roles and hides `verify` after access. |
| Role hierarchy/separators | COMPLETE in source | 30 managed roles, separator validation, bot hierarchy blocker detection. Actual guild role ordering still needs live visual/permission QA. |
| Notification allowlist | COMPLETE in source | Eight preference roles; privileged/noneditable/permission-bearing roles rejected. |
| Premium embed system | COMPLETE in source | Shared `SliceEmbed`, YAML panel templates and persistent `DiscordPanel` references. |
| Permanent panel coverage | PARTIAL | Panels are idempotent for channel keys. Required live visual inspection has not been recorded, and several YAML templates have no current managed channel key. |

## Automated QA Matrix

| Area | Unit | Integration | Component/interaction | Live-guild evidence |
| --- | --- | --- | --- | --- |
| Foundation/config/deploy inventory | Command inventory unit coverage | None | Source/deploy share inventory | Registration names observed live |
| Account linking / My Slice | Yes: onboarding, My Slice, backend client tests | None | Challenge/status logic covered in units | No recorded end-to-end link/unlink web handoff |
| Human verification | Yes | None | Puzzle and ownership/rate conditions unit-covered | No recorded real-guild completion/restart exercise |
| Setup / manifest | Yes: manifest/status tests | None | Confirmation and status code covered | No preview/apply/repair visual QA in this audit; no reset executed |
| Roles selector | Yes: notification role tests | None | Allowlist validation covered | No recorded role mutation check in guild |
| Tickets | Yes: creation/routing/transcript-inactivity | **Yes: 5 Prisma lifecycle tests** | Router authorization is unit-tested | No recorded creator/staff/restart/transcript QA |
| Moderation / automod | Yes: moderation and command tests | None | Rule/hierarchy/case behavior covered | No recorded guild enforcement or mod-log failure exercise |
| Market / Collector / Vault | Yes: safe API projection and paginator tests | None | Owner-scoped paginator tested | No recorded command rendering, pagination or malformed-live-response QA |
| Watchlist / portfolio / balance | No dedicated command test | None | Handoff-only behavior | No live authority because intentionally not implemented |
| Staff operations | Yes | None | Linked role route checks covered | No recorded live authorization/revocation exercise |
| Progression / community | No dedicated progression/community unit file | None | Persistent model supports interactions, but not dedicated suite | No recorded XP/poll/birthday/daily live QA |
| Delivery worker | Yes | None | Delivery decision/receipt logic tested | No observed live customer notification delivery/acknowledgement |

**Observed safe local run:** `npm run test:unit` passed **19 test files / 93 tests** on 2026-08-18. This did not run the database integration suite.

## Live Discord QA Matrix

| Scenario | Evidence status | Required next evidence |
| --- | --- | --- |
| Command inventory | PASS | 56 names were read directly from Discord and match source. |
| Services/readiness | PASS | Both services active; both readiness endpoints returned 200. |
| Account linking and unlinking | NOT RECORDED | Linked and unlinked member flows, expired/reused challenge, role-removal consequence. |
| Human verification | NOT RECORDED | Unverified visibility, successful/failed/rate-limited challenge and a bot restart during a challenge. |
| Cross-user ownership | NOT RECORDED | Paginator, setup confirmation and ticket controls invoked by a second user. |
| Notification role selector | NOT RECORDED | Allowed-role add/remove, unknown/privileged-role rejection, persistence after restart. |
| Tickets/privacy/transcript | NOT RECORDED | Creator, assigned staff and unrelated member views; close, restart and transcript retrieval. |
| Market/Collector/Vault rendering | NOT RECORDED | Public assets, empty states, pagination, malformed/unavailable backend responses. |
| Moderation/automod | NOT RECORDED | Staff hierarchy, target protection, case/mod-log failure and every automod rule. |
| Community/progression | NOT RECORDED | XP cooldown/milestones, daily, rep, birthday, suggestion/poll persistence and scheduled posts. |
| Setup visual result | NOT RECORDED | Run `/setup preview`, review it, then only apply after explicit owner approval; inspect member/staff views on desktop and mobile. |

## Genuine Missing Features

These are current-intent features that are not complete and do **not** require inventing financial/KYC/trading authority:

1. A bounded giveaway system (staff creation, durable entry, end/reroll authorization and scheduled completion).
2. A defined community meme feature beyond the existing weekly prompt.
3. An authoritative scheduled market digest/feed, only if a suitable public Slice backend projection is approved.
4. Functional price-alert evaluation/delivery once a backend price-event seam exists.
5. A bounded, non-financial community analytics surface, if product confirms the metrics and audience.
6. Prediction game and scoring only if product specifies a non-financial, non-advisory game design.
7. A provider-approved news/Pokémon feed only after source, moderation and delivery policy are decided.
8. The two agreed minimal-structure channel gaps: `COMMUNITY → community` and `STAFF → alerts`.

## Superseded Historical Requirements

| Historical/requested concept | Current architecture decision |
| --- | --- |
| Direct bot database/business authority | Replaced by a typed Slice API boundary for Slice-owned data; Prisma is only for Discord operational state. |
| Legacy reaction/prefix-command bot patterns | Replaced by slash commands, components, typed handlers and persisted IDs. |
| Generic link blocking / broad URL deletion | Replaced by targeted automod/anti-scam rules, allowlist/denylist and safe redaction. |
| Discord request/offer as marketplace workflow | Replaced by community/handoff-only `/request` and `/offer`; Slice remains authoritative. |
| Discord wallet, buy/sell, custody, deposit/withdraw, KYC/investor roles | Explicitly excluded until product/legal/backend authority exists. |
| Financial portfolio ROI/P&L, top investors and undervalued/prediction claims | Explicitly excluded rather than fabricated. |
| BullMQ as the mandated scheduler | Current `worker.ts` interval worker is the operative implementation; equivalent jobs are audited by behavior, not historical library choice. |

## Current Blockers

1. **Release blocker — isolated integration database is unavailable to the candidate test process.** `apps/discord-bot/test/test-database-url.ts` requires `TEST_DATABASE_URL`, validates it as a PostgreSQL URL, and rejects every database name except `slice_test`. Prior candidate verification failed because the local database was unreachable and the VPS candidate environment did not provide `TEST_DATABASE_URL`. No placeholder URL, normal Slice database, or guard bypass is acceptable.
2. **Release blocker — full candidate regression is consequently not proven.** Unit tests pass, but the required Prisma ticket-lifecycle integration suite cannot be claimed as current candidate-pass evidence until blocker 1 is solved.
3. **Launch/quality blocker — no recorded real-guild interaction QA.** Registration and readiness are proven; account linking, verification, strict ticket privacy, component ownership/restart behavior, market views, moderation and delivery behavior are not manually evidenced.
4. **Product decision blocker — no approved authoritative producer for market digest, price alerts or news feed.** The bot correctly stores only a price-alert preference and does not claim to evaluate price movement.

## Recommended Work Order

### P0 — required before calling this release complete

1. Provision/propagate the real isolated `TEST_DATABASE_URL` for **only** `slice_test`; run the full candidate test suite without weakening the guard.
2. Record a controlled real-guild QA pass for account link/unlink, human verification, roles, ticket privacy/transcript/restart, moderation/automod, market/Collector/Vault pagination and delivery worker outcome handling.
3. Reconcile and explicitly approve the two desired manifest gaps (`COMMUNITY → community`, `STAFF → alerts`) before another setup apply; use `/setup preview` first.

### P1 — bounded intended product work after P0

1. Decide whether giveaways, memes, non-financial community analytics, prediction game, and news feed remain active product priorities; write bounded requirements before implementation.
2. Obtain an authoritative backend price-event/market-digest contract before building delivery/polling.
3. Add dedicated automated tests for progression/community, price alerts, intelligence/gap commands, persistent-panel interactions and restart cases.

### P2 — only with explicit product/backend/legal approval

1. Backend-approved private watchlist/portfolio/status display.
2. Any financial, wallet, KYC, trading, ownership, ROI, recent-sales or portfolio-showcase surface.
3. Any AI market-impact, undervaluation, confidence or investment-prediction feature.

## DO NOT BUILD

Until explicit product, legal and authoritative backend approval exists, keep the following unimplemented:

- Connect Wallet or a Discord wallet link.
- Verified Investor/KYC Discord role or any identity claim beyond the existing Discord access human check.
- Discord buy/sell/deposit/withdraw/custody/settlement controls.
- Financial `/balance`, transaction, portfolio P&L/ROI/diversification, top-investor or investor-win-rate displays without authoritative backend data.
- Real marketplace request/offer authority in Discord.
- Fake funding, valuation, custody, price, availability, score, confidence or expected-return data.
- Undervalued scanner, AI market-impact predictions, or advisory-like prediction output.

## Audit Evidence Boundaries

- The current source and read-only VPS/Discord observations are authoritative for this report.
- Older QA files are useful historical evidence but contain stale command/release counts (for example, 52 commands on 2026-08-17) and were not treated as current runtime truth.
- No secrets, token values, database URLs, environment values or private credentials were printed or copied into this report.
