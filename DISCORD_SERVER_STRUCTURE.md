# Slice Discord server structure

This document is the contract for the idempotent `/setup` server layout. It describes the server structure and access model; panel/embed copy remains owned by the existing presentation configuration.

## Member view

Unverified members see only:

- `START HERE` → `🔐・verify`

After the verification action grants `✓ Verified`, members see:

- `SLICE` → `📌・welcome`, `📣・announcements`, `◈・my-slice`, `📈・market`
- `COLLECTORS` → `🗂️・collector-hub`, `🏷️・list-a-collectible`
- `COMMUNITY` → `💬・general`, `🔎・collectibles`
- `SUPPORT` → `🎫・support`

`PRIVATE SUPPORT` is separate from public support and is only visible to the ticket creator and the staff roles assigned to that ticket. `STAFF` is never part of the normal member view.

## Roles

The managed operational roles are ordered from highest to lowest as:

1. `Admin`
2. `Slice`
3. `Staff`
4. `Reviewer`
5. `Support`
6. `Verified Collector`
7. `Collector`
8. `✓ Verified`
9. `Member`

Notification, restriction, and progression roles remain separate utility roles. Setup does not grant `✓ Verified` automatically: a member must link the Slice account and explicitly complete verification.

The bot does not grant `Administrator`. Discord administrator access remains a server-owner decision. Managed staff roles use the smallest permissions required for their workspace.

## Access rules

| Area | `@everyone` | `✓ Verified` | Staff | `Slice` / `Admin` |
| --- | --- | --- | --- | --- |
| `START HERE` / `verify` | View only | Hidden | View | Manage |
| Public Slice, collectors, community, support | Hidden | View; chat only in community | View/manage as needed | Manage |
| `PRIVATE SUPPORT` | Hidden | Hidden by category; ticket overwrite only | Assigned ticket access | Manage |
| `STAFF` | Hidden | Hidden | Scoped by channel | Manage |

Removing `✓ Verified` immediately removes the member’s normal category access because the category and channel overwrites are role-based. Re-running setup reconciles any permission drift.

## Migration and safety

`/setup preview` reports the safe reconciliation plan. `/setup server` or `/setup repair` applies only the managed manifest, reuses stored Discord IDs and known legacy names, moves existing `ticket-*` channels into `PRIVATE SUPPORT`, and orders managed resources. Existing panel messages are edited in place where their IDs are known.

Unmanaged Discord resources are not deleted. The separate `/setup reset` flow scans persisted managed IDs plus known Slice names and requires an explicit confirmation before removing managed Discord resources. It does not change Slice accounts, links, portfolios, ownership, orders, trades, balances, or financial records.

## Out of scope for this structure release

Embed wording, artwork, and panel visual design are intentionally unchanged in this migration. They can be redesigned independently without changing the permission or resource contract above.
