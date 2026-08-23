ALTER TABLE "Session"
  ADD COLUMN "recentAuthAt" TIMESTAMP(3);

CREATE INDEX "Session_recentAuthAt_idx" ON "Session"("recentAuthAt");
