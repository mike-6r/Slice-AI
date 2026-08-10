-- Document 012: immutable ownership supply and quantity-only ownership ledger.
CREATE TYPE "OwnershipSupplyStatus" AS ENUM ('PENDING', 'ACTIVE', 'FROZEN', 'CLOSED');
CREATE TYPE "OwnershipAccountType" AS ENUM ('USER', 'TREASURY', 'ESCROW', 'EXTERNAL');
CREATE TYPE "OwnershipAccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');
CREATE TYPE "OwnershipLedgerEntryType" AS ENUM ('ISSUANCE', 'TRANSFER', 'RESERVE', 'RELEASE', 'CONSUME_RESERVATION', 'CORRECTION', 'RETIRE');

CREATE TABLE "OwnershipAssetSupply" (
  "assetId" TEXT NOT NULL,
  "totalUnits" BIGINT NOT NULL,
  "issuedUnits" BIGINT NOT NULL DEFAULT 0,
  "nextSequence" BIGINT NOT NULL DEFAULT 1,
  "status" "OwnershipSupplyStatus" NOT NULL DEFAULT 'PENDING',
  "issuedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipAssetSupply_pkey" PRIMARY KEY ("assetId"),
  CONSTRAINT "OwnershipAssetSupply_total_positive" CHECK ("totalUnits" > 0),
  CONSTRAINT "OwnershipAssetSupply_issued_bounds" CHECK ("issuedUnits" >= 0 AND "issuedUnits" <= "totalUnits"),
  CONSTRAINT "OwnershipAssetSupply_next_sequence_positive" CHECK ("nextSequence" > 0)
);

CREATE TABLE "OwnershipAccount" (
  "id" TEXT NOT NULL,
  "type" "OwnershipAccountType" NOT NULL,
  "userId" TEXT,
  "status" "OwnershipAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnershipPosition" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "settledUnits" BIGINT NOT NULL DEFAULT 0,
  "reservedUnits" BIGINT NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipPosition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnershipPosition_units_bounds" CHECK ("settledUnits" >= 0 AND "reservedUnits" >= 0 AND "reservedUnits" <= "settledUnits")
);

CREATE TABLE "OwnershipLedgerEntry" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "sequence" BIGINT NOT NULL,
  "entryType" "OwnershipLedgerEntryType" NOT NULL,
  "debitAccountId" TEXT,
  "creditAccountId" TEXT,
  "units" BIGINT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "causationId" TEXT,
  "idempotencyRecordId" TEXT,
  "reasonCode" TEXT,
  "metadata" JSONB,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnershipLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnershipLedgerEntry_units_positive" CHECK ("units" > 0)
);

CREATE UNIQUE INDEX "OwnershipAccount_userId_key" ON "OwnershipAccount"("userId");
CREATE INDEX "OwnershipAccount_type_status_id_idx" ON "OwnershipAccount"("type", "status", "id");
CREATE INDEX "OwnershipAssetSupply_status_updatedAt_assetId_idx" ON "OwnershipAssetSupply"("status", "updatedAt", "assetId");
CREATE UNIQUE INDEX "OwnershipPosition_assetId_accountId_key" ON "OwnershipPosition"("assetId", "accountId");
CREATE INDEX "OwnershipPosition_accountId_assetId_idx" ON "OwnershipPosition"("accountId", "assetId");
CREATE UNIQUE INDEX "OwnershipLedgerEntry_assetId_sequence_key" ON "OwnershipLedgerEntry"("assetId", "sequence");
CREATE UNIQUE INDEX "OwnershipLedgerEntry_assetId_correlationId_entryType_key" ON "OwnershipLedgerEntry"("assetId", "correlationId", "entryType");
CREATE INDEX "OwnershipLedgerEntry_assetId_createdAt_id_idx" ON "OwnershipLedgerEntry"("assetId", "createdAt", "id");

ALTER TABLE "OwnershipAssetSupply" ADD CONSTRAINT "OwnershipAssetSupply_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipAccount" ADD CONSTRAINT "OwnershipAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipPosition" ADD CONSTRAINT "OwnershipPosition_assetId_supply_fkey" FOREIGN KEY ("assetId") REFERENCES "OwnershipAssetSupply"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipPosition" ADD CONSTRAINT "OwnershipPosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnershipAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipLedgerEntry" ADD CONSTRAINT "OwnershipLedgerEntry_assetId_supply_fkey" FOREIGN KEY ("assetId") REFERENCES "OwnershipAssetSupply"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipLedgerEntry" ADD CONSTRAINT "OwnershipLedgerEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "OwnershipAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipLedgerEntry" ADD CONSTRAINT "OwnershipLedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "OwnershipAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
