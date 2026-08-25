-- Bank-link security authority: hashed provider instrument identity, safe
-- lifecycle events, and action-scoped MFA challenges.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bankWithdrawalHoldUntil" TIMESTAMP(3);

CREATE TYPE "BankRiskState" AS ENUM (
  'CLEAR',
  'SHARED_INSTRUMENT_REVIEW',
  'DUPLICATE_INSTRUMENT_BLOCKED',
  'MANUAL_REVIEW_REQUIRED'
);

ALTER TABLE "ExternalFinancialAccount"
  ADD COLUMN "environment" "ExternalProviderEnvironment" NOT NULL DEFAULT 'SANDBOX',
  ADD COLUMN "instrumentIdentityId" TEXT,
  ADD COLUMN "riskState" "BankRiskState" NOT NULL DEFAULT 'CLEAR',
  ADD COLUMN "riskReviewedAt" TIMESTAMP(3);

UPDATE "ExternalFinancialAccount"
SET "environment" = 'LIVE'
WHERE "provider" = 'STRIPE_LIVE';

CREATE TABLE "BankInstrumentIdentity" (
  "id" TEXT NOT NULL,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "instrumentFingerprintHash" TEXT NOT NULL,
  "accountLast4" TEXT,
  "bankCountry" TEXT,
  "riskState" "BankRiskState" NOT NULL DEFAULT 'CLEAR',
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankInstrumentIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankSecurityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "externalAccountId" TEXT,
  "instrumentIdentityId" TEXT,
  "provider" "ProviderCode" NOT NULL,
  "environment" "ExternalProviderEnvironment" NOT NULL,
  "eventType" TEXT NOT NULL,
  "ipHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankSecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TwoFactorActionChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "method" "TwoFactorMethod" NOT NULL,
  "phoneE164" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TwoFactorActionChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankInstrumentIdentity_provider_environment_instrumentFingerprintHash_key"
  ON "BankInstrumentIdentity"("provider", "environment", "instrumentFingerprintHash");
CREATE INDEX "BankInstrumentIdentity_riskState_lastSeenAt_idx"
  ON "BankInstrumentIdentity"("riskState", "lastSeenAt");
CREATE INDEX "ExternalFinancialAccount_provider_environment_instrumentIdentityId_idx"
  ON "ExternalFinancialAccount"("provider", "environment", "instrumentIdentityId");
CREATE INDEX "BankSecurityEvent_userId_createdAt_id_idx"
  ON "BankSecurityEvent"("userId", "createdAt", "id");
CREATE INDEX "BankSecurityEvent_instrumentIdentityId_createdAt_id_idx"
  ON "BankSecurityEvent"("instrumentIdentityId", "createdAt", "id");
CREATE INDEX "BankSecurityEvent_eventType_createdAt_idx"
  ON "BankSecurityEvent"("eventType", "createdAt");
CREATE UNIQUE INDEX "TwoFactorActionChallenge_tokenHash_key"
  ON "TwoFactorActionChallenge"("tokenHash");
CREATE INDEX "TwoFactorActionChallenge_userId_action_consumedAt_expiresAt_idx"
  ON "TwoFactorActionChallenge"("userId", "action", "consumedAt", "expiresAt");

ALTER TABLE "ExternalFinancialAccount"
  ADD CONSTRAINT "ExternalFinancialAccount_instrumentIdentityId_fkey"
  FOREIGN KEY ("instrumentIdentityId") REFERENCES "BankInstrumentIdentity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankSecurityEvent"
  ADD CONSTRAINT "BankSecurityEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BankSecurityEvent_externalAccountId_fkey"
  FOREIGN KEY ("externalAccountId") REFERENCES "ExternalFinancialAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BankSecurityEvent_instrumentIdentityId_fkey"
  FOREIGN KEY ("instrumentIdentityId") REFERENCES "BankInstrumentIdentity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TwoFactorActionChallenge"
  ADD CONSTRAINT "TwoFactorActionChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
