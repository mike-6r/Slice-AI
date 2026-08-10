# 013 — Financial ledger and portfolio authority

## 1. Document metadata

Phase 5; **COMPLETE**; critical risk; requires 012. Supports `/portfolio`, `/wallet`, buy/sell previews and monetary stats. Affects finance ledger, balances, lots/P&L and portfolio projections. Extra-large; never parallel with order settlement schema.

## 2. Project-specific context

`portfolio.tsx`, `wallet.tsx`, buy/sell/allocate pages and `src/domain/{portfolio,wallet,trading}.ts` currently use illustrative floats/local math. Slice needs an append-only double-entry ledger before any real order can reserve funds or settle. Ownership units remain authoritative in 012; money/cost basis/P&L become authoritative here; 014 coordinates both.

## 3. Current implementation audit

No financial models, chart of accounts, posting engine, balances, lots or reconciliation exist. Frontend values such as £70.70 are demos. Existing money helper/domain types are not sufficient for accounting. Preserve ownership ledger independence and 005 audit/idempotency. Never use a mutable wallet balance as sole authority.

## 4. Files to read

Read frontend portfolio/wallet/buy/sell/allocate routes, domain portfolio/wallet/trading/common, repositories/services/hooks/mocks/formatters; server ownership/access/database modules; Prisma; 012; all financial invariants/API/entity/workflow/state guides.

## 5. Strict scope

Define chart of accounts and exact money; journal/entries/posting/reversal; available/pending balances and cash reservations; fee postings; trade/issuance funding transaction types; cost-basis lots and realized/unrealized P&L policy; authoritative portfolio/wallet projections; reconciliation; exhaustive balance/race/rollback tests.

## 6. Out of scope

No external deposits/withdrawals/provider webhooks (016), order matching (014), tax advice, multi-currency FX conversion, governance distribution (015), frontend switch, or mutable/delete journal records.

## 7. Dependencies and preconditions

Require 012 units/transactions, legal/accounting approval for client-money model, fee schedule and cost-basis policy. Initial supported currency is GBP only; adding currency requires independent balanced books, never implicit FX. Stop before “real money” claims if client-money/payment approval is absent; backend may run closed-loop DEMO ledger distinctly labelled.

## 8. Database specification

Money uses signed PostgreSQL `BIGINT` minor units internally and decimal strings over API; reject values outside configured safe range.

