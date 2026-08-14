ALTER TABLE "VaultIntakeLocation"
  ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'beta',
  ADD COLUMN "acceptingShipments" BOOLEAN NOT NULL DEFAULT false;
