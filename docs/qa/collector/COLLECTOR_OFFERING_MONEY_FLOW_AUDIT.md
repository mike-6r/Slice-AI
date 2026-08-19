# How Slice works today

## Scope and conclusion

This is a read-only architecture and domain audit. It did not change staging or production state, create orders or executions, call PriceCharting/Ximilar/provider APIs, add migrations, deploy, or touch Umbreon or Charizard.

The short version:

- A collector owns the submission record, not issued ownership units.
- Approval, valuation, custody, publication, supply policy, issuance, and trading are separate backend authorities.
- Issuance currently creates all units in a per-asset `TREASURY` ownership account.
- There is no collector-selected offer percentage, retained ownership, initial-offering inventory, beneficial-owner field, or collector-proceeds account.
- The existing D14-style matcher and atomic settlement path works for Treasury or customer sellers, but treats an initial Treasury sale as ordinary trading.
- Treasury sale proceeds currently land in the platform clearing liability `STAGING_DEMO_TREASURY_PROCEEDS`; they do not go to the originating collector.
- D13 has the accounting primitives needed for the intended model, but only partially: the missing economic roles and initial-offering routing must be added before real collector proceeds are enabled.

## How the current flow works

### Collector submission and review

The authenticated collector creates an `AssetSubmission` through `SubmissionService.create` in `server/src/modules/submissions/application/submission.service.ts`. The row records `ownerUserId`, identity fields, declared metadata, evidence, market research, and status.

`SubmissionService.decide` changes the submission to `APPROVED`, `CHANGES_REQUESTED`, or `REJECTED`, creates a `VerificationReview`, and emits customer-safe outbox events. Approval does not create ownership, cash, a market, or a sale entitlement.

The customer surface is `src/routes/collector-workspace.tsx`, backed by `server/src/modules/collector-workspace/collector-workspace.service.ts`. It covers identity, evidence, research, custody/intake progress, and published-market views. It has no offering configuration.

### Asset binding, valuation, custody, and publication

An approved submission is explicitly linked to an `Asset` by `SubmissionService.linkApprovedAsset`. Staff-controlled lifecycle code keeps these decisions separate:

- Valuation: `ValuationEvidence` and `ValuationDecision`.
- Custody: `VaultCustodyRecord` and `CustodyEvent`.
- Publication: `AssetPublication`.
- Lifecycle projection: `server/src/modules/market-lifecycle/domain/market-lifecycle.ts` and `server/src/modules/lifecycle/application/lifecycle.service.ts`.

External market research is supporting reference data. `SubmissionMarketResearch`, `SubmissionMarketObservation`, `MarketProviderMapping`, `MarketObservation`, and `MarketRefreshService` do not represent Slice ownership or an initial sale.

### Supply policy and issuance

The admin issuance surface is `src/components/admin/AdminCollectibleDetail.tsx`, backed by admin and ownership services. The admin chooses or confirms a total unit count and records a reason. The policy stores:

- `proposedUnits`
- authoritative `valuationMinor` and currency
- integer `pricePerUnitMinor`
- `remainderMinor`
- approval and issuance status

The UI calls the remainder “retained,” but this is an unallocated currency remainder from integer price division. It is not collector-retained ownership.

The first authoritative issuance mutation is `OwnershipService.issue` in `server/src/modules/ownership/application/ownership.service.ts`:

1. Lock the asset and verify published/custody/insurance/readiness requirements.
2. Require an approved `OwnershipSupplyPolicy`.
3. Create an `OwnershipAccount` with `type = TREASURY`.
4. Create `OwnershipAssetSupply` with `issuedUnits = totalUnits`.
5. Create one `OwnershipPosition` holding all units for that Treasury account.
6. Append one `OwnershipLedgerEntry` with `entryType = ISSUANCE` and `creditAccountId = treasury.id`.

The Prisma model comment is explicit: initial issuance creates a private system treasury only; no user allocation or public investor identity is created by that surface. Issuance creates no financial journal, cash balance, market order, or settlement record.

### Treasury liquidity and market opening

The admin ownership view calculates Treasury inventory and listings in `server/src/modules/admin/admin.service.ts`. The staff operation is `TradingService.placeTreasuryListing` in `server/src/modules/trading/application/trading.service.ts`, exposed by `server/src/modules/trading/http/trading.controller.ts`.

That operation requires full issuance, an open market, the issued Slice price, and a reason. It reserves units from Treasury, creates a `TradingOrder` with `principalType = TREASURY` and `userId = null`, records an audit event, and invokes the existing matcher. There is no `InitialOffering` record or initial-sale flag.

## What is wrong or unclear

### Ownership authority

Immediately after issuance, the Treasury ownership account is the materialized owner of all units. The originating collector is not assigned a position, retained remainder, or beneficial-owner relationship. The submission still points to the collector, but that is submission provenance, not ownership authority.

