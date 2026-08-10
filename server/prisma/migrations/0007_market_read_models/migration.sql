CREATE TYPE "MarketDataStatus" AS ENUM ('DEMO', 'DELAYED', 'LIVE');

CREATE TABLE "MarketSnapshot" (
  "id" TEXT NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL,
  "totalEstimatedMarketValueMinor" BIGINT NOT NULL,
  "volume24hMinor" BIGINT NOT NULL,
  "activeAssetCount" INTEGER NOT NULL,
  "collectorCount" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "status" "MarketDataStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketSnapshot_source_asOf_key" ON "MarketSnapshot"("source", "asOf");
CREATE INDEX "MarketSnapshot_asOf_id_idx" ON "MarketSnapshot"("asOf", "id");

CREATE TABLE "AssetValuationPoint" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL,
  "estimatedMarketValueMinor" BIGINT NOT NULL, "currency" TEXT NOT NULL, "source" TEXT NOT NULL,
  "status" "MarketDataStatus" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetValuationPoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetValuationPoint_assetId_source_observedAt_key" ON "AssetValuationPoint"("assetId", "source", "observedAt");
CREATE INDEX "AssetValuationPoint_assetId_observedAt_id_idx" ON "AssetValuationPoint"("assetId", "observedAt", "id");
ALTER TABLE "AssetValuationPoint" ADD CONSTRAINT "AssetValuationPoint_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetMarketSnapshot" (
  "id" TEXT NOT NULL, "assetId" TEXT NOT NULL, "asOf" TIMESTAMP(3) NOT NULL,
  "estimatedMarketValueMinor" BIGINT NOT NULL, "currency" TEXT NOT NULL, "change24hBps" INTEGER NOT NULL,
  "availableBps" INTEGER, "ownersCount" INTEGER, "watchersCount" INTEGER, "confidence" INTEGER,
  "source" TEXT NOT NULL, "status" "MarketDataStatus" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetMarketSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssetMarketSnapshot_assetId_source_asOf_key" ON "AssetMarketSnapshot"("assetId", "source", "asOf");
CREATE INDEX "AssetMarketSnapshot_assetId_asOf_id_idx" ON "AssetMarketSnapshot"("assetId", "asOf", "id");
CREATE INDEX "AssetMarketSnapshot_asOf_change24hBps_id_idx" ON "AssetMarketSnapshot"("asOf", "change24hBps", "id");
ALTER TABLE "AssetMarketSnapshot" ADD CONSTRAINT "AssetMarketSnapshot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
