# Backend requirements for the Discord bot

## Already available (use as-is, no backend change needed)

| Endpoint | Auth | Permission | Audit | Idempotency | Rate limit | Bot usage |
|---|---|---|---|---|---|---|
| `POST /v1/auth/login`, `/refresh`, `/logout`, `/logout-all` | public / cookie / token | self | yes | signup/logout-all only | yes (documented limits) | Not called directly by the bot for end users (see §1) — relevant only if a bot-facing web confirmation page reuses the same session model |
| `GET /v1/session`, `GET /v1/me` | token | self | n/a (read) | n/a | yes | `/account status` |
| `PATCH /v1/me/profile` | token | self | yes (changed fields only) | required | yes | Not exposed in Discord initially (no product need identified) |
| `GET /v1/admin/audit-events`, `GET /v1/admin/users/:id/status-history` | token | ADMIN/SUPPORT | n/a (read) | n/a | yes | Admin read-only lookups (BOT_PRODUCT_SPEC.md §8) |
| `GET /v1/categories`, `.../sets`, `GET /v1/grading-companies`, `.../grades`, `GET /v1/catalogue/assets/:slug` | public | none | n/a | n/a | yes | `/asset search` filters, `/asset view` metadata |
| `GET /v1/market/assets`, `/:slug`, `/:slug/history`, `/:slug/similar`, `/summary`, `/movers` | public | none | n/a | n/a | yes | `/asset search`, `/asset view`, `/market movers`, daily digest job |
| `GET /v1/market/assets/:slug/order-book`, `/recent-trades` | public | none | n/a | n/a | yes | Rendered as Slice's own honest "not available until trading" placeholder |
| `GET /v1/collectors`, `/:slug`, `/:slug/assets` | public | none | n/a | n/a | yes | `/collector search`, `/collector view` |
| `GET /v1/vault/events`, `/summary` | public | none | n/a | n/a | yes | `/vault latest` |
| `GET /v1/me/portfolio?range` | token | self | n/a (read) | n/a | yes | `/portfolio` — always renders `authority: DEMO/UNAVAILABLE` honestly |
| `GET /v1/me/watchlist`, `PUT/DELETE /v1/me/watchlist/:assetId` | token | self | optional | required (mutations) | yes | `/watchlist list/add/remove` |
| `GET /v1/me/notifications`, `PATCH .../:id/read`, `POST .../read-all` | token | self | limited | required (mutations) | yes | `/notifications list/unread/read/read-all` |

## New endpoint required (extends existing Slice modules)

| Endpoint | Method | Auth | Permission | Input | Output | Idempotency | Audit | Rate limit | Reason |
|---|---|---|---|---|---|---|---|---|---|
| `GET /v1/me/discord-link` | GET | token | self | — | `{linked: boolean, discordUserId?, linkedAt?}` | n/a | n/a (read) | yes | Lets the Slice **web app** show link status; the bot itself uses the bot-only equivalent (§1) |

Everything else the bot needs beyond pure reads is a **bot-only service endpoint** (below), because
normal user-facing endpoints assume a browser session the bot does not have.

## Bot-only service endpoints (new — none of this exists today)

Only proposed where a normal user API genuinely cannot serve the need (per the task's own guidance
not to add broad admin endpoints just because Discord could call them).

### 1. Discord account linking

- `POST /v1/bot/discord-link/challenge` — **service-account auth**. Body: `{discordUserId}`.
  Creates a single-use, ≤10-minute token bound to `discordUserId`. Returns `{code, expiresAt}`. Rate
  limited per Discord user (e.g., 3/hour) to prevent token-generation spam.
- `POST /v1/me/discord-link/complete` — **user session auth** (called from the Slice web app, not
  the bot). Body: `{code}`. Validates the code, creates the `discordUserId ↔ userId` mapping
  (new table, e.g. `DiscordLink(userId unique, discordUserId unique, linkedAt, unlinkedAt?)`),
  invalidates the token, writes an `AuditEvent`. Idempotency key required.
