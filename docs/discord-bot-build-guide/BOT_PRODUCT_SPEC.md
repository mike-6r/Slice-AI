# Slice Discord bot — product specification

## Product principles (non-negotiable)

1. **Slice remains the single source of truth.** Users, sessions, permissions, assets, market data,
   watchlists, notifications, collector profiles, vault events, audit history, and (once built)
   ownership/finance/trading all live in the Slice backend. The bot never writes its own copy of any
   of this.
2. **The bot is a client, not a second backend.** It calls Slice's HTTP API through a typed client
   (BOT_ARCHITECTURE.md). It never queries Postgres/Prisma directly, never re-implements a business
   rule Slice already enforces, and never invents a business rule Slice hasn't defined.
3. **Never show fabricated data as real.** If Slice returns `authority: "DEMO"` or
   `dataStatus: "DEMO"`, the bot's embed says so visibly. If Slice has no data for a capability
   (portfolio P&L, trading, wallet), the bot says "not available yet" — it never estimates, mocks, or
   silently omits the caveat.
4. **Discord role possession is never treated as proof of Slice permission**, and a Slice permission
   is never assumed from Discord state alone (see BOT_SECURITY_MODEL.md).
5. **Read-first, mutate-second.** Every feature area below states explicitly whether Discord should
   be read-only or allowed to mutate, and what confirmation/audit/idempotency/rate-limit applies to
   any mutation.
6. **No feature ships ahead of its backend phase.** A command must not exist in a form that implies
   a capability Slice hasn't built (e.g., no "Buy Shares" button before Doc 014 trading ships and
   Doc 018's launch gate is passed).

## Feature-area evaluation (originally proposed areas)

### 1. Account linking — BUILD FIRST, new backend work required

**Backend reality:** no Discord-identity concept exists anywhere in Slice today (confirmed by
searching 003–018 and the entity blueprint — no `ExternalIdentity`/`UserLinkedAccount` table, no
field on `User`). This must be designed from scratch.

- `/account link` — generates a short-lived, single-use link code server-side (new bot-only service
  endpoint, see BOT_API_REQUIREMENTS.md §1). User enters the code on the Slice web app while logged
  in (or the bot opens a deep link to a "confirm Discord link" page). Code expires in ≤10 minutes,
  is single-use, and is invalidated on any use (success or failure) to prevent replay.
- `/account unlink` — removes the mapping; requires the user to be the linked Discord user (or an
  admin with recent-auth, for support cases) and is audited on the Slice side.
- Discord user ↔ Slice user is **1:1 each way** (one Discord account cannot link two Slice accounts
  and vice versa) — enforced server-side with a unique constraint on the new table.
- No password is ever collected in Discord. No Slice access/refresh token is ever placed in a
  Discord message, embed, custom ID, button payload, or log line.
- Account-status handling: if the linked Slice account becomes `SUSPENDED`, `RESTRICTED`, or
  `CLOSED`, the bot must reflect that (e.g., deny mutating commands, show a clear status message) by
  checking `GET /v1/me` fresh on each privileged command — never cache status indefinitely.
- Audit trail: link/unlink are Slice-side audited events (extends the existing `AuditEvent` model
  from Doc 003/005), scoped as a new `actorType` value for bot-originated actions.
- Ephemeral response always (link codes and account state are private).

### 2. Account and session status — read-only, live today's data model

- `/account status` — shows profile summary (`GET /v1/me`), account status enum, joined date
  (`User.createdAt`, VERIFIED field), linked Discord ID confirmation. No session internals, no
  tokens, no email address unless the requester is viewing their own account.
- Ephemeral, self-only, no admin variant here (admin account lookup lives under Admin Operations).

### 3. Marketplace search — read-only, real data available today (DEMO-labeled)

**Backend reality:** Doc 007 (market reads) and Doc 006 (catalogue) are VERIFIED. Market values are
real API responses but explicitly carry `source`, `status` (`dataStatus`: `DEMO`/`DELAYED`/`LIVE`),
`asOf`, and optionally `confidence`. Today, with no live provider wired, expect everything to come
back `DEMO`.

- `/asset search` — category/set/grading-company/grade-range/price-range filters against
  `GET /v1/market/assets`. Public, cacheable, rate-limited by Slice already.
- `/asset view <slug>` — detail via `GET /v1/market/assets/:slug`: estimated value **with its
  `source`, `asOf`, and `dataStatus`/`confidence` rendered every time**, similar assets
  (`/similar`), and — critically — **no generic unlabeled "price" field**. If `dataStatus` is
  `DEMO`, the embed must say "Estimated (demo data)" or equivalent, never just a bare number.
