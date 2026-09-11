-- Provider identifiers are encrypted at rest. Hashes support idempotent
-- lookup only; no bank or card numbers are stored in Slice.
ALTER TABLE "MoneyMovement"
  ADD COLUMN "selectedPayoutDestinationIdCiphertext" TEXT,
  ADD COLUMN "selectedPayoutDestinationIdHash" TEXT;

CREATE INDEX "MoneyMovement_provider_selectedPayoutDestinationIdHash_idx"
  ON "MoneyMovement"("provider", "selectedPayoutDestinationIdHash");

ALTER TABLE "ConnectPayout"
  ADD COLUMN "transferBalanceTransactionIdCiphertext" TEXT,
  ADD COLUMN "transferBalanceTransactionIdHash" TEXT,
  ADD COLUMN "destinationPaymentIdCiphertext" TEXT,
  ADD COLUMN "destinationPaymentIdHash" TEXT,
  ADD COLUMN "payoutBalanceTransactionIdCiphertext" TEXT,
  ADD COLUMN "payoutBalanceTransactionIdHash" TEXT,
  ADD COLUMN "externalDestinationIdCiphertext" TEXT,
  ADD COLUMN "externalDestinationIdHash" TEXT,
  ADD COLUMN "payoutMethod" TEXT,
  ADD COLUMN "arrivalDate" TIMESTAMP(3);

CREATE INDEX "ConnectPayout_provider_externalDestinationIdHash_idx"
  ON "ConnectPayout"("provider", "externalDestinationIdHash");
