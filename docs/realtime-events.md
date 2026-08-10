# Slice future real-time event contract

No WebSocket service is implemented. These events define a future authenticated subscription surface. Payloads use the shared frontend concepts; the backend remains the authority.

| Event                        | Payload                                                 | Subscribers                     |
| ---------------------------- | ------------------------------------------------------- | ------------------------------- |
| `market.price.updated`       | `{ assetId, price: Money, movement, asOf }`             | asset, market, portfolio views  |
| `market.trade.executed`      | `{ assetId, tradeId, units, pricePerUnit, executedAt }` | asset and market views          |
| `order.created`              | `{ order }`                                             | order owner                     |
| `order.updated`              | `{ order }`                                             | order owner                     |
| `order.cancelled`            | `{ orderId, cancelledAt, reason? }`                     | order owner                     |
| `portfolio.updated`          | `{ userId, portfolioId, totalValue, changedAt }`        | affected user                   |
| `ownership.updated`          | `{ assetId, userId?, availableBps, changedAt }`         | asset viewers and affected user |
| `notification.created`       | `{ notification }`                                      | affected user                   |
| `asset.status.updated`       | `{ assetId, status, changedAt }`                        | asset viewers                   |
| `vault.status.updated`       | `{ assetId, vault, custodyEvent? }`                     | asset viewers and owner         |
| `discussion.message.created` | `{ assetId, message }`                                  | asset discussion subscribers    |
| `proposal.created`           | `{ proposal }`                                          | asset discussion subscribers    |
| `proposal.vote.updated`      | `{ proposalId, optionId, voteCount, changedAt }`        | proposal subscribers            |

Clients should authenticate subscriptions, support reconnect and replay via monotonic event IDs, ignore duplicate IDs, scope subscriptions by user and resource, and invalidate the relevant TanStack Query key after applying an event. Sensitive personal, KYC, wallet-address, and settlement data must not be broadcast to public asset channels.

## Notification client contract (Document 017 foundation)

The first-party notification client must treat `GET /v1/me/notifications` and
`GET /v1/me/notifications/unread-count` as the durable authority. On startup it
fetches both, then opens the authenticated SSE stream at
`GET /v1/me/notifications/stream` using the established access-token/session
mechanism (never a query-string user or token). A `notification.created` event
has `version: 1` and a bounded safe notification projection. Clients may merge
that projection or refetch; on disconnect/reconnect they must refetch durable
state. SSE is single-instance, best-effort acceleration only: process restarts
and multi-instance fanout are not replay guarantees.