- `POST /v1/bot/discord-link/unlink` — **service-account auth**, on behalf of a Discord user (self-
  service via the bot) or **admin token** (support case, recent-auth required). Body:
  `{discordUserId}` or `{userId, reasonCode}`. Idempotent, audited.
- `GET /v1/bot/discord-link/:discordUserId` — **service-account auth**. Returns `{linked, userId?,
  status?}` so the bot can resolve a Discord user to a Slice account (or confirm "not linked")
  without holding a user-scoped token for every read. Rate limited.

### 2. Bot-scoped delegated reads/writes on behalf of a linked user

- `POST /v1/bot/tokens/exchange` — **service-account auth**. Body: `{discordUserId, scope}` (scope
  limited to an explicit allowlist: `watchlist:read`, `watchlist:write`, `notifications:read`,
  `notifications:write`, `portfolio:read`, `profile:read`). Returns a short-lived (≤5 minute),
  narrowly-scoped access token for the linked Slice user, usable only for the requested scope. This
  is the mechanism that lets `/watchlist add` and `/notifications read` act as the real user without
  the bot ever holding their password or long-lived refresh token. **This is a genuinely new pattern
  for Slice and requires the backend team's explicit design sign-off** — this build guide proposes
  the shape but does not assume it is pre-approved.

### 3. Service-account authentication itself

- The bot needs a **service-account credential type** that does not exist in Slice's identity model
  today (`User.status`/`role` model is for human accounts). Recommended shape: a new `ServiceAccount`
  entity (or a special `RoleAssignment` scope reserved for machine identities) with its own
  credential (e.g., a rotatable API key or mTLS client cert), scoped to exactly the bot-only
  endpoints above, rate-limited independently of any human user, and fully audited (every
  service-account call writes an `AuditEvent` with `actorType: SERVICE`, distinguishable from human
  actors). No such entity exists in Docs 003–018 today.

### 4. Notification delivery / Discord channel type

- Not proposed as a concrete endpoint yet — flagged as a **design dependency** on Slice's own Doc 017
  (outbox/jobs/realtime/notifications), which today defines only `IN_APP | EMAIL | ...` channels with
  no Discord/webhook value. Before any push-to-Discord feature can be built, Slice's team must:
  1. Add a `DISCORD` (or generic `WEBHOOK`) value to `NotificationPreference.channel`.
  2. Decide whether delivery is bot-pull (bot polls a new `GET /v1/bot/notifications/outbox` cursor
     feed as an `InboxReceipt`-style consumer) or Slice-push (Slice calls a bot-hosted webhook).
     Given Doc 017's own stated pattern ("producers write outbox in the same transaction; consumers
     are idempotent, at-least-once"), **bot-pull as a new outbox consumer is the better fit** —
     it avoids Slice needing to know the bot's network location and avoids a new inbound-webhook
     attack surface on the bot.
  3. Provide a `GET /v1/bot/notifications/outbox?cursor&limit` endpoint (service-account auth) once
     the above exists, returning `OutboxEvent` rows relevant to notification delivery, with the bot
     maintaining its own `InboxReceipt`-equivalent dedup table (BOT_DATA_OWNERSHIP.md).
- **Not built in this iteration.** Documented here so Slice's backend team has an explicit, scoped
  ask when Doc 017 is scheduled, rather than the bot team inventing an ad hoc webhook later.

## Explicitly NOT recommended

- No broad "bot admin" endpoint that exposes every admin capability — only the narrow, explicitly
  justified endpoints above.
- No endpoint that lets the bot mutate user status/roles directly (BOT_PRODUCT_SPEC.md §8 recommends
  keeping that in the web admin panel given the current GLOBAL-only scoping gap).
- No wallet/deposit/withdrawal/KYC endpoint of any kind (Doc 016 DEFERRED).
- No trading/order endpoint of any kind (Doc 014 NOT STARTED).
