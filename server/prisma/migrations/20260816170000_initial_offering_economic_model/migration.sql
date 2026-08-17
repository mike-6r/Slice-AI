-- Additive Phase 1 initial-offering authority. Existing Treasury-issued
-- assets are intentionally untouched and continue using their legacy path.
ALTER TYPE "OwnershipAccountType" ADD VALUE 'INITIAL_OFFERING';
ALTER TYPE "JournalTransactionType" ADD VALUE 'INITIAL_OFFERING_SETTLEMENT';
ALTER TYPE "TradingPrincipalType" ADD VALUE 'INITIAL_OFFERING';

CREATE TYPE "InitialOfferingStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'OPEN', 'PARTIALLY_FILLED', 'SOLD_OUT', 'PAUSED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "TradingChannel" AS ENUM ('INITIAL_OFFERING', 'SECONDARY_MARKET', 'TREASURY_LIQUIDITY');

CREATE TABLE "InitialOffering" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "originatingCollectorUserId" TEXT NOT NULL,
  "beneficiaryUserId" TEXT NOT NULL,
  "ownershipSupplyPolicyId" TEXT NOT NULL,
  "valuationDecisionId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "totalUnits" BIGINT NOT NULL,
  "offeredUnits" BIGINT NOT NULL,
  "retainedUnits" BIGINT NOT NULL,
  "pricePerUnitMinor" BIGINT NOT NULL,
  "grossOfferingMinor" BIGINT NOT NULL,
  "feeScheduleVersion" TEXT NOT NULL,
  "feeBps" INTEGER NOT NULL DEFAULT 0,
  "status" "InitialOfferingStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
  "approvedAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InitialOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InitialOfferingInventory" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "beneficiaryUserId" TEXT NOT NULL,
  "offeredUnits" BIGINT NOT NULL,
  "availableUnits" BIGINT NOT NULL,
  "reservedUnits" BIGINT NOT NULL DEFAULT 0,
  "settledUnits" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InitialOfferingInventory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InitialOffering"
  ADD CONSTRAINT "InitialOffering_units_and_money_check"
  CHECK ("totalUnits" > 0 AND "offeredUnits" > 0 AND "retainedUnits" >= 0 AND "offeredUnits" + "retainedUnits" = "totalUnits" AND "pricePerUnitMinor" > 0 AND "grossOfferingMinor" = "offeredUnits" * "pricePerUnitMinor" AND "feeBps" BETWEEN 0 AND 10000);

ALTER TABLE "InitialOfferingInventory"
  ADD CONSTRAINT "InitialOfferingInventory_units_check"
  CHECK ("offeredUnits" > 0 AND "availableUnits" >= 0 AND "reservedUnits" >= 0 AND "settledUnits" >= 0 AND "availableUnits" + "reservedUnits" + "settledUnits" = "offeredUnits");

ALTER TABLE "TradingOrder"
  ADD COLUMN "channel" "TradingChannel" NOT NULL DEFAULT 'SECONDARY_MARKET',
  ADD COLUMN "initialOfferingId" TEXT;

ALTER TABLE "TradingExecution"
  ADD COLUMN "channel" "TradingChannel" NOT NULL DEFAULT 'SECONDARY_MARKET',
  ADD COLUMN "initialOfferingId" TEXT;

CREATE UNIQUE INDEX "InitialOffering_assetId_key" ON "InitialOffering"("assetId");
CREATE UNIQUE INDEX "InitialOffering_ownershipSupplyPolicyId_key" ON "InitialOffering"("ownershipSupplyPolicyId");
CREATE INDEX "InitialOffering_originatingCollectorUserId_status_updatedAt_id_idx" ON "InitialOffering"("originatingCollectorUserId", "status", "updatedAt", "id");
CREATE INDEX "InitialOffering_beneficiaryUserId_status_updatedAt_id_idx" ON "InitialOffering"("beneficiaryUserId", "status", "updatedAt", "id");
CREATE INDEX "InitialOffering_status_updatedAt_assetId_idx" ON "InitialOffering"("status", "updatedAt", "assetId");

CREATE UNIQUE INDEX "InitialOfferingInventory_offeringId_key" ON "InitialOfferingInventory"("offeringId");
CREATE UNIQUE INDEX "InitialOfferingInventory_accountId_key" ON "InitialOfferingInventory"("accountId");
CREATE INDEX "InitialOfferingInventory_assetId_createdAt_id_idx" ON "InitialOfferingInventory"("assetId", "createdAt", "id");
CREATE INDEX "InitialOfferingInventory_beneficiaryUserId_createdAt_id_idx" ON "InitialOfferingInventory"("beneficiaryUserId", "createdAt", "id");
CREATE INDEX "TradingOrder_initialOfferingId_status_createdAt_id_idx" ON "TradingOrder"("initialOfferingId", "status", "createdAt", "id");

ALTER TABLE "InitialOffering" ADD CONSTRAINT "InitialOffering_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOffering" ADD CONSTRAINT "InitialOffering_originatingCollectorUserId_fkey" FOREIGN KEY ("originatingCollectorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOffering" ADD CONSTRAINT "InitialOffering_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOffering" ADD CONSTRAINT "InitialOffering_ownershipSupplyPolicyId_fkey" FOREIGN KEY ("ownershipSupplyPolicyId") REFERENCES "OwnershipSupplyPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOffering" ADD CONSTRAINT "InitialOffering_valuationDecisionId_fkey" FOREIGN KEY ("valuationDecisionId") REFERENCES "ValuationDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOfferingInventory" ADD CONSTRAINT "InitialOfferingInventory_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "InitialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOfferingInventory" ADD CONSTRAINT "InitialOfferingInventory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOfferingInventory" ADD CONSTRAINT "InitialOfferingInventory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnershipAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InitialOfferingInventory" ADD CONSTRAINT "InitialOfferingInventory_beneficiaryUserId_fkey" FOREIGN KEY ("beneficiaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_initialOfferingId_fkey" FOREIGN KEY ("initialOfferingId") REFERENCES "InitialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_initialOfferingId_fkey" FOREIGN KEY ("initialOfferingId") REFERENCES "InitialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
