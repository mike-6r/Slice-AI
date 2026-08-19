# Admin Review Workstation QA

Updated 15 August 2026 for the Review Queue and Submission Review redesign.

## Delivered

- Review Queue uses a compact summary strip, identity-first rows, secure front thumbnails, readable readiness/research states, and one toolbar for search and filters.
- Submission Review stays inside an Admin Console shell with a focused queue, concise identity/collector header, Review/Evidence/AI Review/Market/History tabs, and a persistent readiness rail on the main Review tab.
- Evidence uses short-lived signed private media URLs and explicit missing-media states. Opening a review does not call Ximilar or PriceCharting.
- Decision actions continue through existing claim, request-changes, approve, reject, and note domain commands. Request changes now exposes structured requested fields and a collector message.

## Verification

| Check | Result |
| --- | --- |
| Frontend typecheck | PASS |
| Server typecheck | PASS |
| Frontend production build | PASS |
| Server production build | PASS |
| Reviewer E2E | BLOCKED: local Postgres is not running at 127.0.0.1:5432 |
| Browser screenshot QA | Pending authenticated staging session |

## Remaining staging checks

Use a disposable submission to verify claim/release, evidence zoom, structured request changes, approve/reject confirmations, private media expiry, reviewer RBAC, and audit history at 390, 768, 1366, 1920 and 2560px widths.
