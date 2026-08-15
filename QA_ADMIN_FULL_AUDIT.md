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
