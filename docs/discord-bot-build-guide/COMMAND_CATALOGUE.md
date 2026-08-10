# Command catalogue

Every planned command. "Backend calls" cites the exact endpoint from `BOT_API_REQUIREMENTS.md`.
"Impl doc" cites the implementation document that builds it. Commands are grouped by phase; Phase 1
is buildable against Slice's backend exactly as it stands today plus the new account-linking
endpoints; Phase 2+ is explicitly gated on named Slice backend documents.

## Phase 1 — account, marketplace, watchlist, notifications, collectors, vault (reads + safe mutations)

| Command | Purpose | Options | Permission | Linked account required | Ephemeral/public | Backend calls | Rate limit | Audit | Idempotency | Error cases | Old-bot predecessor | Impl doc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/account link` | Start linking Discord to Slice | — | any member | no (this creates the link) | ephemeral | `POST /v1/bot/discord-link/challenge` | 3/hour/user | Slice `AuditEvent` on completion | n/a (challenge) | already-linked, rate-limited | `Verification.py` (concept only) | 005 |
| `/account unlink` | Remove the link | — | self or admin (recent-auth) | yes | ephemeral | `POST /v1/bot/discord-link/unlink` | 5/hour/user | yes | required | not-linked | — | 005 |
| `/account status` | Show profile/status/join date | — | any member | yes | ephemeral | `GET /v1/session`, `GET /v1/me` | standard | n/a (read) | n/a | not-linked → prompts `/account link` | — | 005 |
| `/asset search` | Search catalogue/market | `category`, `set`, `gradingCompany`, `gradeMin`, `gradeMax`, `priceMin`, `priceMax`, `sort` | any member | no | public | `GET /v1/market/assets` | standard | n/a | n/a | invalid filter, empty results | — | 007 |
| `/asset view` | Asset detail with valuation | `slug` | any member | no | public | `GET /v1/market/assets/:slug`, `.../similar` | standard | n/a | n/a | not found, not published | — | 007 |
| `/market movers` | Top gainers/losers/active | `kind`, `limit` | any member | no | public | `GET /v1/market/movers` | standard | n/a | n/a | none | — | 007 |
| `/watchlist add` | Add asset to watchlist | `asset` | any member | yes | ephemeral | `PUT /v1/me/watchlist/:assetId` | standard | optional | required | asset not found | — | 009 |
| `/watchlist remove` | Remove asset | `asset` | any member | yes | ephemeral | `DELETE /v1/me/watchlist/:assetId` | standard | optional | required | not in watchlist (no-op success) | — | 009 |
| `/watchlist list` | Paginated watchlist | `page` | any member | yes | ephemeral | `GET /v1/me/watchlist` | standard | n/a | n/a | empty list | — | 009 |
| `/notifications list` | Paginated notifications | `unreadOnly`, `page` | any member | yes | ephemeral | `GET /v1/me/notifications` | standard | n/a | n/a | empty list | — | 010 |
| `/notifications unread` | Unread count | — | any member | yes | ephemeral | `GET /v1/me/notifications?unreadOnly=true` | standard | n/a | n/a | none | — | 010 |
| `/notifications read` | Mark one read | `id` | any member | yes | ephemeral | `PATCH /v1/me/notifications/:id/read` | standard | limited | required | not found | — | 010 |
| `/notifications read-all` | Mark all read | — | any member | yes | ephemeral | `POST /v1/me/notifications/read-all` | standard | limited | required | none | — | 010 |
| `/collector search` | Search public collectors | `query`, `focus` | any member | no | public | `GET /v1/collectors` | standard | n/a | n/a | empty results | — | 008 |
| `/collector view` | Public collector profile | `slug` | any member | no | public | `GET /v1/collectors/:slug`, `.../assets` | standard | n/a | n/a | not public, not found | — | 008 |
| `/vault latest` | Recent public vault events | `type`, `assetId` | any member | no | public | `GET /v1/vault/events` | standard | n/a | n/a | empty results | — | 008 |
| `/vault summary` | Vault summary stats | — | any member | no | public | `GET /v1/vault/summary` | standard | n/a | n/a | none | — | 008 |
| `/portfolio` | Portfolio (honest DEMO/UNAVAILABLE) | — | any member | yes | ephemeral | `GET /v1/me/portfolio` | standard | n/a | n/a | `PORTFOLIO_AUTHORITY_UNAVAILABLE` → friendly "not available yet" | — | 009 |
| `/profile` | Alias of `/collector view` for self, or another member if linked | `member?` | any member | for self-view | ephemeral (self) / public (other) | same as `/collector view` | standard | n/a | n/a | not linked, not public | — | 008 |
| `/help` | Command list/usage | `command?` | any member | no | ephemeral | none (bot-owned) | none | n/a | n/a | unknown command | `Main.py !help` (concept only) | 003 |
| `/invite` | Bot/server invite link | — | any member | no | ephemeral | none (bot-owned config) | none | n/a | n/a | none | `Main.py !social` (concept only) | 003 |

## Admin (read-only)

| Command | Purpose | Options | Permission | Backend calls | Impl doc |
|---|---|---|---|---|---|
| `/admin audit` | Look up audit events | `action`, `actorId`, `subjectId`, `from`, `to` | Slice `ADMIN`/`SUPPORT` (verified fresh, not cached) | `GET /v1/admin/audit-events` | 013 |
| `/admin status-history` | User status history | `userId` | Slice `ADMIN`/`SUPPORT` | `GET /v1/admin/users/:id/status-history` | 013 |
| `/admin link-lookup` | Resolve Discord↔Slice link for support | `discordUser` or `slug` | Slice `ADMIN`/`SUPPORT` | `GET /v1/bot/discord-link/:discordUserId` | 013 |

## Support / community (bot-owned, no Slice dependency)

| Command | Purpose | Impl doc |
|---|---|---|
| `/support open` | Open a category ticket | 011 |
| `/support close`, claim/add/remove/escalate buttons | Ticket lifecycle | 011 |
| `/mod kick/ban/mute/unmute/purge/warn/warns/lockdown/unlock/banlist/unban` | Moderation suite | 012 |
| `/suggest` | Suggestion with status buttons | 014 (community migration) |
| `/giveaway start/reroll/end/delete` | Giveaways | 014 |
| `/poll` | Timed polls | 014 |
| `/faq` | Static platform education | 014 |
| `/roadmap` | Roadmap display (admin-editable content) | 014 |
| `/top` | Clarified: `/top movers` (real, Phase 1) vs. `/top investors` (Phase 2, gated on Slice Doc 013) | 007 (movers) / not implemented (investors, gated, future) |

## Phase 2+ — explicitly gated (documented, not implemented)

**Note on document numbers in this table:** "Slice Doc NN" below refers to Slice's own backend
build guide (`docs/backend-build-guide/implementation/0NN-*.md`), not this Discord bot build guide's
implementation documents (which are cited elsewhere in this file as plain "Doc NN" / "Impl doc").
The two numbering schemes are independent and both run 001–018 — do not conflate them.

| Command | Gated on (Slice backend doc) | Notes |
|---|---|---|
| `/balance`, wallet-adjacent commands | Slice Doc 016 (DEFERRED) + Slice Doc 018 | Not designed further than "do not build" |
| Achievement badges tied to £ invested / trade count / hold duration | Slice Doc 012 + Slice Doc 014 | "Early Supporter" (join-date) ships in Phase 1 as the one exception |
| `/portfolio` full showcase (P&L, ROI, diversification) | Slice Doc 013 | Phase 1 ships the honest unavailable-state version only |
| Trade transparency feed, recent-sales | Slice Doc 014 | Also needs a privacy design pass (buyer/seller pseudonymization) |
| "Buy Shares" / market-feed listings / peer request-offer boards | Slice Doc 012 + 014 + 016 + 018 **and a separate product/legal decision** | See BOT_PRODUCT_SPEC.md client-wishlist table — highest risk item in the whole request list |
| Push notification delivery to Discord (DM or channel) | Slice Doc 017 + a new `DISCORD` channel type (does not exist) | See BOT_API_REQUIREMENTS.md §4 |
| Governance/voting commands | Slice Doc 015 | Follows/discussions/proposals none of which exist yet |

## UI standards

- **Brand colors:** primary accent matches Slice's own web app palette (exact hex to be pulled from
  `src/` design tokens at implementation time — not guessed here); a distinct neutral/warning color
  for caveated data (DEMO labels), and Discord's standard red/green for destructive/success
  confirmations.
- **Footer:** every embed sourced from a live Slice API call carries a footer with the data's `asOf`
  timestamp and `source`; bot-owned content (tickets, giveaways) carries a plain "Slice" footer with
  no fabricated data-source claim.
- **Timestamps:** Discord's native relative-timestamp markdown (`<t:unix:R>`) wherever a time is
  shown, so it localizes to the viewer automatically.
- **Buttons/selects:** every mutating action uses a component, not a reaction (a direct fix over the
  old bot's reaction-based flows, which don't survive restarts and have no built-in permission
  scoping per-click).
- **Modals:** used for any multi-field input (ticket intake questions, suggestion text) instead of
  the old bot's blocking `wait_for` message prompts.
- **Pagination:** shared component (BOT_ARCHITECTURE.md), Previous/Next buttons disabled at bounds,
  page position shown in the footer.
- **Ephemeral messages:** default for anything account-scoped or containing private data (watchlist,
  notifications, portfolio, ticket-open confirmation); public for anything genuinely public
  (asset/collector/vault data, community features).
- **Errors:** single consistent "something went wrong" embed style for unexpected failures (never
  raw exception text — see `ERROR_CATALOGUE.md`); specific, friendly copy for expected errors
  (not-found, not-linked, rate-limited).
- **Loading/deferred responses:** every command defers immediately (respecting Discord's 3-second
  ack window) before making a Slice API call; a lightweight "Loading…" state is shown only if the
  call takes long enough to be noticeable.
- **Confirmation dialogs:** button-based Confirm/Cancel with a visible summary of the action and a
  short timeout (auto-cancel), used for every destructive/mutating admin action.
- **Destructive action confirmation:** additionally requires typing the target's name/ID for the
  highest-impact actions (ban, force-delete ticket) — mirrors the "type to confirm" pattern common
  in production admin tooling.
- **Disabled/unavailable features:** rendered as a visibly disabled button or a plain-text "not
  available yet" message with the reason (e.g., "wallet connections aren't available on Slice yet"),
  never a silently missing feature or a broken click-through.
- **Rate-limit messages:** a single consistent "you're doing that too fast, try again in Xs" message,
  reading `Retry-After` from Slice's response where applicable.
- **Account-link prompts:** any command requiring a linked account that's invoked by an unlinked user
  responds with a short explanation and a button that runs `/account link` directly.
