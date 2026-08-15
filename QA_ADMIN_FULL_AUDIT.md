# Slice Admin Panel — Phase 1 Operational Audit

**Scope:** Accounts detail contract recovery and focused build verification
**Date:** 2026-08-15

## Fixed in this pass

The `GET /api/v1/admin/users/:id` projection now includes the same account-summary fields as the Accounts list projection: `displayName`, `username`, `primaryType`, and `membership`. The frontend mapper requires these fields before it can render the detail tabs. Previously, the API returned a valid-looking detail payload without them, so the mapper rejected it and the UI remained in its account-detail error state.

Collector subscription plan code is also returned alongside the display name so the customer-facing membership summary remains normalized to the admin contract.

## Verification

- Server typecheck: PASS
- Frontend typecheck: PASS
- Server lint for the changed service: PASS
- Focused HTTP repository tests: PASS (12/12)
- Server production build: PASS
- Frontend production build: PASS

## Remaining audit boundary

This commit does not claim a fresh browser walkthrough of every admin section or any mutation workflow. Those workflows remain subject to the existing beta audit evidence and should be rechecked on staging after deployment, with particular attention to Account detail tabs and action permissions.

## Phase 2 mutation foundation — 2026-08-15

## Accounts deep redesign — 2026-08-15

The Accounts directory and User Detail routes now use the Account Control Center layout documented in `ADMIN_ACCOUNTS_DESIGN_QA.md`. Read projections and typed status/role commands remain server-authoritative. Fresh authenticated mutation, responsive, and IDOR evidence is still required before changing the overall Admin release gate.

- Account status transitions are now exposed in the Account Detail `Roles & Access` tab through the existing protected `/admin/users/:id/status` command. The UI requires a reason, confirmation, pending state, and refreshes the authoritative projection after success.
- Role grant/revoke actions are now exposed through the existing protected `/admin/users/:id/roles` commands. The UI confirms changes, uses idempotency keys, refreshes after success, deduplicates repeated semantic role chips, and leaves last-admin/self-lockout enforcement to the backend.
- The status controller now accepts the domain-supported `DEACTIVATED` transition instead of rejecting it at request validation.
- Intake approval requests now include an idempotency key; receipt confirmation already used the idempotent staff command.

The controlled staging mutation walkthrough, including dedicated test identities, has not been executed in this code pass. Physical receipt, verification, valuation, custody, publication, finance adjustment, and real Charizard progression remain untouched.

## Phase 3 final QA / launch-gate boundary — 2026-08-15

Deployment was rechecked before QA: Git `main` and VPS are `7528bfb0e507e6696507af9bd47a7ba1620558b3`; `slice-api.service` and `slice-web.service` are active; `/health` and `/ready` return 200; PostgreSQL and Redis are up; Prisma reports 58 migrations and an up-to-date schema. The configured environment contains the expected Beta/storage/provider key names without exposing secret values.

The route and control inventories are recorded in `ADMIN_ROUTE_INVENTORY.md` and `ADMIN_FUNCTION_INVENTORY.json`. Visible controls are classified as working, intentionally disabled with a reason, or implementation-only pending controlled staging retest. No contextless publish, valuation, receipt, adjustment, or order action was introduced.

The fresh authenticated Admin browser session and full cross-section mutation/RBAC/IDOR/responsive/accessibility/request-health matrix were not executed in this pass because no controlled Admin browser credentials/session were available to the agent and high-risk mutations require an action-time controlled fixture. The unauthenticated staging route correctly presents “Admin Console sign-in required”. This is an explicit evidence gap, not a GO claim.

Phase 3 decision: **NO-GO for final Admin launch gate** until the authenticated browser matrix and controlled mutation retest are completed. Controlled internal read-only Beta remains available with the previously documented limitations. External invited Beta remains blocked by the existing privacy/provider and mutation-test gaps. The controlled Charizard remains untouched: approved submission, `beta-test-uk-intake`, reference `SLICE-3AA5144D`, no shipment, receipt, verification, valuation, custody, publication, issuance, funding, or order.

## Fresh external-gate browser evidence — 2026-08-15

- The controlled operator account authenticated in a fresh staging tab. Admin Console loaded after authenticated navigation retry; no console errors were observed.
- Overview, Accounts, Review Queue, Physical Intake, Collectibles, Asset Operations, Memberships, Finance & Trading, Trust & Support and Platform Operations were opened. Read-only account detail and Roles & Access controls rendered, including required-reason/disabled mutation validation.
- Platform Operations showed API/PostgreSQL, storage, intake and PriceCharting operational, with Ximilar optional/not configured and truthful unknown/disabled telemetry.
- The real Charizard submission was opened read-only from Physical Intake and remained `APPROVED`, `beta-test-uk-intake`, `SLICE-3AA5144D`, awaiting shipment details with no tracking entered.
- Safe reversible mutations, cross-role RBAC/IDOR, staff boundaries, signed-media/intake privacy, responsive/accessibility and request-health matrices were not executed. Admin Phase 3 remains **NO-GO** for invited external release.
