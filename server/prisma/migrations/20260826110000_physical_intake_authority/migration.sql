CREATE TYPE "IntakeExceptionCode" AS ENUM (
  'WRONG_ITEM',
  'DAMAGED_PACKAGE',
  'DAMAGED_COLLECTIBLE',
  'CERT_MISMATCH',
  'GRADE_MISMATCH',
  'IDENTITY_MISMATCH',
  'MISSING_CONTENTS',
  'TRACKING_MISMATCH',
  'DESTINATION_ERROR',
  'RETURN_TO_SENDER',
  'OTHER_REVIEW'
);

CREATE TYPE "IntakeExceptionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "IntakeVerificationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'VERIFIED', 'BLOCKED');

ALTER TABLE "IntakeReceiptConfirmation"
  ADD COLUMN "packageCondition" TEXT,
  ADD COLUMN "checklist" JSONB,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "photoMediaIds" JSONB;

CREATE TABLE "IntakeVerification" (
  "id" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "status" "IntakeVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "identityMatch" BOOLEAN,
  "certificationMatch" BOOLEAN,
  "gradeMatch" BOOLEAN,
  "variantMatch" BOOLEAN,
  "note" TEXT,
  "startedById" TEXT,
  "completedById" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completionIdempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntakeVerification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeVerification_intakeId_key" ON "IntakeVerification"("intakeId");
CREATE UNIQUE INDEX "IntakeVerification_completionIdempotencyKey_key" ON "IntakeVerification"("completionIdempotencyKey");
CREATE INDEX "IntakeVerification_status_updatedAt_id_idx" ON "IntakeVerification"("status", "updatedAt", "id");
ALTER TABLE "IntakeVerification" ADD CONSTRAINT "IntakeVerification_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SubmissionIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IntakeException" (
  "id" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "code" "IntakeExceptionCode" NOT NULL,
  "severity" "IntakeExceptionSeverity" NOT NULL DEFAULT 'MEDIUM',
  "notes" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "createdById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntakeException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeException_intakeId_resolvedAt_createdAt_id_idx" ON "IntakeException"("intakeId", "resolvedAt", "createdAt", "id");
CREATE INDEX "IntakeException_code_resolvedAt_createdAt_id_idx" ON "IntakeException"("code", "resolvedAt", "createdAt", "id");
ALTER TABLE "IntakeException" ADD CONSTRAINT "IntakeException_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SubmissionIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
