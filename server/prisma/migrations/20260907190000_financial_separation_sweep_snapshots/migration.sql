-- Revenue-sweep requests retain the exact financial read-model evaluated by
-- Finance. These fields are nullable only for historical rows created before
-- dual-control sweep snapshots existed.
ALTER TABLE "PlatformRevenueSettlement"
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "beforeFinancialSnapshot" JSONB,
  ADD COLUMN "afterFinancialSnapshot" JSONB;
