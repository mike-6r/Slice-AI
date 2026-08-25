# Slice Account + Wallet + Deposit + Withdrawal QA

Date: 2026-08-25  
Environment: staging (`https://staging.slicecollectable.com`)  
Provider mode: Stripe Sandbox  
Funding rail: Bacs Direct Debit  
Settlement currency: GBP

## Scope and safety

This pass resumed from the user-authenticated staging session after the normal 2FA challenge was completed. No live Stripe mode was enabled. No direct balance patches, controlled Umbreon or Charizard mutations, offering changes, orders, or trades were performed. Deposit testing was intentionally out of scope. One failed withdrawal movement was observed during the withdrawal-only continuation; no successful withdrawal was completed.

The authenticated account used for this pass is the user's authorized staging account with an existing wallet fixture. The existing settled cash was used only for withdrawal QA. No new deposit was created. The provider journey reached the real Stripe Sandbox identity-document checkpoint; QA stopped before any document upload.

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

### One-time payout setup and repeat withdrawals

Implementation date: 2026-08-25. This pass keeps the existing Connect account,
the existing Stripe-hosted onboarding flow, GBP settlement, and the current
backend fee authority. It does not create a second Connect account or alter
the current provider identity/bank data.

#### Readiness and setup state

- The provider-backed payout projection is refreshed when Wallet reads payout
  status, after the Stripe return path, and before a withdrawal capability is
  evaluated.
- A withdrawal cannot pass the backend capability gate using a stale `READY`
  database row. If Stripe adds a requirement or restricts payouts, the live
  provider snapshot is synchronized first and the withdrawal is denied before
  a movement or reservation is created.
- Before `READY`, Wallet shows the one-time explanation: “Complete a one-time
  payout setup with Stripe so we can send withdrawals to your bank.” It also
  explains that verified Slice information is reused where possible and that
  Stripe may still request review or confirmation. A restricted account uses
  `Update payout details`; a fresh setup uses `Set up withdrawals`.
- When the provider projection is `READY`, the setup CTA disappears. Returning
  to Wallet does not require another Stripe onboarding link; the persisted
  provider status is the source of truth for normal withdrawal access.
- The funding bank remains separate from the Connect payout destination. Slice
  does not copy Bacs funding credentials into Connect or display the funding
  bank as the payout bank.

#### Normal withdrawal UX

- Withdraw now opens a review step before submitting anything. The review
  shows gross withdrawal amount, the authoritative Slice fee, estimated net
  payout, GBP currency, and the verified Stripe payout destination.
- The backend remains authoritative for the 2.5% withdrawal fee. For gross
  amount `G`, Slice reduces customer cash by `G`, records the Slice fee as
  `2.5% of G`, and sends `G - fee` to the provider.
- If the existing recent-auth policy requires step-up, Wallet opens a normal
  password confirmation dialog and retries the same withdrawal only after the
  confirmation endpoint succeeds. No password or one-time code is stored in a
  movement record. No MFA bypass was added.
- Repeat withdrawals use the same normal review → recent-auth-if-needed →
  request path. Stripe onboarding is not shown again unless the provider
  projection leaves `READY` because of a new requirement, restriction, or
  removed payout destination.

#### Implementation QA

- Provider refresh ordering test: PASS — Connect status refresh precedes the
  withdrawal capability gate and recent-auth gate.
- Frontend Wallet focused suite: PASS — 5 tests.
- Frontend Wallet typecheck, targeted lint, and production build: PASS.
- Backend typecheck, targeted lint, focused wallet risk suite, and production
  build: PASS.
- Real deposit/withdrawal/payout/reconciliation E2E: NOT RUN — the current
  Connect account remains provider-restricted by the keyed-identity document
  requirement. No financial mutation was attempted by this implementation.

#### Full staging withdrawal-setup audit after release `7fcff4a`

Browser audit date: 2026-08-25. The authenticated Wallet session loaded the
new release successfully. `Update payout details` opened a fresh Account Link
for the existing Connect account; no second account was created. Stripe hosted
the existing information on a `Review and confirm` screen. The account owner
confirmed the already-present review screen without editing identity fields or
uploading a document, and Stripe returned to Slice.

The return-state read remained restricted. The live provider read showed:

