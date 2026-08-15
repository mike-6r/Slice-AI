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

- Account status transitions are now exposed in the Account Detail `Roles & Access` tab through the existing protected `/admin/users/:id/status` command. The UI requires a reason, confirmation, pending state, and refreshes the authoritative projection after success.
- Role grant/revoke actions are now exposed through the existing protected `/admin/users/:id/roles` commands. The UI confirms changes, uses idempotency keys, refreshes after success, deduplicates repeated semantic role chips, and leaves last-admin/self-lockout enforcement to the backend.
- The status controller now accepts the domain-supported `DEACTIVATED` transition instead of rejecting it at request validation.
- Intake approval requests now include an idempotency key; receipt confirmation already used the idempotent staff command.

The controlled staging mutation walkthrough, including dedicated test identities, has not been executed in this code pass. Physical receipt, verification, valuation, custody, publication, finance adjustment, and real Charizard progression remain untouched.
