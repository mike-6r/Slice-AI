ALTER TABLE "VerificationReview"
  ADD COLUMN "staffCondition" TEXT,
  ADD COLUMN "staffConditionNote" TEXT,
  ADD COLUMN "valuationMinor" BIGINT,
  ADD COLUMN "valuationCurrency" TEXT,
  ADD COLUMN "valuationBasis" TEXT,
  ADD COLUMN "valuationConfidence" INTEGER,
  ADD COLUMN "valuationNote" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VerificationReview"
  ADD CONSTRAINT "VerificationReview_valuationConfidence_range"
  CHECK ("valuationConfidence" IS NULL OR ("valuationConfidence" >= 0 AND "valuationConfidence" <= 100));

ALTER TABLE "VerificationReview"
  ADD CONSTRAINT "VerificationReview_valuationMinor_nonnegative"
  CHECK ("valuationMinor" IS NULL OR "valuationMinor" >= 0);
