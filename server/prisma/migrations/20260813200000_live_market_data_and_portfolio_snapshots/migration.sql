ALTER TABLE "AssetMarketSnapshot"
  ADD COLUMN "markSource" TEXT NOT NULL DEFAULT 'SUPPORTED_VALUATION',
  ADD COLUMN "freshness" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  ADD COLUMN "lastSuccessfulRefreshAt" TIMESTAMP(3);

CREATE TABLE "MarketProviderMapping" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "providerCode" TEXT NOT NULL,
  "providerExternalId" TEXT NOT NULL,
  "providerUrl" TEXT,
  "identityHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AUTO_MATCHED',
  "matchQuality" TEXT NOT NULL DEFAULT 'STRONG',
  "lastVerifiedAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastFailureCode" TEXT,
  "cooldownUntil" TIMESTAMP(3),
  "nextRefreshAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketProviderMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketProviderMapping_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketProviderMapping_assetId_providerCode_key" ON "MarketProviderMapping"("assetId", "providerCode");
CREATE UNIQUE INDEX "MarketProviderMapping_providerCode_providerExternalId_key" ON "MarketProviderMapping"("providerCode", "providerExternalId");
CREATE INDEX "MarketProviderMapping_status_nextRefreshAt_assetId_idx" ON "MarketProviderMapping"("status", "nextRefreshAt", "assetId");
CREATE INDEX "MarketProviderMapping_providerCode_status_lastSuccessAt_idx" ON "MarketProviderMapping"("providerCode", "status", "lastSuccessAt");

CREATE TABLE "MarketObservation" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "mappingId" TEXT,
  "providerCode" TEXT NOT NULL,
  "providerExternalId" TEXT NOT NULL,
  "observationType" TEXT NOT NULL,
  "priceMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "grader" TEXT,
  "grade" TEXT,
  "title" TEXT NOT NULL,
  "externalUrl" TEXT,
  "occurredAt" TIMESTAMP(3),
  "observedAt" TIMESTAMP(3) NOT NULL,
  "matchQuality" TEXT NOT NULL,
  "included" BOOLEAN NOT NULL DEFAULT true,
  "exclusionReason" TEXT,
  "sourceFingerprint" TEXT NOT NULL,
  "provenance" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketObservation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketObservation_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "MarketProviderMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketObservation_providerCode_sourceFingerprint_key" ON "MarketObservation"("providerCode", "sourceFingerprint");
CREATE INDEX "MarketObservation_assetId_observationType_matchQuality_observedAt_idx" ON "MarketObservation"("assetId", "observationType", "matchQuality", "observedAt");
CREATE INDEX "MarketObservation_providerCode_providerExternalId_observedAt_idx" ON "MarketObservation"("providerCode", "providerExternalId", "observedAt");

CREATE TABLE "MarketRefreshJob" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "mappingId" TEXT,
  "providerCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketRefreshJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketRefreshJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MarketRefreshJob_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "MarketProviderMapping"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketRefreshJob_idempotencyKey_key" ON "MarketRefreshJob"("idempotencyKey");
CREATE INDEX "MarketRefreshJob_status_availableAt_createdAt_id_idx" ON "MarketRefreshJob"("status", "availableAt", "createdAt", "id");
CREATE INDEX "MarketRefreshJob_assetId_providerCode_status_availableAt_idx" ON "MarketRefreshJob"("assetId", "providerCode", "status", "availableAt");

CREATE TABLE "PortfolioSnapshot" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "cashValueMinor" BIGINT NOT NULL,
  "reservedValueMinor" BIGINT NOT NULL,
  "holdingsMarketValueMinor" BIGINT NOT NULL,
  "portfolioMarketValueMinor" BIGINT NOT NULL,
  "costBasisMinor" BIGINT NOT NULL,
  "unrealizedPnlMinor" BIGINT NOT NULL,
  "realizedPnlMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "marketDataFreshness" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PortfolioSnapshot_userId_bucketStart_key" ON "PortfolioSnapshot"("userId", "bucketStart");
CREATE INDEX "PortfolioSnapshot_userId_bucketStart_id_idx" ON "PortfolioSnapshot"("userId", "bucketStart", "id");