- Order book / recent trades: Slice's own API already returns an honest empty placeholder
  (`availability: "NOT_AVAILABLE_UNTIL_TRADING"`) until Doc 014 ships. The bot mirrors that exactly
  — it shows "Trading not yet available on Slice" rather than omitting the field or faking a book.
- No ownership, no "X shares available," no order-book depth, no fabricated "confidence rating" —
  only what the API actually returns.

### 4. Watchlist — read + mutate, real and idempotent today

**Backend reality:** Doc 008 is VERIFIED. `PUT`/`DELETE /v1/me/watchlist/:assetId` are naturally
idempotent (unique `(userId, assetId)` constraint; add-twice and remove-twice both no-op to success).

- `/watchlist add <asset>`, `/watchlist remove <asset>`, `/watchlist list` (paginated, cursor-based
  to match the API). All self-only, require a linked account, ephemeral responses (a user's
  watchlist is private).
- No client-side idempotency key needed beyond what the API already guarantees, but the bot still
  passes Slice's `Idempotency-Key` header on every mutation per BOT_ARCHITECTURE.md convention, using
  a deterministic key derived from `(discordUserId, assetId, action)` so an accidental Discord retry
  (e.g., a double-click) cannot double-submit.

### 5. Notifications — read + mutate today; **push delivery is not possible yet**

**Backend reality:** Doc 008's `Notification` read/mark-read/mark-all-read endpoints are VERIFIED.
Doc 017 (outbox/jobs/realtime/delivery) is **NOT STARTED**, and — critically — its
`NotificationPreference.channel` enum only names `IN_APP | EMAIL | ...`; **no Discord/webhook channel
is defined anywhere in the Slice docs.** Even `EMAIL` itself is explicitly "unapproved provider" pending
policy.

- `/notifications list`, `/notifications unread` (count), `/notifications read <id>`,
  `/notifications read-all` — all pull-based against the existing VERIFIED endpoints. Self-only,
  ephemeral.
- **Discord push/DM delivery of notifications is a Phase 2+ capability**, gated on Doc 017 shipping
  *and* on Slice's team defining a new `DISCORD` (or generic outbound-webhook) channel value in
  `NotificationPreference` — something that does not exist in any current design document. This
  build guide documents the dependency (BOT_API_REQUIREMENTS.md §7) but does not build it now.
- No notification content leakage: notification bodies are already "server-authored allowlisted
  plain text only" per Doc 008 — the bot renders them as-is, adds no inferred content.

### 6. Collector profiles — read-only, real and opt-in today

**Backend reality:** Doc 008 VERIFIED. `PublicCollectorProfile.isPublic` defaults `false` — only
explicitly opted-in collectors are visible.

