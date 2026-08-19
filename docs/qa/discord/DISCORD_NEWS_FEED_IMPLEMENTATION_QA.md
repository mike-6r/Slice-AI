# Approved Sources

Four centrally configured trusted RSS sources are present: Pokémon, PSA, CGC Cards, and a disabled Sotheby's Collectibles source. Three are enabled by default. Sources live only in `apps/discord-bot/config/news-sources.yml`; no user URL submission or arbitrary HTML crawl exists.

# Source Policy

Only configured HTTPS RSS/Atom feed URLs and final URLs under the configured source domain are accepted. New source enablement has a 24-hour bootstrap window, so historical items are neither persisted nor posted as fresh news.

# Security / SSRF

The dedicated feed client validates HTTPS, source/final hostname allowlisting, public DNS results, bounded redirects (two), an eight-second timeout, 512 KB response maximum, conditional request headers, and an explicit user agent. Localhost, loopback, RFC1918, link-local, and private IPv6 targets are rejected.

# Categories

`POKEMON_OFFICIAL`, `TCG_PRODUCT`, `TOURNAMENT`, `GRADING`, `AUCTION`, and `INDUSTRY` are the only categories.

# Relevance Rules

Deterministic matching requires Pokémon/TCG/collectible-card relevance, with additional category-specific grading, tournament, or auction signals. Rumours, user submissions, affiliate content, gambling, scams, counterfeits, and arbitrary social links have no ingest path.

# Summary Contract

Summaries are deterministic metadata/snippet summaries of at most 500 characters. They state the factual item, source, published time, category, and canonical link. Copyrighted article bodies are never stored.

# Explicit No-Prediction Rule

DISABLED. The formatter removes speculative/investment language and never produces price forecasts, expected return, market direction, buy/sell calls, or valuation claims.

# Routing

Explicit major items route to managed `announcements`; routine items route to managed `collecting` (`#🔎・collectibles`). No permanent channel was added.

# Notification Role

The existing `Slice News` (`news`) notification role is used only when `NEWS_FEED_MENTION_OPT_IN_ROLE=true`; it is false by default. Mentions use an explicit role allowlist, never broad Discord mentions.

# Worker

`NewsFeedWorker` is deployed disabled by default (`NEWS_FEED_ENABLED=false`) and, when explicitly enabled, runs once on worker start and then every `NEWS_FEED_POLL_INTERVAL_MS` (30 minutes by default; configurable 15–30 minutes). It uses one bounded, per-source-isolated polling cycle and no BullMQ.

# Dedup

External ID is preferred; canonical URL is next; per-source content hash is a fallback. Durable unique keys cover repeated fetches, minor title changes, scheduler overlap, and restarts. Known Discord send failures retry; uncertain Discord receipts are not replayed automatically.

# Persistence

Additive bot-owned models: `DiscordNewsSourceState`, `DiscordNewsItem`, and `DiscordNewsDelivery`. They retain conditional request state, metadata, concise permitted summary, canonical link, dedup hashes, and delivery receipts only.

# Failure Handling

429 uses bounded Retry-After backoff. Timeout, malformed feed, redirects, invalid items, 5xx, and per-source persistence failures are contained to the source and logged without raw feed/exception text. A failed source cannot stop later sources or pending deliveries.

# Unit QA

`npm run test:unit` passed: 25 files, 135 tests. Coverage includes allowlisting/SSRF, HTTPS/final host validation, RSS/Atom/malformed parsing, canonicalization, external-ID/URL/content-hash dedup paths, relevance, deterministic no-advice summary, routing, role mention safety, duplicate scheduler suppression, and source-failure isolation.

# Integration QA

`npm run test:integration` passed against protected `slice_test`: 6 files, 34 tests. Coverage creates only synthetic fixtures and validates source state, metadata-only item persistence, uniqueness, delivery claim/retry/dedup, uncertain send handling, and cleanup. Prisma migration deployment reported 68 migrations.

# Manual QA

NOT RUN. No live third-party feed poll or Discord news post has been performed; this avoids historic-feed flooding and uncontrolled external fetches.

# Command Inventory

No command added. The shared runtime/deploy inventory remains 58 top-level commands.

# Remaining Risks

Configured RSS endpoints must be verified during a controlled development poll before enabling production posting. External source availability and feed formats remain outside Slice control. No official asset-detail URL contract is assumed.

# Release Decision

APPROVED FOR SAFE DEPLOYMENT WITH THE FEED DISABLED. The protected `slice_test` full suite passed: 31 files / 168 tests. Typecheck, bot-scoped lint, setup check, Prisma generation/validation, build, and migration status all passed; `slice_test` has 68 current migrations. No command is added, and no live source polling is included in automated QA. A controlled source validation is required before explicitly enabling `NEWS_FEED_ENABLED`.
