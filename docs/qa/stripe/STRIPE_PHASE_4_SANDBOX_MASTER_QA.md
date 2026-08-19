# Stripe Phase 4 Sandbox Master QA

Run status: **BLOCKED BEFORE EXECUTION**  
Run date: 2026-08-19  
Scope: controlled Stripe sandbox launch rehearsal only

## Entry Gate

The launch rehearsal was not started because both mandatory preconditions are
unsatisfied:

1. Credentialed sandbox is not operational. The last read-only staging audit
   found `PROVIDER_MODE=local` and no `STRIPE_SECRET_KEY`,
   `STRIPE_PUBLISHABLE_KEY`, or `STRIPE_WEBHOOK_SECRET` in the protected VPS
   environment.
2. Funding/currency architecture is not resolved. The authoritative decision
   document records **PRODUCT DECISION REQUIRED** for UK/GBP-first,
   US/USD-first, or multi-currency launch intent.

The handoff requires stopping when either condition is false. No QA users,
Stripe objects, webhooks, deposits, withdrawals, ownership records, orders,
trades, payouts, or ledger entries were created.

## Full E2E Result

**NOT RUN — blocked at entry gate.** No static mocks or manually forced provider
states were used.

## Identity Result

**NOT RUN.** No Stripe sandbox VerificationSession, hosted flow, webhook, or
ComplianceCase mutation was created.

## Bank Linking Result

**NOT RUN.** No Financial Connections Session, bank selection, external account
projection, default-account mutation, disconnect, or reconnect was attempted.

The current implementation remains US-bank oriented (`US` Financial Connections
filter and `us_bank_account`) while Slice financial authority is GBP-only. It
must not be activated before the currency/funding decision is approved.

## Deposit Result

**NOT RUN.** No controlled deposit movement or Stripe PaymentIntent was created.

## Settlement Result

**NOT RUN.** No provider webhook, pending-to-settled transition, journal post,
or available-cash credit occurred.

## Ownership Regression

**NOT RUN because no controlled purchase/trade fixture was started.** Protected
Umbreon, Charizard, Initial Offering, ownership, balances, orders, executions,
and journals were not touched.

## Connect Result

**NOT RUN.** No connected account, onboarding link, requirements projection, or
readiness transition was created. The existing implementation targets GB/GBP
Connect, but no credentialed capability was verified.

## Withdrawal/Payout Result

**NOT RUN.** No withdrawal movement, cash reservation, transfer, payout,
webhook, final journal, or reconciliation record was created.

## Failure Matrix

All controlled failure cases were **NOT RUN** because the entry gate failed:

| Case | Result |
| --- | --- |
| Identity failure/retry | NOT RUN |
| Bank-link cancellation | NOT RUN |
| Deposit failure | NOT RUN |
| Deposit return/reversal | NOT RUN |
| Duplicate webhook | NOT RUN |
| Out-of-order webhook | NOT RUN |
| Connect action required | NOT RUN |
| Payout failure | NOT RUN |
| Concurrent withdrawal | NOT RUN |
| Sandbox/live mismatch | NOT RUN; live mode remained disabled |

## Reconciliation

**NOT RUN for external operations.** There are no controlled Stripe operations
to compare. The existing reconciliation design remains Slice-authoritative and
requires comparison of operation ID, Stripe object/event, currency, amount,
journal, reservation, and final state before release.

## Ledger Invariant Proof

No runtime E2E proof was generated because no external operation ran. The
following safety facts remain true from the current implementation audit:

- finance money and journals are GBP-only integer minor units;
- provider completion is required before available cash is credited;
- journal completion and webhook handling use existing idempotency boundaries;
- reservations are Slice-owned and are not replaced by provider balance;
- reversals are append-only and intended to occur exactly once;
- the provider balance is not treated as Slice cash.

These code-level properties do not substitute for credentialed sandbox proof.

## LOCAL_TEST Regression

**Not rerun in this blocked rehearsal.** Previous local implementation evidence
recorded in `docs/qa/stripe/STRIPE_CREDENTIALED_SANDBOX_STAGING_QA.md` remains:

- server: 63 suites / 256 tests passed;
- frontend: 38 files / 131 tests passed;
- typechecks, Prisma validation/generation, builds, and scoped lint passed.

The release gate still requires a complete deterministic regression after the
currency/funding decision and clean provider release are prepared.

## Security

- No secrets were printed, copied, or added to source control.
- Live Stripe mode was not enabled.
- No raw bank, identity, or provider payload was created or exposed.
- No static frontend data was substituted for real API state.
- No real financial, ownership, marketplace, or collectible state changed.

## Staging Health

Last read-only staging audit:

- `slice-api.service`: active
- `slice-web.service`: active
- API `/health`: HTTP 200
- API `/ready`: HTTP 200
- SSR web process: HTTP 200
- Active provider mode: `local`
- Active release: `/opt/slice/releases/20260818-dd2c7cb`

The staging site was not redeployed or restarted by this rehearsal.

## Remaining Technical Blockers

1. Supply sandbox test secret, publishable key, and webhook secret through the
   deployment-managed secret channel.
2. Resolve and record the funding/currency architecture decision.
3. Select a funding rail whose provider settlement currency exactly matches
   Slice's approved ledger currency; the current US Financial Connections path
   is not proven compatible with the GBP ledger.
4. Prepare a clean provider-only release and verify the single existing HTTPS
   webhook route before any controlled mutation.
5. Confirm disposable Identity, bank, Connect, payout, and failure test
   fixtures before running the full journey.

## TECHNICALLY READY FOR LIVE CONFIG

**NO.** Sandbox credentials and the funding/currency decision are missing. Live
mode remains explicitly disabled.

## PRODUCT READY

**NO.** The funding geography and currency architecture are unresolved.

## LEGAL/COMPLIANCE READY

**REVIEW REQUIRED.** The repository's compliance gap analysis does not claim
complete sanctions, AML, fraud, age, jurisdiction, or investment compliance.
Product/legal owners must resolve those requirements before any live-money
decision.

## Release Decision

**DO NOT RUN / DO NOT ENABLE LIVE.** Resume only after credentialed sandbox is
operational and the funding/currency architecture decision is formally
resolved.