- `/collector search`, `/collector view <slug>` — public data only, exactly what
  `GET /v1/collectors` / `GET /v1/collectors/:slug` / `.../assets` return. No fabricated holdings,
  no win-rate/ROI/portfolio-value (those don't exist — see client-wishlist reality check below for
  why "Investor Profiles" as requested can't be built as specified today).
- If a profile isn't public, the command says so explicitly rather than 404-ing silently, using
  Slice's own `PROFILE_NOT_PUBLIC` error mapping.

### 7. Vault activity — read-only, real and source-safe today

**Backend reality:** Doc 008 VERIFIED (public feed) plus Doc 011 (valuation/custody/insurance,
marked BUILT per its own doc — see the 010/011 status discrepancy flagged in CURRENT_STATE.md).

- `/vault latest` — `GET /v1/vault/events` / `/summary`, public summaries only. `VaultPublicEvent`
  has a `sourceRef` field marked **private** — never rendered. No internal location detail, no named
  custody provider unless Slice's own public API already includes it in the allowlisted projection.
- No claims about insurance coverage beyond what `insurance{status, insuredAmount?, expiresAt?}`
  (Doc 011's public allowlist) actually returns, and never presented as a guarantee.

### 8. Admin operations — mostly read-only in the bot; mutations stay in the web admin panel

**Backend reality:** Doc 005 (admin user status/roles/audit reads) is VERIFIED, but "GLOBAL-only
effective role resolution" means there is currently no working per-guild/per-resource scoping — every
grant is platform-wide. A Discord `ADMIN`-equivalent command is therefore unusually high-blast-radius.

- Read-only bot commands (admin-role-gated, ephemeral): audit-event lookup, user status-history
  lookup, linked-account lookup for support triage.
- **High-impact mutations (user status change, role grant/revoke) stay in the web admin panel** by
  default. If ever exposed in Discord, every one of the following is mandatory, no exceptions: Slice
  `ADMIN` permission check (never Discord role alone), a Discord-side role check as a *second* gate
  (defense in depth, not a substitute), recent-auth (the same freshness gate Doc 005 already
  requires for these endpoints), explicit type-to-confirm interaction, the existing
  `Idempotency-Key`, Slice's own audit write, Slice's own rate limit, and safe error handling that
  never echoes raw backend errors. Given the GLOBAL-only scoping gap, this build guide recommends
  **not** exposing status/role mutation in Discord in the initial phases — the blast radius of a
  compromised bot-admin flow is "every Slice user," not "one guild."
- Catalogue admin mutations (Doc 006) are lower-risk (metadata, not identity/finance) and are a
  reasonable Phase 2 candidate under the same confirmation/audit/idempotency bar.

### 9. Support and tickets — bot-owned, informed by the old bot's pattern

See `OLD_TO_NEW_MIGRATION_MATRIX.md` and Implementation Doc 013. Categories align with the client's
explicit request: Account Issues, Investment Issues, Withdrawal, Deposit, Report User, Partnership,
General Support. Ticket channel names never include a raw Slice user ID or email; if linked-account
context is shown inside the ticket, it's the display name/handle only, fetched fresh via `GET
/v1/me` equivalent (admin-scoped lookup) at ticket-open time, not cached indefinitely. Transcript
retention and closure policy are defined explicitly in the implementation doc, not left implicit.

### 10. Announcements and status — bot-owned, content-accuracy gated

- Deployment/status messages, planned-maintenance notices: straightforward, bot/admin-authored.
- "Public market-read summaries" (e.g., a daily digest) are allowed **only** using real Doc 007 data
  with full `source`/`asOf`/`dataStatus` labeling — never "live market" language while `dataStatus`
  is `DEMO`.

### 11. Moderation and community — bot-owned, kept separate from Slice permissions

Standard Discord moderation (kick/ban/mute/purge/warn/lockdown), rewritten per the migration matrix.
Explicitly **not** linked to Slice account status unless a future, deliberately-designed policy says
otherwise (e.g., a Discord ban must not auto-restrict a Slice account, and a Slice suspension must
not auto-ban the Discord account) — see BOT_SECURITY_MODEL.md.

### 12. Future features (documented, not implemented)

Ownership alerts, trade notifications, order updates, portfolio summaries, governance votes,
asset-submission status updates, verification-status updates, settlement notifications — every one
of these is gated on the specific Slice backend document that owns the underlying capability (012,
013, 014, 015, 017 respectively), **and** on Doc 018's launch gate for anything touching real money.
None are implemented in Implementation Docs 001–018 of this build guide; each is called out with its
exact blocking document in BOT_API_REQUIREMENTS.md and IMPLEMENTATION_ORDER.md.

---

## Client-requested feature wishlist — reality check

The client (via "Jay") supplied a large list of desired channels/commands. Several of these describe
a **fully live trading platform** (real-time market engine, wallet connect, buy/sell buttons, trade
transparency feed, portfolio P&L, achievement badges tied to real £ invested). Slice's backend does
not support most of this today — ownership (012), finance/portfolio (013), trading (014), and
compliance/wallet (016, formally **DEFERRED**) are all unbuilt or blocked. Below, every requested
item is classified as **BUILD NOW** (bot-owned or backed by a VERIFIED Slice API, honestly labeled),
**PHASE-GATED** (needs a specific Slice backend document to ship first — named explicitly), or
**NEEDS PRODUCT/LEGAL DECISION** (implies new Slice product surface and/or regulatory exposure that
is out of scope for this build guide to just wire up).

| Client request | Classification | Why / dependency | Recommended near-term design |
|---|---|---|---|
| `#start-here` welcome embed | BUILD NOW | Static content, no backend dependency | Ship as-is |
| `#start-here` "Connect Wallet" button | **NEEDS PRODUCT/LEGAL DECISION** | Wallet is explicitly disabled with "no provider" in Slice's own frontend review; Doc 016 (wallet/compliance) is formally DEFERRED pending provider approval | Do not build a live button. Either omit entirely for now or show a disabled "Coming soon" state with no click-through |
| `#start-here` "Verify Email" button | PHASE-GATED | Doc 004 explicitly excludes email delivery ("no email delivery/reset/MFA/social login" out of scope); Slice itself has no verification-email sender yet | Defer until Slice ships email delivery; in the meantime, "Verify Email" cannot exist as a working button |
| `#start-here` Account Level / Verification Status / Joined Date | PARTIAL BUILD NOW | Account status + joined date are real (`User.status`, `User.createdAt`, VERIFIED). "Account Level" is not a defined Slice concept | Show real status + joined date once account linking exists (Implementation Doc 005); drop "Account Level" until product defines it |
| "Verified Investor" role unlocking marketplace channels | **NEEDS PRODUCT DECISION** | Implies KYC-verified status, which requires Doc 016 (DEFERRED) | Rename/reframe as "Linked Account" role (proves Discord↔Slice link only, not investor verification) until real KYC exists |
| `#create-a-ticket` | BUILD NOW | Bot-owned, no Slice dependency | Ship per Implementation Doc 013 |
| `#faq` `/faq` | BUILD NOW (content-gated) | Static content | Copy must not claim live trading/voting/fractional-share features are active if they aren't; write as platform education, version-controlled by admins |
| `#roadmap` with progress bars + poster | BUILD NOW | Static/admin-updated marketing content, no live API dependency | Ship as a slash command rendering the supplied roadmap content/poster; keep progress values admin-editable, not tied to any live metric |
| `#roles` reaction roles for notification categories | BUILD NOW (roles) / PHASE-GATED (delivery) | Discord-native role assignment has no Slice dependency; *delivering* real "New Listing"/"Price Alert" notifications needs Doc 017 (NOT STARTED, no Discord channel defined) + real listing/trading data (012/014) | Ship opt-in roles now; label clearly that notifications "will activate once [feature] launches" |
| Leveling system (XP, daily rewards, leaderboard, birthdays) | BUILD NOW | Entirely bot-owned Discord engagement data, zero Slice dependency | Ship as bot-owned persistence (BOT_DATA_OWNERSHIP.md) |
| "Live Market Engine" (real-time price, 24h %, volume, market cap, movers) | PARTIAL BUILD NOW | Doc 007 (VERIFIED) provides this data via `GET /v1/market/*`, but **labeled DEMO**, and there is no push/streaming (017 not started) — so "real-time" must mean scheduled polling, not live push | Ship `/asset view`, `/market movers`, daily digest using real DEMO-labeled data on a polling cadence; do not market it as "live" while `dataStatus` is `DEMO` |
| Investor Profiles (win rate, ROI, total invested, portfolio value) | PHASE-GATED | Requires ownership (012) + finance/portfolio (013), both NOT STARTED; today `PublicCollectorProfile` has no financial-performance fields at all | Ship the real, non-financial part now (`/collector view` — headline, specialism, public holdings if allowlisted); defer performance stats entirely |
| Achievement system tied to £ invested / trade count / hold duration | PHASE-GATED (mostly) | "£1,000 Invested," "100 Trades," "Diamond Hands" all require real ownership/trading data (012/014, NOT STARTED) | "Early Supporter" (join-date based) is buildable now as a bot-owned badge; everything else waits for 012/014 |
| Analytics (DAU, trades/day, holding time, liquidity, retention) | PARTIAL BUILD NOW (admin-only) | DAU/retention are Discord-side, bot-owned, buildable now; trades/day, holding time, liquidity require Doc 014 (NOT STARTED) | Ship Discord engagement analytics as an admin-only dashboard/command now; defer trading analytics |
| `/portfolio /profile /card /search /value /balance /watchlist /price /history /help /invite /top` | MIXED | `/profile`→collector view (BUILD NOW), `/search`/`/card`/`/price`/`/history`→market/catalogue (BUILD NOW, DEMO-labeled), `/watchlist` (BUILD NOW), `/help`/`/invite` (BUILD NOW), `/portfolio` → must show Slice's own `authority: DEMO/UNAVAILABLE` honestly (BUILD NOW, but never fabricated P&L), `/balance` → **not buildable** (no finance ledger, 013 NOT STARTED), `/top` → clarify: market movers (BUILD NOW) vs. top investors (PHASE-GATED, needs 013) | See COMMAND_CATALOGUE.md for the exact per-command scoping |
| `#suggestions` voting/approve-reject-planned-completed | BUILD NOW | Bot-owned | Ship per migration matrix (button state machine) |
| `#memes` weekly competition | BUILD NOW | Bot-owned | Ship as a simple reaction-count job |
| `#polls` `/poll` | BUILD NOW | Bot-owned | Ship using Discord-native or custom timed polls |
| `#market-discussion` auto-morning summary | PARTIAL BUILD NOW | Real Doc 007 movers/summary data, DEMO-labeled, scheduled job | Ship with clear DEMO/source/asOf labeling on every line |
| `#requesting` (peer "looking for X, budget £Y") | **NEEDS PRODUCT/LEGAL DECISION** | No such concept exists in any Slice document (010–018); implies a peer-to-peer request/matching surface for a regulated investment product with no compliance review | Do not build without a product + compliance decision; flag as a wholly new feature proposal, out of scope for this build guide |
| `#offering` (sell template, "Buy"/"Message Seller"/"Watch" buttons, "Expected ROI") | **NEEDS PRODUCT/LEGAL DECISION — HIGH RISK** | A working "Buy" button here would execute value transfer outside Slice's real order/settlement system (014, NOT STARTED) and outside compliance gating (016, DEFERRED) — this is the single highest-risk item in the entire request list; a non-functional "Buy" button is actively misleading | Do not build in any form until Doc 014 (trading) ships, Doc 016 (compliance) is unblocked, and Doc 018 (launch gate) is passed for the specific market. Even then, this needs its own product spec, not a bot bolt-on |
| `#trades` (Trade Complete posts with buyer/seller/price/txn ID) | PHASE-GATED + PRIVACY REVIEW | Needs real Doc 014 execution data (NOT STARTED); even once built, broadcasting buyer/seller identity conflicts with the codebase's own stated rule that "private... order and settlement data must never use public channels" | Defer entirely; when 014 ships, design as pseudonymized/opt-in disclosure, not raw identity broadcast |
| `#market-feed` (new listings, funding progress %, "Buy Shares") | **NEEDS PRODUCT/LEGAL DECISION — HIGH RISK** | "Funding Progress %" implies a crowdfund/issuance mechanic not present in any Slice document — Doc 012's model is "fixed supply issued once," not a funding round. "Buy Shares" has the same risk as `#offering` above | Do not build; this is a new product concept requiring its own design + compliance review before any bot work |
| `#recent-sales` (completed purchases, volume charts) | PHASE-GATED | Needs real Doc 014 data | Defer entirely |
| `#price-alerts` (% move / ATH / high-volume pings) | PARTIAL BUILD NOW | Real Doc 007 DEMO-labeled data can drive a scheduled-poll alert; true event-driven push needs Doc 017 (NOT STARTED) | Ship a polling-based version now, clearly DEMO-labeled; upgrade to push once 017 exists |
| `#portfolio-showcase` `/portfolio` card (value/P&L/best-worst/diversification/ROI) | PHASE-GATED | Needs Doc 013 (finance/portfolio authority, NOT STARTED); today portfolio reads return `authority: DEMO` or `UNAVAILABLE` only | Ship an honest "portfolio not yet available" card now if desired; full showcase waits for 013 |
| Daily "Top 10 Undervalued" scanner with confidence rating | **NEEDS PRODUCT DECISION** | No "undervalued"/expected-ROI scoring model exists anywhere in Slice's documented backend (006/007 don't include this) — this is new data-science/analytics work, not a wiring task | Scope as a new backend analytics proposal; do not fabricate a confidence score client-side |
| Prediction market + accuracy leaderboard | BUILD NOW (as a bot-owned game) | Predictions and scoring can be entirely bot-owned, scored against real (DEMO-labeled) Doc 007 prices later | Ship with an explicit "for entertainment, not investment advice" disclaimer given it's predicting real-money-denominated (if currently demo) prices |
| Portfolio analytics (lowest volatility, highest appreciation, oldest holdings, conviction) | PHASE-GATED | Needs Doc 012/013 real ownership/portfolio data | Defer entirely |
| Pokémon TCG news aggregator | BUILD NOW (content) | External news source, bot-owned, no Slice dependency | Ship as a scheduled feed job |
| ...with "predicts potential market impact" | **NEEDS PRODUCT/LEGAL REVIEW** | AI-generated market-impact commentary on a real-money collectibles investment platform is functionally market commentary/financial-adjacent content with real liability exposure | Ship the news feed without impact predictions until legal/compliance signs off on that specific feature; if approved, labeled clearly as speculative/entertainment content, not advice |

**Bottom line:** roughly a third of the client's list is buildable now as honest, DEMO-labeled, or
bot-owned functionality (start-here shell, tickets, FAQ, roadmap, reaction-roles, leveling,
suggestions, memes, polls, market summaries/movers, watchlist, collector profiles, prediction game,
news feed). A third is phase-gated on specific named Slice backend documents (012–014, 017) and
should be scheduled accordingly, not built early with fake data. The remaining third — anything with
a working "Buy" button, peer-to-peer trading requests, or funding-progress listings — needs an
explicit product and legal/compliance decision before any bot implementation begins, because a
non-functional or improperly-gated financial action button is the single biggest risk in this entire
request list.
