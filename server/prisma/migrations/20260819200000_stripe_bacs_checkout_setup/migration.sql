-- Replace raw Bacs setup references with encrypted/hash provider references.
-- The legacy setup-intent column remains nullable for additive compatibility;
-- new writes must use the safe reference columns.
ALTER TABLE "BacsSetupSession"
  ALTER COLUMN "externalSetupIntentId" DROP NOT NULL;

ALTER TABLE "BacsSetupSession"
  ADD COLUMN "externalCheckoutSessionReferenceCiphertext" TEXT,
  ADD COLUMN "externalCheckoutSessionReferenceHash" TEXT,
  ADD COLUMN "externalSetupIntentReferenceCiphertext" TEXT,
  ADD COLUMN "externalSetupIntentReferenceHash" TEXT,
  ADD COLUMN "externalPaymentMethodReferenceCiphertext" TEXT,
  ADD COLUMN "externalPaymentMethodReferenceHash" TEXT;

CREATE UNIQUE INDEX "BacsSetupSession_externalCheckoutSessionReferenceHash_key"
  ON "BacsSetupSession" ("externalCheckoutSessionReferenceHash");
CREATE UNIQUE INDEX "BacsSetupSession_externalSetupIntentReferenceHash_key"
  ON "BacsSetupSession" ("externalSetupIntentReferenceHash");
CREATE UNIQUE INDEX "BacsSetupSession_externalPaymentMethodReferenceHash_key"
  ON "BacsSetupSession" ("externalPaymentMethodReferenceHash");
