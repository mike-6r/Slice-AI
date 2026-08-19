# Stripe Credentialed Sandbox Staging QA

Run date: 2026-08-19

## Environment

- Staging origin: `https://staging.slicecollectable.com`
- VPS: `51.38.81.9`
- Active release: `/opt/slice/releases/20260818-dd2c7cb`
- `slice-api.service`: active
- `slice-web.service`: active
- API health/readiness: HTTP 200
- SSR web process: HTTP 200
- PostgreSQL and Redis were not restarted or modified.

## Credential Mode

**BLOCKED.** The protected VPS environment is `PROVIDER_MODE=local`. The
required `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, and
`STRIPE_WEBHOOK_SECRET` variables are absent. `STRIPE_LIVE_ENABLED` is not
configured and live mode was not enabled. No secret values were printed.

The local implementation accepts `stripe_sandbox`, enforces `sk_test_` and
`pk_test_` prefixes, and keeps live mode fail-closed. The staging environment
was not changed because activating a provider mode without credentials would
only create an unavailable service, not a valid sandbox.

## Deployment

**NOT DEPLOYED.** The VPS release predates the local Stripe implementation and
contains no Stripe SDK, Stripe service files, or Stripe migrations. The local
worktree is mixed with unrelated uncommitted Discord and frontend changes, so
it was not used as a release artifact. No marketplace, homepage, asset-card,
catalogue, or other static/frontend work was deployed by this task.

## Webhook

The existing externally reachable URL is:

`https://staging.slicecollectable.com/api/v1/providers/STRIPE_SANDBOX/webhooks`

Apache routes `/api/` to the existing API, and the current controller is
`POST /providers/:provider/webhooks`. The implementation preserves raw request
bytes, verifies Stripe signatures, and persists through the existing
`WebhookInbox`. No second webhook endpoint was created. Registration,
signature verification, and delivery were **NOT RUN** because the staging
Stripe secret and webhook secret are missing.

The event contract found in the current implementation is limited to:

- `payment_intent.processing`
- `payment_intent.requires_action`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `account.updated`
- `payout.paid`
- `payout.failed`
- `payout.canceled`
- Stripe Identity `identity.verification_session.*` events used by the
  current handler

## Financial Connections

**NOT RUN.** No Stripe Customer, Financial Connections Session, test
institution, or connected bank projection was created. The real frontend flow
remains API-backed, but staging is still local-provider mode. The existing
GBP-ledger versus US `us_bank_account`/Financial Connections product decision
also remains open.

## Deposit Success

**NOT RUN.** No QA deposit, PaymentIntent, provider webhook, settlement, or
journal entry was created.

## Deposit Failure

**NOT RUN.** No failure PaymentIntent or provider failure webhook was created;
therefore no available cash or failure-state mutation occurred.

## Duplicate Webhook

**NOT RUN.** No Stripe event was delivered or replayed. The existing
`WebhookInbox` remains the intended deduplication boundary.

## Identity

**NOT RUN.** No Stripe Identity VerificationSession, hosted test flow, or
identity webhook was created. No `VERIFIED` state was inserted or projected.

## Connect

**NOT RUN.** No controlled Collector Connect account or hosted onboarding link
was created. No readiness state was changed.

## Payout

**NOT RUN.** No withdrawal reservation, transfer, payout, payout webhook, or
financial journal was created. The GBP/UK Connect test-recipient requirement
remains a release blocker.

## LOCAL_TEST Regression

PASS on the current local implementation:

- Server: 63 suites, 256 tests
- Frontend: 38 files, 131 tests
- Server and frontend typechecks: PASS
- Prisma validate/generate: PASS
- Server build: PASS
- Frontend production build: PASS
- Stripe-related server lint: PASS
- Stripe-related touched frontend lint: PASS after a formatting-only fix in
  `src/repositories/http-repositories.ts`

No external provider call was made during these checks.

## Security

- No secrets were displayed or copied into source control.
- No live Stripe key or live provider mode was enabled.
- No database reset, manual financial-state update, or staging business
  mutation was performed.
- No Umbreon, Charizard, Initial Offering, ownership, balance, order, trade,
  or journal state was touched.
- No static marketplace data or frontend redesign was deployed.

## Blockers

1. Supply sandbox `sk_test_`, `pk_test_`, and `whsec_` values through the
   deployment-managed secret channel.
2. Configure staging `PROVIDER_MODE=stripe_sandbox` and
   `STRIPE_LIVE_ENABLED=false`, then deploy a clean Stripe-only release that
   includes the required migrations.
3. Register the single existing HTTPS webhook URL with only the current event
   set and verify raw-body signature handling and WebhookInbox persistence.
4. Resolve the GBP ledger versus US ACH/Financial Connections product decision.
5. Provide disposable Stripe Identity sandbox configuration and a valid UK
   Connect test recipient before payout execution.

## Release Decision

**NOT READY / DO NOT RELEASE.** Credentialed Stripe sandbox staging QA could
not begin because the VPS has no Stripe credentials and remains on the local
provider release. The implementation is locally test-green, but the
credentialed provider gate and currency/product decision are outstanding.

**READY FOR CURRENCY DECISION PHASE: NO**
