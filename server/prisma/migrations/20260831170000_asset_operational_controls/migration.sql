CREATE TYPE "AssetOperationalControlStatus" AS ENUM ('ACTIVE', 'FROZEN');

CREATE TABLE "AssetOperationalControl" (
    "assetId" TEXT NOT NULL,
    "status" "AssetOperationalControlStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "frozenAt" TIMESTAMP(3),
    "unfrozenAt" TIMESTAMP(3),
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetOperationalControl_pkey" PRIMARY KEY ("assetId")
);

CREATE INDEX "AssetOperationalControl_status_updatedAt_assetId_idx"
ON "AssetOperationalControl"("status", "updatedAt", "assetId");

ALTER TABLE "AssetOperationalControl"
ADD CONSTRAINT "AssetOperationalControl_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
