# Active route audience map

This map is a Wave 0 preservation document. It does not retire, redirect, or
consolidate a route.

| Surface | Client gate and primary audience | Navigation / deep link | Owned requests and mutations | Overlap decision |
| --- | --- | --- | --- | --- |
| `/admin` | `ADMIN` client role; every data request is server-permission checked. Primary audience: broad admin console staff. | Main administrative navigation. `section`, `asset`, `membership`, filters, sort and page search parameters preserve deep links. | Read console projections; Collectibles uses `GET /v1/admin/collectibles` with `admin.console.read`. The console hosts separate review/intake/catalogue/operations sections. | **KEEP DISTINCT** — it is the privileged overview and catalogue workspace. |
| `/staff` | `SUPPORT` or `ADMIN` client role. Primary audience: staff landing page. | Linked from staff navigation; no record-specific mutation state. | No operational mutation itself; offers entry points based on role projection. | **KEEP DISTINCT** — role-aware launch surface. |
| `/operations/submissions` | Authenticated client route; the review API is server-gated by `submission.review` and appropriate actor roles. Primary audience: asset reviewers. | Direct `submission` and `tab` search parameters select a case and review tab. `/staff` currently links reviewers to the collector workspace rather than directly here, so this remains an active/deep-link surface. | Claim/release, evidence and review fields, decision, market-research promotion; approve changes only review/submission authority. It does not create/link an Asset. | **CONSOLIDATE LATER** — overlaps admin review presentation, but audience/deep-link workflow must be preserved first. |
| `/operations/assets` | Authenticated client route; reads require `admin.console.read`; individual mutations require custody, valuation, insurance, or publication permissions. Primary audience: vault/compliance/lifecycle operators. | `/staff` links qualifying staff here. Current route keeps selected Asset local rather than a URL search parameter. | `GET /v1/admin/assets/operations`; lifecycle custody handoff/transitions, valuation, insurance, readiness and publication endpoints. | **KEEP DISTINCT** — lifecycle mutation workspace, not a replacement for canonical catalogue. |

## Cross-cutting result

The route pair under `/operations/*` is active and server-authorized. It must
not be deleted in a cleanup wave. `/admin` owns the dense cross-domain console;
`/operations/submissions` and `/operations/assets` are task-focused workspaces.
No safe consolidation or redirect exists in Wave 0. A later decision needs
usage/telemetry, a role matrix, and explicit deep-link migration plans.
