CREATE TABLE "SubmissionMarketResearch" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT,
  "ownerUserId" TEXT NOT NULL,
  "identityHash" TEXT NOT NULL,
  "identity" JSONB NOT NULL,
  "state" TEXT NOT NULL,
  "dataQuality" TEXT,
  "sourceCoverage" JSONB NOT NULL,
  "providerFailures" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionMarketResearch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionMarketResearch_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "SubmissionMarketObservation" (
  "id" TEXT NOT NULL,
  "researchId" TEXT NOT NULL,
  "providerCode" TEXT NOT NULL,
  "externalReferenceId" TEXT NOT NULL,
  "externalUrl" TEXT,
  "observationType" TEXT NOT NULL,
  "originalTitle" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "soldAt" TIMESTAMP(3),
  "grader" TEXT,
  "grade" TEXT,
  "variant" TEXT,
  "matchQuality" TEXT NOT NULL,
  "exclusionReason" TEXT,
  "includedInSnapshot" BOOLEAN NOT NULL DEFAULT false,
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionMarketObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubmissionMarketObservation_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "SubmissionMarketResearch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubmissionMarketObservation_researchId_providerCode_externalReferenceId_key" ON "SubmissionMarketObservation"("researchId", "providerCode", "externalReferenceId");
CREATE INDEX "SubmissionMarketResearch_ownerUserId_identityHash_expiresAt_idx" ON "SubmissionMarketResearch"("ownerUserId", "identityHash", "expiresAt");
CREATE INDEX "SubmissionMarketResearch_submissionId_collectedAt_id_idx" ON "SubmissionMarketResearch"("submissionId", "collectedAt", "id");
CREATE INDEX "SubmissionMarketObservation_researchId_observationType_matchQuality_observedAt_idx" ON "SubmissionMarketObservation"("researchId", "observationType", "matchQuality", "observedAt");
