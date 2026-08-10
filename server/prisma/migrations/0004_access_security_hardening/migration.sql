-- Post-Document-005 access-control security hardening.
ALTER TABLE "Session"
  ADD COLUMN "authenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing sessions have an authentication time at migration application. New refresh rotations
-- preserve their predecessor's authentication time in application code.
