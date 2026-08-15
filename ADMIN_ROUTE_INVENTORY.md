# Slice Admin Route Inventory — Phase 3

Generated 2026-08-15 against `main` commit `7528bfb0e507e6696507af9bd47a7ba1620558b3`.

This inventory describes the public Admin Console route (`/admin`) and its query-state sections. It is an implementation map, not a claim that every state-changing command has been exercised against staging.

| Route / section | Tabs and controls | Read authority | Mutations | Permission boundary | QA result |
| --- | --- | --- | --- | --- | --- |
| `/admin?section=control` | Four operational metrics, max-five attention feed, compact system status, pipeline, recent activity, quick actions, scoped search | `GET /api/v1/admin/overview`, `GET /api/v1/admin/operations/overview`, `GET /api/v1/admin/risk-operations`, review/lifecycle reads | Contextual links only | Admin workspace | Redesign implemented; fresh authenticated retest required |
| `/admin?section=users` | Account search, type/status/membership/role/date filters, sort, pagination; account detail tabs Overview, Roles & Access, Investor, Collector, Wallet, Orders, Compliance, Support, Activity, Audit | `GET /api/v1/admin/users`, `GET /api/v1/admin/users/:id` | Status, grant role, revoke role | `users.status.manage`, `users.roles.manage`, `audit.read` | Account actions implemented; controlled staging mutation retest required |
| `/admin?section=moderation` | Review search, priority/status/evidence/research/date filters, sort, pagination, open review | `GET /api/v1/reviews/submissions`, `GET /api/v1/reviews/submissions/:id` | Claim, request changes, approve, reject, notes live in review workflow route | Review workflow permissions | Queue/read route implemented; mutation browser pass not executed |
| `/admin?section=intake` | All, Accepted, Shipped, Delivered, Received, Verified, Ready for Vault, Exceptions; search, status/vault/carrier/date filters, pagination | `GET /api/v1/admin/intake` | Destination approval/disable; controlled receipt confirmation | Vault operations permission | Read route implemented; receipt/destination mutation retest required |
| `/admin?section=collectibles` | Canonical catalogue search/status/pagination; detail tabs | `GET /api/v1/admin/collectibles`, `GET /api/v1/admin/assets/:id` | No blind catalogue mutation in this console | Admin read permission | Read-only catalogue route implemented |
| `/admin?section=assetOperations` | Verification, valuation, Vault Ready, Market Ready, Market Live, exceptions; category/grader/priority/search/pagination | `GET /api/v1/admin/assets/operations`, `GET /api/v1/admin/assets/:id/lifecycle` | Handoff, valuation, custody, coverage, publish | Asset operations permissions | Board implemented; controlled lifecycle mutation pass not executed |
| `/admin?section=memberships` | All, Active, Past Due, Cancelled, Cancelling, Trialing, Expired; plan/status/search/sort/pagination | `GET /api/v1/admin/memberships` | Plan/cancel/reactivate commands are backend-owned | Membership permission | Read route implemented; mutation browser pass not executed |
| `/admin?section=payments` | Wallets, Movements, Orders, Executions, Reconciliation, Adjustments; search/status/pagination | `GET /api/v1/admin/finance/dashboard`, `GET /api/v1/admin/finance/records` | D13 reversals/reconciliation only through protected finance commands | Finance read/mutation permissions | Read route implemented; high-risk mutation pass not executed |
| `/admin?section=support` | Compliance, Restrictions, Tickets, Escalations; search/type/status/priority/pagination | `GET /api/v1/admin/trust-support/dashboard`, `GET /api/v1/admin/trust-support/records`, compliance detail reads | Protected trust/support commands | Trust/support permissions | Read route implemented; mutation browser pass not executed |
| `/admin?section=health` | Health, Jobs, Webhooks, Integrations, Audit, Feature Flags, Settings | `GET /api/v1/admin/platform/dashboard`, `GET /api/v1/admin/platform/records`, `GET /api/v1/admin/risk-operations`, `GET /api/v1/admin/audit-events` | Job/webhook retry commands where exposed; feature flags/settings unavailable states are explicit | Operations/audit permissions | Read route implemented; telemetry limitations documented |

## Legacy deep links

The route normalizer keeps older links from becoming dead destinations:

- `valuations`, `custody`, and `marketplace` → Collectibles/Asset Operations context.
- `compliance`, `restrictions`, `cases`, and `escalations` → Trust & Support tabs.
- `system-health`, `jobs`, `webhooks`, `integrations`, `audit`, `flags`, `settings`, `maintenance`, and `deployments` → Platform Operations tabs.

## Disabled controls

- Intake **Export** is disabled because no approved reporting projection is configured.
- Intake **settings** is disabled because destination configuration remains in the approved operations workflow.
- Intake **Accept to intake** remains disabled because acceptance is controlled by Submission Review.
- Feature Flags/unsupported settings show an explicit unavailable state rather than a dead action.

## Final QA boundary

The current artifact records implementation and read-only route coverage. A fresh authenticated Admin browser session, cross-identity RBAC/IDOR matrix, responsive/accessibility sweep, request-health capture, and controlled mutation walkthrough remain required before declaring `ADMIN GO`.