- existing test Connect account present, country `GB`;
- contact email and contact phone present;
- provider payout capability status `active`;
- provider transfer capability status `active`;
- one requirement awaiting user action;
- requirement `identity.individual.documents.primary_verification`;
- provider error `verification_failed_keyed_identity`;
- the requirement impacts both `stripe_balance.payouts` and
  `stripe_balance.stripe_transfers` with an `eventually_due` deadline.

Slice synchronized that provider result as:

- `status=RESTRICTED`;
- `detailsSubmitted=false`;
- `payoutsEnabled=true`;
- `transfersCapability=active`;
- `currentlyDueCount=1`;
- `pendingVerificationCount=1`;
- `hasValidationErrors=true`.

The withdrawal UI correctly explains that the payout account is the next
requirement. All existing account gates were complete in the dialog: email,
service availability, phone, two-factor authentication, and identity. A £1.00
withdrawal preview calculated £0.02 Slice fee and £0.98 estimated payout, but
the backend capability gate stopped the request before any movement was
created. The account still has one settled £100.00 deposit and zero withdrawal
movements; no cash was reserved and no Stripe transfer or payout was created.

**Diagnosis:** the setup button and Slice backend are functioning. The block is
Stripe's unresolved keyed-identity verification requirement. The user must
review/correct the keyed identity in Stripe's hosted flow and complete the
primary verification-document step if Stripe presents it. Slice must not
invent, edit, or upload that identity evidence. After Stripe clears the
requirement, return to Slice and refresh Wallet; readiness should only change
after a fresh provider read proves there are no current requirements or
validation errors.

### Withdrawal (historical pre-remediation check)

- Withdrawable cash shown by wallet: £91.71 existing fixture
- Withdrawal was not submitted in this historical check
- Fee preview, reservation, provider transfer/payout, webhook, final settlement, fee revenue, provider expense, and reconciliation: NOT RUN
- Real sandbox withdrawal: BLOCKED at that time — Connect onboarding was not complete

### Deposit scope for the withdrawal-only continuation

- Deposit testing: **OUT OF SCOPE FOR THIS CONTINUATION / ALREADY PROVEN**
- No Bacs deposit, PaymentIntent, deposit webhook, settlement, or deposit fixture was created.
- The existing settled £100.00 deposit remained the only cash source for withdrawal QA.

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

- Backend full suite: PASS — 331 tests
- Backend Connect payout focused suite: PASS — 6 tests
- Frontend full suite: PASS — 155 tests
- Frontend typecheck: PASS
- Backend typecheck: PASS
- Frontend production build: PASS
- Backend production build: PASS
- Targeted frontend lint for the changed Wallet and repository test files: PASS

## Remaining launch blockers

1. Provide enough available GBP liquidity in the Stripe Sandbox platform balance, or wait for the existing pending provider balance to become available. Do not create another customer deposit for this QA.
2. Repeat one controlled withdrawal only after provider liquidity is available; no second retry was performed in this continuation.
3. Verify provider transfer → connected-account payout → webhook → final ledger state, fee revenue, provider expense evidence, and reconciliation.
4. Add/execute duplicate-bank and cross-user shared-bank QA without mutating the current connected bank.
5. Verify the deployed Account Center link and all nextAction routes in the authenticated browser at desktop and 390px mobile widths.

## Status

Current task status: **PAYOUT REMEDIATION IMPLEMENTED / WITHDRAWAL QA BLOCKED** by insufficient available Stripe Sandbox platform liquidity. The keyed-identity remediation link now reaches Stripe's identity-document checkpoint, and the provider account subsequently reads ready. No successful withdrawal E2E result is claimed.

Continuation status: **BLOCKED after provider transfer failure**. The failed withdrawal released its reservation and did not create a ledger debit, Stripe transfer, or Stripe payout. Deposit testing remained intentionally out of scope.

## Deployment

- Application commit: `5ac0377`
- Release: `/opt/slice/releases/20260825-5ac0377`
- `/opt/slice/current`: `/opt/slice/releases/20260825-5ac0377`
- `/opt/slice/app`: `/opt/slice/releases/20260825-5ac0377`
- API service: active
- Web service: active
- Health: PASS — HTTP 200
- Ready: PASS — HTTP 200
- Public site: PASS — HTTP 200
- Public market assets: PASS — HTTP 200
- Browser console errors after deploy: none observed
- Browser provider handoff: PASS — fresh hosted link reached Stripe Sandbox; no API/network error observed in the Slice page
- Browser prefill disclosure: PASS — the existing authenticated Wallet QA rendered the verified-data reuse explanation and `Set up withdrawals` CTA; the new release preserves that copy and adds the one-time setup/review flow
- Provider/database mutations during this implementation: no financial/provider mutation; no new account, bank, movement, order, trade, or balance state was created. VPS migration check reported no pending migrations.