The current model therefore cannot truthfully express “offer 60%, retain 40%.” The only retained number in the issuance UI is a currency remainder.

### Initial sale proceeds

When an investor buys a unit from Treasury, `TradingService.settleExecution` transfers ownership from Treasury to the buyer and calls `settleCash`. For a Treasury seller, `settlementSellerCashAccount` resolves:

`FinancialAccount(ownerType = PLATFORM, accountType = LIABILITY, code = STAGING_DEMO_TREASURY_PROCEEDS)`.

No originating collector account is involved. The balance is not Slice fee revenue, but it is also not a collector-proceeds account. Without a later authorized sweep, the current model has no economic path from that balance to the collector.

### Secondary market distinction

`TradingOrder` and `TradingExecution` do not distinguish initial offering from secondary market. Both are matched by the same order book and use the same fee and settlement fields. The matcher should not be rewritten; the missing boundary is inventory/proceeds role around it.

### Terminology

Admin and finance surfaces intentionally show terms such as `Slice Treasury`, `Treasury inventory`, and `System treasury`. Public surfaces generally show availability rather than Treasury, but do not explain initial offering versus secondary listing. The phrase “retained remainder” is especially risky because it can be read as collector ownership when it means price rounding.

## Umbreon evidence preserved for this audit

The controlled Umbreon run’s preserved state is approximately:

- issued supply: 1,000 units;
- Treasury settled units: 999 after the existing one-unit execution;
- Treasury reserved units: 9;
- Treasury available units: 990;
- existing execution: 1 unit at £1.64;
- investor settled units: 1;
- remaining inventory is still sourced from the Treasury position.

No new order, execution, provider call, or state mutation was made for this audit. The issuance and settlement code above is the authoritative explanation of how that state was produced.

## Fee audit

| Fee or revenue line | Status | Evidence |
|---|---|---|
| Secondary buyer fee | IMPLEMENTED | `TradingService.settleExecution`; `TradingMarket` maker/taker bps. Defaults are maker 0 bps and taker 100 bps in `trading-policy.ts`. |
| Secondary seller fee | IMPLEMENTED | Same settlement path; seller fee uses the opposite maker/taker role. |
| Slice trading fee revenue | IMPLEMENTED for current trading | Platform account `TRADING_FEE_REVENUE` receives buyer plus seller fees. |
| Initial-offering fee | NOT IMPLEMENTED | No offering entity, channel, collector beneficiary, or initial-sale fee template. |
| Collector-proceeds fee | NOT IMPLEMENTED | No collector proceeds account or initial-sale sweep. |
| Withdrawal fee | NOT IMPLEMENTED as a product fee | Withdrawal limits, reservations, compliance, and provider states exist; no Slice withdrawal-fee calculation found. |
| Membership fee | PARTIAL | Collector plan prices exist in `collector-entitlements.ts`, but billing actions intentionally return `BILLING_CONFIGURATION_REQUIRED` when no provider is configured. |
| Provider fee | NOT IMPLEMENTED | Provider adapters exist, but no provider-fee journal or fee schedule is modeled. |
| Community distribution fee | SEPARATE FEATURE | `DISTRIBUTION_FEE_BPS` belongs to community distributions, not collector offerings. |

Do not copy secondary trading bps into the initial offering until product, accounting, and policy owners approve a separate schedule.

## D13 money movement

D13 centers on `FinancialAccount`, `JournalTransaction`, `JournalEntry`, `AccountBalance`, and `CashReservation` in `server/prisma/schema.prisma`, with posting and projections in `server/src/modules/finance/application/financial-ledger.service.ts`.

Current roles:

- Customer cash: USER-owned accounts such as `CASH_AVAILABLE`; available equals posted authority less `reservedMinor`.
- Pending cash: `MoneyMovement.status = PENDING_PROVIDER` plus reservation state, not a dedicated offering account.
- Platform revenue: PLATFORM/REVENUE/`TRADING_FEE_REVENUE`.
- Treasury proceeds: PLATFORM/LIABILITY/`STAGING_DEMO_TREASURY_PROCEEDS`.
- External clearing: CLEARING/ASSET/`EXTERNAL_GBP_CLEARING`.
- Suspense: no dedicated collector-offering suspense authority found.
- Withdrawals: `MoneyMovement`, `CashReservation`, provider confirmation, and external-clearing journals.

Trading settlement directly writes a balanced `TRADE_SETTLEMENT` journal inside the atomic execution transaction: buyer cash is debited by gross plus buyer fee; seller cash is credited by gross less seller fee; platform fee revenue is credited by total fee. Ownership, cash, FIFO lots, execution, audit, and outbox are atomic.

