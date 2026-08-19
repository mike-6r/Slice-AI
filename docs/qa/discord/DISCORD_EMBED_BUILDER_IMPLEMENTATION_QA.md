# Feature Summary

`/embed` is a staff-only Discord presentation builder. It is bot-owned publishing infrastructure only and has no Slice business, financial, valuation, KYC, or account authority.

# Command UX

`/embed create`, `edit`, `list`, `clone`, and `import` open or manage private draft sessions. Runtime authorization requires Discord Manage Server.

# Builder Controls

Private controls support title, description, custom hex color, preview, and publish. Validation centralizes Discord title, description, field, footer, author, total-character, URL, and button constraints.

# Permissions

Registration and every command/button/modal action recheck `ManageGuild`; builder sessions are guild/creator scoped and expire after 15 minutes.

# Draft Persistence

Bot-owned drafts persist validated payloads, link button data, target channel, revision, and save audit history. Optimistic revision saves reject stale sessions.

# Publication History

Every publish creates a durable bot-owned publication receipt and audit event.

# Channel Selection

The builder uses the invoking guild text channel as the initial target and rechecks text capability before publish. Cross-guild or inaccessible channels cannot be used.

# Embed Validation

Embed/link limits and public HTTPS URLs are validated before publication. Mentions are always suppressed.

# Mention Safety

`allowedMentions` is empty for all builder publications.

# URL Safety

Only public HTTPS URLs are accepted; javascript, data, file, localhost, loopback, and private-network URLs are rejected.

# Import / Export

Validated JSON import is supported. Export and advanced field/author/image/footer/button editor controls remain future polish.

# Concurrency

Draft saves use revisions; sessions are actor-bound. Publications are persisted after sends.

# Audit

Draft creation/edit/clone and publish audit events are stored in bot-owned tables.

# Unit QA

Command inventory, runtime authorization/validation helpers, and all existing bot unit suites are run in regression.

# Integration QA

Pending isolated `slice_test` persistence-specific coverage.

# Manual QA

NOT RUN.

# Command Inventory

One new top-level command: `/embed`; total 59.

# Remaining Risks

Advanced controls—field reorder/editor, channel select picker, publication update/delete UI, and export—are not yet exposed in the first interactive dashboard.

# Release Decision

PARTIAL implementation; do not deploy until advanced builder controls and integration coverage are complete.
