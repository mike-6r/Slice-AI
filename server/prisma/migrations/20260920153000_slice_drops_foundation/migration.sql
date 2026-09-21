CREATE TYPE "DropState" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'READY_TO_PUBLISH', 'LIVE', 'SOLD_OUT', 'CLOSED', 'CANCELLED', 'BLOCKED');
CREATE TYPE "DropPublicationStatus" AS ENUM ('UNPUBLISHED', 'PUBLISHED', 'WITHDRAWN');
CREATE TYPE "PreviewFixtureClassification" AS ENUM ('PREVIEW_QA');

CREATE TABLE "Drop" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "creatorUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "state" "DropState" NOT NULL DEFAULT 'DRAFT',
  "publicationStatus" "DropPublicationStatus" NOT NULL DEFAULT 'UNPUBLISHED',
  "openingCount" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "submittedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "blockedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Drop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DropInventoryItem" (
  "id" TEXT NOT NULL,
  "dropId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DropInventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DropAssetLock" (
  "assetId" TEXT NOT NULL,
  "dropId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "DropAssetLock_pkey" PRIMARY KEY ("assetId")
);

CREATE TABLE "DropHistoryEvent" (
  "id" TEXT NOT NULL,
  "dropId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "fromState" "DropState",
  "toState" "DropState",
  "beforeState" JSONB,
  "afterState" JSONB,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DropHistoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreviewDropFixture" (
  "id" TEXT NOT NULL,
  "fixtureKey" TEXT NOT NULL,
  "creatorUserId" TEXT NOT NULL,
  "classification" "PreviewFixtureClassification" NOT NULL DEFAULT 'PREVIEW_QA',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreviewDropFixture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PreviewDropFixtureAsset" (
  "fixtureId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "scenario" TEXT NOT NULL,
  CONSTRAINT "PreviewDropFixtureAsset_pkey" PRIMARY KEY ("fixtureId", "assetId")
);

CREATE UNIQUE INDEX "Drop_publicId_key" ON "Drop"("publicId");
CREATE UNIQUE INDEX "Drop_slug_key" ON "Drop"("slug");
CREATE INDEX "Drop_creatorUserId_state_updatedAt_id_idx" ON "Drop"("creatorUserId", "state", "updatedAt", "id");
CREATE INDEX "Drop_publicationStatus_state_publishedAt_id_idx" ON "Drop"("publicationStatus", "state", "publishedAt", "id");
CREATE UNIQUE INDEX "DropInventoryItem_dropId_assetId_key" ON "DropInventoryItem"("dropId", "assetId");
CREATE INDEX "DropInventoryItem_assetId_dropId_idx" ON "DropInventoryItem"("assetId", "dropId");
CREATE UNIQUE INDEX "DropAssetLock_inventoryItemId_key" ON "DropAssetLock"("inventoryItemId");
CREATE INDEX "DropAssetLock_dropId_lockedAt_assetId_idx" ON "DropAssetLock"("dropId", "lockedAt", "assetId");
CREATE INDEX "DropHistoryEvent_dropId_createdAt_id_idx" ON "DropHistoryEvent"("dropId", "createdAt", "id");
CREATE INDEX "DropHistoryEvent_action_createdAt_id_idx" ON "DropHistoryEvent"("action", "createdAt", "id");
CREATE UNIQUE INDEX "PreviewDropFixture_fixtureKey_key" ON "PreviewDropFixture"("fixtureKey");
CREATE INDEX "PreviewDropFixture_classification_createdAt_id_idx" ON "PreviewDropFixture"("classification", "createdAt", "id");
CREATE UNIQUE INDEX "PreviewDropFixtureAsset_assetId_key" ON "PreviewDropFixtureAsset"("assetId");
CREATE INDEX "PreviewDropFixtureAsset_scenario_assetId_idx" ON "PreviewDropFixtureAsset"("scenario", "assetId");

ALTER TABLE "Drop" ADD CONSTRAINT "Drop_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropInventoryItem" ADD CONSTRAINT "DropInventoryItem_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropInventoryItem" ADD CONSTRAINT "DropInventoryItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropAssetLock" ADD CONSTRAINT "DropAssetLock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropAssetLock" ADD CONSTRAINT "DropAssetLock_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropAssetLock" ADD CONSTRAINT "DropAssetLock_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "DropInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropHistoryEvent" ADD CONSTRAINT "DropHistoryEvent_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "Drop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DropHistoryEvent" ADD CONSTRAINT "DropHistoryEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PreviewDropFixture" ADD CONSTRAINT "PreviewDropFixture_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreviewDropFixtureAsset" ADD CONSTRAINT "PreviewDropFixtureAsset_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "PreviewDropFixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreviewDropFixtureAsset" ADD CONSTRAINT "PreviewDropFixtureAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Drop" ADD CONSTRAINT "Drop_openingCount_nonnegative" CHECK ("openingCount" >= 0);
ALTER TABLE "Drop" ADD CONSTRAINT "Drop_version_positive" CHECK ("version" > 0);
ALTER TABLE "DropAssetLock" ADD CONSTRAINT "DropAssetLock_version_positive" CHECK ("version" > 0);