**D13 can support the intended model: PARTIAL.** Balanced journals, customer cash, reservations, platform revenue, clearing, and provider movement state exist. Collector beneficiary/proceeds accounts and initial-offering settlement templates do not.

## Current versus intended

| Area | Current behavior | Intended behavior | Gap / risk | Priority |
|---|---|---|---|---|
| Collector offering % | Not captured | Collector chooses percentage | Economic intent cannot be enforced | P1 |
| Retained ownership | Not captured | Collector retains unsold units | Treasury appears to own everything | P1 |
| Treasury | Owns all issued units technically | Technical inventory/clearing only | Platform can be mistaken for owner | P0 |
| Initial proceeds | Platform Treasury liability | Collector net proceeds | Wrong economic recipient | P0 |
| Slice fees | Secondary trading only | Explicit approved initial and secondary policies | Initial fee unclear | P1 |
| Secondary trades | Atomic matcher works | Continue unchanged | Needs channel metadata only | P1 |
| Seller identity | Treasury or customer principal | Initial offering vs secondary seller | Customer meaning is unclear | P2 |
| Ledger | Customer/platform/clearing roles exist | Collector proceeds separated from revenue | Missing proceeds role | P0 |
| Withdrawals | Provider-gated movement workflow | Collector withdraws settled proceeds | No proceeds source | P0 |
| Provider settlement | Guarded Bridge/Plaid abstractions | Provider-authoritative payout | Offering payout integration missing | P0 |
| UI terminology | Treasury is internal/admin; public lacks offering distinction | Explain offering and secondary market | Misleading understanding | P2 |

## Required changes by priority

### P0 — accounting and security correctness

- Add immutable originator/beneficiary provenance.
- Prevent initial-offering inventory from being treated as Slice economic property by default.
- Add balanced, idempotent initial-sale cash settlement: buyer, collector proceeds, and Slice fee lines.
- Keep provider-confirmed cash authoritative for withdrawals.
- Preserve ownership supply, reservation, atomicity, and frontend-authority invariants.

### P1 — economic model correctness

- Add approved offering terms: offered percentage/units, retained percentage/units, price, currency, and fee-schedule version.
- Add separate initial-offering inventory/account.
- Allocate retained units to the collector only under approved policy.
- Add initial-offering lifecycle and reporting fields without changing the secondary matcher core.

### P2 — UX and clarity

- After valuation approval, show 25%, 50%, 75%, 100%, and Custom.
- Show value, total units, offered/retained units, starting price, estimated gross proceeds, estimated fees, and estimated net proceeds.
- Label public supply as Initial offering or Secondary market.
- Rename currency “retained remainder” to avoid implying collector ownership.

### P3 — optional improvement

- Add analytics, payout history, expiry tooling, and future redemption/corporate-action surfaces only after policy review.

## Minimal architecture proposal

Recommend a narrow initial-offering boundary around D14:

1. Add an `InitialOffering` authority linked to Asset, originating collector, approved supply policy, and fee-schedule version.
2. Store offered and retained units as immutable approved terms.
3. Add a distinct `INITIAL_OFFERING` inventory/account type or equivalent `InitialOfferingInventory` record; it must not be the `TREASURY` account.
4. On approved issuance, create the offering position for offered units and the collector position for retained units in one idempotent ownership transaction, if policy permits retention at issuance.
5. Reuse matching, reservations, execution, and atomic settlement. Add offering reference/channel and route cash by seller inventory type.
6. On initial fill, transfer offering units to buyer, debit buyer cash, credit collector proceeds payable with net proceeds, and credit Slice fee revenue.
7. Leave user-to-user secondary settlement and FIFO accounting unchanged.
8. Expose collector proceeds for withdrawal only after posted, reconciled journal state and provider/compliance controls.

## Treasury decision

| Option | Clarity | D14 compatibility | Risk | Assessment |
|---|---|---|---|---|
| A. Treasury technical holder; collector beneficial origin | Medium | High | Beneficiary can be omitted or mislabeled | Good interim compatibility, fragile long term |
| B. Collector owns all units and sells directly | High | Medium | Changes seller permissions and assumptions | Semantically direct, larger change |
| C. Separate InitialOfferingInventory from Treasury | High | High | One new explicit authority and routing branch | **Recommended** |

**Recommend C.** Treasury remains for explicit platform-owned liquidity and operational clearing. Collector-originated initial inventory has its own account/entity, mandatory beneficiary, offering id, and collector payout route.

## Proposed collector experience and states

After valuation approval:

1. “How much would you like to offer?” — 25%, 50%, 75%, 100%, Custom.
2. Whole value, total units, offered %, offered units, retained %, retained units.
3. Starting price per Slice, estimated gross proceeds, estimated Slice fees, estimated net proceeds.
4. Plain-language confirmation that Slice does not purchase the physical collectible and that retained/unsold ownership follows the approved terms.

