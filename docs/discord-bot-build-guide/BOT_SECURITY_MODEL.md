# Bot security model

## 1. Account linking

- Link challenge: `/account link` calls a new bot-only service endpoint (BOT_API_REQUIREMENTS.md §1)
  that creates a short-lived (≤10 minute), single-use, cryptographically random link token bound to
  the requesting Discord user ID. The token is shown only in an ephemeral Discord message.
- Completion happens on the **Slice web app**, where the user is already authenticated with a real
  session: they paste/confirm the code, and the backend atomically creates the `discordUserId ↔
  userId` mapping, invalidates the token (success or failure — always single-use), and writes a
  Slice `AuditEvent`.
- **Replay prevention:** token is invalidated on first use regardless of outcome; expired tokens are
  rejected with a generic error (no distinction between "expired" and "already used" is leaked, to
  avoid enumeration).
- **CSRF-style linking attack prevention:** the token is bound server-side to the Discord user ID that
  requested it — a token cannot be redeemed to link a *different* Discord account than the one that
  generated it, even if an attacker tricks a victim into submitting a token they didn't generate for
  themselves the normal way.
- **Discord user verification:** the bot never trusts a client-supplied Discord ID for anything
  security-relevant — it always uses the ID Discord itself attaches to the interaction object.
- **1:1 enforcement:** unique constraint both directions (one Discord account ↔ one Slice account) —
  attempting to link a second Slice account from an already-linked Discord account, or vice versa,
  is rejected with a clear "already linked" error, not silently overwritten.
- **Unlink/relink:** `/account unlink` requires the requester to be the linked Discord user (self-
  service) or an `ADMIN` with a fresh recent-auth check (support case, e.g. a compromised or
  abandoned Discord account) — audited either way. Relinking after unlink requires the full challenge
  flow again, no shortcut.
- **No password collection in Discord, ever.** No Slice access/refresh token, session cookie, or
  password is ever placed in a Discord message, embed, button custom ID, modal, or log line.

## 2. Guild authorization

- The bot only accepts commands from guilds it has been explicitly installed to; a single Discord
  server does not implicitly grant any Slice-side authority.
- Multi-guild behavior: a Discord account's link to a Slice account is **global to the Discord
  account**, not per-guild — a user linked in one server is recognized as linked in any other server
  the bot is installed to (this must be an explicit, documented product decision reflected in the
  data model, not an accident of implementation).
- Per-guild configuration (ticket categories, moderation settings, channel IDs) is bot-owned and
  scoped to `guildId` — never mixed with the global Discord↔Slice identity mapping.

## 3. Slash command permissions, role spoofing, interaction forgery

- Discord's own application-command permission system is used as the *first* gate for guild-local
  features (moderation, tickets) — but for anything touching a Slice account, Discord role
  possession is **never** treated as proof of Slice permission (see §6).
- Every interaction is verified to be a genuine, current Discord interaction object (discord.js
  handles signature/timestamp verification for HTTP-based interactions if that transport is ever
  used; for gateway-based interactions, the object comes directly from an authenticated gateway
  connection) — the bot does not accept any interaction payload from a source other than the Discord
  API itself.
- Custom IDs on buttons/selects/modals are opaque, non-guessable, bot-generated resource references
  (never a raw Slice user ID, email, or predictable sequential ID) to prevent a forged/replayed
  custom-ID payload from acting on a different user's resource. Every button handler re-verifies that
  the interacting user matches the resource's owner (or has an explicit permission override) before
  acting — it never trusts "this button was shown to the right person" as sufficient authorization.

## 4. Bot token and Slice credential safety

- The Discord bot token is stored only in the deployment secret manager, never in source control, never
  logged, rotated on any suspected compromise.
- **Slice API credentials for the bot are a new requirement — nothing like this exists in Slice
  today.** Two credential types are needed:
  1. A **service-account credential** for calls that don't impersonate a specific user (public
     catalogue/market/collector/vault reads) — a new, narrowly-scoped machine credential Slice's team
     must provision (BOT_API_REQUIREMENTS.md §8).
  2. **User-scoped calls** (watchlist, notifications, account status, admin actions) must be made
     using a token tied to the linked Slice user's own permission set, not the bot's service
     identity — meaning the bot needs a way to obtain a short-lived, narrowly-scoped access token on
     behalf of the linked user without ever holding their password or long-lived refresh token
     directly. The exact mechanism (a bot-specific token-exchange endpoint vs. a scoped
     service-to-service delegation model) is an open design question for Slice's backend team,
     flagged in BOT_API_REQUIREMENTS.md §1 — this build guide does not invent a mechanism Slice
     hasn't approved.
