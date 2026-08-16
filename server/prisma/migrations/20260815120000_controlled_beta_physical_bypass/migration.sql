-- Controlled Beta QA only. This record enables a named asset to continue
-- without changing shipment, delivery, receipt, or physical custody state.
CREATE TABLE "ControlledBetaPhysicalBypass" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlledBetaPhysicalBypass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlledBetaPhysicalBypass_submissionId_key" ON "ControlledBetaPhysicalBypass"("submissionId");
CREATE UNIQUE INDEX "ControlledBetaPhysicalBypass_assetId_key" ON "ControlledBetaPhysicalBypass"("assetId");
CREATE INDEX "ControlledBetaPhysicalBypass_assetId_createdAt_id_idx" ON "ControlledBetaPhysicalBypass"("assetId", "createdAt", "id");
CREATE INDEX "ControlledBetaPhysicalBypass_createdByUserId_createdAt_id_idx" ON "ControlledBetaPhysicalBypass"("createdByUserId", "createdAt", "id");

ALTER TABLE "ControlledBetaPhysicalBypass" ADD CONSTRAINT "ControlledBetaPhysicalBypass_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ControlledBetaPhysicalBypass" ADD CONSTRAINT "ControlledBetaPhysicalBypass_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ControlledBetaPhysicalBypass" ADD CONSTRAINT "ControlledBetaPhysicalBypass_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
