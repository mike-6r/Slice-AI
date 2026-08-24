# Slice Investor Withdrawals + Current Fee System QA

## Scope

This pass generalizes GBP withdrawals from Collector-only access to any verified
USER with eligible settled cash and a ready user-owned Stripe Connect payout
destination. It does not change controlled Umbreon, Initial Offering, ownership,
market, or treasury economics.

## Withdrawal root cause

Three independent Collector assumptions caused the defect:

1. `AccountCapabilityService` rejected every non-Collector in Stripe modes with
   `COLLECTOR_PAYOUTS_REQUIRED` before checking payout readiness.
2. `StripeConnectPayoutService.status()` and onboarding repeated the Collector
   role check, even though `ExternalConnectAccount` is already unique by
   provider, environment, and `userId`.
3. `WalletMovementService` selected `CASH_AVAILABLE` for an investor, reserved
   it correctly, and then rejected the provider path unless the selected
   account was `COLLECTOR_PROCEEDS_AVAILABLE`.

The ledger and reservation primitives were already user-owned and already kept
`CASH_AVAILABLE` and `COLLECTOR_PROCEEDS_AVAILABLE` as separate accounts.

## User-level withdrawal authority

The withdrawal authority is now:

- active account;
- verified email, phone, and MFA;
- approved identity/compliance with no relevant hold;
- withdrawals feature enabled;
- in provider mode, a ready reusable user-level payout account;
- backend-calculated posted GBP cash in `CASH_AVAILABLE` or
  `COLLECTOR_PROCEEDS_AVAILABLE`, after active reservations.

Collector role is not consulted. Collector proceeds remain in their own
financial account. A mixed-role user can withdraw from either eligible source;
the movement records the exact source account and no transfer between accounts
is performed.

If provider setup is complete but no eligible posted balance exists, the exact
capability reason is `NO_WITHDRAWABLE_BALANCE`, shown to customers as “No funds
available to withdraw.”

## Withdrawable balance projection

`FinancialLedgerService.walletForUser()` now returns:

- `withdrawableMinor`;
- `withdrawableSources` for the two eligible account codes;
- existing total, reserved, order-reserved, withdrawal-reserved, pending deposit,
  and pending withdrawal fields.

The value is derived from posted account authority minus active reservations.
Pending deposits have no posted ledger balance and therefore cannot increase it.
Open buy-order reservations, pending withdrawals, and held/restricted movement
funds are excluded by the existing reservation/compliance authorities. The
frontend consumes this projection and does not recompute a withdrawal amount.

## Stripe payout architecture

Stripe Connect remains the external payout rail in Stripe Sandbox and live
fail-closed modes. `ExternalConnectAccount` remains unique per
`provider + environment + userId`; onboarding/status/payout operations now
reuse that same account for investors, collectors, and mixed-role users. No
second Investor/Collector Connect account is created.

The existing idempotency keys, `MoneyMovement`, `CashReservation`, ConnectPayout
mapping, provider state transitions, webhook handling, and reversal/hold
behavior are preserved. Provider failure does not silently consume customer
cash; the existing movement failure/hold paths remain authoritative.

## Current runtime fee policy

Audited authorities:

| Action | Runtime policy |
| --- | --- |
| Secondary-market maker | `0 bps` / `0%` |
| Secondary-market taker | `100 bps` / `1%` |
| Initial Offering | `0 bps` / `0%`, separate `INITIAL_OFFERING_ZERO_FEE_V1` policy |
| Deposit Slice product fee | none (`0 bps`) |
| Withdrawal Slice product fee | none (`0 bps`) |

Secondary markets are provisioned from `tradingPolicy` with
`INITIAL_POLICY_V1`, and settlement selects the fee from the actual maker/taker
order priority. Initial Offering settlement uses its own fee policy. Provider
operating charges are not added to the customer movement amount by Slice.

