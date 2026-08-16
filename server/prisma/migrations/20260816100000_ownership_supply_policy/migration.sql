-- Explicit per-asset supply authority. This table is configuration only;
-- it does not create ownership, market, payment, or settlement state.
CREATE TYPE "OwnershipSupplyPolicyStatus" AS ENUM ('PROPOSED', 'APPROVED', 'ISSUED', 'REJECTED');

CREATE TABLE "OwnershipSupplyPolicy" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "policyCode" TEXT NOT NULL,
  "status" "OwnershipSupplyPolicyStatus" NOT NULL DEFAULT 'PROPOSED',
  "proposedUnits" BIGINT NOT NULL,
  "valuationMinor" BIGINT NOT NULL,
  "valuationCurrency" TEXT NOT NULL,
  "pricePerUnitMinor" BIGINT NOT NULL,
  "remainderMinor" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "proposedByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipSupplyPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnershipSupplyPolicy_units_positive" CHECK ("proposedUnits" > 0),
  CONSTRAINT "OwnershipSupplyPolicy_money_nonnegative" CHECK ("valuationMinor" >= 0 AND "pricePerUnitMinor" >= 0 AND "remainderMinor" >= 0)
);

CREATE UNIQUE INDEX "OwnershipSupplyPolicy_assetId_key" ON "OwnershipSupplyPolicy"("assetId");
CREATE INDEX "OwnershipSupplyPolicy_status_updatedAt_assetId_idx" ON "OwnershipSupplyPolicy"("status", "updatedAt", "assetId");

ALTER TABLE "OwnershipSupplyPolicy" ADD CONSTRAINT "OwnershipSupplyPolicy_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipSupplyPolicy" ADD CONSTRAINT "OwnershipSupplyPolicy_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipSupplyPolicy" ADD CONSTRAINT "OwnershipSupplyPolicy_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
