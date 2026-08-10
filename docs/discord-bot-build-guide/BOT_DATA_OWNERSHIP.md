# Data ownership

Slice remains authoritative for every product/financial/identity concept. The bot owns only what is
genuinely Discord-operational state with no Slice counterpart.

| Data | Authority | Notes |
|---|---|---|
| User identity, email, password | Slice | Bot never stores or sees a password |
| Session/auth tokens | Slice | Bot never persists a Slice access/refresh token at rest |
| Account status, roles | Slice | Bot queries fresh on every privileged interaction, never caches long-term |
| Asset catalogue | Slice | Bot is read-only |
| Market data / valuations | Slice | Bot renders `source`/`asOf`/`dataStatus` from the API, never computes its own |
| Collector profiles | Slice | Bot is read-only |
| Vault events | Slice | Bot is read-only |
| Watchlist | Slice | Bot mutates via the real API only |
| Notifications | Slice | Bot reads/marks-read via the real API only |
| Portfolio / ownership / finance / trading | Slice (once built) | Not available today (012–014 NOT STARTED); bot has zero authority over any of it |
| Audit events | Slice | Bot writes its own *correlated* local log entry, never a competing audit record |
| **Discord ↔ Slice user link mapping** | **Shared — Slice is authoritative for the mapping's existence/validity; the mapping itself is a new Slice-side table** | See BOT_SECURITY_MODEL.md §1. The bot never independently decides a link is valid — it always confirms against Slice |
| Guild configuration (ticket categories, moderation settings, channel IDs, auto-mod domain lists, roadmap content, FAQ copy) | **Bot** | Pure Discord-operational config, no Slice equivalent |
| Ticket channel/thread mapping, claim state, blacklist | **Bot** | No Slice equivalent exists or should exist |
| Ticket transcripts | **Bot** (storage), with an explicit retention/redaction policy | Never contains Slice tokens; may reference (not embed) a linked account's display name only |
| Suggestion state machine | **Bot** | Pure Discord engagement feature |
| Giveaway state | **Bot** | Pure Discord engagement feature |
| Leveling/XP/leaderboard/birthdays | **Bot** | Pure Discord engagement feature, explicitly out of Slice's domain |
| Prediction-game submissions/leaderboard | **Bot** | Bot-owned, may *read* real Slice market data to score predictions but never writes back to Slice |
| Delivery deduplication (once notification push exists) | **Bot** | A new `InboxReceipt`-style dedup table on the bot side, consuming Slice's future Doc 017 outbox — mirrors the pattern Doc 017 itself specifies for its own consumers |
| Discord interaction state (in-flight confirmations, pagination cursors held in component state) | **Bot** | Ephemeral, short TTL, never a system of record |
| Moderation history (kicks/bans/mutes/warns) | **Bot** | Explicitly decoupled from Slice `AccountStatusHistory` — a Discord ban is not a Slice account action and vice versa (BOT_SECURITY_MODEL.md §6) |
| Roadmap/FAQ/announcement content | **Bot** (admin-editable) | Marketing/static content, not a live Slice data source |
| News feed content (Pokémon TCG news aggregation) | **Bot** | External source, no Slice dependency |

## Rule

If a row in this table ever becomes ambiguous — "is this Slice's job or the bot's job?" — the
default answer is **Slice**, unless the data has zero product/financial/identity meaning outside of
Discord itself (tickets, moderation, engagement gamification, static content). The bot must never
become a second source of truth for anything a reasonable person would call "the user's data" on the
Slice platform.
