# Test strategy

## Unit tests

- Command-handler logic against a fake, typed Slice API client (no network) — covers input
  validation, permission pre-checks, error-mapping (every code in ERROR_CATALOGUE.md), embed
  construction, pagination math.
- Idempotency-key derivation (deterministic per logical intent, changes only on explicit retry).
- Scheduled-job logic in isolation (mute-expiry timing, giveaway winner selection given an arbitrary
  entry set — explicitly regression-testing the old bot's reaction-index-0 bug).
- Account-link token lifecycle (expiry, single-use, 1:1 enforcement) against a fake service layer.

## Integration tests

- Real bot command handlers against a **disposable local Slice instance** (mirroring how Slice's own
  backend spins up disposable Postgres/Redis per Doc 002) for the endpoints in
  "already available" (BOT_API_REQUIREMENTS.md) — watchlist add/remove/list, notifications,
  portfolio unavailable-state, market/catalogue/collector/vault reads.
- Once the bot-only endpoints (§1–3 of BOT_API_REQUIREMENTS.md) exist on a disposable Slice instance,
  integration tests cover the full link → delegated-token-exchange → watchlist-mutation path
  end-to-end.
- Bot-owned persistence (tickets, moderation, giveaways, suggestions) tested against a real
  disposable bot database.

## Discord interaction tests

- Simulated interaction payloads (slash command, button click, select, modal submit) run through the
  real interaction router and command handlers, asserting the exact response shape (ephemeral flag,
  embed fields, component state) without a live Discord gateway connection.
- Persistent-component tests: a button's custom ID is round-tripped through a simulated bot restart
  to confirm state is recoverable from bot-owned persistence, not memory.

## Manual QA

- Full pass through every Phase 1 command in a real test guild against a real (non-production) Slice
  environment: account link/unlink, watchlist add/remove/list, notifications read flows, portfolio
  honest-unavailable state, asset/collector/vault reads with correct DEMO labeling, ticket lifecycle
  (all seven categories), moderation suite, giveaways, suggestions.
- Rate-limit QA: deliberately trigger Slice's documented rate limits and confirm the bot surfaces the
  friendly message with correct `Retry-After`, not a raw 429.
- Error QA: deliberately trigger each mapped error code (e.g., request a non-public collector, an
  unpublished asset) and confirm the correct friendly message, and that no raw error text ever
  appears.
- Security QA: confirm no Slice token/secret ever appears in a Discord message, embed, custom ID, or
  bot log, by grepping structured logs and Discord message history in the test guild after a full
  pass.

## Verification commands (to be run at implementation time, template)

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration   # requires a disposable Slice instance per BOT_ARCHITECTURE.md
npm run build
```

## Non-goals

No test suite is written for Phase 2+ features (trading, wallet, governance) since they are not
implemented in this build guide.
