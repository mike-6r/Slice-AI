# Slice Financial Capability Gating Audit

## Scope

This audit covers the customer-facing capability projection for:

- Place Buy Order
- Deposit Funds
- Withdraw Funds

No wallet balances, ownership, orders, trades, ledger entries, provider
objects, or financial movements were created or changed during the audit.

## Root cause

The Security & Access card rendered every denied decision with either
`Blocked` or the raw `FEATURE_AVAILABILITY` requirement. The backend used one
generic `FEATURE_DISABLED` reason for trading, deposits, and withdrawals, so
the UI could only say `Feature availability required` even when the real state
was a deliberately disabled environment feature.

There was also an authority mismatch: the capability service searched all
historical compliance cases for any `APPROVED` record, while the compliance
projection reads the unique KYC case for the active provider. A historical
approval from another provider could therefore make trading appear allowed
while the current Stripe Sandbox KYC case was still pending.

The blocked modal compounded this by always linking to the beginning of the
generic onboarding flow and by showing internal requirement names.

## Current dependency graph

### Place Buy Order

1. Authenticated active account.
2. No active deletion request or account/compliance hold.
3. Email verified.
4. Trading operational feature enabled.
5. Current provider KYC case approved.
6. No active hold covering trading eligibility.
7. Cash sufficiency and market/order validation remain submission-time checks.

Phone verification, MFA, bank funding, and payout onboarding do not block a
buy order in the current policy.

### Deposit Funds

1. Authenticated active account.
2. No active deletion request or account/compliance hold.
3. Email verified.
4. Deposits operational feature enabled.
5. Current provider KYC case approved.
6. In non-local provider modes, a connected default GBP Bacs bank account is
   required because the current deposit workflow does not create bank setup
   inline.

### Withdraw Funds

1. Authenticated active account.
2. No active deletion request or account/compliance hold.
3. Email verified.
4. Withdrawals operational feature enabled.
5. Phone verified.
6. MFA enabled.
7. Current provider KYC case approved.
8. No active withdrawal/external-movement hold.
9. In Stripe modes, the account must have the Collector role and a persisted
   READY Stripe Connect payout account because external withdrawals currently
   support collector proceeds only.
10. Available cash, velocity limits, screening, and payout execution remain
    submission-time checks.

## Canonical response

`GET /api/v1/me/capabilities` remains the server authority and now returns a
status alongside the existing allowed/reason/requirements fields:

- `AVAILABLE`
- `ACTION_REQUIRED`
- `TEMPORARILY_UNAVAILABLE`
- `BLOCKED`

Feature-specific reasons now include:

- `TRADING_UNAVAILABLE`
- `DEPOSITS_UNAVAILABLE`
- `WITHDRAWALS_UNAVAILABLE`
- `BANK_ACCOUNT_REQUIRED`
- `PAYOUT_ACCOUNT_REQUIRED`
- `PAYOUT_ACCOUNT_REVIEW_REQUIRED`

The active provider KYC case is selected using the configured provider and
`KYC` type. Raw provider references, holds, scores, and internal case data are
never exposed.

## Staging account audit

The supplied read-only staging account was audited without mutations:

| State | Result |
|---|---|
| Account | `ACTIVE` |
| Roles | `USER` only |
| Email | Verified |
| Phone | Not verified |
| TOTP | Not enabled |
| SMS MFA | Not enabled |
| Recovery codes | No configured methods reported |
| Identity | `PENDING` / `REQUIRES_INPUT` |
| Bank funding | No connected bank accounts |
| Payout destination | Not applicable to this non-Collector account; endpoint denied |
| Provider | `STRIPE_SANDBOX` |
| Trading feature | Enabled |
| Deposit feature | Disabled |
| Withdrawal feature | Disabled |
| Restrictions | Account active; no restriction was reported by the capability projection |

The screenshots supplied with the request show a different security-complete
state than the supplied demo-investor account. The API projection is the
authority for the account above.

## Correct expected staging result

For the supplied account after deployment:

### Place Buy Order

- Allowed: **NO**
- Status: **ACTION_REQUIRED**
- Reason: **COMPLIANCE_REVIEW_REQUIRED**
- Copy: verification is under review / identity setup is required according
  to the active KYC state.
- Next action: Account → Identity verification.

### Deposit Funds

- Allowed: **NO**
- Status: **TEMPORARILY_UNAVAILABLE**
- Reason: **DEPOSITS_UNAVAILABLE**
- Copy: deposits are temporarily unavailable in this environment.
- No misleading bank-setup CTA is shown while the deposit feature itself is
  disabled.

### Withdraw Funds

- Allowed: **NO**
- Status: **TEMPORARILY_UNAVAILABLE**
- Reason: **WITHDRAWALS_UNAVAILABLE**
- Copy: withdrawals are available for collector proceeds only in this
  environment.
- No payout CTA is shown for a non-Collector account.

## Frontend mapping

The Account Security & Access card now displays server-authored statuses:

- Available
- Action required
- Temporarily unavailable
- Blocked

Specific row copy replaces `Feature availability required`. The capability
modal shows the requested feature, completed requirements, remaining
requirements, customer-safe copy, and only a relevant next action. Identity
routes to Account identity, security requirements route to Account security,
and bank/payout requirements route to Wallet. Administrative/provider-off
states do not pretend that account setup will fix them.

## Cache and invalidation

Capability data remains a React Query projection. Existing account security and
onboarding refresh paths invalidate it after email, phone, and MFA changes.
Wallet refresh now also invalidates capabilities after identity, bank, payout,
or wallet-state refreshes. No logout/login is required for the card to update.

## Tests

- Backend capability policy: **10 passed**.
- Frontend capability modal, Account Center, and HTTP contract tests: **21
  passed**.
- Frontend typecheck: **PASS**.
- Full financial behavior was not mutated or exercised against real money.

## Release gate

The implementation is ready to build and deploy after the focused checks pass.
Staging verification must confirm the deployed response includes `status` and
the feature-specific reasons above, and that the rendered card no longer
contains `Feature availability required` for these three capabilities.

No market matching, ownership, ledger, fees, PriceCharting, asset pages,
Collector pages, Discord, Stripe objects, or Twilio actions were changed.
