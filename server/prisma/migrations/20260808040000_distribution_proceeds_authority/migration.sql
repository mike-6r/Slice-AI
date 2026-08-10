-- Document 015: a verified sale must reference finance-authoritative proceeds.
ALTER TYPE "JournalTransactionType" ADD VALUE 'DISTRIBUTION';

ALTER TABLE "ExternalSaleVerification"
  ADD COLUMN "proceedsAccountId" TEXT NOT NULL,
  ADD COLUMN "proceedsJournalId" TEXT NOT NULL;

CREATE UNIQUE INDEX "ExternalSaleVerification_proceedsJournalId_key"
  ON "ExternalSaleVerification"("proceedsJournalId");

ALTER TABLE "ExternalSaleVerification"
  ADD CONSTRAINT "ExternalSaleVerification_proceedsAccountId_fkey"
  FOREIGN KEY ("proceedsAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ExternalSaleVerification_proceedsJournalId_fkey"
  FOREIGN KEY ("proceedsJournalId") REFERENCES "JournalTransaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
