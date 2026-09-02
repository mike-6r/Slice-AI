CREATE TYPE "PreSaleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'FINALIZING', 'CONVERTED', 'CANCELLED');

CREATE TYPE "PreSaleReservationStatus" AS ENUM ('ACTIVE', 'CONVERTING', 'CONVERTED', 'CANCELLED', 'RELEASED', 'REFUNDED', 'FAILED');

CREATE TABLE "PreSale" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "initialOfferingId" TEXT NOT NULL,
    "status" "PreSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "physicalStatus" TEXT NOT NULL DEFAULT 'AWAITING_INTAKE',
    "pauseReason" TEXT,
    "cancellationReason" TEXT,
    "cancellationAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "openedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PreSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreSaleReservation" (
    "id" TEXT NOT NULL,
    "preSaleId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "units" BIGINT NOT NULL,
    "pricePerUnitMinor" BIGINT NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "cashReservationId" TEXT,
    "status" "PreSaleReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "convertedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PreSaleReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreSaleAuditEvent" (
    "id" TEXT NOT NULL,
    "preSaleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "beforeState" JSONB NOT NULL,
    "afterState" JSONB NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreSaleAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PreSale_assetId_key" ON "PreSale"("assetId");
CREATE UNIQUE INDEX "PreSale_initialOfferingId_key" ON "PreSale"("initialOfferingId");
CREATE INDEX "PreSale_status_deadlineAt_id_idx" ON "PreSale"("status", "deadlineAt", "id");
CREATE INDEX "PreSale_physicalStatus_status_updatedAt_id_idx" ON "PreSale"("physicalStatus", "status", "updatedAt", "id");
CREATE UNIQUE INDEX "PreSaleReservation_cashReservationId_key" ON "PreSaleReservation"("cashReservationId");
CREATE UNIQUE INDEX "PreSaleReservation_idempotencyKey_key" ON "PreSaleReservation"("idempotencyKey");
CREATE INDEX "PreSaleReservation_preSaleId_status_createdAt_id_idx" ON "PreSaleReservation"("preSaleId", "status", "createdAt", "id");
CREATE INDEX "PreSaleReservation_buyerUserId_status_createdAt_id_idx" ON "PreSaleReservation"("buyerUserId", "status", "createdAt", "id");
CREATE INDEX "PreSaleReservation_assetId_status_createdAt_id_idx" ON "PreSaleReservation"("assetId", "status", "createdAt", "id");
CREATE INDEX "PreSaleAuditEvent_preSaleId_createdAt_id_idx" ON "PreSaleAuditEvent"("preSaleId", "createdAt", "id");
CREATE INDEX "PreSaleAuditEvent_action_createdAt_id_idx" ON "PreSaleAuditEvent"("action", "createdAt", "id");

ALTER TABLE "PreSale" ADD CONSTRAINT "PreSale_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreSale" ADD CONSTRAINT "PreSale_initialOfferingId_fkey" FOREIGN KEY ("initialOfferingId") REFERENCES "InitialOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreSaleReservation" ADD CONSTRAINT "PreSaleReservation_preSaleId_fkey" FOREIGN KEY ("preSaleId") REFERENCES "PreSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreSaleReservation" ADD CONSTRAINT "PreSaleReservation_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreSaleReservation" ADD CONSTRAINT "PreSaleReservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreSaleAuditEvent" ADD CONSTRAINT "PreSaleAuditEvent_preSaleId_fkey" FOREIGN KEY ("preSaleId") REFERENCES "PreSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreSaleAuditEvent" ADD CONSTRAINT "PreSaleAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
