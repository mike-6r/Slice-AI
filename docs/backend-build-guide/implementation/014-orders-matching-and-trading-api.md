# 014 — Orders, matching and trading API

## 1. Document metadata

> **Completion override (2026-08-08):** Document 014 is COMPLETE. Document 015 is NEXT / NOT STARTED. The historical planning metadata below predates implementation and is retained as context only.

Phase 5; **NOT STARTED**; critical risk; requires 005 and 012–013. Supports `/buy/$id`, `/sell/$id`, asset order book/recent trades and portfolio trade actions. Affects orders, matching, execution and atomic settlement. Extra-large; not parallel-safe with ownership/finance.

## 2. Project-specific context

Frontend buy/sell pages simulate percent/amount, agreement, price and completion; asset detail fabricates orders/trades; trading repository exposes previews/create/cancel/list. Real trading must reserve ownership/cash and atomically settle both ledgers. This document replaces 007’s honest empty order-book/trade placeholders; it cannot proceed without proven 012/013 invariants.

## 3. Current implementation audit

No server Order/Execution/matcher exists. Frontend uses decimal prices and percentages; backend must use integer pence and units. Do not copy fabricated investor names. Existing control plane provides actor/idempotency/rate/audit; ledgers provide reservation/settlement ports. Missing order states/types/TIF, engine sequence, price-time priority, partial fills, self-trade prevention, locks, atomic settlement and races.

## 4. Files to read

Read buy/sell/asset/portfolio routes, trading/ownership/portfolio domain types, repositories/services/hooks/mocks, market contracts; all ownership/finance modules/tests and access; Prisma; 012–013; API/entity/business/workflow/state guides.

## 5. Strict scope

Implement LIMIT buy/sell orders, GTC and IOC time-in-force, previews, cash/unit reservation, cancel/expire, deterministic price-time matching, partial fills, self-trade prevention, executions, atomic dual-ledger settlement, order book/recent trades/my orders, idempotency/audit/outbox and complete race/rollback tests.

## 6. Out of scope

No market/stop/margin/short orders, dark pools, auction, external exchange, fiat provider, KYC decision engine (016), frontend integration, or approximate settlement.

## 7. Dependencies and preconditions

Require ACTIVE account, published/tradable/unfrozen supply, GBP finance ledger and compliance gate interface. Legal/product must approve fee schedule, tick size, lot size, market hours, cancellation and self-trade policy. Initial: whole ownership units; GBP integer pence; asset-configured `tickSizeMinor >=1`; GTC/IOC only; maker price determines execution. If approvals/ledgers are incomplete, stop.

## 8. Database specification

`TradingMarket(assetId PK,status OPEN|HALTED|CLOSED,tickSizeMinor,lotSizeUnits,feeScheduleVersion,nextPrioritySequence,version,timestamps)`; `Order(id,userId,assetId,side BUY|SELL,type LIMIT,timeInForce GTC|IOC,status PENDING_RESERVATION|OPEN|PARTIALLY_FILLED|FILLED|CANCEL_PENDING|CANCELLED|EXPIRED|REJECTED,limitPriceMinor,originalUnits,remainingUnits,filledUnits,averageFillPriceMinor?,prioritySequence?,cashReservationId?,ownershipReservationId?,idempotencyRecordId,expiresAt?,version,createdAt,openedAt?,closedAt?)`; `Execution(id,assetId,buyOrderId,sellOrderId,makerOrderId,takerOrderId,priceMinor,units,grossMinor,buyerFeeMinor,sellerFeeMinor,marketSequence,settlementStatus PENDING|SETTLED|FAILED,correlationId unique,executedAt,settledAt?)`; `OrderStatusHistory` append-only; optional `MatchAttempt` operational. Checks quantities/equations/status; indexes active book `(assetId,side,status,price,prioritySequence)`, user/time, execution market sequence; unique market sequence. FKs restrict. Migration `orders_matching_execution`; permanent executions/history, orders retained per law.

## 9. Domain types and ports

`OrderId`, `ExecutionId`, `PriceMinor`, `OrderUnits`, `OrderSide/Type/TIF/Status`, `OrderPreview`, `OrderBookLevel`, `TradePrint`. `OrderRepository.create`, `findForUpdate`, `assignPriority`, `findBestOppositeForUpdate(asset,side,limit)` with SKIP LOCKED policy documented, `updateFill`, `cancel`, `listBook/My`; `ExecutionRepository.append/list`; `MarketRepository.lock/nextSequence`; `OwnershipSettlementPort.reserve/release/consume`; `FinancialSettlementPort.reserve/release/consumeAndPostTrade`; `TradingUnitOfWork`, fee/compliance/clock/audit/idempotency/outbox ports.

## 10. Domain rules and invariants

Order equations: original >0; `remaining + filled == original`; status consistent; limit divisible by tick and units by lot. BUY reserves worst-case `limit*units + maximum buy fee`; SELL reserves units. OPEN only after reservation succeeds. Price-time priority: best BUY highest price then lowest priority; SELL lowest then lowest priority. Cross when buy >= sell; execution price is older maker limit. Fill units=min remaining. No self-trade: configured `CANCEL_TAKER` initially, audited; do not silently transfer between same beneficial owner.

