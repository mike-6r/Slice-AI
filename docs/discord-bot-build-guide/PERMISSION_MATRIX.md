# Permission matrix

| Capability | Discord-side gate | Slice-side gate | Notes |
|---|---|---|---|
| `/account link`, `/account status` | any member | none (self-service) | — |
| `/account unlink` (self) | any member | self-token match | — |
| `/account unlink` (support) | bot support/admin role | Slice `ADMIN` + recent-auth | two-gate, both required |
| Marketplace/collector/vault reads | any member | none (public API) | — |
| `/watchlist *`, `/notifications *`, `/portfolio` | any member | self-token via delegated exchange (BOT_API_REQUIREMENTS.md §2) | requires linked account |
| `/admin audit`, `/admin status-history`, `/admin link-lookup` | bot admin/support role | Slice `ADMIN`/`SUPPORT`, checked fresh every call | never cached |
| `/mod *` (kick/ban/mute/purge/warn/lockdown/unlock/banlist/unban) | Discord kick/ban/administrator permission (native) | none — explicitly decoupled from Slice | BOT_SECURITY_MODEL.md §6 |
| `/support open` | any verified member | none | — |
| `/support` lifecycle (claim/close/add/remove/escalate/blacklist) | bot support/admin role | none | — |
| `/suggest` submit | any verified member | none | — |
| `/suggest` status change | bot support/admin role | none | — |
| `/giveaway *` | bot admin role only, every subcommand (fixes old bot's missing checks) | none | — |
| `/poll`, `/faq`, `/roadmap` (view) | any member | none | — |
| `/roadmap`, `/faq` (edit content) | bot admin role | none | — |
| High-impact Slice mutations (user status/role change) | **not exposed in Discord in Phase 1/2** | would require Slice `ADMIN` + recent-auth + Discord admin role + explicit confirm | see BOT_PRODUCT_SPEC.md §8 for why this stays out of Discord for now |
| Any wallet/deposit/withdrawal/KYC action | **never exposed** | Doc 016 DEFERRED | — |
| Any order/trade placement action | **never exposed until Doc 014 + 016 + 018 clear, and a product decision is made** | — | — |

**Rule:** a Discord-side role check is always a gate, never a substitute for the corresponding
Slice-side check when a command touches Slice data. Bot-owned-only commands (moderation, tickets,
engagement) use Discord-side gates exclusively because there is no Slice concept to check against.
