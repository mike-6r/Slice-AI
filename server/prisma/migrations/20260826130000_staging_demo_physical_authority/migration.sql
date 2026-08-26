-- Staging/demo physical authority is intentionally distinct from normal
-- shipment, receipt, verification and vault-custody records.
CREATE TABLE "StagingDemoPhysicalIntake" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fixtureKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DEMO_INTAKE',
    "destinationLabel" TEXT NOT NULL,
    "simulationNote" TEXT NOT NULL,
    "identityMatch" BOOLEAN NOT NULL,
    "certificationMatch" BOOLEAN NOT NULL,
    "gradeMatch" BOOLEAN NOT NULL,
    "variantMatch" BOOLEAN NOT NULL,
    "simulatedReceiptAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "custodyAt" TIMESTAMP(3) NOT NULL,
    "completedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StagingDemoPhysicalIntake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StagingDemoPhysicalIntake_submissionId_key" ON "StagingDemoPhysicalIntake"("submissionId");
CREATE UNIQUE INDEX "StagingDemoPhysicalIntake_assetId_key" ON "StagingDemoPhysicalIntake"("assetId");
CREATE INDEX "StagingDemoPhysicalIntake_completedByUserId_createdAt_id_idx" ON "StagingDemoPhysicalIntake"("completedByUserId", "createdAt", "id");

ALTER TABLE "StagingDemoPhysicalIntake" ADD CONSTRAINT "StagingDemoPhysicalIntake_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StagingDemoPhysicalIntake" ADD CONSTRAINT "StagingDemoPhysicalIntake_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StagingDemoPhysicalIntake" ADD CONSTRAINT "StagingDemoPhysicalIntake_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
