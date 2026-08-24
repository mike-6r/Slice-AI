ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'PROVIDER_EXPENSE';

CREATE TYPE "ProviderFinancialCostType" AS ENUM ('DEPOSIT_PROCESSING', 'WITHDRAWAL_PROCESSING', 'PAYOUT_PROCESSING', 'TRANSFER_PROCESSING', 'DISPUTE', 'RETURN', 'OTHER');
CREATE TYPE "ProviderFinancialCostStatus" AS ENUM ('PENDING_EVIDENCE', 'OBSERVED', 'POSTED', 'RECONCILED', 'FAILED');
CREATE TYPE "PlatformRevenueSettlementStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'PROCESSING', 'SETTLED', 'FAILED', 'CANCELLED');

ALTER TABLE "MoneyMovement"
  ADD COLUMN "sliceFeeMinor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "providerAmountMinor" BIGINT;

UPDATE "MoneyMovement" SET "providerAmountMinor" = "amountMinor" WHERE "providerAmountMinor" IS NULL;

ALTER TABLE "TradingMarket"
  ALTER COLUMN "takerFeeBps" SET DEFAULT 0,
  ALTER COLUMN "feeScheduleVersion" SET DEFAULT 'ZERO_TRADING_FEES_V2';

UPDATE "TradingMarket"
SET "takerFeeBps" = 0,
    "feeScheduleVersion" = 'ZERO_TRADING_FEES_V2',
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "makerFeeBps" = 0
  AND "takerFeeBps" = 100
  AND "feeScheduleVersion" = 'INITIAL_POLICY_V1';

CREATE TABLE "ProviderFinancialCost" (
  "id" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "currency" TEXT NOT NULL,
  "amountMinor" BIGINT,
  "costType" "ProviderFinancialCostType" NOT NULL,
  "sourceObjectType" TEXT NOT NULL,
  "sourceObjectId" TEXT NOT NULL,
  "balanceTransactionId" TEXT,
  "relatedMovementId" TEXT,
  "relatedConnectPayoutId" TEXT,
  "status" "ProviderFinancialCostStatus" NOT NULL DEFAULT 'PENDING_EVIDENCE',
  "failureCode" TEXT,
  "observedAt" TIMESTAMP(3),
  "postedJournalTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderFinancialCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformRevenueSettlement" (
  "id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "grossRevenueMinor" BIGINT NOT NULL,
  "providerExpensesMinor" BIGINT NOT NULL,
  "eligibleSettlementMinor" BIGINT NOT NULL,
  "requestedAmountMinor" BIGINT NOT NULL,
  "requestIdempotencyKeyHash" TEXT NOT NULL,
  "approvalIdempotencyKeyHash" TEXT,
  "status" "PlatformRevenueSettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "externalStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "requestedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "providerReference" TEXT,
  "journalTransactionId" TEXT,
  "failureCode" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "processingAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformRevenueSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformRevenueSettlementLine" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformRevenueSettlementLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderFinancialCost_postedJournalTransactionId_key" ON "ProviderFinancialCost"("postedJournalTransactionId");
CREATE UNIQUE INDEX "ProviderFinancialCost_provider_environment_sourceObjectType_sourceObjectId_costType_key" ON "ProviderFinancialCost"("provider", "environment", "sourceObjectType", "sourceObjectId", "costType");
CREATE UNIQUE INDEX "ProviderFinancialCost_provider_environment_balanceTransactionId_key" ON "ProviderFinancialCost"("provider", "environment", "balanceTransactionId");
CREATE INDEX "ProviderFinancialCost_status_createdAt_id_idx" ON "ProviderFinancialCost"("status", "createdAt", "id");
CREATE INDEX "ProviderFinancialCost_relatedMovementId_status_idx" ON "ProviderFinancialCost"("relatedMovementId", "status");
CREATE INDEX "ProviderFinancialCost_relatedConnectPayoutId_status_idx" ON "ProviderFinancialCost"("relatedConnectPayoutId", "status");

CREATE UNIQUE INDEX "PlatformRevenueSettlement_journalTransactionId_key" ON "PlatformRevenueSettlement"("journalTransactionId");
CREATE UNIQUE INDEX "PlatformRevenueSettlement_requestIdempotencyKeyHash_key" ON "PlatformRevenueSettlement"("requestIdempotencyKeyHash");
CREATE UNIQUE INDEX "PlatformRevenueSettlement_approvalIdempotencyKeyHash_key" ON "PlatformRevenueSettlement"("approvalIdempotencyKeyHash");
CREATE INDEX "PlatformRevenueSettlement_status_createdAt_id_idx" ON "PlatformRevenueSettlement"("status", "createdAt", "id");
CREATE INDEX "PlatformRevenueSettlement_requestedByUserId_createdAt_id_idx" ON "PlatformRevenueSettlement"("requestedByUserId", "createdAt", "id");
CREATE UNIQUE INDEX "PlatformRevenueSettlementLine_settlementId_category_sourceType_sourceId_key" ON "PlatformRevenueSettlementLine"("settlementId", "category", "sourceType", "sourceId");
CREATE INDEX "PlatformRevenueSettlementLine_sourceType_sourceId_idx" ON "PlatformRevenueSettlementLine"("sourceType", "sourceId");

ALTER TABLE "ProviderFinancialCost" ADD CONSTRAINT "ProviderFinancialCost_relatedMovementId_fkey" FOREIGN KEY ("relatedMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderFinancialCost" ADD CONSTRAINT "ProviderFinancialCost_relatedConnectPayoutId_fkey" FOREIGN KEY ("relatedConnectPayoutId") REFERENCES "ConnectPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderFinancialCost" ADD CONSTRAINT "ProviderFinancialCost_postedJournalTransactionId_fkey" FOREIGN KEY ("postedJournalTransactionId") REFERENCES "JournalTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformRevenueSettlement" ADD CONSTRAINT "PlatformRevenueSettlement_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformRevenueSettlement" ADD CONSTRAINT "PlatformRevenueSettlement_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformRevenueSettlement" ADD CONSTRAINT "PlatformRevenueSettlement_journalTransactionId_fkey" FOREIGN KEY ("journalTransactionId") REFERENCES "JournalTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformRevenueSettlementLine" ADD CONSTRAINT "PlatformRevenueSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PlatformRevenueSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
