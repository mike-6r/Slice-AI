-- Document 012: ownership-only reservations and immutable reconciliation runs.
CREATE TYPE "OwnershipReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');
CREATE TYPE "OwnershipReconciliationStatus" AS ENUM ('RECONCILED', 'MISMATCH');

CREATE TABLE "OwnershipReservation" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "purposeType" TEXT NOT NULL,
  "purposeId" TEXT NOT NULL,
  "units" BIGINT NOT NULL,
  "status" "OwnershipReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "idempotencyRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OwnershipReservation_units_positive" CHECK ("units" > 0)
);

CREATE TABLE "OwnershipReconciliationRun" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "status" "OwnershipReconciliationStatus" NOT NULL,
  "expectedIssuedUnits" BIGINT NOT NULL,
  "positionUnits" BIGINT NOT NULL,
  "reservedUnits" BIGINT NOT NULL,
  "ledgerUnits" BIGINT NOT NULL,
  "mismatchCodes" JSONB NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnershipReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnershipReservation_assetId_accountId_purposeType_purposeId_key" ON "OwnershipReservation"("assetId", "accountId", "purposeType", "purposeId");
CREATE INDEX "OwnershipReservation_assetId_accountId_status_expiresAt_idx" ON "OwnershipReservation"("assetId", "accountId", "status", "expiresAt");
CREATE INDEX "OwnershipReconciliationRun_assetId_createdAt_id_idx" ON "OwnershipReconciliationRun"("assetId", "createdAt", "id");

ALTER TABLE "OwnershipReservation" ADD CONSTRAINT "OwnershipReservation_position_fkey" FOREIGN KEY ("assetId", "accountId") REFERENCES "OwnershipPosition"("assetId", "accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
