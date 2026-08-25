# Slice Account + Wallet + Deposit + Withdrawal QA

Date: 2026-08-25  
Environment: staging (`https://staging.slicecollectable.com`)  
Provider mode: Stripe Sandbox  
Funding rail: Bacs Direct Debit  
Settlement currency: GBP

## Scope and safety

This pass resumed from the user-authenticated staging session after the normal 2FA challenge was completed. No live Stripe mode was enabled. No direct balance patches, controlled Umbreon or Charizard mutations, offering changes, orders, trades, or withdrawals were performed.

The authenticated account used for the UI audit is an admin account with an existing staging wallet fixture. It is not a disposable normal USER, so the real deposit/settlement/withdrawal acceptance path remains blocked rather than being claimed as passed.

## Root causes found

1. Account Center always rendered a generic `Continue account setup` link to `/onboarding`, even when the authoritative blocker was bank setup, payout setup, identity, security, or an account restriction.
2. The capability response exposed `allowed`, `status`, `reason`, and `requirements`, but not an authoritative `nextAction`, so the frontend had to guess the remediation route.
3. The frontend had no customer-facing mapping for `BANK_CHANGE_WITHDRAWAL_HOLD`.
4. The connected-bank view currently shows one connected/default bank row and one disconnected historical row with the same masked account. This was observed and not altered.

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
- Create/pending/webhook/settlement/reconciliation: NOT RUN in this pass
- Real sandbox deposit: BLOCKED — requires a disposable normal USER and a supported Bacs settlement test; the authenticated account has an existing wallet fixture and was not used for a new deposit

### Payout setup

- Investor/USER-level policy: PASS in backend policy; Collector role is not required
- Connect onboarding request: PASS — staging returned HTTP 201
- Connect account creation/reuse path: PASS — request completed without an API error
- Stripe-hosted onboarding completion: BLOCKED at manual hosted checkpoint — the returned provider handoff did not become a visible in-app navigation in the authenticated browser session
- Payout readiness: BLOCKED — account still showed payout setup required after the request
- Capability refresh: PASS at API level — the wallet refreshed its payout status request; readiness remained correctly blocked

### Withdrawal

- Withdrawable cash shown by wallet: £91.71 existing fixture
- Withdrawal was not submitted
- Fee preview, reservation, provider transfer/payout, webhook, final settlement, fee revenue, provider expense, and reconciliation: NOT RUN
- Real sandbox withdrawal: BLOCKED — no disposable-user settled deposit and no completed Connect hosted onboarding

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

1. Complete the Stripe-hosted Connect onboarding manually for a disposable normal USER, return to Slice, and verify readiness transitions to `READY`.
2. Run a real sandbox Bacs deposit through pending → signed webhook → settlement → ledger reconciliation.
3. Run the same disposable USER through withdrawal preview, recent-auth/MFA, reservation, payout, webhook, final ledger state, fee revenue, and reconciliation.
4. Add/execute duplicate-bank and cross-user shared-bank QA without mutating the current connected bank.
5. Verify the deployed Account Center link and all nextAction routes in the authenticated browser at desktop and 390px mobile widths.

## Status

## Deployment

- Commit: `0194a0f`
- Release: `/opt/slice/releases/20260825-0194a0f`
- `/opt/slice/current`: `/opt/slice/releases/20260825-0194a0f`
- `/opt/slice/app`: `/opt/slice/releases/20260825-0194a0f`
- API service: active
- Web service: active
- Health: PASS — HTTP 200
- Ready: PASS — HTTP 200
- Public site: PASS — HTTP 200
- Public market assets: PASS — HTTP 200
- Browser console/network errors after deploy: none observed

Financial release gate: **NO-GO / QA BLOCKED** until the disposable normal-user provider journey reaches real sandbox-confirmed deposit and withdrawal final states. The implementation does not claim provider success without provider evidence.
