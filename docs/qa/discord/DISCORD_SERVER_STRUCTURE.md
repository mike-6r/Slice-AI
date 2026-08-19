# Slice Discord server structure

This document is the contract for the idempotent `/setup` server layout. It describes the server structure and access model; panel/embed copy remains owned by the existing presentation configuration.

## Member view

Unverified members see only:

- `START HERE` → `🔐・verify`

The verification action is a short Discord-only human check; it does not link, identify, or verify a Slice account. After that check grants `✓ Verified`, members see:

- `SLICE` → `📌・welcome`, `📣・announcements`, `◈・my-slice`, `📈・market`, `🎛️・roles`
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

`🎛️・roles` is a verified-only, read-only managed panel. Its single persistent selector may assign only the explicit notification-preference allowlist: New Listings, Price Alerts, Rare Finds, Auctions, Giveaways, Slice News, Market Brief, and Platform Updates. It cannot assign any staff, verification, Collector, restriction, moderation, business, or permission-bearing role. Notification roles are neutral, non-hoisted, non-mentionable, and have no Discord permissions.

The bot does not grant `Administrator`. Discord administrator access remains a server-owner decision. Managed staff roles use the smallest permissions required for their workspace.

| Role | Purpose | Hoisted | Color | Mentionable | Self-assignable | Discord permissions | Assignment authority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Slice | Bot-managed operational role | No | Slice mint | No | No | Managed operational permissions | Bot/server owner |
| Admin | Discord administration | Yes | Coral | No | No | Privileged Discord management | Server owner |
| Staff | Staff operations | Yes | Slate-blue | No | No | Messages, threads, history | Server owner/Admin |
| Reviewer | Review workspace access | Yes | Violet | No | No | Review history and threads | Server owner/Admin |
| Support | Private support operations | Yes | Amber | No | No | Ticket/support messaging | Server owner/Admin |
| Verified Collector | Deferred authoritative Collector status | No | Mint | No | No | None | Authoritative Slice flow only |
| Collector | Collector identity | Yes | Mint | No | No | None | Supported Collector sync/admin authority |
| ✓ Verified | Discord access gate | No | Default | No | No | None | Discord human check |
| Notification roles | Discord-side preferences | No | Default | No | Yes, `🎛️・roles` only | None | Member selector |
| Level roles | Progression milestones | No | Default | No | No | None | Progression system |
| Restricted / Muted | Moderation controls | No | Coral / muted | No | No | None at role level | Moderation system/staff |
| Separator roles | Server Settings organization only | No | Default | No | No | None | Never assigned |

The managed Server Settings order is Slice; staff separator and staff roles; Slice identity separator and Verified/Member roles; Collector separator and Collector roles; notification separator and preferences; community separator and descending level roles; system separator and moderation roles. Separator roles are intentionally unassigned and never appear as member-list sections. `Member` remains a non-hoisted legacy display role because the existing Slice-account display sync still references it; it is not self-assignable and is a future migration candidate.

## Access rules

| Area | `@everyone` | `✓ Verified` | Staff | `Slice` / `Admin` |
| --- | --- | --- | --- | --- |
| `START HERE` / `verify` | View only | Hidden | View | Manage |
| `SLICE` / `roles` | Hidden | View only; select preferences | View/manage | Manage |
| Public Slice, collectors, community, support | Hidden | View; chat only in community | View/manage as needed | Manage |
| `PRIVATE SUPPORT` | Hidden | Hidden by category; ticket overwrite only | Assigned ticket access | Manage |
| `STAFF` | Hidden | Hidden | Scoped by channel | Manage |

Removing `✓ Verified` immediately removes the member’s normal category access because the category and channel overwrites are role-based. Re-running setup reconciles any permission drift.

## Migration and safety

`/setup preview` reports the safe reconciliation plan. `/setup server` or `/setup repair` applies only the managed manifest, reuses stored Discord IDs and known legacy names, moves existing `ticket-*` channels into `PRIVATE SUPPORT`, and orders managed resources. Existing panel messages are edited in place where their IDs are known.

Unmanaged Discord resources are not deleted. The separate `/setup reset` flow scans persisted managed IDs plus known Slice names and requires an explicit confirmation before removing managed Discord resources. It does not change Slice accounts, links, portfolios, ownership, orders, trades, balances, or financial records.

## Out of scope for this structure release

Embed wording, artwork, and panel visual design are intentionally unchanged in this migration. They can be redesigned independently without changing the permission or resource contract above.
