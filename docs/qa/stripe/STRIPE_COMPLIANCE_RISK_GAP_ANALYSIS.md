# Stripe Compliance / Risk Gap Analysis

## Executive Summary

Phase 4E audits Slice after the provider migration from Plaid/Bridge to
Stripe. Stripe is an external capability provider, not Slice's complete AML,
fraud, sanctions, or investment-compliance program. Slice remains authoritative
for identity-case state, wallet movements, reservations, journals, ownership,
trade settlement, holds, and reconciliation.

The current implementation has useful engineering controls: signed and
environment-separated Stripe webhooks, no provisional ACH credit, pending
provider settlement, idempotent movement creation, withdrawal velocity limits,
reservation locking, reversal/deficit holds, recent-auth checks, Connect
readiness checks, and a backend manual-hold gate. Phase 4E hardened two concrete
gaps: withdrawal velocity is now serialized per user, and admin/provider hold
creation and release transitions are durably audited with source metadata.

This document does not make a regulatory compliance claim. Product and legal
decisions remain open wherever the repository does not define a requirement.

## Stripe Coverage

| Slice capability | Current Stripe layer | What Slice treats as authoritative |
| --- | --- | --- |
| Identity | Stripe Identity VerificationSession in sandbox/live provider modes | `ComplianceCase`, mapped identity state, and Slice capability gates |
| Bank ownership | Stripe Financial Connections ownership permission | Safe `ExternalFinancialAccount` projection and Slice user mapping |
| Bank payments | Stripe PaymentIntent / `us_bank_account` boundary | `MoneyMovement`, pending settlement, journal posting, reversals |
| Connect KYC/onboarding | Stripe Express Connect hosted onboarding and account requirements | Collector payout eligibility projection and Slice payout movement |
| External payouts | Stripe platform transfer plus connected-account payout | Slice reservation, movement status, webhook completion, reconciliation |
| Native payment risk | Stripe may apply provider-side payment checks | No Slice policy claim; provider outcomes are not treated as a complete Slice fraud or AML decision |

Stripe objects are environment checked. Sandbox and live credentials/events are
not interchangeable, and live mode remains explicitly fail-closed by default.

## Identity Coverage

Slice creates a hosted Stripe Identity session for document verification with
live capture and matching selfie requested by the current implementation. The
shared signed webhook boundary maps provider events into the existing
`ComplianceCase` and stores only safe state, timestamps, a hashed/encrypted
provider reference, and a safe failure category.

`VERIFIED` means the provider reported a verified identity session. It does not
mean `AML_CLEARED`, sanctions-cleared, age-eligible, jurisdiction-eligible, or
investment-eligible. The backend method is explicitly named
`requireIdentityApproved` to keep the current identity gate separate from
future compliance policies.

## Connect Coverage

Stripe Connect Express onboarding is collector-only. Slice projects account
requirements, `details_submitted`, `payouts_enabled`, transfers capability, and
safe lifecycle status. `READY` requires active transfers, enabled payouts, and
no current/past due or validation errors. Onboarding completion alone is not a
Slice investment or payout-fraud decision.

`CONNECT_READY` does not imply identity approval, AML clearance, sanctions
clearance, age eligibility, jurisdiction eligibility, or general investment
eligibility. Admin compliance detail now presents Connect payout readiness as a
separate projection from identity and risk holds.

## Financial Connections Coverage

Slice requests only the current minimum Financial Connections permissions and
stores safe bank metadata. Full account/routing numbers and credentials are not
stored. The account-to-customer relationship is checked before persistence.

The current Stripe Financial Connections / `us_bank_account` arrangement is
US-bank oriented while Slice's ledger is GBP. That currency/product decision
and credentialed sandbox validation remain release blockers.

## Payments Coverage

Deposits begin as Slice `PENDING_PROVIDER` movements. A provider response does
not credit available cash. Only a verified, deduplicated settlement webhook
can post the existing Slice journal. Failure, cancellation, return, reversal,
deficit, reservation, and reconciliation paths remain Slice-owned.

The safe current ACH rule is:

`NO_PROVISIONAL_ACH_CREDIT`

No predictive ACH return score is claimed or used.

## Missing Plaid Capabilities

Plaid Signal and Plaid Monitor are intentionally not reintroduced. Slice does
not pretend to have predictive ACH return scoring or ongoing monitoring because
those capabilities are not present in the current Stripe boundary. If product
later requires them, a provider-neutral interface can be implemented and a
provider selected separately; this phase does not purchase or integrate one.

## ACH Risk

**Classification: NOT CURRENTLY REQUIRED/DEFINED for provisional credit.**

The current policy keeps deposits pending until verified provider settlement.
That removes the need to make available-cash decisions from an unproven ACH
return prediction. A future product decision may define whether predictive
return-risk scoring is needed; until then, no provisional credit is allowed.

## Sanctions / PEP

**Sanctions classification: IMPLEMENTED only for the narrow existing
transaction/destination screening adapter; customer sanctions screening is not
implemented.**

The current withdrawal destination adapter can fail closed or request review
from its configured provider signal. That is not a customer-wide sanctions
program and is not represented as AML clearance.

**PEP classification: EXTERNAL PROVIDER NEEDED if the product/legal decision
requires PEP screening.** No PEP provider or PEP result is currently present.

No Stripe Identity behavior is described as sanctions or PEP monitoring.

## AML Monitoring

**Classification: PRODUCT-RULE NEEDED.**

Slice has durable authoritative signals (deposits, withdrawals, settlement,
ownership/trading domains, reversals, and failed provider attempts) and now
exposes provider-neutral `ComplianceRiskEvent` and screening ports. It does not
run a fake suspicious-activity algorithm, assign suspicious labels from
invented thresholds, or claim ongoing AML monitoring.

