# Slice Discord Premium Panel QA

## Local implementation QA

| Surface | Status | Notes |
| --- | --- | --- |
| Verify | Pass | Mint, compact, verify-first gate; no permanent timestamp. |
| Welcome | Pass | Clear Slice orientation and two action hierarchy. |
| Announcements | Pass | Header only, concise read-only copy. |
| My Slice | Pass | Private companion panel with limited actions. |
| Market | Pass | Factual marketplace framing; no ticker or financial hype. |
| Roles | Pass | Verified-only, read-only canonical notification selector; eight-role allowlist. |
| Collector Hub / listing | Pass | Submission flow is clear; no sensitive documents in Discord. |
| Support | Pass | Select-first private routing with seven categories. |
| Ticket | Pass | Compact support-request header and existing strict privacy controls. |
| Operations / review / support ops / logs | Pass | Slate internal presentation; no fabricated metrics. |
| Setup status / errors / success | Pass | Shared embed palette and redacted error boundary remain in use. |

## Configuration and persistence

The setup check requires every permanent panel key, validates palette and embed sizes, and enforces Discord select limits. Existing panel IDs remain persisted and setup reconciliation edits the canonical message instead of creating duplicates.

The roles selector rejects unknown, privileged, permission-bearing, non-editable, and above-bot roles before any preference or Discord role mutation. Notification roles are non-hoisted, non-mentionable, neutral, and permissionless.

## Live visual QA required

Not yet performed in the live guild. Per the deployment guardrails, run `/setup preview` first and review the managed changes before any apply. After explicit approval, inspect the unverified, verified, Collector, and staff views on desktop and mobile. No `/setup` action was applied as part of this implementation pass.
