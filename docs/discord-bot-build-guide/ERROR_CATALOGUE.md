# Error catalogue

Maps Slice's own error codes (from Docs 004–008, quoted exactly) to safe, friendly Discord
responses. No mapping ever echoes the raw Slice error body, stack trace, or internal identifiers.

| Slice error code | HTTP | Discord-facing message | Notes |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | "That input doesn't look right — check the details and try again." | Field-level detail only if Slice's response includes a safe, user-facing field name |
| `AUTHENTICATION_REQUIRED` / `ACCESS_TOKEN_EXPIRED` | 401 | "Your linked session needs refreshing — try again in a moment." | Bot silently retries the delegated-token exchange once (GET only, never a mutation) before showing this |
| `REFRESH_TOKEN_INVALID` / `REFRESH_TOKEN_REUSED` / `SESSION_REVOKED` | 401 | "Your Slice link needs to be re-established — run `/account link`." | Never says "reused/replayed" (avoids leaking security internals) |
| `ACCOUNT_RESTRICTED` | 403 | "This action isn't available on your account right now. Contact support if you think that's wrong." | Never explains *why* restricted beyond this |
| `FORBIDDEN` | 403 | "You don't have permission to do that." | — |
| `PROFILE_NOT_FOUND` / `COLLECTOR_NOT_FOUND` / `ASSET_NOT_FOUND` / `NOTIFICATION_NOT_FOUND` | 404 | "Couldn't find that — double check and try again." | — |
| `PROFILE_NOT_PUBLIC` | 404 | "That collector hasn't made their profile public." | — |
| `ASSET_NOT_PUBLIC` | 404 | "That asset isn't published yet." | — |
| `PORTFOLIO_AUTHORITY_UNAVAILABLE` | 503 | "Portfolio tracking isn't live on Slice yet — hang tight." | Never shown as a generic error; this is an expected, honest state |
| `IDEMPOTENCY_KEY_CONFLICT` / `REQUEST_IN_PROGRESS` | 409 | "That's already being processed — give it a second." | Bot should not auto-retry a conflicting mutation |
| `RATE_LIMITED` | 429 | "You're doing that too fast — try again in {Retry-After}s." | Reads Slice's `Retry-After` header |
| `MARKET_DATA_UNAVAILABLE` / `PERSISTENCE_UNAVAILABLE` / `CONTROL_STORE_UNAVAILABLE` | 503 | "Slice is having a moment — try again shortly." | Retried once automatically for GET-only calls per BOT_ARCHITECTURE.md |
| Unrecognized/unexpected error | any | "Something went wrong on our end — we've logged it (ref: `{requestId}`)." | Full detail logged server-side only; requestId lets support correlate |
| Discord-side failure (missing permissions to act, channel deleted, DM closed) | n/a | Specific, context-aware message per case (never the generic bot-error message for a Discord-side, not Slice-side, failure) | — |

**Rule inherited from the old bot's known bug (Migration M6):** the generic/unrecognized branch must
never interpolate the raw exception object into a user-facing string.
