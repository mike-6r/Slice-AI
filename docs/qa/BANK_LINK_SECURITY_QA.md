# Bank Link Security QA

## Automated checks

| Area | Result |
| --- | --- |
| Frontend typecheck | PASS |
| Frontend wallet tests | PASS — 5 tests |
| Server typecheck | PASS |
| Prisma validation | PASS |
| Provider boundary + capability tests | PASS — 17 tests |
| Prisma client generation | PASS |

## Read-only and lifecycle review

- Connected badge is non-interactive: PASS.
- Disconnect is explicit and confirmation-gated: PASS.
- Confirmation explains pending movements and future deposits: PASS.
- Recent-auth boundary is enforced server-side: PASS.
- TOTP-first / SMS action challenge path is implemented: PASS.
- Provider PaymentMethod detach is not called on disconnect: PASS by code inspection.
- Pending movement history remains linked: PASS by code inspection.
- Default-bank replacement warning is enforced server-side: PASS.
- Same-user fingerprint duplicate is blocked: PASS by code inspection.
- Cross-user fingerprint match is blocked and sent to review: PASS by code inspection.
- Raw fingerprint and raw bank details are not returned: PASS by code inspection.
- Security notifications are safe-projection only: PASS by code inspection.
- Provider customer reuse remains idempotent and environment-scoped: PASS.
- Admin risk endpoint is permission-protected and safe-projection only: PASS.
- Withdrawal hold is configuration-driven and defaults inactive: PASS.

## Required staging browser checks

The following must be run against the deployed staging release with an authenticated test account before release approval:

1. Open Wallet and verify the Connected badge has no action behavior.
2. Start Disconnect and verify the confirmation text, checkbox, and disabled Continue state.
3. Verify stale recent auth routes to the recent-auth step and never changes state.
4. Verify TOTP and SMS step-up behavior using the configured staging factor.
5. Verify a successful disconnect refreshes bank connections and account capabilities.
6. Verify pending movements remain visible and no balance, journal, payout, order, or trade changes occur.
7. Verify the last-bank case leaves deposits unavailable without showing a fake balance or payout change.
8. Verify the default-bank replacement error when another connected bank exists.
9. Verify duplicate and cross-user instrument attempts produce safe customer messages and admin review records.
10. Verify `GET /admin/providers/bank-risk` is denied without `provider.manage` and contains no raw provider identifiers.
11. Verify concurrent link attempts produce at most one connected account for the same user/instrument.
12. Verify security notifications contain no full bank details.

## Provider-call and mutation boundary

Disconnect must produce no Stripe detach call. Duplicate handling may retrieve the completed setup/payment method during link completion, but must not create a second connected account or perform an automatic destructive repair. No testing step creates trades, changes ownership, or changes unrelated financial state.
