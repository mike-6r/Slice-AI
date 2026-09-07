-- Card funding is an explicitly selected provider rail. Existing historical
-- records are Bacs-originated by definition and retain that immutable label.
CREATE TYPE "MoneyMovementRail" AS ENUM (
  'BACS_DIRECT_DEBIT',
  'CARD',
  'CONNECT_STANDARD_PAYOUT'
);

ALTER TABLE "MoneyMovement"
  ADD COLUMN "rail" "MoneyMovementRail" NOT NULL DEFAULT 'BACS_DIRECT_DEBIT',
  ADD COLUMN "providerInstrumentLabel" TEXT;

CREATE TYPE "ConnectPayoutBalanceSnapshotStage" AS ENUM (
  'BEFORE_TRANSFER',
  'AFTER_TRANSFER',
  'AFTER_PAYOUT'
);

CREATE TABLE "ConnectPayoutBalanceSnapshot" (
  "id" TEXT NOT NULL,
  "connectPayoutId" TEXT NOT NULL,
  "stage" "ConnectPayoutBalanceSnapshotStage" NOT NULL,
  "platformAvailableMinor" BIGINT NOT NULL,
  "platformPendingMinor" BIGINT NOT NULL,
  "connectedAvailableMinor" BIGINT NOT NULL,
  "connectedPendingMinor" BIGINT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectPayoutBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectPayoutBalanceSnapshot_connectPayoutId_stage_key"
  ON "ConnectPayoutBalanceSnapshot"("connectPayoutId", "stage");
CREATE INDEX "ConnectPayoutBalanceSnapshot_connectPayoutId_capturedAt_idx"
  ON "ConnectPayoutBalanceSnapshot"("connectPayoutId", "capturedAt");
ALTER TABLE "ConnectPayoutBalanceSnapshot"
  ADD CONSTRAINT "ConnectPayoutBalanceSnapshot_connectPayoutId_fkey"
  FOREIGN KEY ("connectPayoutId") REFERENCES "ConnectPayout"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
