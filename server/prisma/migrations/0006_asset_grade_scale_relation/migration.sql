-- Replace the denormalized company/decimal pair with one authoritative grade-scale relation.
ALTER TABLE "Asset" ADD COLUMN "gradeScaleEntryId" TEXT;
UPDATE "Asset" AS asset
SET "gradeScaleEntryId" = grade_entry."id"
FROM "GradeScaleEntry" AS grade_entry
WHERE asset."gradingCompanyId" = grade_entry."companyId"
  AND asset."grade" = grade_entry."grade";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Asset" WHERE "grade" IS NOT NULL AND "gradeScaleEntryId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate Asset grade: no matching GradeScaleEntry';
  END IF;
END $$;
DROP INDEX "Asset_gradingCompanyId_certificationNumber_key";
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_gradingCompanyId_fkey";
ALTER TABLE "Asset" DROP COLUMN "gradingCompanyId", DROP COLUMN "grade";
CREATE UNIQUE INDEX "Asset_gradeScaleEntryId_certificationNumber_key" ON "Asset"("gradeScaleEntryId", "certificationNumber");
CREATE INDEX "Asset_gradeScaleEntryId_idx" ON "Asset"("gradeScaleEntryId");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_gradeScaleEntryId_fkey" FOREIGN KEY ("gradeScaleEntryId") REFERENCES "GradeScaleEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
