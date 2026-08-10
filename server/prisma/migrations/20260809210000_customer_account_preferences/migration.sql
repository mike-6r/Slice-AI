-- Durable, non-financial customer display preferences. GBP remains the
-- finance authority; locale is intentionally constrained in application code.
ALTER TABLE "UserProfile"
ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-GB';
