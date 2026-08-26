# Schema usage matrix

## Method

The matrix covers every current Prisma model. Evidence was collected from
`server/src`, `server/test`, `server/src/scripts`, `apps/discord-bot`, root
frontend/scripts, all migrations, Prisma type references, nested relations,
and raw SQL. A static delegate trace found direct/reference evidence for 173
models. The two exceptions are classified below from relation and schema
evidence, not from an absence-of-grep assumption.

| Classification | Models | Usage evidence |
| --- | --- | --- |
| ACTIVE_CORE | `User`, `ConsentAcceptance`, `AccountDeletionRequest`, `EmailVerificationToken`, `PasswordResetToken`, `TransactionalEmailDelivery`, `PhoneVerificationChallenge`, `UserTwoFactor`, `UserSmsTwoFactor`, `TwoFactorRecoveryCode`, `TwoFactorLoginChallenge`, `TwoFactorActionChallenge`, `UserProfile`, `Session`, `RoleAssignment`, `AccountStatusHistory`, `AuditEvent`, `IdempotencyRecord` | Identity, access, consent, sessions, recovery, audit, and idempotency services plus tests and migrations. |
| ACTIVE_ADMIN | `Category`, `CollectibleSet`, `GradingCompany`, `GradeScaleEntry`, `Asset`, `PublicCollectorProfile`, `WatchlistItem`, `Notification`, `NotificationPreference`, `VerificationReview`, `VaultIntakeLocation` | Catalogue, public/profile, notification, review, and admin list/detail queries. |
| ACTIVE_CORE | `AssetSubmission`, `GradingCertificationVerification`, `GradingCertificationClaim`, `RawCardPreGrade`, `SubmissionMarketResearch`, `SubmissionMarketObservation`, `SubmissionMedia`, `ValuationEvidence`, `ValuationDecision`, `VaultCustodyRecord`, `CustodyEvent`, `InsuranceCoverage`, `AssetPublication`, `ControlledBetaPhysicalBypass`, `VaultPublicEvent`, `SubmissionIntake`, `IntakeShipment`, `IntakeReceiptConfirmation`, `IntakeVerification`, `IntakeException` | Submission/review, certification, intake, verification, custody, valuation, and publication service paths; canonical-lineage and lifecycle tests; migrations. |
| ACTIVE_ADMIN | `CollectorPlan`, `CollectorSubscription`, `CollectorSubscriptionStatusHistory` | Membership administration, entitlement, period, and audit/history paths. |
| ACTIVE_BACKGROUND | `MarketSnapshot`, `AssetValuationPoint`, `AssetMarketSnapshot`, `MarketProviderMapping`, `MarketObservation`, `MarketRefreshJob`, `PortfolioSnapshot` | Market provider mappings, refresh jobs, valuation/portfolio projections, and related tests. |
| ACTIVE_CORE | `OwnershipSupplyPolicy`, `OwnershipAssetSupply`, `OwnershipAccount`, `InitialOffering`, `InitialOfferingInventory`, `OwnershipPosition`, `OwnershipReservation`, `OwnershipLedgerEntry`, `OwnershipReconciliationRun` | Supply policy, issuance, reservations, ownership ledger, offering inventory, reconciliation, and row-lock paths. |
| ACTIVE_CORE / FINANCE | `FinancialAccount`, `JournalTransaction`, `JournalEntry`, `AccountBalance`, `CashReservation`, `FinancialDeficit`, `FinancialAdjustmentRequest`, `PortfolioLot`, `LotDisposal`, `FinancialReconciliationRun`, `PlatformRevenueSettlement` | Financial accounting, settlement, reconciliation, audit, and transaction-lock paths. High-risk: audit only. |
| LEGACY_ACTIVE / FINANCE | `FinancialConnectionSession` | No direct current delegate call, but schema commentary and provider tests state that it is retained Financial Connections history. Provider-retention owner decision required before any change. |
| RELATION_ONLY / FINANCE | `PlatformRevenueSettlementLine` | Active child relation of `PlatformRevenueSettlement.lines`; uniqueness protects settlement source lines. No standalone delegate is required for nested persistence. |
| ACTIVE_PROVIDER | `ComplianceCase`, `ComplianceDecision`, `ExternalProviderCustomer`, `BacsSetupSession`, `ExternalFinancialAccount`, `BankInstrumentIdentity`, `BankSecurityEvent`, `ExternalConnectAccount`, `MoneyMovement`, `ProviderLiquidityReservation`, `ConnectPayout`, `MoneyMovementHistory`, `WebhookInbox`, `ProviderReconciliationRun`, `ProviderDiscrepancy`, `ComplianceHold`, `ProviderIncident`, `ProviderFinancialCost`, `ExternalSaleVerification`, `ExternalSaleVerificationApproval` | Provider adapters, payment/compliance/reconciliation services, webhook/idempotency logic, tests, and migrations. Preserve even when staging/provider mode is gated. |
| ACTIVE_CORE / TRADING | `TradingMarket`, `TradingOrder`, `TradingExecution`, `OrderStatusHistory` | Order-book queries, matching/execution, status history, market-sequence uniqueness, and transactional locks. High-risk: audit only. |
| ACTIVE_ADMIN / COMMUNITY | `OutboxEvent`, `NotificationDelivery`, `CollectorFollow`, `DiscussionPost`, `ContentReport`, `ModerationAction`, `SaleProposal`, `ProposalEligibility`, `ProposalVote`, `Distribution`, `DistributionLine`, `DistributionReconciliationRun` | Durable queues, notification delivery, community governance, external-sale, and distribution/reconciliation flows. Queue raw SQL confirms `OutboxEvent` and `NotificationDelivery` are active infrastructure. |
| ACTIVE_DISCORD | `DiscordAccountLink`, `DiscordOAuthState`, `DiscordBotLinkChallenge`, `DiscordGuildConfig`, `DiscordManagedResource`, `DiscordPanel`, `DiscordNotificationPreference`, `DiscordTicket`, `DiscordTicketCategoryPolicy`, `DiscordTicketFormVersion`, `DiscordTicketIntakeResponse`, `DiscordTicketInternalNote`, `DiscordTicketTag`, `DiscordTicketTagAssignment`, `DiscordTicketEvent`, `DiscordTicketTranscript`, `DiscordTicketStaffTranscript`, `DiscordAnalyticsDailyGuild`, `DiscordAnalyticsDailyChannel`, `DiscordAnalyticsDailyCommand`, `DiscordAnalyticsDailyMemberActivity`, `DiscordWorkerHeartbeat`, `DiscordModerationCase`, `DiscordModerationCounter`, `DiscordMemberProgression`, `DiscordReputationGrant`, `DiscordReputationCooldown`, `DiscordSuggestion`, `DiscordSuggestionVote`, `DiscordPoll`, `DiscordPollVote`, `DiscordBirthday`, `DiscordCommunityScheduleState`, `DiscordMemeCompetition`, `DiscordMemeSubmission`, `DiscordMemeAward`, `DiscordMemeCompetitionAuditEvent`, `DiscordGiveaway`, `DiscordGiveawayEntry`, `DiscordGiveawayWinner`, `DiscordGiveawayAuditEvent`, `DiscordInvestorProfilePreference`, `DiscordDeliveryReceipt`, `DiscordPriceAlert`, `DiscordPriceAlertDelivery`, `DiscordMarketDigestRun`, `DiscordNewsSourceState`, `DiscordNewsItem`, `DiscordNewsDelivery`, `DiscordEmbedDraft`, `DiscordEmbedPublication`, `DiscordEmbedAuditEvent`, `DiscordAnnouncementSchedule`, `DiscordScheduledPublicationRun`, `DiscordAnnouncementScheduleAuditEvent`, `DiscordSpotlight`, `DiscordSpotlightAuditEvent`, `DiscordMemberAchievement` | Direct Discord persistence/repository, worker, setup, community, and test use. Their absence from a Nest API delegate trace would not be evidence of inactivity. |

