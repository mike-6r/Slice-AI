-- Stable public collector directory pagination.
CREATE INDEX "PublicCollectorProfile_isPublic_createdAt_userId_idx"
ON "PublicCollectorProfile"("isPublic", "createdAt" DESC, "userId" DESC);
