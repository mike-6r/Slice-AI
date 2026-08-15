# SLICE FULL COLLECTOR + ADMIN QA

Environment: https://staging.slicecollectable.com  
Audit date: 2026-08-14  
Git/VPS commit: `d46c5d600e2534f011c460421244417b574cccff`  
Account: controlled authenticated Michael Fultz session (`@michael`, Collector + Administrator)

## Deployment and provider gate

- `slice-api.service`: active
- `slice-web.service`: active
- `/health`: PASS (200)
- `/ready`: PASS (200; PostgreSQL and Redis up)
- Prisma: prior deployment verification reported all migrations applied
- `APP_ENV=beta`: confirmed in the VPS environment file (values were not printed)
- R2/object storage: configured and operational in Platform Operations
- PriceCharting: operational; persisted research only on ordinary page loads
- Ximilar: operational; no page-render analysis call observed
- Intake: one approved Beta destination is reported by the read model; no shipment or receipt was created

## Collector scorecard

| Area | Result | Evidence |
|---|---|---|
| Auth / refresh / direct workspace | PASS | Authenticated workspace loaded directly and retained session during route navigation |
| Overview | PASS | Empty counts and membership state are consistent; no stale cards or console errors |
| List an Asset CTA | PASS | Added direct Overview link to `/list` |
| My Collectibles | PASS (empty state) | Status filters render; no fixture contamination |
| Collectible Detail | NOT TESTABLE | Account has zero controlled collectibles |
| Submissions | PASS (empty state) | Route and empty state render |
| Submission Detail | NOT TESTABLE | No owned submission available |
| Requests / Your Actions | PASS (empty state) | Filters render and remain empty |
| List Step 1 | PASS | PriceCharting URL import returned an exact product and populated details |
| List Steps 2–4 | NOT TESTABLE | No draft was saved or media was uploaded during the safety-bounded pass |
| AI Review / Ximilar | NOT TESTED | No fresh analysis was triggered |
| Review & Submit | NOT TESTABLE | No new submission was created |
| Subscription | PASS | Truthful no-active-plan state; no fake Stripe Active state |
| Public Profile | PASS | Profile editor and public toggle rendered |
| Settings | PASS | Collector-specific links rendered |
| Mobile / responsive | PASS (spot check) | Workspace content had no horizontal overflow at the tested desktop layout; narrow viewport checks were limited |
| Request health | PASS | No 401/403/409/429/500 loops or console errors observed on exercised routes |

Collector decision: **GO for controlled internal empty-state/listing-entry beta; NO-GO for external invited beta** until fresh upload, Ximilar, submission and cross-user privacy checks are completed.

## Admin scorecard

| Area | Result | Evidence |
|---|---|---|
| Auth / direct `/admin` | PASS | Admin Console loaded as Administrator |
| Overview | PASS | Counts, review workload and operational cards rendered |
| Accounts | PASS (read-only) | Users/role/status tabs and counts rendered |
| User Detail | NOT TESTABLE | No detail mutation exercised |
| Review Queue | PASS (read-only) | Queue counts, tabs and filters rendered |
| Submission Review | NOT TESTABLE | No controlled review mutation exercised |
| Physical Intake | PASS (read-only) | Destination/intake summary rendered with zero false receipts |
| Collectibles | FAIL | Nav currently renders Asset Operations, not a canonical catalogue; see `ADMIN-COL-001` |
| Collectible Detail | NOT TESTABLE | No canonical admin catalogue record selected |
| Asset Operations | PASS (read-only) | Lifecycle pipeline and filters rendered |
| Memberships | PASS (read-only) | Membership counts and status tabs rendered |
| Finance & Trading | PASS (read-only) | Finance/trading summaries rendered; no mutation exercised |
| Trust & Support | PASS (read-only) | Deferred compliance/support states render safely |
| Platform Operations | PARTIAL | Tabs load; aggregate health is Unknown because some telemetry is unavailable |
| Jobs / Webhooks / Integrations / Audit / Flags / Settings | PASS (read-only) | Each tab opened; no console errors; unavailable data is labelled rather than fabricated |
| Mobile | NOT TESTABLE | Desktop route pass completed; targeted narrow checks remain |
| RBAC / IDOR | NOT TESTABLE | Requires separate controlled identities; no cross-account mutation was attempted |
| Request health | PASS | No request storms or console errors on exercised routes |

Admin decision: **NO-GO for external invited beta** while `ADMIN-COL-001` remains open and RBAC/IDOR mutation checks are outstanding. Controlled read-only internal review: **GO with documented limitations**.

## Security and safety boundaries

- No physical shipment, tracking, delivery, Slice receipt, verification, valuation, custody, issuance, publication or order was fabricated.
- No provider call was triggered by ordinary page render during this pass.
- Private media, cross-user access, and anonymous R2 access require separate identities and are recorded as not testable rather than assumed.
- Plaid, Bridge, SMS, email verification and 2FA remain deferred/disabled; no fake success state was created.

## Issues

See `QA_COLLECTOR_ADMIN_ISSUES.json` for structured reproduction details. The contained Collector CTA regression was fixed in this pass. The Admin Collectibles/Asset Operations route collision is the top remaining functional issue.
