# Slice Monetization Full QA

Status: implementation and automated validation in progress; staging sandbox
verification is required after deployment.

## Expected policy

- Deposit: 0% Slice fee.
- Secondary maker: 0%.
- Secondary taker: 0%.
- Withdrawal: 2.5% of gross customer withdrawal.
- New Collector Initial Offering: 5% of successfully sold offering proceeds.

## Automated checks

| Area | Coverage |
| --- | --- |
| Policy authority | `/api/v1/fees`, 250 bps withdrawal, 500 bps Initial Offering, 0/0 trading |
| Rounding | £1, £10, £99.99, £100, and £1,000 integer-minor-unit cases |
| Withdrawal model | gross reservation/debit, £25 fee on £1,000, £975 provider amount |
| Initial Offering | new 5% policy and persisted historical zero-fee policy |
| Trading | new policy uses 0/0; execution fee fields remain append-only history |
| Provider expenses | pending evidence, actual balance transaction, one record/one posting |
| Revenue | three dedicated revenue accounts and customer/company separation |
| Settlement | recent auth, idempotency, dual approval, self-approval rejection, no fake payout |
| Reconciliation | provider cost pending/missing journal observations; no auto-repair |

## Staging-only browser/API checks

Use Stripe Sandbox only. Do not mutate controlled Umbreon, Charizard, or any
other controlled economic fixture.

1. Read `/api/v1/fees` and verify the policy above.
2. Use a disposable verified USER for a deposit when a sandbox Bacs flow is
   available. Verify the wallet receives the full approved deposit amount and
   any provider cost is separate/pending until Stripe exposes evidence.
3. Use a disposable USER with a configured payout destination. For a £1,000
   gross withdrawal verify the wallet reservation is £1,000, payout amount is
   £975, `WITHDRAWAL_FEE_REVENUE` is £25, and provider expense remains separate.
4. Create a disposable new Initial Offering only if the staging fixture is
   explicitly safe. Verify £10,000 gross → £9,500 Collector proceeds + £500
   Initial Offering revenue; do not touch the controlled offering.
5. Create a disposable 0/0 secondary execution only if approved staging
   liquidity exists. Verify no trading fee revenue and balanced settlement.
6. Read Admin Finance. Verify customer cash and Collector proceeds are labelled
   separately from Slice revenue; provider evidence says pending when unknown,
   never a guessed £0; settlement status is `NOT_CONFIGURED` unless a real
   business destination is configured.
7. Replay the same signed provider event and verify no duplicate cost record or
   expense journal.
8. Run bounded provider and global reconciliation. Verify discrepancies are
   reported without automatic repair.

## Historical safety assertions

- Existing `TradingExecution.buyerFeeMinor` and `sellerFeeMinor` are unchanged.
- Existing Initial Offering rows retain their stored policy/version and fee.
- No customer cash, Collector proceeds, external clearing, orders, or trades are
  created by this implementation itself.
- No live Stripe mode is enabled.

## Deployment gate

Before declaring release readiness, run Prisma format/validate/generate/status,
backend typecheck/tests/integration/HTTP E2E, frontend typecheck/tests/build/SSR
build/lint, then deploy the same release to API, web, and worker. Verify
`/opt/slice/current`, `/opt/slice/app`, health, readiness, and the public fee
projection. The final status is GO only when sandbox-safe QA and all release
gates pass; otherwise it is NO-GO with the exact blocker recorded here.
