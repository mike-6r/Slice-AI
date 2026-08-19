-- Stripe Connect payout recipients and the provider-side payout mapping.
-- Slice remains authoritative for balances, reservations, and settlement.
CREATE TYPE "ConnectAccountStatus" AS ENUM ('NOT_STARTED', 'ACTION_REQUIRED', 'UNDER_REVIEW', 'READY', 'RESTRICTED', 'DISABLED');
CREATE TYPE "ConnectPayoutStatus" AS ENUM ('CREATED', 'TRANSFERRED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELED', 'MANUAL_REVIEW');

CREATE TABLE "ExternalConnectAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "externalAccountIdCiphertext" TEXT NOT NULL,
  "externalAccountIdHash" TEXT NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "status" "ConnectAccountStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "requirementsSummary" JSONB,
  "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "transfersCapability" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  CONSTRAINT "ExternalConnectAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectPayout" (
  "id" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "connectAccountId" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "ConnectPayoutStatus" NOT NULL DEFAULT 'CREATED',
  "externalTransferIdCiphertext" TEXT,
  "externalTransferIdHash" TEXT,
  "externalPayoutIdCiphertext" TEXT,
  "externalPayoutIdHash" TEXT,
  "encryptionKeyVersion" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  CONSTRAINT "ConnectPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalConnectAccount_provider_environment_userId_key"
  ON "ExternalConnectAccount" ("provider", "environment", "userId");
CREATE UNIQUE INDEX "ExternalConnectAccount_provider_environment_externalAccountIdHash_key"
  ON "ExternalConnectAccount" ("provider", "environment", "externalAccountIdHash");
CREATE INDEX "ExternalConnectAccount_userId_provider_environment_status_idx"
  ON "ExternalConnectAccount" ("userId", "provider", "environment", "status");
CREATE UNIQUE INDEX "ConnectPayout_movementId_key" ON "ConnectPayout" ("movementId");
CREATE UNIQUE INDEX "ConnectPayout_provider_externalTransferIdHash_key" ON "ConnectPayout" ("provider", "externalTransferIdHash");
CREATE UNIQUE INDEX "ConnectPayout_provider_externalPayoutIdHash_key" ON "ConnectPayout" ("provider", "externalPayoutIdHash");
CREATE INDEX "ConnectPayout_connectAccountId_status_updatedAt_idx" ON "ConnectPayout" ("connectAccountId", "status", "updatedAt");
CREATE INDEX "ConnectPayout_provider_environment_status_updatedAt_idx" ON "ConnectPayout" ("provider", "environment", "status", "updatedAt");

ALTER TABLE "ExternalConnectAccount"
  ADD CONSTRAINT "ExternalConnectAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConnectPayout"
  ADD CONSTRAINT "ConnectPayout_movementId_fkey"
  FOREIGN KEY ("movementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConnectPayout"
  ADD CONSTRAINT "ConnectPayout_connectAccountId_fkey"
  FOREIGN KEY ("connectAccountId") REFERENCES "ExternalConnectAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