## Field classification

Field review was risk-led: fields that were nullable, explicitly documented as
legacy, defaults that affect workflow, JSON payloads, relation keys, unique
keys, and raw-SQL columns were traced. Most fields participate in delegate
selects/writes, relation traversal, constraints, audit serialization, or
migrations and are not cleanup candidates.

| Category | Result |
| --- | --- |
| READ_AND_WRITTEN | Catalogue grade-scale metadata, canonical/submission linkage, provider, lifecycle, ownership, finance, and Discord fields have direct service/repository operations. |
| RELATION_ONLY | `PlatformRevenueSettlementLine` persistence is nested through `PlatformRevenueSettlement.lines`; relation-only use is active use. |
| INDEX/CONSTRAINT_ONLY | Composite keys for certifications, provider references, idempotency, ownership, offerings, market sequences, delivery, and Discord logical identities are required database invariants. |
| AUDIT/HISTORICAL | Audit/history tables, retained provider payload state, enum values, and legacy references must not be treated as dead UI data. |
| MIGRATION_COMPATIBILITY | `PhoneVerificationChallenge.codeHash` and `BacsSetupSession.externalSetupIntentId` are explicit retained compatibility fields. |
| POTENTIAL_UNUSED | None at Tier A. |

## Enum classification

All 108 enums are used by one or more current model fields. Enum value
references were additionally checked in service logic, tests, migrations, and
provider serialization. No enum or value meets a removal bar.

The only identified historical values are `ProviderCode.SUMSUB`,
`ProviderCode.TRM`, and `ProviderCode.BVNK`; the schema labels them historical
compatibility values. They are LEGACY BUT REQUIRED, not unused. `LOCAL_TEST`
remains active for controlled local/test flows.

## Raw SQL and dynamic-use guard

Raw SQL covers row locks on `Asset`, `AssetSubmission`, custody, finance,
ownership, provider movements, notification/outbox queue claims, and Discord
schedule/progression/community locking. It also uses PostgreSQL advisory locks.
No dynamic generic Prisma delegate/table abstraction was found that would
invalidate this matrix; nested relation operations are called out explicitly.

No classification in this document authorises a schema deletion.
