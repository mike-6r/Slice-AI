-- Featured is presentation metadata only. It does not change collector
-- visibility, ownership, submissions, or marketplace lifecycle state.
ALTER TABLE "PublicCollectorProfile"
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featuredAt" TIMESTAMP(3);

CREATE INDEX "PublicCollectorProfile_isPublic_isFeatured_featuredAt_createdAt_userId_idx"
  ON "PublicCollectorProfile"("isPublic", "isFeatured", "featuredAt", "createdAt", "userId");
