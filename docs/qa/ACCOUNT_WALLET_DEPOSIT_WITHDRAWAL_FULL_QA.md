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

### Existing Connect keyed identity remediation

Audit date: 2026-08-25. This continuation reused the existing Stripe Sandbox
Connect account `acct_1U8JaiGqKVJOvmNB`. No second account was created, and no
Connect account, bank, balance, movement, journal, ownership, order, trade, or
withdrawal state was mutated during this audit.

#### Read-only provider evidence

The existing v2 account was retrieved directly from Stripe Sandbox with
`identity`, `requirements`, `future_requirements`, and
`configuration.recipient` included. The safe projection was:

- Account object: `v2.core.account`.
- Legacy `details_submitted`, `charges_enabled`, and `payouts_enabled` fields:
  not exposed on this v2 object; they are not used as readiness evidence for
  this account type.
- Recipient `stripe_balance.payouts`: `active` with no status details.
- Recipient `stripe_balance.stripe_transfers`: `active` with no status details.
- `requirements.entries`: one entry awaiting action from `user`:
  `identity.individual.documents.primary_verification`.
- Requirement impact: restricts `stripe_balance.payouts` and
  `stripe_balance.stripe_transfers` for the recipient configuration.
- Requirement deadline: `eventually_due`.
- `future_requirements.entries`: empty.
- Full safe provider error: `verification_failed_keyed_identity` — the
  person's keyed-in identity information could not be verified; Stripe says
  to correct the errors or upload a document that matches the identity fields,
  such as name and date of birth.

This is the exact provider blocker. It is not an API outage, a missing bank
funding relationship, a stale browser label, or evidence that Slice may invent
or directly patch legal identity data.

#### Slice projection after the provider read

The existing `ExternalConnectAccount` row was read after the provider audit:

- Status: `RESTRICTED`.
- `detailsSubmitted`: `false` (Slice's v2 safe projection because the
  requirement has a user action and validation error).
- `payoutsEnabled`: `true`.
- `transfersCapability`: `active`.
- `currentlyDueCount`: `1`.
- `pendingVerificationCount`: `1` (the requirement deadline is
  `eventually_due` and the provider is awaiting user action).
- `hasValidationErrors`: `true`.
- Provider-to-Slice sync: PASS — the row was last synced at
  `2026-08-25T14:55:06.526Z`.

Slice correctly does not transition to `READY` merely because Stripe reports
the capability statuses as active. Its v2 readiness rule also requires no
validation errors or user-action requirements.

#### Supported remediation path

The existing implementation uses the Stripe-hosted v2 Account Link with the
recipient onboarding configuration, collects currently due fields, and
includes future requirements. Slice does not collect KYC documents, guess a
legal name or date of birth, or copy the funding bank into the payout account.
The provider's returned error identifies the required user action: review or
correct the keyed identity in Stripe-hosted onboarding and upload a matching
primary identity document if Stripe requests it. After the user returns,
Slice must retrieve the provider account again and only then decide whether
the account is `READY`.

The fresh-link/browser action was intentionally not initiated in this
read-only continuation because it would transmit the account's verified
contact data to Stripe and open a sensitive hosted flow. The existing Wallet
CTA and prior hosted-link reachability remain verified. The next checkpoint
is the account owner's action in Stripe-hosted onboarding; no financial flow
may proceed before that checkpoint clears.

#### Authorized hosted-flow checkpoint

The account owner authorized the Wallet action on 2026-08-25. The existing
account's `Set up withdrawals` action was invoked; it returned
`Continue to Stripe` and a fresh Stripe-hosted Account Link. The link opened
the existing account in Stripe Sandbox at the `Review and confirm` screen.
No second Connect account was created.

The hosted screen showed the existing individual identity, personal-details,
email, and payout-bank sections. No document-upload form or separate
correction instruction was visible before confirmation. QA stopped before
clicking `Confirm`, editing identity details, or uploading a document.

The authorized prefill path supplied only the already-verified missing
contact phone to the existing provider account; the provider now reports
contact and individual phone presence as true, while the existing email and
country remained protected. No legal name, date of birth, address, or bank
value was changed by Slice.

