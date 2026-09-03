CREATE TYPE "QualificationOutcome" AS ENUM ('AUTO_QUALIFIED', 'HUMAN_REVIEW_REQUIRED', 'COLLECTOR_ACTION_REQUIRED', 'BLOCKED');
CREATE TYPE "QualificationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "QualificationCheckResult" AS ENUM ('PASS', 'ADVISORY', 'UNCERTAIN', 'FAIL', 'ACTION_REQUIRED', 'BLOCKED');

CREATE TABLE "QualificationRun" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'SUBMISSION_SUBMITTED',
  "policyVersion" TEXT NOT NULL,
  "status" "QualificationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "outcome" "QualificationOutcome",
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "reasons" JSONB,
  "actions" JSONB,
  "retryOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualificationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QualificationCheck" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "result" "QualificationCheckResult" NOT NULL,
  "mandatory" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualificationCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutoReviewPolicy" (
  "id" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL DEFAULT 'default',
  "version" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "enabledCategories" TEXT[] NOT NULL,
  "enabledGraders" TEXT[] NOT NULL,
  "qaSamplingBps" INTEGER NOT NULL DEFAULT 0,
  "autoPreSaleLaunch" BOOLEAN NOT NULL DEFAULT true,
  "defaultPreSaleSupply" BIGINT NOT NULL DEFAULT 1000,
  "emergencyDisabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutoReviewPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoReviewPolicy_policyKey_key" ON "AutoReviewPolicy"("policyKey");
CREATE INDEX "QualificationRun_submissionId_createdAt_id_idx" ON "QualificationRun"("submissionId", "createdAt", "id");
CREATE INDEX "QualificationRun_outcome_createdAt_id_idx" ON "QualificationRun"("outcome", "createdAt", "id");
CREATE INDEX "QualificationRun_status_createdAt_id_idx" ON "QualificationRun"("status", "createdAt", "id");
CREATE INDEX "QualificationCheck_runId_code_idx" ON "QualificationCheck"("runId", "code");
CREATE INDEX "QualificationCheck_code_result_createdAt_id_idx" ON "QualificationCheck"("code", "result", "createdAt", "id");
CREATE INDEX "AutoReviewPolicy_enabled_emergencyDisabled_updatedAt_idx" ON "AutoReviewPolicy"("enabled", "emergencyDisabled", "updatedAt");

ALTER TABLE "QualificationRun" ADD CONSTRAINT "QualificationRun_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QualificationCheck" ADD CONSTRAINT "QualificationCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QualificationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
