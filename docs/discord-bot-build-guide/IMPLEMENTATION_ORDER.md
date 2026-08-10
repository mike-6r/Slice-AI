# Implementation order

Run implementation documents strictly in order, one at a time, each ending with its own stop
condition. Do not begin the next document until the current one's completion checklist is satisfied.

| # | Document | Depends on | Slice backend dependency | Can start today? |
|---|---|---|---|---|
| 001 | Repository reconciliation and bot foundation | none | none | Yes |
| 002 | Slice API client and shared contracts | 001 | Docs 004–008 (VERIFIED, read-only client) | Yes |
| 003 | Discord interaction framework and command registry | 001, 002 | none | Yes |
| 004 | Account-linking domain and backend API requirements | 002 | **New bot-only endpoints must exist on a Slice environment before this closes** (BOT_API_REQUIREMENTS.md §1–3) | Spec work: yes. Full closure: blocked on Slice team building the new endpoints |
| 005 | Account-linking Discord commands | 003, 004 | same as 004 | Blocked until 004 closes |
| 006 | Permission and authorization integration | 004, 005 | delegated-token-exchange endpoint (§2) | Blocked until 004 closes |
| 007 | Marketplace and asset commands | 002, 003 | Doc 006/007 (VERIFIED) | Yes |
| 008 | Collector and Vault commands | 002, 003 | Doc 008 (VERIFIED) | Yes |
| 009 | Watchlist and portfolio commands | 005, 006 | Doc 008 (VERIFIED) | Blocked until account linking (005/006) closes |
| 010 | Notification commands and delivery-preference documentation | 005, 006 | Doc 008 (VERIFIED, reads/marks-read only) | Blocked until account linking closes |
| 011 | Support/ticket migration | 001, 003 | none | Yes |
| 012 | Moderation suite migration | 001, 003 | none | Yes |
| 013 | Admin read-only operational commands | 005, 006 | Doc 005 (VERIFIED, admin reads) | Blocked until account linking closes |
| 014 | Community and engagement features | 001, 003 | none (news feed is external) | Yes |
| 015 | Background jobs and scheduled digests | 007, 008 | Doc 007 (VERIFIED market data) | Yes, for market-digest/price-alert jobs; ticket/mute/giveaway jobs depend on 011/012/014 |
| 016 | Observability, audit correlation and operational controls | 002–015 | none | After the above land |
| 017 | Testing and Discord interaction E2E | 001–016 | disposable Slice test environment | After the above land |
| 018 | Deployment, production hardening, and final launch checklist | 001–017 | none | Last |

## Parallelizable tracks

Given the dependency graph, three tracks can proceed **in parallel** once 001–003 land:

- **Track A (blocked on new Slice backend work):** 004 → 005 → 006 → 009 → 010 → 013.
- **Track B (no Slice backend dependency beyond what's already VERIFIED):** 007, 008 in parallel;
  then 015's market-digest/price-alert jobs.
- **Track C (fully bot-owned, no Slice dependency at all):** 011, 012, 014 in parallel; then 015's
  ticket/mute/giveaway jobs.

016, 017, 018 always run last, after every track above has landed.

## Exact next document

**Implementation Document 001** — nothing has been implemented yet (this build guide is
documentation-only, per its own scope). See MASTER_CHECKLIST.md.