The post-link read-only provider refresh still reports
`verification_failed_keyed_identity` on
`identity.individual.documents.primary_verification`, awaiting action from
the user, with payouts and transfers active but restricted by the requirement.
Slice refreshed at `2026-08-25T15:18:00.556Z` and remains `RESTRICTED` with
`detailsSubmitted=false`, `currentlyDueCount=1`,
`pendingVerificationCount=1`, and `hasValidationErrors=true`.

**User action required:** on Stripe's hosted flow, review the keyed identity
fields. If any field is incorrect, correct it there. If Stripe presents the
document step after confirmation, provide a primary identity document whose
name and date of birth match the keyed identity. Slice did not enter, edit,
or upload any identity data. Financial QA remains blocked until Stripe clears
the requirement and a fresh provider read proves readiness.

### Connect onboarding data reuse / prefill

Audit date: 2026-08-25. This section covers the safe prefill change made after the post-onboarding provider-state check. Stripe remains the verification authority; Slice only supplies verified contact data where the current Stripe Accounts v2 contract allows it.

#### Slice identity authority

| Field | Slice state | Reuse decision |
| --- | --- | --- |
| Legal first name | UNAVAILABLE — `UserProfile.displayName` is a public/user-entered label, not a legal identity record | Not sent; never split or promoted to a legal name |
| Legal last name | UNAVAILABLE | Not sent |
| Date of birth | UNAVAILABLE — the compliance record stores provider state and safe references, not DOB | Not sent |
| Residential address | UNAVAILABLE — no address fields are stored in Slice compliance/profile records | Not sent |
| Country | USER_ENTERED — `UserProfile.countryCode`; current staging account is `GB` | Used for the new-account country only after compatibility validation; non-GB values fail with `IDENTITY_MISMATCH_REVIEW` rather than being mapped to GB |
| Phone | VERIFIED — `User.phoneE164` with `phoneVerifiedAt` | Sent as Connect contact/individual phone when present and verified |
| Email | VERIFIED — `User.email` with `emailVerifiedAt` | Sent as Connect contact email and individual email when verified |
| Verification status/source | VERIFIED — Slice compliance state is backed by Stripe Identity in Sandbox | Used as a capability/input gate only; never treated as proof that Connect requirements are complete |

The Slice schema does not retain raw Stripe Identity legal values. Discord birthday data and public profile display names are unrelated and are deliberately not used for financial onboarding.

#### Connect payload and existing-account behavior

The new Accounts v2 recipient payload now supplies:

- `contact_email` from the Slice account;
- `contact_phone` only when the Slice phone is verified;
- `identity.country` from the compatible Slice profile country (`GB` in the current GBP product);
- `identity.entity_type=individual`;
- `identity.individual.email` and `identity.individual.phone` only when their Slice verification timestamps are present;
- `identity` in the response include list so provider state can be inspected without persisting raw values.

Legal name, DOB, address, business profile, support profile, and company fields are not fabricated or derived from unrelated profile data. Normal consumer users remain individual recipients; no company/business representation was added.

For an existing Accounts v2 account, the service retrieves provider identity fields and:

- returns `IDENTITY_MISMATCH_REVIEW` when provider country, email, or phone conflicts with verified Slice data;
- updates only missing contact/individual email or phone fields, with a stable idempotency key;
- never overwrites an existing provider value, including provider-verified identity fields;
- requests the provider requirements/configuration again after a safe update so Slice status cannot regress from an incomplete response.

The current authorized account was inspected read-only after hosted onboarding. Stripe reported provider-side name, address, and email fields, but no date of birth or phone field; Slice did not overwrite or copy those provider values. No Connect update was invoked during this audit.

#### Funding bank and payout bank

The existing Bacs funding relationship remains a Stripe Customer + PaymentMethod + Mandate. A Connect payout bank is an external account on the connected account. Stripe does not expose an approved direct-reuse path in the current implementation. Raw account numbers, sort codes, masked values, or bank credentials are not extracted or copied. The payout bank therefore still requires confirmation through Stripe-hosted onboarding.

#### Customer disclosure

Wallet now shows `Set up withdrawals` with this concise disclosure before the handoff:

> We’ll reuse the verified account information we already have where possible. Stripe may still ask you to review or confirm certain details and your payout bank.

