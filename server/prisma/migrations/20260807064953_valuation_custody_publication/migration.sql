-- CreateEnum
CREATE TYPE "ValuationDecisionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('EXPECTED', 'RECEIVED', 'INSPECTED', 'SECURED', 'RELEASE_PENDING', 'RELEASED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "InsuranceCoverageStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "AssetPublicationStatus" AS ENUM ('BLOCKED', 'READY', 'PUBLISHED', 'UNPUBLISHED');

-- CreateTable
CREATE TABLE "ValuationEvidence" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "valueMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "conditionBasis" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "documentMediaId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationDecision" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "valueMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "methodologyCode" TEXT NOT NULL,
    "decidedByUserId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "status" "ValuationDecisionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultCustodyRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "facilityCode" TEXT,
    "status" "CustodyStatus" NOT NULL DEFAULT 'EXPECTED',
    "providerRef" TEXT,
    "receivedAt" TIMESTAMP(3),
    "securedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCustodyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "custodyRecordId" TEXT NOT NULL,
    "fromStatus" "CustodyStatus",
    "toStatus" "CustodyStatus" NOT NULL,
    "actorUserId" TEXT,
    "providerRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceCoverage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "policyRef" TEXT,
    "insuredValueMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InsuranceCoverageStatus" NOT NULL DEFAULT 'PENDING',
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "evidenceMediaId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPublication" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "AssetPublicationStatus" NOT NULL DEFAULT 'BLOCKED',
    "readiness" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "unpublishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValuationEvidence_assetId_observedAt_id_idx" ON "ValuationEvidence"("assetId", "observedAt", "id");

-- CreateIndex
CREATE INDEX "ValuationEvidence_assetId_sourceType_createdAt_idx" ON "ValuationEvidence"("assetId", "sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "ValuationDecision_assetId_status_decidedAt_id_idx" ON "ValuationDecision"("assetId", "status", "decidedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "VaultCustodyRecord_assetId_key" ON "VaultCustodyRecord"("assetId");

-- CreateIndex
CREATE INDEX "VaultCustodyRecord_status_updatedAt_id_idx" ON "VaultCustodyRecord"("status", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "CustodyEvent_assetId_occurredAt_id_idx" ON "CustodyEvent"("assetId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "CustodyEvent_custodyRecordId_createdAt_id_idx" ON "CustodyEvent"("custodyRecordId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "InsuranceCoverage_assetId_status_expiresAt_id_idx" ON "InsuranceCoverage"("assetId", "status", "expiresAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPublication_assetId_key" ON "AssetPublication"("assetId");

-- CreateIndex
CREATE INDEX "AssetPublication_status_updatedAt_id_idx" ON "AssetPublication"("status", "updatedAt", "id");

-- AddForeignKey
ALTER TABLE "ValuationEvidence" ADD CONSTRAINT "ValuationEvidence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationEvidence" ADD CONSTRAINT "ValuationEvidence_documentMediaId_fkey" FOREIGN KEY ("documentMediaId") REFERENCES "SubmissionMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationEvidence" ADD CONSTRAINT "ValuationEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationDecision" ADD CONSTRAINT "ValuationDecision_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationDecision" ADD CONSTRAINT "ValuationDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultCustodyRecord" ADD CONSTRAINT "VaultCustodyRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_custodyRecordId_fkey" FOREIGN KEY ("custodyRecordId") REFERENCES "VaultCustodyRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCoverage" ADD CONSTRAINT "InsuranceCoverage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCoverage" ADD CONSTRAINT "InsuranceCoverage_evidenceMediaId_fkey" FOREIGN KEY ("evidenceMediaId") REFERENCES "SubmissionMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPublication" ADD CONSTRAINT "AssetPublication_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPublication" ADD CONSTRAINT "AssetPublication_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
