# Slice frontend API requirements

This is a proposed contract for replacing the local demo adapters. No production API is implemented in this repository.

## Conventions

- REST resources use cursor pagination: `?cursor=<opaque>&limit=20`, returning `{ data, nextCursor }`.
- GBP money is `{ "amount": 2458000, "currency": "GBP" }`, where `amount` is integer minor units.
- Crypto amounts are decimal strings, for example `{ "asset": "USDC", "amount": "1250.500000" }`.
- IDs are opaque strings. Timestamps are ISO 8601 UTC strings.
- Errors follow `{ "code", "message", "fieldErrors?", "requestId" }` and must never expose internal stacks.

## Resources

| Resource                       | Methods                                                                                                            | Filtering / pagination                            | Key response needs                                          | Error cases / realtime                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Authentication                 | `POST /auth/signup`, `/login`, `/logout`, `/refresh`                                                               | n/a                                               | session, current user, account state                        | invalid credentials, locked account                          |
| Users and profiles             | `GET/PATCH /me`, `GET /users/:id`                                                                                  | profile lookup                                    | user, profile, account/KYC state                            | forbidden, not found                                         |
| KYC                            | `GET /me/kyc`, `POST /me/kyc/session`                                                                              | n/a                                               | provider session token and status only                      | ineligible, provider unavailable                             |
| Collectors                     | `GET /collectors`, `GET /collectors/:id`, `POST/DELETE /collectors/:id/follow`                                     | category, query, sort, cursor                     | profile, performance, holdings summary                      | already followed; `collector.followed` useful                |
| Assets                         | `GET /assets`, `GET /assets/:id`, `GET /assets/featured`, `GET /assets/trending`                                   | category, status, query, price band, sort, cursor | details, grade, media, verification, vault, market value    | not found; `asset.status.updated`                            |
| Asset media and verification   | `GET /assets/:id/media`, `/verification`, `/vault`                                                                 | n/a                                               | ordered media, certificate, custody events, insurance state | permission and not-ready states                              |
| Valuations and price history   | `GET /assets/:id/valuation`, `/price-history`                                                                      | `range=24H                                        | 7D                                                          | 30D                                                          | 90D | 1Y  | ALL` | money points, confidence, comparable sales | incomplete history; `market.price.updated` |
| Ownership                      | `GET /me/positions`, `GET /assets/:id/ownership`, `GET /watchlist`, `POST/DELETE /watchlist/:assetId`              | asset and cursor                                  | units, basis points, availability, snapshots                | insufficient availability; `ownership.updated`               |
| Orders and trades              | `GET/POST /orders`, `POST /orders/preview`, `POST /orders/:id/cancel`, `GET /assets/:id/order-book`, `GET /trades` | status, asset, side, cursor                       | order, fee preview, order book, trade execution             | KYC required, balance unavailable, price moved; order events |
| Portfolio                      | `GET /portfolio`, `/portfolio/performance`, `/portfolio/activity`                                                  | time range, cursor                                | positions, allocations, P/L, activity                       | unavailable calculation; `portfolio.updated`                 |
| Wallets, deposits, withdrawals | `GET /wallet/balances`, `/transactions`, `POST /deposits`, `POST /withdrawals`                                     | transaction cursor and state                      | USDC balance, network, compliance state, transaction state  | unsupported network, compliance hold, provider outage        |
| Notifications                  | `GET /notifications`, `PATCH /notifications/:id`                                                                   | unread, type, cursor                              | user-safe notification records                              | `notification.created`                                       |
| Discussions                    | `GET/POST /assets/:id/discussions`, `POST /discussions/:id/reactions`                                              | cursor, reply depth                               | messages, replies, reactions                                | moderation/restriction; `discussion.message.created`         |
| Proposals and votes            | `GET/POST /sale-proposals`, `GET /sale-proposals/:id`, `POST /sale-proposals/:id/votes`                            | asset, status, cursor                             | proposal, poll options, vote totals                         | proposal closed, already voted; proposal events              |

## Security boundary

The frontend validates shape and provides previews only. The backend must enforce identity, KYC, eligibility, balances, ownership, trading, custody, compliance, idempotency, rate limits, and audit trails.
