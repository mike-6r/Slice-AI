ALTER TABLE "PublicCollectorProfile"
  ADD COLUMN "featurePriority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "featuredCaption" TEXT;

CREATE TABLE "PublicCollectorFeaturedAsset" (
  "id" TEXT NOT NULL,
  "collectorProfileUserId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicCollectorFeaturedAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicCollectorFeaturedAsset_collectorProfileUserId_assetId_key"
  ON "PublicCollectorFeaturedAsset"("collectorProfileUserId", "assetId");
CREATE UNIQUE INDEX "PublicCollectorFeaturedAsset_collectorProfileUserId_position_key"
  ON "PublicCollectorFeaturedAsset"("collectorProfileUserId", "position");
CREATE INDEX "PublicCollectorFeaturedAsset_assetId_position_idx"
  ON "PublicCollectorFeaturedAsset"("assetId", "position");
CREATE INDEX "PublicCollectorProfile_isPublic_isFeatured_featurePriority_featuredAt_createdAt_userId_idx"
  ON "PublicCollectorProfile"("isPublic", "isFeatured", "featurePriority", "featuredAt", "createdAt", "userId");

ALTER TABLE "PublicCollectorFeaturedAsset"
  ADD CONSTRAINT "PublicCollectorFeaturedAsset_collectorProfileUserId_fkey"
  FOREIGN KEY ("collectorProfileUserId") REFERENCES "PublicCollectorProfile"("userId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicCollectorFeaturedAsset"
  ADD CONSTRAINT "PublicCollectorFeaturedAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