The disclosure describes prefill, not verification completion, and preserves Stripe's hosted review and verification steps.

#### Prefill test result and root cause

- New-account payload contract test: PASS — verified email/phone are included and no unavailable identity fields are generated.
- Existing-account safe-update contract test: PASS — only missing verified phone is updated; legal name/DOB/address are absent from the update.
- Current authorized account provider comparison: PASS read-only — provider identity and requirements were inspected without creating a second account or changing the current account.
- Hosted-form prefill visual proof after this code change: NOT YET RUN — the current account already has provider-side name/address values from the previous hosted flow, and creating a second connected account solely for visual proof would create an unnecessary duplicate account. A disposable test user/account is required for a clean before/after visual comparison.
- Deployed Wallet disclosure/browser check: PASS — the live staging Wallet rendered `Set up withdrawals` and the exact prefill disclosure; no browser error or warning logs were observed. The button was not clicked, so no provider update or Account Link was created during this final read-only check.

Root cause of the earlier duplicate/example identity fields: the payout service previously sent only the contact email and a hard-coded GB country. It did not pass permitted individual email/phone fields, and Slice has no safely reusable legal name, DOB, or address record. Stripe therefore remained responsible for collecting those fields in hosted onboarding; this was not a frontend cache or a verification bypass.

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

- Backend full suite: PASS — 326 tests
- Backend Connect payout focused suite: PASS — 6 tests
- Frontend full suite: PASS — 155 tests
- Frontend typecheck: PASS
- Backend typecheck: PASS
- Frontend production build: PASS
- Backend production build: PASS
- Targeted frontend lint for the changed Wallet and repository test files: PASS

## Remaining launch blockers

1. Complete the Stripe-hosted Connect onboarding manually for the authorized staging account, return to Slice, and verify actual provider requirements/capabilities before deciding whether readiness transitions to `READY`.
2. Run a real sandbox Bacs deposit through pending → signed webhook → settlement → ledger reconciliation.
3. Run the authorized account through withdrawal preview, recent-auth/MFA if challenged, reservation, payout, webhook, final ledger state, fee revenue, and reconciliation.
4. Add/execute duplicate-bank and cross-user shared-bank QA without mutating the current connected bank.
5. Verify the deployed Account Center link and all nextAction routes in the authenticated browser at desktop and 390px mobile widths.
6. Complete the pending recent-auth/2FA checkpoint for the authorized £1.00 deposit, then verify the provider-backed pending → webhook → settlement journey.
7. Correct/re-submit the Stripe keyed identity details, then re-read provider requirements and verify Slice payout readiness before attempting withdrawal.

## Status

Current task status: **PREFILL IMPLEMENTED / FINANCIAL QA BLOCKED** by the provider's keyed-identity verification requirement and the normal recent-auth gate. The customer disclosure and deployed Wallet handoff are browser-verified; no financial E2E result is claimed yet.

Continuation status: **BLOCKED at the normal recent-auth/2FA gate for the authorized £1.00 deposit**. Wallet still correctly shows payout setup restricted after Stripe return. No new financial movement was created.

## Deployment

- Application commit: `ee0af9e`
- Release: `/opt/slice/releases/20260825-ee0af9e`
- `/opt/slice/current`: `/opt/slice/releases/20260825-ee0af9e`
- `/opt/slice/app`: `/opt/slice/releases/20260825-ee0af9e`
- API service: active
- Web service: active
- Health: PASS — HTTP 200
- Ready: PASS — HTTP 200
- Public site: PASS — HTTP 200
- Public market assets: PASS — HTTP 200
- Browser console errors after deploy: none observed
- Browser provider handoff: PASS — fresh hosted link reached Stripe Sandbox; no API/network error observed in the Slice page
- Browser prefill disclosure: PASS — deployed Wallet rendered the verified-data reuse explanation and `Set up withdrawals` CTA
- Provider/database mutations during this prefill implementation QA: none from the final browser check; no new account, bank, movement, order, trade, or balance state was created

Financial release gate: **NO-GO / QA BLOCKED** until the disposable normal-user provider journey reaches real sandbox-confirmed deposit and withdrawal final states. The implementation does not claim provider success without provider evidence.