- **Request signing:** if Slice's team chooses a service-to-service model requiring request signing
  (e.g., HMAC over the request body with a shared secret, or mTLS), the bot's API client implements
  it as a single, centrally-located concern (BOT_ARCHITECTURE.md), never duplicated per-command.

## 5. Idempotency, rate limits, audit — bot-side obligations

- Every mutating Slice call carries a deterministic `Idempotency-Key` (BOT_ARCHITECTURE.md).
- The bot never bypasses Slice's own rate limiting by fanning out parallel retries; it honors
  `Retry-After` and applies its own local cooldown on top for bot-owned actions.
- Every Slice-side mutation the bot triggers is already audited by Slice itself (Docs 003–008 audit
  model); the bot additionally logs its own local action (Discord user, command, outcome, Slice
  request ID) for correlation, but never duplicates Slice's audit record as a second source of truth.

## 6. Discord role possession ≠ Slice permission (and vice versa)

- A Discord `ADMIN`/moderator role never implies Slice `ADMIN` permission. Any command touching a
  privileged Slice endpoint re-checks the linked account's actual Slice role via a fresh API call —
  it never caches "this Discord user is a Slice admin" beyond the lifetime of a single interaction.
- Conversely, a Slice account status change (e.g., `SUSPENDED`) does not automatically trigger a
  Discord-side action (ban/kick/role removal) unless a future, explicitly-designed and
  product-approved policy says so. The two systems' moderation/authorization stay decoupled by
  default.

## 7. Recent authentication for high-impact actions

- Any command that would trigger a Slice mutation gated by Doc 005's "recent-auth" requirement
  (admin status/role changes) must itself require the *Discord* user to have completed the
  account-link challenge freshly enough to satisfy Slice's own freshness window — the bot cannot
  satisfy a "prove you recently authenticated" requirement with a stale link record. In practice,
  this build guide recommends **not exposing these specific mutations in Discord at all** in early
  phases (BOT_PRODUCT_SPEC.md §8), which sidesteps the problem by simply not building the surface.

## 8. Compromised Discord account handling

- If a user reports their Discord account compromised, `/account unlink` (admin-assisted, recent-auth
  required) immediately severs the mapping; the underlying Slice account's own security (password
  reset, session revocation) is handled entirely by Slice's existing mechanisms (Doc 004) — the bot
  does not attempt to "protect" the Slice account itself beyond removing the link.
- A compromised Discord account can never be used to reach privileged Slice functionality once
  unlinked, since the bot re-verifies the link on every privileged interaction rather than caching it.

## 9. Deleted Discord accounts

- If Discord reports a user/guild-member as deleted or the bot can no longer resolve the Discord user
  object, the bot treats the link as orphaned (visible to admins for cleanup) but does **not**
  automatically delete the underlying Slice account or any Slice data — Slice account lifecycle is
  entirely Slice's own concern (account closure flows, if any, are Slice-side).

## 10. Logging redaction, DM privacy, ticket privacy

- No log line, embed, or transcript ever contains a raw email address, password, token, or session
  cookie. Structured logs redact known-sensitive field names by default (mirroring Slice's own audit
  metadata allowlisting approach from Doc 005).
- DMs (verification-style flows, ticket notifications) are best-effort; a failed DM (closed DMs) is
  handled gracefully with a one-time in-channel notice, not a repeated retry loop.
- Ticket channels are visible only to the opener, claimed staff, and anyone explicitly added — never
  broadly visible by default, matching (and improving on) the old bot's overwrite model.

## 11. Admin action confirmation

- Every destructive or high-impact bot command (ban, ticket force-delete, role mutation if ever
  exposed, blacklist) requires an explicit type-to-confirm or button-confirm step with a visible
  summary of the action before execution — no single-click destructive actions.

## Explicit non-goals for this build guide

- No wallet-connect, deposit/withdrawal, or KYC-adjacent command is designed here (Doc 016 is
  DEFERRED) — see BOT_PRODUCT_SPEC.md's client-wishlist reality check.
- No trading/order-placement command is designed here (Doc 014 is NOT STARTED, and Doc 016 + Doc 018
  gate production trading regardless of code completeness).
