-- PostgreSQL requires a newly-added enum value to be committed before it can
-- be used in a default or DML statement. Keep this in a follow-up migration
-- so deploys remain safe on supported PostgreSQL versions.
ALTER TABLE "CollectorSubscription"
  ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';

-- Providerless rows from the former local/demo membership shell are not
-- evidence of a paid subscription. Preserve their history while requiring a
-- verified Stripe subscription before they become active again.
UPDATE "CollectorSubscription"
SET "status" = 'INCOMPLETE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('ACTIVE', 'TRIALING')
  AND ("provider" IS NULL OR "provider" = 'STAGING_DEMO');