Recommended states:

`DRAFT → AWAITING_APPROVAL → APPROVED → OPEN → PARTIALLY_FILLED → SOLD_OUT`

Operator/terminal states: `PAUSED`, `CANCELLED`, `EXPIRED`. Do not use SOLD_OUT for a market that never opened.

## Money-flow examples

These are design examples only. No journal was created.

### £500 provider-confirmed deposit

Create a provider movement intent; after verified confirmation, debit external clearing £500 and credit customer `CASH_AVAILABLE` £500. Available balance is posted balance less reservations.

### £100 initial-offering purchase

For approved total fee `Y` and collector net `X`: debit buyer cash £100; credit collector proceeds payable `X`; credit Slice fee revenue `Y`; enforce `X + Y = £100`; transfer offering units to buyer atomically. Product must decide whether £100 means gross consideration or total buyer debit before implementation.

### £100 secondary purchase

Keep D14: buyer debit gross plus buyer fee; customer seller credit gross less seller fee; Slice fee revenue receives fees; ownership transfers atomically; FIFO lots update.

### £95 collector withdrawal

Reserve £95 from posted collector proceeds, create provider withdrawal, and only consume the reservation after provider confirmation and the external-clearing journal. Preserve hold/fail/reverse/cancel states.

### £5 Slice fee sweep

Only under an approved policy, transfer £5 through a balanced journal from proceeds/clearing liability to an initial-offering fee revenue account. Do not infer this from Treasury ownership.

## Providers, legal flags, and invariants

Bridge external movements, Plaid identity/bank-link/verification, signed webhooks, encryption, compliance, and reconciliation boundaries exist. Beta/configuration gates external money movement. Collector billing actions also defer when no provider is configured. Provider settlement for collector offerings and provider-fee accounting are not implemented.

Policy/legal review is required for fractional ownership, custody/beneficial ownership, securities/investment treatment, money transmission, customer funds/FBO, collector payout/tax, redemption/buyout, physical sale/custody exit, and voting/corporate actions. This is not legal advice.

Preserve: no money created/destroyed except explicit journal; debits equal credits; supply constant; atomic ownership transfer; collector proceeds separate from Slice revenue; customer/company money separate; Treasury cannot silently become economic owner; provider settlement authoritative; frontend never creates truth; initial and secondary markets report separately.

## Final audit return

**SLICE COLLECTOR OFFERING + MONEY FLOW AUDIT — COMPLETE**

- Collector ownership after issuance: **Treasury owns all issued units technically; collector owns no issued position by this path.**
- Treasury role: **Per-asset ownership holder and initial liquidity seller; sale proceeds route to platform clearing liability.**
- Initial sale proceeds currently go to: **`STAGING_DEMO_TREASURY_PROCEEDS`, not the originating collector.**
- Current Slice fee handling: **Secondary maker/taker fees credit `TRADING_FEE_REVENUE`; no initial-offering fee exists.**
- Collector retained ownership: **NOT SUPPORTED**
- Collector percentage selection: **NOT SUPPORTED**
- Initial offering distinction: **NOT SUPPORTED**
- Secondary market: **Supported by existing atomic matcher, ownership ledger, cash journal, reservations, FIFO lots, audit, and outbox.**
- D13 CAN SUPPORT INTENDED MODEL: **PARTIAL**
- Why: **Accounting primitives exist; collector beneficiary/proceeds and initial-offering routing do not.**
- Biggest economic gap: **All issued units are Treasury inventory and initial proceeds are not attributed to the collector.**
- Biggest accounting risk: **Treasury liability can be mistaken for economic ownership or used without collector-beneficiary routing.**
- Biggest UX gap: **No collector offer/retain choice and no initial/secondary distinction for customers.**
- Recommended Treasury model: **C**
- Reason: **Separate initial inventory gives the clearest audit trail while preserving D14.**
- Existing D14 trading rewrite required: **NO. Add a narrow initial-offering boundary and metadata/routing.**
- Real-money provider work required now: **NO. Implement the economic/accounting boundary and approved policy first.**

**FILES CREATED**

- `docs/qa/collector/COLLECTOR_OFFERING_MONEY_FLOW_AUDIT.md`
- `docs/qa/collector/COLLECTOR_OFFERING_MONEY_FLOW_AUDIT.json`

**DOMAIN MUTATIONS:** **0**

**PROVIDER CALLS:** **0**

**DEPLOYMENT:** **NONE**

**NEXT IMPLEMENTATION PHASE:** **P0/P1 accounting design: add immutable collector-originator and InitialOffering authorities, collector proceeds/payable accounts, and idempotent initial-offering settlement while keeping the existing secondary D14 matcher unchanged.**
