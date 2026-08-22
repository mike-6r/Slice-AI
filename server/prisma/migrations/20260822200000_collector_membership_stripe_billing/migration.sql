ALTER TYPE "CollectorSubscriptionStatus" ADD VALUE IF NOT EXISTS 'INCOMPLETE';
ALTER TYPE "CollectorSubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

ALTER TABLE "CollectorPlan"
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'month',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CollectorSubscription"
  ADD COLUMN "providerCustomerId" TEXT,
  ADD COLUMN "providerCheckoutSessionId" TEXT,
  ADD COLUMN "providerPriceId" TEXT,
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "paymentMethodBrand" TEXT,
  ADD COLUMN "paymentMethodLast4" TEXT,
  ADD COLUMN "paymentMethodExpMonth" INTEGER,
  ADD COLUMN "paymentMethodExpYear" INTEGER,
  ADD COLUMN "lastProviderEventCreatedAt" TIMESTAMP(3),
  ADD COLUMN "lastProviderEventIdHash" TEXT;

CREATE UNIQUE INDEX "CollectorSubscription_providerCheckoutSessionId_key"
  ON "CollectorSubscription"("providerCheckoutSessionId");
CREATE INDEX "CollectorSubscription_provider_providerCustomerId_idx"
  ON "CollectorSubscription"("provider", "providerCustomerId");
CREATE INDEX "CollectorSubscription_lastProviderEventCreatedAt_idx"
  ON "CollectorSubscription"("lastProviderEventCreatedAt");

CREATE TABLE "CollectorSubscriptionStatusHistory" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "fromStatus" "CollectorSubscriptionStatus",
  "toStatus" "CollectorSubscriptionStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "providerEventIdHash" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectorSubscriptionStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CollectorSubscriptionStatusHistory_subscriptionId_createdAt_id_idx"
  ON "CollectorSubscriptionStatusHistory"("subscriptionId", "createdAt", "id");
CREATE INDEX "CollectorSubscriptionStatusHistory_providerEventIdHash_idx"
  ON "CollectorSubscriptionStatusHistory"("providerEventIdHash");
ALTER TABLE "CollectorSubscriptionStatusHistory"
  ADD CONSTRAINT "CollectorSubscriptionStatusHistory_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "CollectorSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CollectorPlan" ("id", "code", "displayName", "description", "monthlyPriceMinor", "currency", "billingInterval", "sortOrder", "entitlements", "active", "createdAt", "updatedAt")
VALUES
  ('collector-plan-starter', 'STARTER', 'Collector Starter', 'A focused start for growing collections.', 900, 'GBP', 'month', 10, '{"maxActiveCollectibles":10,"maxOpenDrafts":3,"maxOpenSubmissions":3,"maxConcurrentIntake":1,"maxConcurrentSubmissions":3,"monthlySubmissionLimit":10,"marketResearchTier":"STANDARD","marketResearchHistoryDepth":3,"bulkImportEnabled":false,"advancedAnalyticsEnabled":false,"featuredProfileAssetLimit":2,"prioritySupport":false,"exportEnabled":false}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('collector-plan-pro', 'PRO', 'Collector Pro', 'More room for active collectors and advanced tools.', 1900, 'GBP', 'month', 20, '{"maxActiveCollectibles":50,"maxOpenDrafts":10,"maxOpenSubmissions":10,"maxConcurrentIntake":2,"maxConcurrentSubmissions":10,"monthlySubmissionLimit":20,"marketResearchTier":"EXPANDED","marketResearchHistoryDepth":12,"bulkImportEnabled":true,"advancedAnalyticsEnabled":true,"featuredProfileAssetLimit":6,"prioritySupport":true,"exportEnabled":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('collector-plan-elite', 'ELITE', 'Collector Elite', 'Maximum capacity for serious collections.', 4900, 'GBP', 'month', 30, '{"maxActiveCollectibles":250,"maxOpenDrafts":30,"maxOpenSubmissions":30,"maxConcurrentIntake":5,"maxConcurrentSubmissions":30,"monthlySubmissionLimit":100,"marketResearchTier":"ADVANCED","marketResearchHistoryDepth":36,"bulkImportEnabled":true,"advancedAnalyticsEnabled":true,"featuredProfileAssetLimit":12,"prioritySupport":true,"exportEnabled":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "displayName" = EXCLUDED."displayName",
  "description" = EXCLUDED."description",
  "monthlyPriceMinor" = EXCLUDED."monthlyPriceMinor",
  "currency" = EXCLUDED."currency",
  "billingInterval" = EXCLUDED."billingInterval",
  "sortOrder" = EXCLUDED."sortOrder",
  "entitlements" = EXCLUDED."entitlements",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;
