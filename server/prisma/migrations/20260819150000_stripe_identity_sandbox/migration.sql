-- Extend the existing Slice ComplianceCase authority with safe Stripe Identity state.
-- Provider-sensitive documents and reports remain held by Stripe.
ALTER TABLE "ComplianceCase"
  ADD COLUMN "identityState" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "identityRequestedAt" TIMESTAMP(3),
  ADD COLUMN "identityCompletedAt" TIMESTAMP(3),
  ADD COLUMN "identityVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "identitySafeFailureCode" TEXT,
  ADD COLUMN "identityLastProviderSync" TIMESTAMP(3);

CREATE INDEX "ComplianceCase_provider_identityState_updatedAt_idx"
  ON "ComplianceCase" ("provider", "identityState", "updatedAt");