Financial release gate: **NO-GO / QA BLOCKED** until the existing provider platform has sufficient available GBP liquidity and one controlled withdrawal reaches provider-confirmed final state with reconciliation. The implementation does not claim provider success without provider evidence.

## Withdrawal-only remediation continuation — 2026-08-25

Deposit functionality was not tested in this continuation. The existing settled
£100.00 deposit and current wallet cash were reused only for withdrawal review.

### Connect remediation result

- Existing connected account reused: PASS — no second Connect account created.
- `account_update` experiment: rejected by Stripe for this Express-style V2
  account; no state mutation resulted.
- Supported remediation: PASS — `account_onboarding` with
  `collection_options.fields=eventually_due` and `future_requirements=include`.
- Hosted checkpoint: PASS — Stripe showed `Verify your identity` and stated
  that a government-issued ID must be uploaded to verify the keyed identity.
- Required user action if Stripe presents the checkpoint: correct the keyed
  legal name/date of birth if needed, then upload a matching government-issued
  photo ID in Stripe-hosted flow. Slice did not edit or upload identity data.
- Provider re-read after remediation-link generation: no requirement entries or
  validation errors; payout capability `active`; transfers `active`.
- Slice projection after refresh: `READY`; Withdraw Funds `AVAILABLE`.

### Failed withdrawal diagnosis

The Wallet request reached the backend and passed the account-readiness gate.
The observed failed request was gross £50.00, Slice fee £1.25, provider amount
£48.75. Recent-auth completed, the cash reservation was created and then
released, and the customer ledger was not debited. `ConnectPayout` ended
`FAILED` with `STRIPE_TRANSFER_FAILED`; it has no transfer or payout reference.

The Stripe Sandbox platform balance at the time of the failure was:

- available GBP: `-£2.50`
- pending GBP: `£99.00`

Stripe showed one prior GBP transfer and one paid GBP payout, but no transfer or
payout for the failed withdrawal. The Slice provider adapter attempts the
platform-to-connected-account transfer before creating the connected-account
payout. With the platform balance negative and the requested provider amount
greater than available balance, the transfer fails before a provider payout can
exist. This is provider liquidity, not a Connect identity/readiness failure.

The current generic customer message is produced by the transfer catch block;
the provider error is intentionally not exposed there. The failure is safe:
no customer cash was consumed, no fee revenue was booked, and the wallet still
shows £91.71 withdrawable with no pending or reserved cash after release.

### Withdrawal-only final gate

| Check | Result |
| --- | --- |
| Payout setup / provider readiness | PASS — existing account reads `READY` |
| Withdraw capability | PASS — `AVAILABLE` |
| Amount and 2.5% preview | PASS — £1.00 preview showed £0.02 fee / £0.98 net |
| Recent-auth / MFA | PASS — request reached provider transfer stage; no bypass |
| Cash reservation | PASS — created, then released on provider failure |
| MoneyMovement | PASS for failure safety; final state `FAILED` |
| Stripe transfer | FAIL — insufficient available platform liquidity |
| Stripe payout | NOT RUN — transfer was never created |
| Webhook / final settlement | NOT RUN |
| Reconciliation | NO-GO for successful payout; failure state has no ledger/provider debit |
| Deposit testing | NOT RUN — intentional |

Final status for this continuation: **NO-GO**. Do not retry another real
withdrawal until the Stripe Sandbox platform has enough available GBP or an
approved treasury-funding test is explicitly authorized. No automatic balance
patch, fake money, deposit, or second withdrawal was performed.

## Provider Money Lifecycle Reconciliation — 2026-08-25

This section records the authorized Stripe Sandbox deposit continuation after
the Connect readiness remediation. It does not claim a successful withdrawal
where Stripe did not provide enough available platform liquidity.

### Opening provider snapshot

Before the new deposit, the Stripe Sandbox platform balance was:

- available GBP: **-£2.50**;
- pending GBP: **£99.00**;
- Connect reserved GBP: **£0.00**.

The negative available amount is explainable by the existing provider
transactions: prior charge net **+£96.65**, prior platform transfer
**-£100.00**, two application-fee credits of **+£3.00** each, prior paid payout
**-£2.65**, and two provider-fee debits of **-£1.25** each. This reconciles to
**-£2.50** and was not patched by Slice.

