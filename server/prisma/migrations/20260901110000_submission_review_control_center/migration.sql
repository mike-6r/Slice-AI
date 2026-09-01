ALTER TABLE "AssetSubmission"
  ADD COLUMN "reviewMetadata" JSONB;

CREATE TYPE "SubmissionReviewFindingSeverity" AS ENUM ('ADVISORY', 'BLOCKING');
CREATE TYPE "SubmissionReviewFindingStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "SubmissionReviewFinding" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "severity" "SubmissionReviewFindingSeverity" NOT NULL DEFAULT 'ADVISORY',
    "status" "SubmissionReviewFindingStatus" NOT NULL DEFAULT 'OPEN',
    "customerAction" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionReviewFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubmissionReviewFinding_submissionId_status_severity_createdAt_id_idx"
  ON "SubmissionReviewFinding"("submissionId", "status", "severity", "createdAt", "id");
CREATE INDEX "SubmissionReviewFinding_createdByUserId_createdAt_id_idx"
  ON "SubmissionReviewFinding"("createdByUserId", "createdAt", "id");

ALTER TABLE "SubmissionReviewFinding"
  ADD CONSTRAINT "SubmissionReviewFinding_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
