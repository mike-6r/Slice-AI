# Slice Initial Financial Launch Policy — Activation QA

Date: 2026-08-25  
Application commit: `045f863`  
Staging release: `/opt/slice/releases/20260825-045f863`

## Decision

The owner-approved conservative initial policy is active in staging only.
Production was not modified and must be configured independently with the same
approved values or fail closed.

Approved GBP policy:

| Authority | Value |
| --- | ---: |
| `BACS_INTERNAL_TRADE_HOLD_DAYS` | `7` |
| `BACS_DEPOSIT_MAX_MINOR` | `500000` (£5,000) |
| `BACS_DEPOSIT_DAILY_LIMIT_MINOR` | `500000` (£5,000) |
| `BACS_DEPOSIT_ROLLING_7D_LIMIT_MINOR` | `1000000` (£10,000) |
| `BACS_DEPOSIT_DAILY_COUNT_LIMIT` | `2` |
| `BACS_DEPOSIT_RAPID_WINDOW_SECONDS` | `3600` |
| `BACS_DEPOSIT_RAPID_COUNT_LIMIT` | `1` |

The Bacs release boundary is exactly `providerAvailableOn + 7 days`.
Missing or malformed policy configuration fails closed; it does not disable
the hold or invent a fallback.

## Implemented controls

- Finance/admin projections expose the active hold authority, all six limits,
  recent per-user limit utilization, held/manual-review/returned deposits,
  release evidence, deficits/recovery, payout liquidity, and mandatory
  finance-email backlog.
- Wallet clearing now carries the authoritative expected release timestamp.
- Deposit boundaries are pure, testable policy decisions: £5,000 is allowed,
  one penny above is blocked, and daily/rolling/count/rapid boundaries are
  explicit.
- Manual deficit adjustment is dual-control only:
  `DRAFT → PENDING_APPROVAL → APPROVED → APPLIED` or `REJECTED`.
  It requires Finance permission, recent authentication, an immutable reason,
  idempotency, a different approver, a balanced `ADMIN_CORRECTION` journal,
  before/after projections, and audit events. There is no direct balance patch
  and no Discord approval path.
- Sale proceeds are not automatically appropriated. Buyer ownership,
  Collector proceeds, and completed execution state are not silently unwound.

## Validation

| Check | Result |
| --- | --- |
| Prisma format / validate / generate | PASS |
| Backend typecheck | PASS |
| Backend lint | PASS |
| Backend production build | PASS |
| Backend full suite | PASS — 77 suites / 342 tests |
| Focused launch-policy tests | PASS — 3 tests covering the approved boundary matrix |
| Frontend typecheck | PASS |
| Frontend full suite | PASS — 39 files / 155 tests |
| Frontend production client + SSR build | PASS |
| Migration deploy | PASS — 96 migrations, schema up to date |

## Staging verification

- `/opt/slice/current` and `/opt/slice/app` both resolve to
  `/opt/slice/releases/20260825-0f63b7e`.
- `slice-api.service` and `slice-web.service`: active.
- `/health`: HTTP 200.
- `/ready`: HTTP 200.
- Public site: HTTP 200.
- Unauthenticated adjustments queue: HTTP 401, confirming the Finance guard.
- No financial/provider workflow was invoked. No deposit, withdrawal, order,
  trade, payout, ownership, deficit, or adjustment record was created by this
  activation. The only database change was the empty dual-control workflow
  table and its indexes.
- Umbreon and Charizard were not touched.

## Release gate

`SLICE INITIAL FINANCIAL LAUNCH POLICY — ACTIVATED`

The policy is activated for staging. `READY FOR FULL STRIPE E2E: NO` for this
task because no Stripe money lifecycle was run here, and production provider
liquidity, production email monitoring, and independent production
configuration still require their own controlled release gate.
