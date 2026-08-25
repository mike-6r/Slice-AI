# Slice Account + Wallet + Deposit + Withdrawal QA

Date: 2026-08-25  
Environment: staging (`https://staging.slicecollectable.com`)  
Provider mode: Stripe Sandbox  
Funding rail: Bacs Direct Debit  
Settlement currency: GBP

## Scope and safety

This pass resumed from the user-authenticated staging session after the normal 2FA challenge was completed. No live Stripe mode was enabled. No direct balance patches, controlled Umbreon or Charizard mutations, offering changes, orders, trades, or withdrawals were performed.

The authenticated account used for this pass is the user's authorized staging account with an existing wallet fixture. No deposit or withdrawal was created. The provider journey is paused at the real Stripe Sandbox hosted onboarding form because personal details must be entered by the account owner rather than invented by QA.

## Root causes found

1. Account Center always rendered a generic `Continue account setup` link to `/onboarding`, even when the authoritative blocker was bank setup, payout setup, identity, security, or an account restriction.
2. The capability response exposed `allowed`, `status`, `reason`, and `requirements`, but not an authoritative `nextAction`, so the frontend had to guess the remediation route.
3. The frontend had no customer-facing mapping for `BANK_CHANGE_WITHDRAWAL_HOLD`.
4. The connected-bank view currently shows one connected/default bank row and one disconnected historical row with the same masked account. This was observed and not altered.
5. The visible Wallet payout control was rendered by `AccountStatusPanel`; the earlier handoff patch had been placed in an unused payout panel, so the live button discarded the returned Account Link after refetching. The live render path now preserves the returned link, shows a clear `Continue to Stripe` CTA, and surfaces request errors.
6. Connect Account Link expiry was normalized across Stripe v2 string timestamps and legacy numeric timestamps before frontend contract mapping.

## Fix implemented

The backend capability authority now returns `nextAction` for each actionable blocker. Account Center uses the highest-priority blocked capability to route directly to the next actual requirement:

| Blocker | Action | Destination |
| --- | --- | --- |
| Email, phone, or MFA | Continue security setup | Account security |
| Identity required or under review | Continue/view identity | Account identity |
| Bank required | Connect a bank account | Wallet |
| Payout required or under review | Set up/view withdrawals | Wallet |
| No withdrawable cash | Open wallet | Wallet |
| Account restriction/review | View account status | Account |

The dialog now explains the bank-change withdrawal hold and links to wallet status.

The Wallet payout control now keeps the secure hosted link visible after a successful HTTP 201 response. A fresh browser check showed the user-facing message `Your secure payout setup is ready to continue.` and a `Continue to Stripe` link. The fresh link opened Stripe Sandbox hosted onboarding, advanced through Stripe's built-in test-phone and test-code helpers, and reached the Personal details form. No personal details were entered or submitted.

## Runtime evidence

### Account security

- Email: PASS — verified
- Phone: PASS — verified
- TOTP: PASS — enabled; user completed the normal 2FA checkpoint
- SMS MFA: OPTIONAL — not required because TOTP is enabled
- Recent auth: PARTIAL — session was restored after the user completed 2FA; a separate sensitive-action re-auth challenge was not forced
- Identity: PASS — current account showed Approved / verification complete in the TEST environment
- Compliance: PASS — current account capability evaluation accepted the approved case

### Account access

At the time of the authenticated audit:

- Place Buy Order: AVAILABLE
- Deposit Funds: AVAILABLE
- Withdraw Funds: BLOCKED — `PAYOUT_ACCOUNT_REQUIRED`
- Exact next action: `SET_UP_PAYOUTS`
- Generic setup dead-end: PASS — deployed Account Center now shows `Set up withdrawals` and links to `/wallet`

### Bank

- Funding bank: PASS — connected GBP Bacs bank is visible
- Default bank: PASS — one row is marked connected/default
- Historical disconnected row: OBSERVED — preserved and displayed separately
- Same-user duplicate protection: NOT FULLY TESTED — existing duplicate-looking history was observed; no new bank was linked
- Cross-user fraud protection: NOT TESTED
- Disconnect confirmation/MFA: NOT TESTED — no destructive bank mutation performed

### Deposit

- Provider: Stripe Sandbox
- Rail: Bacs Direct Debit
- Product fee: 0%
- Capability: PASS for the audited account
- Create/pending/webhook/settlement/reconciliation: NOT RUN — Connect onboarding is not complete
- Real sandbox deposit: NOT RUN — explicitly authorized for this account, but held until hosted Connect onboarding and provider capability state are verified

### Payout setup

- Investor/USER-level policy: PASS in backend policy; Collector role is not required
- Connect onboarding request: PASS — staging returned HTTP 201
- Connect account creation/reuse path: PASS — request completed without an API error
- Visible customer handoff: PASS — Wallet now retains and displays `Continue to Stripe` after the response
- Stripe-hosted onboarding reachability: PASS — fresh Account Link opened Stripe Sandbox hosted onboarding
- Stripe test-phone/test-code helpers: PASS — Stripe Sandbox advanced to the personal-details step
- Stripe-hosted onboarding completion: BLOCKED — manual checkpoint requires the account owner's legal name, date of birth, and home address
- Payout readiness: BLOCKED — account still showed payout setup required because onboarding was not submitted
- Return URL / refresh URL: NOT RUN to completion — the manual form was not submitted
- Connect account provider state: NOT YET VERIFIED — must be read after hosted onboarding return/refresh
- Capability refresh: PASS at API level — the wallet refreshed its payout status request; readiness remained correctly blocked