The existing connected GB payout account was re-read before the deposit:
payout capability 'active', transfers capability 'active', and no current
requirements/errors after the hosted remediation refresh. Slice projected the
account as 'READY' and Withdraw Funds as 'AVAILABLE'.

### Authorized deposit

One new **£100.00** deposit was requested through the authenticated Wallet UI
using the existing connected Bacs funding setup. No second deposit was
requested.

- Slice reference: WLT-047C8642;
- PaymentIntent: pi_3U8NczGqKVy64D3s1lS2MQSG, 'succeeded';
- charge/payment record: py_3U8NczGqKVy64D3s1efnCqNK, 'succeeded';
- Stripe balance transaction: txn_3U8NczGqKVy64D3s1LWFjeGD;
- provider gross: **£100.00**;
- provider fee: **£1.00**;
- provider net: **£99.00**;
- provider available_on: **2026-09-01 00:00 UTC**.

Slice requested the configured bacs_debit rail and used the existing
connected Bacs funding setup. Stripe Sandbox reported the resulting balance
transaction under its card source category; this is provider reporting
behavior observed in test mode, not a frontend conversion or a substituted
funding rail.

The Slice movement became 'SETTLED', retained its provider reference, and has
a linked ledger transaction. The signed provider webhook path processed the
deposit lifecycle ('payment_intent.processing' followed by
'payment_intent.succeeded') without a duplicate Slice movement. The Wallet UI
showed the movement as Completed after refresh. This proves the Slice credit
was driven by provider confirmation, not a manual balance patch.

The provider dashboard still reported the deposit in the platform pending
balance at the time of this QA: available remained **-£2.50**, pending became
**£198.00**. Therefore the Slice policy currently makes cash spendable after
the configured provider-success confirmation, while Stripe's external
balance availability remains later (available_on). That timing distinction
must remain explicit in production policy and reconciliation.

### Slice ledger and wallet projection

Before this continuation the authenticated wallet showed **£91.71**
withdrawable cash. After the settled deposit it showed:

- withdrawable cash: **£191.71**;
- pending deposits: **£0.00**;
- pending withdrawals: **£0.00**;
- reserved cash: **£0.00**;
- total wallet balance: **£191.71**;
- settled deposits: **£200.00** total;
- settled withdrawals: **£0.00** total.

The new movement credited **£100.00** to Slice cash with no Slice fee. The
Stripe evidence separately explains the **£1.00** provider processing cost;
it is not presented as Slice fee revenue. The customer-facing wallet and
provider records are therefore directionally reconciled for the deposit, with
the pending-to-available timing caveat above.

### Withdrawal and payout gate

No new withdrawal was submitted in this continuation. A recommended gross
withdrawal of **£50.00** would require a provider transfer of **£48.75** after
the Slice 2.5% fee. The current provider available balance of **-£2.50** cannot
fund that transfer, so the provider-to-Connect transfer → Connect payout →
webhook → final ledger reconciliation chain cannot be truthfully completed
yet.

The Wallet now keeps Slice cash and withdrawal eligibility separate. Connect
requirements/capabilities are ready and Slice cash is posted, but provider
liquidity still gates external execution. The prior
observed failed £50.00 movement remains a safe 'FAILED' record: its £1.25
Slice fee was not booked, its reservation was released, no customer ledger
debit occurred, and no Stripe transfer or payout reference exists. It is not
counted as a successful withdrawal for this lifecycle.

### Lifecycle result

| Lifecycle check | Result |
| --- | --- |
| Stripe Sandbox only / live mode disabled | PASS |
| Opening Stripe balance explained | PASS — available -£2.50 reconciles |
| New deposit provider confirmation | PASS — PaymentIntent/charge succeeded |
| Signed webhook → Slice settlement | PASS — movement settled and ledger-linked |
| Slice wallet credit | PASS — £100.00, no Slice fee |
| Provider fee separated | PASS — £1.00 provider fee, not Slice revenue |
| Stripe balance availability | PENDING — £99.00 net available on 2026-09-01 |
| Connect readiness | PASS — payouts/transfers active, no current requirements |
| New withdrawal | NOT RUN — provider available balance insufficient |
| Transfer → payout → final reconciliation | NOT PROVEN — blocked at provider liquidity |
| Umbreon / Charizard / controlled economics | UNCHANGED |

