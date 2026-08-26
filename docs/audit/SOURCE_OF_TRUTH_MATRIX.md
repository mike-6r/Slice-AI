# Source-of-truth matrix

| Domain fact                    | Authoritative entity/service                                                    | Read surfaces                                      | Non-authoritative inputs / boundaries                                               |
| ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Submission                     | `AssetSubmission`, `SubmissionService`                                          | review queue, collector workspace                  | customer metadata/media; review UI                                                  |
| Review decision                | `VerificationReview` + `AssetSubmission.status`                                 | admin review workspace                             | frontend readiness copy                                                             |
| Canonical collectible identity | `Asset`, `CatalogueService`                                                     | admin collectibles, public catalogue, market reads | raw submission text until normalized/promoted                                       |
| Submission-to-asset lineage    | `AssetSubmission.assetId`, audit events                                         | admin catalogue/detail                             | manual `linkApprovedAsset` handoff                                                  |
| Physical intake                | `SubmissionIntake` and shipment/receipt/verification/exception children         | physical intake, asset detail                      | carrier delivery state alone                                                        |
| Custody                        | `VaultCustodyRecord`, `CustodyEvent`                                            | admin catalogue/detail, public vault projection    | inferred UI state                                                                   |
| Grade/certification            | `GradingCompany`, `GradeScaleEntry`, certification verification/claim models    | catalogue/detail/review                            | provider evidence before staff confirmation                                         |
| Staff valuation                | `ValuationDecision`                                                             | admin catalogue/detail, portfolio projections      | PriceCharting/market observations; customer estimate                                |
| Market reference               | `MarketObservation`, `MarketSnapshot`, provider mappings                        | market research/admin/detail                       | no automatic promotion to staff valuation                                           |
| Publication                    | `AssetPublication`                                                              | public catalogue/market and admin                  | ownership does not imply publication                                                |
| Initial Offering               | `InitialOffering`, inventory/order records                                      | offering/admin/detail                              | catalogue existence alone                                                           |
| Ownership supply/positions     | `OwnershipAssetSupply`, `OwnershipPosition`, ownership ledger                   | portfolio/admin/detail                             | frontend percentages and ownership inference                                        |
| Finance                        | financial accounts, journal transactions/entries, reservations, money movements | finance/admin/wallet                               | provider balances and UI estimates                                                  |
| Provider/webhook state         | `WebhookInbox`, provider services and reconciliation                            | admin integrations/finance                         | unsigned or unverified payloads                                                     |
| Notifications/outbox           | `OutboxEvent`, `NotificationDelivery`                                           | self notifications/admin operations                | transport delivery status                                                           |
| Discord community              | Discord Prisma models and bot repositories                                      | Discord bot                                        | Slice API remains authoritative for assets, orders, custody, membership and finance |

## Canonicalization boundary

The code currently implements two distinct operations:

1. `CatalogueService.createAsset` creates a draft canonical `Asset` after catalogue reference validation. It creates no ownership, publication, custody, valuation, offering, or submission linkage.
2. `SubmissionService.linkApprovedAsset` links an already-created `Asset` to an approved submission, under lock, with duplicate submission and graded certification checks. It writes lineage/audit only and does not infer downstream lifecycle state.

Review approval itself does not create the canonical row. Its outbox event is notification-only; no worker or Discord consumer calls either canonicalization operation. Staging has 12 approved submissions, including one approved intake without an Asset link, so the missing automatic/staff UI handoff is an active workflow-policy gap. The intended trigger remains **OWNER DECISION REQUIRED**; Wave 0 recommends an explicit staff canonicalization step (Model C) pending approval. See `CANONICALIZATION_AUTHORITY.md` and `STAGING_AUTHORITY_EVIDENCE.md`.
