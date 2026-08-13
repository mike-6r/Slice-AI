-- CreateEnum
CREATE TYPE "RawCardPreGradeStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'TEMPORARILY_UNAVAILABLE', 'NOT_CONFIGURED', 'STALE');

-- CreateTable
CREATE TABLE "RawCardPreGrade" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "status" "RawCardPreGradeStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "overallEstimate" DOUBLE PRECISION,
    "overallMin" DOUBLE PRECISION,
    "overallMax" DOUBLE PRECISION,
    "frontDetected" BOOLEAN,
    "backDetected" BOOLEAN,
    "centeringScore" DOUBLE PRECISION,
    "cornerScore" DOUBLE PRECISION,
    "edgeScore" DOUBLE PRECISION,
    "surfaceScore" DOUBLE PRECISION,
    "conditionLabel" TEXT,
    "autographDetected" BOOLEAN,
    "categoryDetected" TEXT,
    "warnings" JSONB,
    "analysisFingerprint" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3),
    "providerVersion" TEXT,
    "errorCode" TEXT,
    "rawResponse" JSONB,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawCardPreGrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawCardPreGrade_submissionId_analysisFingerprint_key" ON "RawCardPreGrade"("submissionId", "analysisFingerprint");
CREATE INDEX "RawCardPreGrade_submissionId_createdAt_idx" ON "RawCardPreGrade"("submissionId", "createdAt");
CREATE INDEX "RawCardPreGrade_status_updatedAt_idx" ON "RawCardPreGrade"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "RawCardPreGrade" ADD CONSTRAINT "RawCardPreGrade_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
