# Owner Demo Golden Path

**Status:** BLOCKED pending canonicalization policy, a controlled staging
fixture run and authenticated browser QA.  
**Fixture policy:** staging only; named `Owner Demo`; all writes through Slice
services and API contracts; no direct SQL; never use controlled Umbreon or
Charizard state.

## Preconditions

- Staging `/health` and `/ready` are green.
- The active immutable release is proven to match the candidate commit.
- A staging-only Owner Demo Collector, Investor and (if needed) market-maker
  identities are active and clearly marked test/demo.
- The owner has chosen the canonicalization boundary. If Model C is selected,
  the explicit staff UI is present, audited and permission-tested.
- Local/test provider adapters and the existing internal ledger path are
  enabled according to the protected staging environment; no live bank or
  payment provider is used.

## Happy path acceptance matrix

| Step | Actor and action | Expected authoritative result | Evidence required |
| --- | --- | --- | --- |
| 1 | Collector creates a named Owner Demo listing and uploads required images | One `AssetSubmission` draft, then submitted revision | Submission ID, media status, customer view |
| 2 | Admin opens Review Queue and claims it | Claim state is owned by the staff actor | Queue/detail screenshot and audit row |
| 3 | Reviewer checks identity, evidence, cert/research, condition and valuation | Review details are displayed; research remains reference-only; staff valuation is distinct | Detail tabs and request IDs |
| 4 | Reviewer accepts with reason/note | Submission is approved only; no false receipt/custody/ownership/publication | Decision audit and collector notification |
| 5 | Authorized staff performs the chosen canonicalization action | Exactly one draft `Asset` and one `AssetSubmission.assetId` link | Asset ID, link audit, duplicate replay assertion |
| 6 | Intake staff progresses the disposable shipment, confirms physical receipt and completes verification | Carrier delivery remains distinct from staff receipt; verified intake is recorded | Intake timeline and verification audit |
| 7 | Operations staff records custody and a final staff valuation | Custody and valuation records exist independently | Collectible Detail, history and audit |
| 8 | Ownership staff proposes, approves and issues supply | Issued units, positions and inventory reconcile; no automatic issuance occurred earlier | Ownership tab and invariants |
| 9 | Collector proposes an Initial Offering; staff approves and opens it | Terms, fee policy, inventory and readiness are explicit | Offering tab and audit |
| 10 | Authorized staff publishes and enables the market when ready | Public market record appears only after the readiness rules pass | Admin detail and public marketplace |
| 11 | Investor previews and places a supported local-test purchase | Internal ledger/order authority creates one execution and consumes inventory | Order preview, execution, wallet movement |
| 12 | Investor opens Portfolio | Holding, units and ownership percentage reflect the execution | Portfolio and transaction history |
| 13 | Admin reopens the canonical asset | Source lineage, custody, valuation, supply, offering, execution and audit are coherent | Collectible history and finance/admin views |

## Required invariant checks

- One owner-demo submission has exactly one canonical Asset link.
- Replaying the canonicalization command does not create a second asset, link,
  custody record, valuation, supply, publication or execution.
- A duplicate graded certification is rejected before linkage.
- Receipt cannot be double-confirmed; invalid verification/exception ordering is
  rejected.
- The final valuation is an authoritative staff decision, not PriceCharting or
  AI data.
- Ownership positions reconcile to issued supply and Initial Offering inventory.
- The buyer order creates one execution only and the ledger remains balanced.
- Every mutation produces a usable audit event. The collector receives
  workflow notifications where implemented; successful demonstration does not
  depend on provider delivery.

## Cross-surface state consistency

After each successful transition, refresh each affected view and record that
the same authoritative state is shown. A mutation is not accepted merely
because its originating page updated optimistically.

| Transition | Projections that must agree |
| --- | --- |
| Submission accepted | Review Queue, Submission Detail, Admin Overview and Collector Workspace |
| Canonicalization | Collectibles, Collectible Detail, source lineage and Admin Overview |
| Physical receipt / verification | Physical Intake, Collectible Detail, Asset Operations and activity/history |
| Ownership issuance | Collectible Detail, Initial Offering readiness and Admin ownership projection |
| Publication | Collectibles, public Asset Detail, Marketplace and Admin market state |
| Purchase | Marketplace availability, Asset Detail, Portfolio, ownership positions, offering inventory, finance, execution history and Admin activity |

## Recovery and repeated-action matrix

At submission, claim, decision, canonicalization, receipt, verification,
issuance, Initial Offering, publication and purchase boundaries, test browser
refresh, deep link, logout/login, session refresh, network retry, stale retry
and repeated button activation. Where safely permitted, also exercise API and
worker restart recovery. No result may rely only on React memory.

For each of these commands, assert at most one durable outcome: submit, claim,
accept, request changes, create/link canonical Asset, receipt confirmation,
verification completion, ownership issuance, Initial Offering creation,
publication, purchase/sale and confirmation.

## Media, money and notification checks

- Run the disposable-media matrix: front/back/additional/slab/damage evidence,
  portrait/landscape/phone/large image, unsupported and oversized upload,
  duplicate, replacement, permitted deletion, thumbnails, preview/zoom,
  missing/broken references and published public-safe media. Confirm media
  order and that no private storage URL leaks.
- Reconcile every money display to its backend response: currency, decimal
  formatting, price per Slice, total value, fees, collector proceeds, available
  / settling / trade-available cash and external reference value. There is no
  silent FX conversion.
- Verify total supply exactly equals collector-retained + offering inventory +
  investor positions + applicable treasury units. Reconcile percentages,
  offering gross, applicable fee, collector proceeds and buyer/seller totals.
- Inspect rendered notification subject/body/link copy for submission, changes,
  approval, intake and financial events. It must name the collectible and next
  step without raw enums, provider secrets or debug text. Delivery failure may
  not block the domain transition.

## Failure path matrix

| Scenario | Required outcome |
| --- | --- |
| Missing evidence / bad media | Submission cannot be accepted; collector receives a safe request-for-changes path. |
| Stale reviewer / second reviewer | Claim and version protections prevent a stale decision. |
| Duplicate cert | Canonical link is blocked with an operator-safe explanation. |
| Invalid intake transition / duplicate receipt | Command is rejected and history remains singular. |
| Missing custody, valuation or issued supply | Publication/Initial Offering readiness stays blocked with an actionable reason. |
| Insufficient buyer cash / restricted account | Buy is denied without ownership or cash mutation. |
| Provider/optional enrichment unavailable | Relevant state says unavailable/manual review; the page does not crash. |
| Unauthorised role | API and UI deny the action without leaking restricted data. |

## Completion evidence

The golden path is PASS only with an authenticated, post-deploy record of all
steps above, desktop and mobile screenshots, console/network review, release
provenance and a fixture reset result. Until then, it is a test specification,
not a completed demo claim.

Record both the complete demonstration duration and a short owner narrative
that shows listing, review, explicit canonicalization, custody/valuation,
offering, market purchase and portfolio outcome without unnecessary operational
detail.
