-- Document 018: encrypted Plaid Link connection material and safe display metadata.
-- No access token or provider reference is ever exposed through user DTOs.
ALTER TABLE "ExternalFinancialAccount"
  ADD COLUMN "itemReferenceCiphertext" TEXT,
  ADD COLUMN "itemReferenceHash" TEXT,
  ADD COLUMN "accessTokenCiphertext" TEXT,
  ADD COLUMN "accessTokenHash" TEXT,
  ADD COLUMN "institutionName" TEXT,
  ADD COLUMN "accountName" TEXT,
  ADD COLUMN "accountMask" TEXT;

CREATE INDEX "ExternalFinancialAccount_userId_provider_itemReferenceHash_idx"
  ON "ExternalFinancialAccount"("userId", "provider", "itemReferenceHash");