Each execution atomically: lock market, both orders in deterministic ID order, ownership positions/reservation, financial accounts/reservation following global lock order; revalidate status/remaining/reservations/compliance; compute checked integer gross/fees; consume seller units to buyer; consume buyer cash and post seller proceeds/fees; create/update FIFO lots; append execution/status/audit/outbox; update both orders. Any failure rolls all back. Partial fills retain exact remaining reservations; release excess buyer price/fee reserve after fills and all remainder at terminal state. IOC matches immediately then cancels remainder. GTC persists until fill/cancel/expiry. Cancel vs match has one winner under row lock. Engine replay cannot duplicate execution/correlation/market sequence.

## 11. Application services

- `PreviewOrder`: validates market/tick/lot, computes gross/max fees/reservation/available and warnings; no reservation/guarantee.
- `PlaceOrder`: actor/compliance/status validation, idempotency, create pending, reserve cash/units, open+priority in one transaction, then invoke bounded matcher; failure releases/rolls back.
- `MatchMarket(assetId,maxExecutions)`: service identity; repeatedly locks best crossing pair, applies self-trade, settles, commits each or bounded batch with invariant; stops on no cross/limit/halt.
- `CancelOrder`: self/admin, lock, mark cancel/release remainder atomically; filled returns prior terminal result.
- `ExpireOrders`: same semantics idempotently.
- Read services aggregate book levels (not identities), recent settled trades and self orders.
- `HaltMarket`: privileged, stops new/matching; does not silently cancel unless separate action.

## 12. API specification

- `POST /v1/trading/orders/preview` auth `{assetId,side,type:"LIMIT",timeInForce,units,limitPriceMinor}` → 200 calculations/status.
- `POST /v1/trading/orders` same plus acknowledgement/version → 201 order; idempotency required; strict user/asset velocity; audit/events.
- `DELETE /v1/trading/orders/:id` self → 200 terminal/current order; idempotency.
- `GET /v1/trading/orders?status&assetId&cursor&limit` self.
- `GET /v1/market/assets/:slug/order-book?depth` public aggregated bid/ask levels with asOf/marketSequence/status; supersedes 007 placeholder.
- `GET /v1/market/assets/:slug/recent-trades?cursor&limit` public settled price/units/time, no user identities; supersedes 007.
- Admin `POST /v1/admin/trading/markets/:assetId/halt|resume` and restricted order cancellation.
  Responses serialize money/units as strings; max page 100/depth 50. 201 may return PARTIALLY_FILLED/FILLED due synchronous bounded match.

## 13. Error catalogue

`MARKET_NOT_OPEN` 409; `ASSET_NOT_TRADABLE` 409; `INVALID_TICK_SIZE`/`INVALID_LOT_SIZE` 422; `INVALID_ORDER_QUANTITY/PRICE` 422; `INSUFFICIENT_FUNDS/OWNERSHIP` 409; `ORDER_NOT_FOUND` 404; `ORDER_NOT_CANCELLABLE` 409; `ORDER_VERSION_CONFLICT` 409; `SELF_TRADE_PREVENTED` safe result/reason; `COMPLIANCE_REQUIRED` 403; `SETTLEMENT_CONFLICT` 409 retryable; `SETTLEMENT_INVARIANT_VIOLATION` 500 halt/alert; `MATCHER_BUSY` 503 retryable. Never reveal counterpart identity/balance/reservation.

## 14. Authorization and security

Only actor places/cancels own orders; service identity matches; admin halt/cancel needs scope/recent auth/audit. Account ACTIVE and compliance gate checked at placement and immediately before settlement. Client cannot set fees, priority, status, execution price, accounts or actor. Abuse controls: per-user/IP/asset order and cancel velocity, max open orders/notional, search/page caps. No insider/admin self-preferencing; priority allocated transactionally.

## 15. Audit and idempotency

Audit place/open/reject/cancel/expire/self-trade/halt/resume/execution/settlement failure with safe IDs, side, units, prices, fee version, sequences/result; no counterpart PII/account balances. Place/cancel keys actor+operation scoped and fingerprint exact normalized request. Preview has no key. Unique order idempotency and execution correlation/market sequence prevent duplicate settlement. Replay returns current/original resource, never reruns match solely due HTTP retry.

## 16. Events, realtime and jobs

Outbox `trading.order.opened/updated/closed.v1`, `trading.execution.settled.v1`, `trading.book.changed.v1`, `portfolio.changed.v1`, `market.halted.v1`; safe payload IDs, units/prices strings, sequence/version. 017 dispatches WebSocket/SSE and expiry/matcher retry jobs. Consumers discard duplicate/event version and invalidate order/book/trade/asset/portfolio/wallet queries. Dead-letter settlement anomalies halt market and alert; never auto-compensate with guessed entries.

## 17. Frontend alignment

Maps TradingRepository preview/create/cancel/list, buy/sell forms, asset order book/recent trades and portfolio actions. Percent/amount inputs must be converted to exact units by future frontend adapter, with backend result authoritative. Show pending/open/partial/filled/cancelled/rejected, insufficient, halt and compliance states. No frontend change here.

