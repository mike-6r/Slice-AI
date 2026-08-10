# Prompt index

Index of the 18 implementation documents. Run strictly in order; each stops itself. Status starts
NOT STARTED for all 18 — this build guide contains no completed implementation work. Update the
status column here (and in `CURRENT_STATE.md`) as each document actually closes; do not mark a row
COMPLETE based on this build guide alone.

| # | File | Title | Status | Depends on | Slice backend dependency | Can start today |
|---|---|---|---|---|---|---|
| 001 | `implementation/001-repository-reconciliation-and-bot-foundation.md` | Repository reconciliation and bot foundation | NOT STARTED | none | none | Yes |
| 002 | `implementation/002-slice-api-client-and-shared-contracts.md` | Slice API client and shared contracts | NOT STARTED | 001 | Docs 004–008 (VERIFIED, read-only client) | Yes |
| 003 | `implementation/003-discord-interaction-framework-and-command-registry.md` | Discord interaction framework and command registry | NOT STARTED | 001, 002 | none | Yes |
| 004 | `implementation/004-account-linking-domain-and-backend-api-requirements.md` | Account-linking domain and backend API requirements | NOT STARTED | 002 | New bot-only endpoints (BOT_API_REQUIREMENTS.md §1–3) must exist before this closes | Spec work: yes. Full closure: blocked on Slice team |
| 005 | `implementation/005-account-linking-discord-commands.md` | Account-linking Discord commands | NOT STARTED | 003, 004 | same as 004 | Blocked until 004 closes |
| 006 | `implementation/006-permission-and-authorization-integration.md` | Permission and authorization integration | NOT STARTED | 004, 005 | delegated-token-exchange endpoint (§2) | Blocked until 004 closes |
| 007 | `implementation/007-marketplace-and-asset-commands.md` | Marketplace and asset commands | NOT STARTED | 002, 003 | Docs 006/007 (VERIFIED) | Yes |
| 008 | `implementation/008-collector-and-vault-commands.md` | Collector and Vault commands | NOT STARTED | 002, 003 | Doc 008 (VERIFIED) | Yes |
| 009 | `implementation/009-watchlist-and-portfolio-commands.md` | Watchlist and portfolio commands | NOT STARTED | 005, 006 | Doc 008 (VERIFIED) | Blocked until account linking closes |
| 010 | `implementation/010-notification-commands-and-delivery-preference-documentation.md` | Notification commands and delivery-preference documentation | NOT STARTED | 005, 006 | Doc 008 (VERIFIED, reads/marks-read only) | Blocked until account linking closes |
| 011 | `implementation/011-support-ticket-migration.md` | Support/ticket migration | NOT STARTED | 001, 003 | none | Yes |
| 012 | `implementation/012-moderation-suite-migration.md` | Moderation suite migration | NOT STARTED | 001, 003 | none | Yes |
| 013 | `implementation/013-admin-read-only-operational-commands.md` | Admin read-only operational commands | NOT STARTED | 005, 006 | Doc 005 (VERIFIED, admin reads) | Blocked until account linking closes |
| 014 | `implementation/014-community-and-engagement-features.md` | Community and engagement features | NOT STARTED | 001, 003 | none (news feed is external) | Yes |
| 015 | `implementation/015-background-jobs-and-scheduled-digests.md` | Background jobs and scheduled digests | NOT STARTED | 007, 008 | Doc 007 (VERIFIED market data) for digests; 011/012/014 for their own jobs | Yes for market jobs; others blocked |
| 016 | `implementation/016-observability-audit-correlation-and-operational-controls.md` | Observability, audit correlation and operational controls | NOT STARTED | 002–015 | none | After tracks above land |
| 017 | `implementation/017-testing-and-discord-interaction-e2e.md` | Testing and Discord interaction E2E | NOT STARTED | 001–016 | disposable Slice test environment | After 016 |
| 018 | `implementation/018-deployment-production-hardening-and-final-launch-checklist.md` | Deployment, production hardening, and final launch checklist | NOT STARTED | 001–017 | none | Last |

## Exact next document

**Implementation Document 001** (`implementation/001-repository-reconciliation-and-bot-foundation.md`).
Nothing has been implemented yet.