### Post-onboarding provider-state continuation

After the user completed the Stripe-hosted form and returned to Slice, the live Stripe Sandbox account was read directly in test mode and the Slice projection was refreshed.

Provider account state:

- Object: `v2.core.account`
- Environment: `STRIPE_SANDBOX` / Sandbox
- Payout capability: `active` (`payoutsEnabled=true`)
- Transfers capability: `active`
- Requirements: one `eventually_due` identity requirement, `identity.individual.documents.primary_verification`
- Provider validation error: `verification_failed_keyed_identity` — keyed identity information could not be verified
- Provider `detailsSubmitted`: `false`
- Provider country/default currency: not returned on the v2 object projection

Slice projection after provider refresh:

- Status: `RESTRICTED`
- `currentlyDueCount`: 1
- `pendingVerificationCount`: 1
- `hasValidationErrors`: true
- `payoutsEnabled`: true
- `transfersCapability`: `active`
- Withdraw capability: BLOCKED — Account Center displayed `PAYOUT_ACCOUNT_REQUIRED` / `SET_UP_PAYOUTS`

This is not a stale frontend-only state. Stripe has active payout/transfer capability flags but an unresolved keyed-identity validation error; Slice correctly keeps the payout account restricted until the provider requirement is cleared.

### Withdrawal

- Withdrawable cash shown by wallet: £91.71 existing fixture
- Withdrawal was not submitted
- Fee preview, reservation, provider transfer/payout, webhook, final settlement, fee revenue, provider expense, and reconciliation: NOT RUN
- Real sandbox withdrawal: BLOCKED — no disposable-user settled deposit and no completed Connect hosted onboarding

### Authorized deposit continuation

- Requested QA amount: £1.00
- Deposit request: STOPPED by the normal backend recent-auth gate with `Authentication is required.`
- Provider PaymentIntent/MoneyMovement: NOT CREATED — no new movement appeared in Wallet history
- Cash state: unchanged at £91.71 withdrawable / £0.00 pending deposits
- 2FA/recent-auth: REQUIRED — paused for the user's current one-time code; no bypass or retry performed
- Withdrawal/payout/reconciliation: NOT RUN because the deposit auth checkpoint and Connect identity requirement remain unresolved

## Wallet UI

PASS for the read-only state display:

- Withdrawable cash: £91.71
- Pending deposits: £0.00
- Pending withdrawals: £0.00
- Reserved cash: £0.00
- Total wallet balance: £91.71
- Connected bank and payout readiness are shown independently
- Existing deposit history remains visible

## Provider/configuration checks

- `PROVIDER_MODE=stripe_sandbox`: PASS
- `STRIPE_LIVE_ENABLED=false`: PASS
- `STRIPE_BANK_FUNDING_RAIL=bacs_debit`: PASS
- Identity and phone verification feature flags: enabled in staging
- No secrets are recorded in this document

## Automated validation

- Backend account capability focused suite: PASS — 12 tests
- Frontend Account Center and capability dialog tests: PASS — 5 tests
- Frontend typecheck: PASS
- Backend typecheck: PASS
- Frontend production build: PASS
- Backend production build: PASS

## Remaining launch blockers

1. Complete the Stripe-hosted Connect onboarding manually for the authorized staging account, return to Slice, and verify actual provider requirements/capabilities before deciding whether readiness transitions to `READY`.
2. Run a real sandbox Bacs deposit through pending → signed webhook → settlement → ledger reconciliation.
3. Run the authorized account through withdrawal preview, recent-auth/MFA if challenged, reservation, payout, webhook, final ledger state, fee revenue, and reconciliation.
4. Add/execute duplicate-bank and cross-user shared-bank QA without mutating the current connected bank.
5. Verify the deployed Account Center link and all nextAction routes in the authenticated browser at desktop and 390px mobile widths.
6. Complete the pending recent-auth/2FA checkpoint for the authorized £1.00 deposit, then verify the provider-backed pending → webhook → settlement journey.
7. Correct/re-submit the Stripe keyed identity details, then re-read provider requirements and verify Slice payout readiness before attempting withdrawal.

## Status

Current task status: **BLOCKED by the provider's keyed-identity verification requirement and the normal recent-auth gate**. The customer handoff defect is fixed and browser-verified; no financial E2E result is claimed yet.

Continuation status: **BLOCKED at the normal recent-auth/2FA gate for the authorized £1.00 deposit**. A clean browser screenshot captured Wallet Withdraw still restricted after Stripe return. No new financial movement was created.

## Deployment

- Commit: `becfbfa`
- Release: `/opt/slice/releases/20260825-becfbfa`
- `/opt/slice/current`: `/opt/slice/releases/20260825-becfbfa`
- `/opt/slice/app`: `/opt/slice/releases/20260825-becfbfa`
- API service: active
- Web service: active
- Health: PASS — HTTP 200
- Ready: PASS — HTTP 200
- Public site: PASS — HTTP 200
- Public market assets: PASS — HTTP 200
- Browser console errors after deploy: none observed
- Browser provider handoff: PASS — fresh hosted link reached Stripe Sandbox; no API/network error observed in the Slice page

Financial release gate: **NO-GO / QA BLOCKED** until the disposable normal-user provider journey reaches real sandbox-confirmed deposit and withdrawal final states. The implementation does not claim provider success without provider evidence.