## 18. Implementation file plan

Create `server/src/modules/trading/{domain,application,persistence,http}` matcher/settlement/orchestration/tests; Prisma migration and market read replacement. Modify ownership/finance only through existing ports or narrowly extend them with tested atomic transaction-context methods. Preserve providers/frontend.

## 19. Numbered implementation process

1. Approve market/tick/lot/TIF/fee/self-trade policy.
2. Implement exact order math/state machine/fee calculation.
3. Add reviewed migration/indexes/checks.
4. Implement repositories, market priority and book selection locks.
5. Implement preview and reserve/open transaction.
6. Implement one-execution matcher with global lock order and atomic dual-ledger settlement.
7. Add partial fills, reservation rebasing, IOC and cancel/expiry races.
8. Add reads/admin controls/audit/idempotency/outbox rows.
9. Add full unit/property/PostgreSQL concurrency/rollback/E2E/load matrix.
10. Manually reconcile ownership+finance after trades; update state.

## 20. Test plan

Unit/property: state transitions, tick/lot/overflow, fee rounding, maker pricing, priority, partial fills, IOC remainder, self-trade and order equations. PostgreSQL: priority allocation race; two takers one maker; cancel-vs-match; expire-vs-match; buy overspend race; sell double-reserve; partial reservation rebasing; idempotent replay; duplicate matcher workers; deadlock retry; injected failure after ownership/before finance and vice versa proves total rollback; execution/ledger correlations and all ownership/finance invariants after every randomized sequence. E2E all APIs/permissions/rates/halt/private fields; load test book consistency. No fake ledgers.

## 21. Manual QA

In disposable DEMO environment fund two users and issue/transfer units, place noncrossing orders, inspect book, cross with partial/IOC, cancel remainder, attempt self-trade/overbuy/oversell/concurrent cancel, inspect executions/my orders/recent trades/portfolio/wallet. Run ownership and finance reconciliation with zero discrepancy and verify audits/outbox. Reset test DB only.

## 22. Verification commands

Server Prisma commands, lint, unit/property, real integration/concurrency/load scripts added by this document, E2E and build. Run both 012 and 013 reconciliation suites after trading tests. Root typecheck/build contract regression.

## 23. Documentation and state updates

Update all state/control/API/entity/business/workflow/feature/baseline docs. Transfer authoritative order-book/recent-trade endpoint ownership from 007 placeholder to 014. Record production gate on 016.

## 24. Completion checklist

- [ ] Limit/GTC/IOC/tick/lot/order-state rules are exact.
- [ ] BUY cash and SELL units reserve before OPEN.
- [ ] Price-time priority and maker price are deterministic.
- [ ] Partial fills conserve original units and rebase reservations exactly.
- [ ] Cancel/expire/match races have one valid terminal outcome.
- [ ] Self-trade prevention follows approved policy.
- [ ] Each execution settles ownership, cash, fees and lots atomically.
- [ ] Replay/duplicate workers cannot double-execute or settle.
- [ ] Book/trade APIs expose no identities and use settled data only.
- [ ] Ownership and finance reconciliations pass after randomized/concurrent tests.
- [ ] Real DB rollback/E2E/load tests pass.
- [ ] No provider/frontend integration was implemented.

## 25. Final report format

Report all 17 standard items including matching/settlement race evidence and next document `015`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

## Document 014 completion evidence (2026-08-08)

- Migrations through `20260808034500_trading_execution_fee_constraints` are applied to local `slice_test` (**18** total). The final fee constraint permits only non-negative persisted maker/taker minor-unit fees while preserving exact gross equations.
- Configurable per-market policy enforces 1-minor-unit tick/lot, £1 minimum notional, `OPEN|HALTED|CLOSED`, `REJECT_TAKER`, and bounded maker `0` / taker `100` bps fees. BUY orders reserve worst-case gross plus taker fee. Maker-price fills rebalance reserves, post an internally balanced GBP journal, credit platform fee revenue, and allocate seller fees across FIFO disposals without floating-point arithmetic.
- Focused trading PostgreSQL proof passed **17/17**. Full backend verification passed **94** unit, **60** real PostgreSQL/Redis integration and **61** HTTP E2E tests, alongside typecheck, lint, build and Prisma format/validate/generate/migrate status.
- Concurrent reserve, sell reserve, matcher, cancellation and price-time cases assert durable authority state. Injected reservation/order/execution/cancellation/expiry failures roll back order, reservation, ownership, cash, FIFO, execution, audit and idempotency state coherently.
- `src/scripts/manual-trading-qa.ts` passed against real local PostgreSQL/Redis with funding, issued seller units, GTC maker-price match/replay, 100-bps taker fee, insufficient-funds rejection, cancellation/release and safe reads. Scoped cleanup counts were zero for orders, executions, cash reservations, lots, financial accounts, journal transactions, ownership accounts/positions, users and assets.
- No distributions, external provider, wallet, bank, crypto, KYC/KYT or other Document 015 scope was implemented.