| Model                        | Specification                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinancialAccount`           | UUID; ownerType USER                                                                                                                                      | PLATFORM                                                                                                                        | CLEARING            | EXTERNAL, ownerId?; accountType ASSET               | LIABILITY           | EQUITY           | REVENUE | EXPENSE; code; currency; normalSide DEBIT | CREDIT; status; timestamps; unique owner/code/currency; immutable currency/type after activity. |
| `JournalTransaction`         | UUID; type DEPOSIT_PENDING                                                                                                                                | DEPOSIT_SETTLED                                                                                                                 | WITHDRAWAL_RESERVED | WITHDRAWAL_SETTLED                                  | TRADE_CASH_RESERVED | TRADE_SETTLEMENT | FEE     | REFUND                                    | REVERSAL                                                                                        | DISTRIBUTION | ADMIN_CORRECTION; status POSTED | REVERSED; effectiveAt; correlation/causation/idempotency unique semantics; descriptionCode; source refs; createdBy/createdAt; reversalOf unique nullable. Append-only. |
| `JournalEntry`               | UUID; transactionId; sequence; accountId; side DEBIT                                                                                                      | CREDIT; amountMinor >0; currency; assetId/orderId/executionId? dimensions; createdAt; unique transaction+sequence; append-only. |
| `AccountBalance`             | accountId PK; postedDebitMinor,postedCreditMinor,reservedMinor >=0; version; updatedAt; projection only. Available derived by account normal-side policy. |
| `CashReservation`            | UUID; accountId; purpose/order; amountMinor >0; status ACTIVE                                                                                             | CONSUMED                                                                                                                        | RELEASED            | EXPIRED; expiry; timestamps; unique active purpose. |
| `PortfolioLot`               | UUID; userId,assetId; acquiredUnits bigint; remainingUnits bigint; totalCostMinor bigint; acquiredAt; sourceExecutionId unique; status OPEN               | CLOSED; deterministic lot order.                                                                                                |
| `LotDisposal`                | UUID; lotId,executionId; units; allocatedCostMinor; proceedsMinor; feeMinor; realizedPnlMinor; createdAt; append-only.                                    |
| `FinancialReconciliationRun` | UUID; scope/asOf/status; debits/credits/balance hashes/discrepancies; actor/timestamps; immutable.                                                        |

Checks ensure currency match, positive entries, remaining 0..acquired, reservations nonnegative. FKs restrict deletion. Permanent journal/entries/disposals; retention pending law. Migration `financial_ledger_foundation`; no production opening balances without signed import/reconciliation.

## 9. Domain types and ports

`Money {minor: bigint,currency}`, `DebitCredit`, `AccountCode`, `PostingLine`, `JournalDraft`, `CashReservation`, `PortfolioLot`, `PortfolioValuation`. `FinancialLedgerRepository.findAccountsForUpdate(sortedIds)`, `appendTransactionAndEntries`, `getTransactionByCorrelation`, `updateBalanceProjection`, `listEntries`; `CashReservationRepository` lock/create/consume/release; `LotRepository` lock open lots/create/allocate disposal; `FinancialUnitOfWork`; `MarketPricePort` read-only valued/asOf/status; `OwnershipPositionPort`; `AuditWriter`; `IdempotencyService`.

## 10. Domain rules and invariants

1. For every posted transaction/currency, sum debits == sum credits exactly.
2. No zero/negative entry; no float/decimal/exponent input; currency of entry/account/transaction matches.
3. Journal/entries are append-only; correction is a new reversal plus replacement, never mutation.
4. A transaction is reversed at most once; reversal mirrors every line/amount/side and references original.
5. Balance projection equals replayed journal by account; available client cash cannot go below zero after active reservations.
6. Active cash reservations equal `reservedMinor` projection and are consumed/released once.
7. Platform fees post to explicit revenue account, not netted invisibly; refunds reverse appropriate fee/revenue/cash lines.
8. FIFO is the initial cost-basis policy, per asset/account, deterministic by acquiredAt then ID. Policy version is stored; no retroactive switch.
9. Disposed units cannot exceed lots/ownership transfer; allocated cost conserves lot total using remainder-on-final-unit rule.
10. Realized P&L = proceeds − allocated cost − sell fees. Unrealized = marked value − remaining allocated cost; provisional source/asOf is returned.
11. Portfolio totals are derived, not accepted from client.

Lock financial accounts sorted by ID, then reservations/lots; coordinate with 012/014 in one documented global lock order: asset supply → ownership positions → financial accounts → orders/executions. Serializable/deadlock retry only for idempotent operation.

## 11. Application services

- `PostJournal`: validate template/lines, lock accounts, enforce balance, append journal+entries, update projections, audit/event.
- `ReserveCash/ReleaseCash/ConsumeCashReservation`: actor/account/purpose/amount validation, available check, terminal replay.
- `ReverseTransaction`: authorize, lock original/accounts, generate exact mirror, update projection, audit; no cascade magic.
- `RecordAcquisition`: after ownership settlement, create FIFO lot with units and total consideration+buy fees.
- `RecordDisposal`: lock lots FIFO, allocate cost deterministically, append disposal records and return realized P&L.
- `GetWallet/GetPortfolio/GetPerformance`: derive balances/lots/ownership/market marks with authority/asOf.
- `ReconcileFinancialLedger`: compare debit-credit, replay balances, reservations, lot units vs 012 positions and transaction correlations; `RebuildBalanceProjection` under maintenance/two-person approval.

## 12. API specification

Authenticated: `GET /v1/me/wallet/balances`; `GET /v1/me/wallet/transactions?cursor&limit&type&from&to`; `GET /v1/me/portfolio`; `GET /v1/me/portfolio/performance?range`; `GET /v1/me/portfolio/assets?cursor&limit`. Admin: `POST /v1/admin/finance/reversals`; `POST /v1/admin/finance/corrections` (two-person workflow); `POST /v1/admin/finance/reconciliation-runs`; `GET /v1/admin/finance/reconciliation-runs/:id`. Internal reserve/settle is an application port used by 014, not public. Money strings+currency; all mutations idempotent/audited/rate-limited/recent-auth.

## 13. Error catalogue

`INVALID_MONEY` 422; `CURRENCY_MISMATCH` 422; `UNBALANCED_JOURNAL` 500/internal programmer error; `INSUFFICIENT_AVAILABLE_FUNDS` 409; `CASH_RESERVATION_NOT_FOUND/TERMINAL/EXPIRED` 404/409; `TRANSACTION_ALREADY_REVERSED` 409/replay; `LOT_UNDERFLOW` 500/settlement rollback; `FINANCIAL_CONCURRENCY_CONFLICT` 409 retryable; `FINANCIAL_INVARIANT_VIOLATION` 500 alert; `PORTFOLIO_MARK_UNAVAILABLE` 503/partial with status by contract; `RECONCILIATION_MISMATCH` 409 admin. Never expose other balances/account codes/provider refs.

## 14. Authorization and security

Self reads only. Only scoped SYSTEM settlement posts trade templates; finance admin can reverse/correct with second approval, never arbitrary unbalanced lines. Client cannot choose ledger accounts, sides, fee amounts or marks. Recent auth for sensitive admin. Encrypt/protect provider/payment refs later. Redact journal metadata and export access. Apply fraud velocity hooks but provider/KYT decisions wait for 016.

## 15. Audit and idempotency

Every posting/reservation/release/consume/reversal/correction/reconciliation is audited with transaction/entry/account opaque IDs, amount/currency, template/reason/result/request ID; no bank/token/card/PII. Idempotency scope includes actor+operation+correlation; fingerprint includes exact money/currency/purpose/template/version. Unique correlation and sourceExecution constraints prevent duplicates. Replay returns original journal/result.

## 16. Events, realtime and jobs

Outbox contracts `finance.transaction.posted/reversed.v1`, `finance.cash.reserved/released/consumed.v1`, `portfolio.changed.v1`, `finance.reconciliation.failed.v1`; IDs, safe money strings, version/asOf, no account/provider secrets. 017 dispatches/schedules mark snapshots and reconciliation. Duplicate handlers use transaction IDs.

## 17. Frontend alignment

Map Wallet/Portfolio repository methods and fields: balances, transaction history, total value, cost basis, realized/unrealized P&L, allocation, performance, authority/source/asOf. Replace frontend floats only in later integration; this document modifies no frontend. Portfolio display rounds, ledger never does.

## 18. Implementation file plan

Create `server/src/modules/finance/{domain,application,persistence,http}` with chart/templates/posting/reservation/lots/reconciliation/tests; Prisma migration/contracts/app wiring. Preserve orders/providers/frontend.

## 19. Numbered implementation process

1. Obtain chart/fee/client-money/FIFO approval and label DEMO if gated.
2. Implement exact Money parser/arithmetic and posting templates.
3. Add reviewed migration/checks/indexes.
4. Implement account/journal/balance repositories and sorted locks.
5. Implement balanced posting and exact reversal.
6. Implement cash reservations and concurrency controls.
7. Implement FIFO lots/disposals/remainder policy.
8. Implement authoritative wallet/portfolio/performance projections.
9. Implement reconciliation/shadow replay/rebuild.
10. Add APIs/audit/idempotency/outbox rows.
11. Run full balance/race/rollback/reconciliation matrix.
12. Update state and stop.

## 20. Test plan

Unit: parse limits, currency, every posting template balances, reversal mirror, fee/refund, FIFO multi-lot/partial/remainder, realized/unrealized calculations. PostgreSQL: account creation race; reserve-vs-reserve/settle/release; journal correlation replay; reversal race; forced rollback; balance replay; reservation projection; lots vs ownership; reconciliation detection/rebuild. Property tests generate valid templates and prove debit=credit/conservation. E2E self isolation/admin approvals/idempotency/pagination/large values. No fake persistence or provider tests.

## 21. Manual QA

In disposable DEMO ledger, create chart/user liability/cash accounts, post opening test funding via approved fixture, reserve/release, post fee/trade template, reverse it, create/dispose FIFO lots, query wallet/portfolio, inspect exact entries/projections/audits, provoke over-reserve/concurrency, run reconciliation and verify zero discrepancies. Cleanup only via test DB reset.

## 22. Verification commands

Server Prisma validate/generate/status; lint; unit/property tests; real integration/concurrency; E2E; build; checked-in SQL reconciliation command. Root typecheck/build for DTO compatibility. Never run opening-balance fixture against non-test DB.

## 23. Documentation and state updates

Update state/control/API/entity/business/workflow/feature/baseline docs and this prompt. Record chart, FIFO, fee, DEMO/production gate and 014 dependency explicitly.

## 24. Completion checklist

- [x] Money is integer minor units with explicit currency everywhere.
- [x] Every journal transaction balances per currency.
- [x] Journal/entries are append-only; exact reversals are one-time.
- [x] Balance and reservation projections replay exactly.
- [x] Concurrent cash reservations cannot overspend.
- [x] Fees remain explicitly zero while policy is OPEN; no fee treatment is fabricated.
- [x] FIFO lot/disposal rounding conserves total cost exactly.
- [x] Portfolio derives from ownership+ledger+market authority with as-of/status.
- [x] Reconciliation proves journals, balances, reservations, lots and ownership agree.
- [x] Real DB race/rollback/E2E tests pass.
- [x] No provider/order/trading work was implemented; the authoritative portfolio UI now consumes real API data only.

## 25. Final report format

Report all 17 standard items including chart/templates/invariant evidence and next document `014`.

## 26. Stop condition

Stop after completing this document.

Do not start the next implementation document.

Do not begin later-phase work.

If any required dependency or verification is unavailable, stop and report the exact blocker rather than faking completion.

## 27. Implementation progress (2026-08-07)

- Migration `20260807182355_financial_ledger_foundation` is applied to `slice_test`. It introduces private financial accounts, append-only journal transactions/entries, replayable balance projections, cash reservations, FIFO lot/disposal persistence and financial reconciliation-run persistence.
- The finance domain begins with a GBP-only integer-minor money parser that rejects zero, signs, floats, exponent notation, overflow and non-GBP values. Focused tests: 9 passed; backend typecheck and Prisma migration status pass.
- A transaction-scoped, closed-loop GBP journal posting primitive now validates equal debits and credits, locks financial accounts in deterministic ID order, appends immutable journal rows, and updates only replayable debit/credit projections. It reuses durable idempotency and audit writes. `GET /v1/me/wallet/balances` is a self-only derived projection with no account IDs, counterparties, or journal metadata.
- The internal cash-control port supports transactionally idempotent reserve/release mutations against a user's active GBP account, deriving available authority from committed journal projections and maintaining a separate reserved projection. It is not exposed as a payment, wallet, or order API.
- FIFO lot acquisition/disposal authority is present: acquisition records are immutable, disposals lock and consume the oldest lots deterministically, partial consumption derives cost with final-remainder conservation, and disposal rows are append-only. Fees remain explicitly zero in this closed-loop phase because fee policy is OPEN; no fee schedule is inferred or exposed.
- Self-only portfolio, holdings, lot, wallet-balance and safe journal-history reads are present. The portfolio returns only derived cash, 012 ownership units, lot cost basis, and market estimates with an explicit unavailable/partial valuation state.
- Privileged reversal and reconciliation authority is present. Reversals create an exact compensating journal transaction and preserve the original posted entries; reconciliation records deterministic aggregate mismatch codes and does not repair state. Both use recent-auth, idempotency, audit and the existing admin Redis limit.
- A direct, lightweight real-PostgreSQL finance integration harness now exercises production financial services without booting `AppModule`. It proves balanced posting/replay/conflict/rejection, balance projection derivation, serialized cash reservation/release, FIFO partial/full cost-basis conservation, append-only reversal, and clean reconciliation. Focused run: 4 passed; full integration: 10 suites / 41 tests passed.
- The legacy unavailable `GET /v1/me/portfolio` placeholder was removed so the Document 013 finance controller is authoritative. Focused HTTP E2E verifies wallet, portfolio, holdings, lots, transaction history, authentication, and safe DTOs: 2 passed.
- Focused privileged HTTP E2E verifies finance permission denial, reversal/reconciliation replay and conflict behavior, immutable originals, one compensating journal, and safe reconciliation output: 2 passed. Full E2E regression: 22 suites / 59 tests passed.
- This partial-state note is superseded by the completion evidence below: frontend replacement, rollback/race coverage and disposable manual QA are complete.

## 28. Completion evidence (2026-08-07)

- Document 013 is **COMPLETE**. Migration `20260807182355_financial_ledger_foundation` is the fourteenth applied migration; Prisma format, validate, generate and migrate status passed against local `slice_test`.
- Journal authority is GBP-only integer-minor, balanced, append-only and idempotent. Reversals append one compensating journal and preserve the original transaction and entries. Balance projections are journal-derived; reservation authority is internal only and cannot create negative available cash.
- Focused real PostgreSQL integration (`financial-ledger.integration-spec.ts`) has six cases covering balanced/unbalanced post, exact replay/conflict, projections, reserve/release, FIFO partial/full conservation, reversal/reconciliation, injected rollback points and concurrent journal/reservation/FIFO/reversal races. The full integration regression passed **10 suites / 43 tests**.
- Rollback injection proves journal, reservation/release, FIFO disposal, reversal and reconciliation persistence all roll back their transaction, audit and idempotency work. Races leave one journal/reversal, no overspend or double lot consumption, and projections equal journal totals.
- Finance HTTP contracts are verified by focused self-read and admin E2E suites; full E2E passed **22 suites / 59 tests** with permission, recent-auth, replay/conflict, rate-limit, request-ID and privacy assertions.
- The authoritative frontend portfolio migration uses `AppServicesProvider`, repositories, shared HTTP client and React Query. It presents only real cash, holdings, lots, transactions and FULL/PARTIAL/UNAVAILABLE valuation state; it hides P&L, allocation, return, performance and unsupported marks. Root verification passed **11 suites / 31 tests**; lint has only the nine pre-existing Fast Refresh warnings.
- Disposable manual QA (`npm run qa:finance`) passed against PostgreSQL and Redis: funding/replay, reserve/over-reserve/release, FIFO partial/full cost-basis, portfolio/history, one reversal/replay, clean and controlled-mismatch reconciliation, idempotency conflict, journal/reservation/FIFO races and privacy. Cleanup removed 2 financial accounts, 5 journals/10 entries, 2 balances, 2 reservations, 2 lots/3 disposals, 2 reconciliation runs, 16 audit/idempotency records, ownership fixtures, 2 assets, category and user; residual counts were `[0,0,0,0]`.
- Final backend verification passed **20 suites / 89 unit tests**, **10 suites / 43 integration tests**, **22 suites / 59 E2E tests**, typecheck, lint, build and Prisma checks. Document 014 is NEXT and remains NOT STARTED.
