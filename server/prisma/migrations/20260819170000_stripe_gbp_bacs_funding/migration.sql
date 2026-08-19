-- Additive Stripe Bacs setup-session boundary for the GBP customer-funding rail.
CREATE TABLE "BacsSetupSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "externalSetupIntentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BacsSetupSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BacsSetupSession_provider_environment_externalSetupIntentId_key"
  ON "BacsSetupSession" ("provider", "environment", "externalSetupIntentId");
CREATE INDEX "BacsSetupSession_userId_provider_environment_status_idx"
  ON "BacsSetupSession" ("userId", "provider", "environment", "status");

ALTER TABLE "BacsSetupSession"
  ADD CONSTRAINT "BacsSetupSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
