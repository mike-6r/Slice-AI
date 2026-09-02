ALTER TABLE "VaultIntakeLocation"
  ADD COLUMN "internalName" TEXT,
  ADD COLUMN "operationalNotes" TEXT,
  ADD COLUMN "internalContact" TEXT,
  ADD COLUMN "openingHours" TEXT,
  ADD COLUMN "appointmentRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "walkInsAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicContactInstructions" TEXT,
  ADD COLUMN "packageLabelInstructions" TEXT,
  ADD COLUMN "specialHandlingInstructions" TEXT,
  ADD COLUMN "maximumActiveIntakes" INTEGER,
  ADD COLUMN "warningThreshold" INTEGER,
  ADD COLUMN "pauseReason" TEXT,
  ADD COLUMN "pauseEffectiveAt" TIMESTAMP(3),
  ADD COLUMN "expectedResumeAt" TIMESTAMP(3);

ALTER TABLE "VaultIntakeLocation"
  ADD CONSTRAINT "VaultIntakeLocation_capacity_threshold_check"
  CHECK (
    ("maximumActiveIntakes" IS NULL OR "maximumActiveIntakes" > 0)
    AND ("warningThreshold" IS NULL OR "warningThreshold" >= 0)
    AND ("maximumActiveIntakes" IS NULL OR "warningThreshold" IS NULL OR "warningThreshold" <= "maximumActiveIntakes")
  );
