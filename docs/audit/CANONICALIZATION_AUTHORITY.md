# Canonicalization authority contract

As-of repository commit `e413dbd`, `Asset` is Slice's canonical collectible
entity. `AssetSubmission` is a separate collector/review record; its nullable
`assetId` is the auditable lineage link, not an implication that either record
creates the other.

## Current executable flow

| Lifecycle stage | Authority | Current trigger | Automatic? | Must not be inferred |
| --- | --- | --- | --- | --- |
| Submission | `AssetSubmission`, `SubmissionService.create` | Collector submission | No | Canonical identity, receipt, custody, valuation, ownership, or publication |
| Review claim/decision | `VerificationReview` plus `AssetSubmission.status` | Review endpoints including `SubmissionService.decide` | No | An `Asset` row; approval emits only `submission.approved` to the notification outbox |
| Canonical asset creation | `Asset`, `CatalogueService.createAsset` | `POST /v1/admin/catalogue/assets`; demo setup script | No | Submission link, custody, valuation, publication, offering, or ownership. The service creates `DRAFT` only. |
| Submission lineage | `AssetSubmission.assetId`, `SubmissionService.linkApprovedAsset`, audit event | `POST /v1/admin/submissions/:id/asset-link`; demo setup script | No | A second submission for the same Asset; downstream lifecycle truth |
| Intake | `SubmissionIntake` and shipment/receipt children | Intake workflow | No | Canonicalization, custody, or verification |
| Receipt and verification | `IntakeReceiptConfirmation`, `IntakeVerification` | Staff/provider workflow | No | Custody, valuation, publication, or ownership |
| Custody | `VaultCustodyRecord`, `CustodyEvent` | Lifecycle custody endpoints | No | Intake carrier state or verification result alone |
| Valuation | `ValuationDecision` | Staff lifecycle decision | No | Customer estimate or external market observation as final value |
| Publication | `AssetPublication` | Publication lifecycle endpoint | No | Ownership issuance or trading availability |
| Ownership | `OwnershipAssetSupply`, positions, ledger | Separate ownership issuance flow | No | Asset existence, publication, or Initial Offering |
| Offering and trading | `InitialOffering`, inventory, `TradingMarket`, orders/executions | Separate finance/trading flows | No | Asset existence or a custody state alone |

## Trace result

`SubmissionService.decide(..., 'APPROVED', ...)` updates the submission,
creates `VerificationReview`, records `SUBMISSION_APPROVED`, and appends the
`submission.approved` outbox event. The registered outbox handlers route that
event to notifications; no handler calls `CatalogueService.createAsset` or
`SubmissionService.linkApprovedAsset`.

The only active repository call sites for canonical creation/linking are the
respective controllers/services. The former synthetic Collector fixture
generator was retired on 2026-09-01 and no longer creates catalogue records.
There is no frontend mutation, Discord consumer, background worker, or outbox
consumer that invokes either transition. The controller comment describing the
link as "service-only" is stale: the protected staff endpoint is active, but
no current UI calls it.

`linkApprovedAsset` locks both rows, requires `APPROVED`, prohibits relinking
to a different Asset, prohibits another submission from using the Asset, claims
graded certification under the existing unique company/certificate identity,
and writes `SUBMISSION_APPROVED_ASSET_LINKED`. Its outer mutation contract is
idempotency-key protected. A same-Asset replay is lineage-safe and cannot create
an Asset, custody record, valuation, publication, or ownership record.

## Policy decision gate

The code establishes the separation but does **not** establish when staff must
invoke it. There is no durable handoff job, queue action, or UI action selecting
the boundary. Therefore the policy is **OWNER DECISION REQUIRED**.

| Model | Advantages | Risks | Compatibility and recommendation |
| --- | --- | --- | --- |
| A — create/link at review approval | Catalogue sees accepted work immediately; simple operator flow | Treats pre-receipt customer/review identity as canonical and makes duplicate/normalization mistakes harder to unwind | Schema-compatible, but not current code or UI. Do not adopt without explicit policy. |
| B — create/link after receipt/verification | Strongest physical identity/certainty boundary; avoids catalogue rows for items never received | Catalogue cannot represent a recognised accepted asset until logistics completes; conflicts with current independent `Asset` and intake models | Schema-compatible, but no implementation path exists. |
| C — explicit staff canonicalization | Preserves independent Asset authority; staff chooses the point after identity evidence is sufficiently authoritative; existing protected create/link services and audited locking fit it | Current UI has no explicit action, so approved records can stall without an operating procedure | **Recommended pending owner approval.** It best matches the current implementation and avoids falsely asserting receipt, verification, custody, valuation, ownership, or market state. |
| D — entirely independent manual catalogue | Maximally flexible for legacy/direct acquisitions | No guaranteed lineage or service level for approved submissions; current link endpoint becomes optional | Technically possible, but conflicts with the documented review-to-lifecycle handoff language and staging's unlinked approved intake. Not recommended. |

## Required decision before a behavior change

Choose C, or explicitly choose A/B/D with the intended trigger, responsible
role, retry/queue semantics, and controlled-asset handling. A later change must
retain the current duplicate certification and link locking invariants and must
not infer downstream authority when creating or linking an Asset.
