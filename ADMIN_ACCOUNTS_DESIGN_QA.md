# Admin Accounts & User Detail — Design QA

Updated 2026-08-15.

This pass focuses on `/admin?section=users` and the account detail experience. It replaces the wide analytics treatment with an account-control workflow: compact summary, dominant search, one expandable advanced-filter row, readable account rows, beta-test labels, and a single-column detail workspace.

## Completed

- Removed the six-card KPI wall and `Current projection` language.
- Removed the permanent Accounts filter/summary sidebar.
- Added a compact account summary strip and readable `Open account` row action.
- Replaced repeated `Unavailable` last-active values with `Not tracked` and an explanation tooltip.
- Deduplicated semantic role assignments and labeled controlled demo accounts as `Beta test`.
- Reworked the detail header into an Account Control Center identity block with summary chips.
- Merged Wallet and Orders into Finance and removed the repeated action/activity side rails.
- Reworked Access and Account status into vertical, Slice-styled forms with readable role descriptions.
- Replaced browser-default select appearance in this workflow with the dark Slice select primitive.
- Removed the unconnected Support tab from account detail; Trust & Support remains the authoritative support workspace.
- Kept server-owned status/role commands, RBAC, idempotency, audit, self-lockout and last-admin protections unchanged.

## Verification boundary

Frontend typecheck and production build are required for this change. Server projection and mutation contracts remain the existing typed `/admin/users` reads plus `/status` and `/roles` commands. Authenticated mutation walkthrough, responsive screenshot capture, and cross-role IDOR testing require a fresh Admin session on staging and are not inferred from static screenshots.

## Safety

No wallet balance, ledger, execution, provider verification, physical custody, or Charizard submission state is edited by this pass.