Final provider money lifecycle gate: **NO-GO** until Stripe Sandbox has
sufficient available GBP and one controlled withdrawal produces provider
transfer, connected-account payout, signed webhook, fee/cost evidence, and
final Slice reconciliation. No fake provider event, balance patch, automatic
settlement, or second withdrawal was performed.

## Provider liquidity / withdrawal maturity hardening — 2026-08-25

This implementation closes the projection mismatch identified above. It does
not claim that the previously unavailable Stripe balance has become available,
and it does not create a deposit, withdrawal, transfer, payout, order, trade,
or balance patch.

### Root cause and corrected authorities

The former wallet projection treated posted GBP customer cash as externally
withdrawable after Connect readiness. That was incomplete: the prior £100
deposit had a successful PaymentIntent and a settled Slice movement, while its
Stripe balance transaction had provider net £99.00 and `available_on` 1 Sep
2026. Stripe platform available GBP was -£2.50 while pending GBP was £198.00.
The £50 attempt therefore reached a provider transfer that Stripe could not
fund.

The corrected projection now keeps these values separate:

- Available cash: posted Slice customer GBP after active cash reservations;
- Available to withdraw: customer-matured cash capped by provider-funded gross
  payout capacity;
- Settling for withdrawal: only the customer-specific provider maturity bucket;
- Provider liquidity: Stripe available GBP less active internal payout
  reservations; pending GBP is excluded;
- Customer liability: remains the full posted customer amount, independent of
  Stripe's provider fee.

The £1 provider fee on the £100 deposit remains Slice provider expense. It is
not deducted from the customer's £100 liability or used as a fake customer
withdrawal fee.

### Backend hardening

- `GET /api/v1/me/wallet/withdrawal-preflight` returns authoritative wallet,
  trade availability, eligibility, maturity status, fee, net payout, provider
  status, and expected availability fields.
- Stripe balance transaction evidence is persisted on provider-backed
  movements: balance transaction reference, gross, fee, net, GBP currency,
  `available_on`, and hashed source reference.
- Before a Stripe transfer, the backend refreshes available GBP and takes a
  PostgreSQL advisory-lock-protected `ProviderLiquidityReservation` so
  concurrent withdrawals cannot reserve the same provider liquidity.
- Provider insufficiency blocks before transfer creation. A provider failure
  releases the provider reservation and preserves the existing customer cash
  reservation/ledger failure safety.

### UI and Admin Finance

- Wallet now labels Available cash, Available to withdraw, Settling for
  withdrawal, Reserved cash, and Available to trade separately.
- Customer copy does not expose Stripe negative balances or raw provider
  errors. It explains that funds are settling or bank withdrawals are
  temporarily unavailable, with an expected date only when safely attributable
  to provider evidence.
- Admin Finance now shows customer cash liabilities, withdrawal-eligible
  liabilities, Stripe available/pending GBP, settling cash, active payout
  reservations, payout-liquidity coverage, and an operational warning.

### Read-only current-case result

Using the last observed staging provider evidence, the new projection must not
claim that a £50 withdrawal is executable while Stripe available GBP is
-£2.50 and pending GBP is £198.00. No new withdrawal was attempted during this
hardening pass. A successful sandbox withdrawal remains gated until Stripe
actually reports enough available GBP; the calendar and provider balance are
not faked.

### Hardening gate

| Check | Result |
| --- | --- |
| Customer liability remains full GBP amount | PASS — no provider fee deduction |
| Pending Stripe balance excluded from payout liquidity | PASS |
| Negative/insufficient provider balance blocks before transfer | PASS — focused tests |
| Provider maturity timestamp used when evidence exists | PASS — focused tests |
| Concurrent payout-liquidity reservation | PASS — advisory-lock reservation path implemented; integration requires staging DB run |
| Customer-safe liquidity/maturity copy | PASS |
| Explicit trade availability and maturity status | PASS — backend contract and Wallet projection |
| Negative provider balance cannot pass zero-amount preflight | PASS — focused test |
| Admin provider/liability projection | PASS — API/UI contract implemented |
| Controlled £50 withdrawal | NOT YET AVAILABLE — provider available GBP was insufficient |
| Umbreon / Charizard / trading state | UNCHANGED |

The release remains **NO-GO** for successful withdrawal E2E until actual Stripe
Sandbox available GBP is sufficient. Do not retry the real withdrawal or create
test money solely to manufacture that state.
