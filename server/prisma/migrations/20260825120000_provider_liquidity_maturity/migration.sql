CREATE TYPE "ProviderLiquidityReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

ALTER TABLE "MoneyMovement"
  ADD COLUMN "providerBalanceTransactionIdCiphertext" TEXT,
  ADD COLUMN "providerBalanceTransactionIdHash" TEXT,
  ADD COLUMN "providerFeeMinor" BIGINT,
  ADD COLUMN "providerNetMinor" BIGINT,
  ADD COLUMN "providerAvailableOn" TIMESTAMP(3),
  ADD COLUMN "providerCurrency" TEXT,
  ADD COLUMN "providerSourceReferenceHash" TEXT;

CREATE TABLE "ProviderLiquidityReservation" (
  "id" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "currency" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "status" "ProviderLiquidityReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "providerBalanceCheckedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderLiquidityReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoneyMovement_provider_providerBalanceTransactionIdHash_key"
  ON "MoneyMovement"("provider", "providerBalanceTransactionIdHash");
CREATE INDEX "MoneyMovement_provider_providerAvailableOn_status_idx"
  ON "MoneyMovement"("provider", "providerAvailableOn", "status");
CREATE UNIQUE INDEX "ProviderLiquidityReservation_movementId_key"
  ON "ProviderLiquidityReservation"("movementId");
CREATE INDEX "ProviderLiquidityReservation_provider_environment_currency_status_createdAt_id_idx"
  ON "ProviderLiquidityReservation"("provider", "environment", "currency", "status", "createdAt", "id");

ALTER TABLE "ProviderLiquidityReservation"
  ADD CONSTRAINT "ProviderLiquidityReservation_movementId_fkey"
  FOREIGN KEY ("movementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