The balanced settlement journal credits `TRADING_FEE_REVENUE` for secondary
trading fees and `INITIAL_OFFERING_FEE_REVENUE` for Initial Offering fees. It
does not mix revenue with customer cash or Collector proceeds.

## Maker/taker disclosure

The backend order preview now checks current opposing liquidity and returns an
estimated `feeRole` (`MAKER` or `TAKER`) and estimated fee. A preview is clearly
labelled as an estimate because a limit order can partially cross and then
rest. The final execution projection returns backend-authoritative `grossMinor`,
`feeMinor`, and `netMinor`; the Orders execution table displays Gross, Fee, and
Net/Total after settlement.

The current policy is disclosed from the read-only backend `/fees` projection;
wallet, withdrawal/deposit disclosures, and order entry do not duplicate fee
values as frontend policy constants.

For a £100 execution:

- resting SELL + crossing BUY: seller maker fee £0, buyer taker fee £1,
  buyer total £101, seller proceeds £100, revenue £1;
- resting BUY + crossing SELL: buyer maker fee £0, seller taker fee £1,
  buyer debit £100, seller net £99, revenue £1.

Integer minor-unit rounding remains in the existing `feeMinor()` authority.

## Account Center and Wallet UI

The Account Center and blocked modal now show exact payout, identity, provider,
feature, and zero-balance blockers. Collector-only withdrawal wording has been
removed from active user-facing paths. Wallet shows backend-projected
withdrawable cash, reserved cash, pending deposits, pending withdrawals, and
the payout readiness state for every authenticated user. Movement forms retrieve
the current backend fee policy before disclosing the Slice movement fee.

## Automated QA

Focused backend coverage verifies:

- user withdrawal allowed without Collector role when payout setup is ready;
- payout setup status available to a USER role;
- payout setup required when not ready;
- zero withdrawable balance has an exact blocker;
- current movement/Initial Offering/secondary fee policy values;
- existing maker/taker integer fee policy tests.

Focused frontend coverage verifies the finance adapter preserves authoritative
cash fields, wallet rendering, order rendering, and fee-aware contracts.

Validation completed before release:

- Prisma validate and generate: PASS. Local migration status could not connect
  because no local PostgreSQL service was running; staging migration status is
  verified during deployment.
- Backend typecheck, build, and full tests: PASS (72 suites, 307 tests).
- Frontend typecheck, full tests, and production client/SSR build: PASS (39
  files, 143 tests).
- Changed-file ESLint: PASS. Repository-wide lint remains blocked by the
  pre-existing Prettier backlog outside this change.

## Staging QA

Staging deployment and read-only health verification are performed after the
commit. No controlled Umbreon or Initial Offering state should be mutated for
this task. A real Stripe Sandbox investor payout should be marked BLOCKED, not
passed, if the disposable fixture lacks an approved Connect account or Stripe
cannot produce the provider state transition/webhook needed for final payout.

Deployment verification for this pass:

- Git commit: `984457f75b6fb89db4c8eb75f3a621b360c97559`.
- Active release: `/opt/slice/releases/984457f75b6fb89db4c8eb75f3a621b360c97559`.
- `slice-api`, `slice-web`, and `slice-discord-worker`: active.
- `/health`: PASS; `/ready`: PASS with PostgreSQL and Redis up.
- Prisma deployment: PASS; no pending migrations.
- Public staging `/api/v1/fees`: PASS and returned the policy above.
- Public staging `/`: HTTP 200.
- No controlled asset, offering, ownership, order, trade, or treasury state
  was mutated during deployment or verification.

## Remaining launch blockers

- A disposable, non-Collector Stripe Sandbox investor fixture must complete
  payout onboarding before a real staging payout can be tested.
- Provider webhook delivery and final payout state require Stripe Sandbox
  configuration; no fake success is acceptable.
- Repository-wide lint remains blocked by pre-existing formatting errors unless
  the project elects to perform a separate formatting-only cleanup.
