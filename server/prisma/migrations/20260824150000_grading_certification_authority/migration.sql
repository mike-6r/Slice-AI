ALTER TABLE "GradingCompany"
  ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "verificationMode" TEXT NOT NULL DEFAULT 'MANUAL_OFFICIAL_LOOKUP',
  ADD COLUMN "supportsCertVerification" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "supportsAutomatedVerification" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "officialVerificationUrl" TEXT,
  ADD COLUMN "certificationFormat" TEXT,
  ADD COLUMN "gradeScaleVersion" TEXT NOT NULL DEFAULT 'unconfirmed-v1';

UPDATE "GradingCompany" SET "displayName" = "name" WHERE "displayName" = '';

ALTER TABLE "GradeScaleEntry"
  ADD COLUMN "designation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "legacy" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gradeEra" TEXT,
  ADD COLUMN "scaleVersion" TEXT;

ALTER TABLE "Asset"
  ADD COLUMN "normalizedCertificationNumber" TEXT;

ALTER TABLE "AssetSubmission"
  ADD COLUMN "normalizedCertificationNumber" TEXT;

CREATE TABLE "GradingCertificationVerification" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "companyCode" TEXT NOT NULL,
  "certificationNumber" TEXT NOT NULL,
  "normalizedCertificationNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "verificationMode" TEXT NOT NULL,
  "officialVerificationUrl" TEXT,
  "providerReference" TEXT,
  "verifiedCard" JSONB,
  "verifiedGrade" TEXT,
  "verifiedLabel" TEXT,
  "designation" TEXT,
  "subgrades" JSONB,
  "gradeEra" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradingCertificationVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GradingCertificationClaim" (
  "id" TEXT NOT NULL,
  "companyCode" TEXT NOT NULL,
  "normalizedCertificationNumber" TEXT NOT NULL,
  "submissionId" TEXT,
  "assetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMISSION',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradingCertificationClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GradingCertificationClaim_companyCode_normalizedCertificationNumber_key"
  ON "GradingCertificationClaim"("companyCode", "normalizedCertificationNumber");
CREATE INDEX "GradingCertificationVerification_submissionId_createdAt_id_idx"
  ON "GradingCertificationVerification"("submissionId", "createdAt", "id");
CREATE INDEX "GradingCertificationVerification_companyCode_normalizedCertificationNumber_status_idx"
  ON "GradingCertificationVerification"("companyCode", "normalizedCertificationNumber", "status");
CREATE INDEX "GradingCertificationClaim_submissionId_status_idx"
  ON "GradingCertificationClaim"("submissionId", "status");
CREATE INDEX "GradingCertificationClaim_assetId_status_idx"
  ON "GradingCertificationClaim"("assetId", "status");

UPDATE "Asset"
SET "normalizedCertificationNumber" = upper(regexp_replace("certificationNumber", '[^[:alnum:]]', '', 'g'))
WHERE "certificationNumber" IS NOT NULL AND "certificationNumber" <> '';

-- Submission certification numbers live in declaredMetadata. This backfill is
-- intentionally limited to active workflow records and leaves ambiguous or
-- malformed legacy data for staff review.
UPDATE "AssetSubmission"
SET "normalizedCertificationNumber" = upper(regexp_replace("declaredMetadata"->>'certificationNumber', '[^[:alnum:]]', '', 'g'))
WHERE "declaredMetadata"->>'certificationNumber' IS NOT NULL
  AND "declaredMetadata"->>'certificationNumber' <> ''
  AND "status" IN ('SUBMITTED', 'IN_REVIEW', 'APPROVED');

-- Existing assets are the strongest durable authority. If an approved
-- submission is already linked to that asset, retain both references on the
-- same claim; no legacy asset is rewritten.
INSERT INTO "GradingCertificationClaim" (
  "id", "companyCode", "normalizedCertificationNumber", "submissionId", "assetId", "status", "updatedAt"
)
SELECT
  'legacy-cert-' || md5(a.id),
  gc.code,
  a."normalizedCertificationNumber",
  s.id,
  a.id,
  'ACTIVE',
  CURRENT_TIMESTAMP
FROM "Asset" a
JOIN "GradeScaleEntry" gse ON gse.id = a."gradeScaleEntryId"
JOIN "GradingCompany" gc ON gc.id = gse."companyId"
LEFT JOIN "AssetSubmission" s ON s."assetId" = a.id
WHERE a."normalizedCertificationNumber" IS NOT NULL
ON CONFLICT ("companyCode", "normalizedCertificationNumber") DO NOTHING;

INSERT INTO "GradingCertificationClaim" (
  "id", "companyCode", "normalizedCertificationNumber", "submissionId", "status", "updatedAt"
)
SELECT
  'legacy-submission-cert-' || md5(s.id),
  gc.code,
  s."normalizedCertificationNumber",
  s.id,
  'SUBMISSION',
  CURRENT_TIMESTAMP
FROM "AssetSubmission" s
JOIN "GradeScaleEntry" gse ON gse.id = s."gradeScaleEntryId"
JOIN "GradingCompany" gc ON gc.id = gse."companyId"
WHERE s."normalizedCertificationNumber" IS NOT NULL
  AND s."status" IN ('SUBMITTED', 'IN_REVIEW', 'APPROVED')
ON CONFLICT ("companyCode", "normalizedCertificationNumber") DO NOTHING;

ALTER TABLE "GradingCertificationVerification"
  ADD CONSTRAINT "GradingCertificationVerification_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradingCertificationClaim"
  ADD CONSTRAINT "GradingCertificationClaim_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradingCertificationClaim"
  ADD CONSTRAINT "GradingCertificationClaim_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "GradeScaleEntry_companyId_grade_key";
CREATE UNIQUE INDEX "GradeScaleEntry_companyId_grade_designation_key"
  ON "GradeScaleEntry"("companyId", "grade", "designation");
