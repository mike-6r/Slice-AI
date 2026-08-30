CREATE TYPE "IntakeLocationStatus" AS ENUM ('ACTIVE', 'TEMPORARILY_UNAVAILABLE', 'INACTIVE');

ALTER TABLE "VaultIntakeLocation"
  ADD COLUMN "status" "IntakeLocationStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "receiverName" TEXT,
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "inPersonInstructions" TEXT;

ALTER TABLE "SubmissionIntake"
  ADD COLUMN "destinationSnapshot" JSONB;

UPDATE "VaultIntakeLocation"
SET "status" = CASE
  WHEN NOT active THEN 'INACTIVE'::"IntakeLocationStatus"
  WHEN NOT "intakeAvailable" THEN 'TEMPORARILY_UNAVAILABLE'::"IntakeLocationStatus"
  ELSE 'ACTIVE'::"IntakeLocationStatus"
END;

-- Preserve the authoritative UK staging facility id and make its purpose
-- explicit. This is an evolution of the existing record, not a new location.
UPDATE "VaultIntakeLocation"
SET "locationType" = 'DEMO_TEST'::"IntakeLocationType"
WHERE id = 'beta-test-uk-intake';

CREATE INDEX "VaultIntakeLocation_status_environment_countryCode_id_idx"
  ON "VaultIntakeLocation"("status", "environment", "countryCode", "id");

CREATE UNIQUE INDEX "VaultIntakeLocation_displayName_countryCode_key"
  ON "VaultIntakeLocation"("displayName", "countryCode");
