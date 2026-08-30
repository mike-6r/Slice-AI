CREATE TYPE "IntakeDeliveryMethod" AS ENUM ('SHIPMENT', 'IN_PERSON');
CREATE TYPE "IntakeLocationType" AS ENUM (
  'SLICE_VAULT',
  'SLICE_INTAKE',
  'PARTNER_STORE',
  'PARTNER_INTAKE',
  'DEMO_TEST'
);

ALTER TABLE "VaultIntakeLocation"
  ADD COLUMN "acceptingInPerson" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "locationType" "IntakeLocationType" NOT NULL DEFAULT 'SLICE_VAULT';

ALTER TABLE "AssetSubmission"
  ADD COLUMN "preferredIntakeLocationId" TEXT,
  ADD COLUMN "preferredDeliveryMethod" "IntakeDeliveryMethod";

ALTER TABLE "SubmissionIntake"
  ADD COLUMN "deliveryMethod" "IntakeDeliveryMethod" NOT NULL DEFAULT 'SHIPMENT';

CREATE INDEX "AssetSubmission_preferredIntakeLocationId_idx"
  ON "AssetSubmission"("preferredIntakeLocationId");

ALTER TABLE "AssetSubmission"
  ADD CONSTRAINT "AssetSubmission_preferredIntakeLocationId_fkey"
  FOREIGN KEY ("preferredIntakeLocationId") REFERENCES "VaultIntakeLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
