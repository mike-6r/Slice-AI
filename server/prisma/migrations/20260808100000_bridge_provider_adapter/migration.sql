-- Preserve historical provider rows while making Bridge the active external
-- movement provider and neutralising the generic clearing account identifier.
ALTER TYPE "ProviderCode" ADD VALUE IF NOT EXISTS 'BRIDGE';

UPDATE "FinancialAccount"
SET "code" = 'EXTERNAL_GBP_CLEARING'
WHERE "ownerType" = 'CLEARING'
  AND "code" = 'BVNK_GBP_CLEARING'
  AND "currency" = 'GBP';
