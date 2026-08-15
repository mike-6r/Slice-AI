# Admin Memberships — Design and Functional QA

**Scope:** Membership directory and account-linked membership detail workspace.

## Implemented

- Replaced the KPI-heavy/right-rail layout with a compact full-width workspace.
- Added status tabs with counts, search, plan/status/billing/usage filters, pagination, and an explicit Manage action.
- Rows now show plan price, billing truth, Beta entitlement state, effective usage, capacity state, renewal, and actionable warnings without exposing internal projection labels.
- Manage opens an account-linked membership detail view with overview, usage/capacity, effective entitlements, and provider-owned management state.
- Unsupported Beta mutations remain disabled with a reason; no fake provider billing or entitlement changes are presented.
- Added responsive table overflow and detail grid behavior without fixed-height clipping.

## Backend contract

`GET /api/v1/admin/memberships` now includes `billingState`, `betaEntitlement`, `entitlements`, `overLimit`, `warnings`, and `eligibleActions` per row. Usage is derived from the shared collector entitlement projection. Provider billing remains disabled when the source is the staging demo or no provider is configured.

## Verification boundary

- Frontend typecheck: PASS
- Server typecheck: PASS
- Changed service lint: PASS
- Full authenticated browser, responsive, RBAC/IDOR, and mutation walkthrough: staging retest required
- Billing mutations: intentionally unavailable until a real provider is configured
