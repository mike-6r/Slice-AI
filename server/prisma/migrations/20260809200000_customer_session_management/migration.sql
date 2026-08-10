-- Add an opaque, stable public reference for customer session management.
-- Existing refresh/session authority remains keyed by Session.id and tokenHash.
ALTER TABLE "Session" ADD COLUMN "publicId" TEXT;

-- Backfill pre-existing sessions without deriving a visible reference from a
-- token or disclosing the internal session id.
UPDATE "Session"
SET "publicId" = 'session_' || md5(
  "id" || clock_timestamp()::text || random()::text
)
WHERE "publicId" IS NULL;

ALTER TABLE "Session" ALTER COLUMN "publicId" SET NOT NULL;

CREATE UNIQUE INDEX "Session_publicId_key" ON "Session"("publicId");
CREATE INDEX "Session_userId_publicId_idx" ON "Session"("userId", "publicId");