## Fraud

**Classification: PRODUCT-RULE NEEDED.**

Current deterministic safeguards include authentication, recent-auth checks,
2FA/CAPTCHA where configured, idempotency, provider environment separation,
reservation locking, provider failure handling, configured withdrawal limits,
and manual holds. These are engineering controls, not a complete fraud-risk
evaluation or fraud decision service.

## Age / Jurisdiction

**Age classification: NOT CURRENTLY REQUIRED/DEFINED.** The repository does
not define an age rule in this product flow; no age threshold was invented.

**Jurisdiction classification: NOT CURRENTLY REQUIRED/DEFINED.** The
repository does not define a jurisdiction allow/deny policy; no country or
state eligibility rule was invented.

If either becomes a product or legal requirement, it needs an explicit policy,
data source, and backend gate before activation.

## Manual Review

Slice already has a generic backend `ComplianceHold` authority with scopes for
funding, withdrawal, trading eligibility, external movement, and account. An
active hold blocks configured sensitive actions; releasing the hold restores
normal policy evaluation without silently changing identity or provider state.

Phase 4E hardening:

- admin hold creation is source-attributed as `ADMIN`;
- admin hold release is now durably audited;
- provider-created movement holds are source-attributed as `PROVIDER` and
  audited;
- repeated provider hold processing does not create another active hold;
- admin projections distinguish identity, risk review, and Connect readiness;
- Discord is not an authority and has no compliance mutation path.

Manual review states are `CLEAR`, `REVIEW_REQUIRED` (active hold), and the
existing configured movement/case states. No hold is interpreted as AML
clearance.

## Provider-Neutral Interfaces

Phase 4E adds declarations for:

- `SanctionsScreeningProvider`;
- `RiskScreeningProvider`;
- `ComplianceRiskEventSink`;
- `ComplianceRiskEvent`, with non-suspicious internal events for movement,
  settlement, ownership, provider failure, and reversal signals.

They are not wired to a vendor and do not make outbound calls. They provide a
stable future boundary without coupling Slice domain code to Stripe, Plaid, or
another SDK.

## What Is Implemented

- Stripe sandbox/live mode separation and fail-closed configuration.
- Signed webhook verification, replay inbox, event environment checks, and
  provider-neutral dispatch.
- Stripe Identity hosted verification session and safe Slice state mapping.
- Financial Connections ownership projection and pending-settlement payments.
- Connect onboarding/readiness projection and payout movement mapping.
- Slice-owned movement, reservation, ledger, reversal, return, deficit, and
  reconciliation authority.
- Idempotent movement creation and provider-object operations.
- Configured withdrawal per-movement, 24-hour, and 7-day windows.
- Per-user transactional serialization around withdrawal velocity reads.
- Generic backend manual holds with scoped action blocking and durable audits.
- Provider-neutral future risk/sanctions interfaces and internal signal types.
- Separate admin projections for identity, risk review, and payout readiness.

## What Is Not Implemented

- Customer sanctions screening.
- PEP screening.
- Adverse-media screening.
- Ongoing customer monitoring.
- A complete AML transaction-monitoring algorithm.
- A complete fraud-risk score or account-risk model.
- Predictive ACH return scoring.
- Defined age or jurisdiction policy.
- Automatic identity re-verification policy.
- Device fingerprint or device-risk scoring.
- A complete payout-fraud program.
- Credentialed Stripe sandbox E2E, webhook delivery, or live verification.

## Legal/Product Decisions Required

- Whether Slice needs customer sanctions and PEP screening, and at which
  lifecycle points.
- Whether adverse media, ongoing monitoring, transaction monitoring, or
  suspicious-activity escalation is a product requirement.
- Whether Slice needs age and jurisdiction eligibility rules, including scope
  and source of truth.
- Whether identity must be re-verified after a product-defined event or age of
  a prior verification.
- Whether payout-risk controls need additional product-defined rules.
- Whether the current UK/GBP product can use the Stripe US ACH / Financial
  Connections arrangement or needs a different provider capability.

No legal conclusion is made here. These decisions require the appropriate
product and legal owners.

## Recommended Future Provider Needs

Only if the decisions above define a requirement, evaluate a provider capable
of the specific need: customer sanctions/PEP screening, adverse media,
monitoring, ACH return risk, fraud signals, or device risk. Evaluate it behind
the provider-neutral ports and retain Slice's authority for eligibility,
holds, ledger state, and settlement. Do not infer broad coverage from Stripe
Identity or Connect.

## Tests

Completed locally in this workspace:

- server typecheck;
- frontend typecheck;
- existing Stripe Identity, provider boundary, webhook, hold, wallet,
  reservation, settlement, reversal, and reconciliation suites;
- full server and frontend suites;
- Prisma validation/generation;
- production server and frontend builds;
- provider mode/livemode safety and no-credential fail-closed checks.

Credentialed Stripe sandbox tests remain blocked because no Stripe sandbox
secret, publishable key, webhook secret, disposable Identity flow, test bank,
or Connect recipient was supplied.

## Release Decision

**PHASE 4E: COMPLETE LOCALLY / NOT RELEASE-READY.**

The audit and narrow hardening work are complete without claiming regulatory
compliance or integrating another vendor. Stripe sandbox E2E, the GBP/US ACH
product decision, and the Phase 4B/4C/4D credentialed validation blockers mean
the code must not be deployed as an activated real-money Stripe release from
this task.

**READY FOR 4F: NO.**

Phase 4F should begin only after the owners resolve the required product/legal
decisions and the remaining credentialed sandbox release gates.
