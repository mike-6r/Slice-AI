-- Stripe sandbox customer, Financial Connections session, and safe linked-bank metadata.
CREATE TYPE "ExternalProviderEnvironment" AS ENUM ('SANDBOX', 'LIVE');

ALTER TABLE "ExternalFinancialAccount"
  ADD COLUMN "externalPaymentMethodId" TEXT,
  ADD COLUMN "ownershipStatus" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE TABLE "ExternalProviderCustomer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "externalCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalProviderCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialConnectionSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "externalSessionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialConnectionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalProviderCustomer_provider_environment_userId_key"
  ON "ExternalProviderCustomer" ("provider", "environment", "userId");
CREATE UNIQUE INDEX "ExternalProviderCustomer_provider_environment_externalCustomerId_key"
  ON "ExternalProviderCustomer" ("provider", "environment", "externalCustomerId");
CREATE INDEX "ExternalProviderCustomer_userId_provider_environment_idx"
  ON "ExternalProviderCustomer" ("userId", "provider", "environment");
CREATE UNIQUE INDEX "FinancialConnectionSession_provider_environment_externalSessionId_key"
  ON "FinancialConnectionSession" ("provider", "environment", "externalSessionId");
CREATE INDEX "FinancialConnectionSession_userId_provider_environment_status_idx"
  ON "FinancialConnectionSession" ("userId", "provider", "environment", "status");

ALTER TABLE "ExternalProviderCustomer"
  ADD CONSTRAINT "ExternalProviderCustomer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialConnectionSession"
  ADD CONSTRAINT "FinancialConnectionSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
