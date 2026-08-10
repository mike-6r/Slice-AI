# Event and job catalogue

## Discord gateway events consumed

| Event | Handler purpose | Notes |
|---|---|---|
| `interactionCreate` | Routes every slash command / button / select / modal submission | Central router, BOT_ARCHITECTURE.md |
| `guildMemberAdd` | Posts the `#start-here` welcome embed / onboarding flow | Bot-owned, no Slice call |
| `messageCreate` (scoped) | Auto-moderation (invite/link filter) | Only where auto-mod is enabled per guild |
| `guildCreate` / `guildDelete` | Registers/cleans up per-guild bot configuration | Bot-owned config lifecycle |

## Scheduled jobs (BullMQ, matching Slice's own Doc 017 technology choice)

| Job | Cadence | Purpose | Backend calls | Failure handling |
|---|---|---|---|---|
| `ticket-inactivity-sweep` | every 15 min | Auto-close tickets past the configured inactivity window | none (bot-owned) | retry with backoff, dead-letter after N failures, alert admin channel |
| `mute-expiry` | every 1 min | Remove the muted role once a mute's duration elapses | none (bot-owned) | same |
| `giveaway-tick` | every 30s (mirrors old bot's cadence, reimplemented safely) | Update countdown embeds, end expired giveaways, pick winners | none (bot-owned) | same |
| `market-digest` | daily, configurable time | Post a DEMO-labeled market summary/movers digest | `GET /v1/market/summary`, `/movers` | skip and log on Slice API failure, do not post partial/stale data as if current |
| `price-alert-poll` | every 5–15 min (configurable) | Poll DEMO-labeled market data for large moves, ping the opt-in role | `GET /v1/market/movers` | same; clearly labeled DEMO in every alert |
| `prediction-scoring` | daily | Score open predictions against real (DEMO-labeled) market data, update leaderboard | `GET /v1/market/assets/:slug` | same |
| `news-feed-poll` | every 15–30 min | Pull external Pokémon TCG news source, post new items | external source only | independent of Slice; failures don't affect any Slice-backed feature |
| `notification-delivery-consumer` | **Phase 2, not built** | Would consume Slice's outbox once Doc 017 + a Discord channel type exist | `GET /v1/bot/notifications/outbox` (not built) | documented only, BOT_API_REQUIREMENTS.md §4 |

## Domain events referenced from Slice (not yet dispatched anywhere — for future design awareness only)

Per the extraction from Slice's own docs, these use-case-level events already exist as return values
inside the backend but are not published anywhere (no queue/outbox exists until Doc 017 ships):
`identity.user.created.v1`, `identity.status.changed.v1`, `identity.role.changed.v1`,
`catalogue.asset.metadata.changed.v1`, `market.snapshot.updated.v1`, `vault.public_event.published.v1`,
`portfolio.changed.v1`, `notification.created.v1`, `notification.read.v1`, `watchlist.changed.v1`,
plus the Doc 010/011 events (`submission.submitted.v1`, `verification.approved/rejected.v1`,
`valuation.decided.v1`, `custody.status.changed.v1`, `insurance.status.changed.v1`,
`asset.published.v1`) and every Doc 012–015 planned event. **None of these can be subscribed to by
the bot today.** They are listed here so the future `notification-delivery-consumer` job's design
starts from an accurate list rather than guessing.
