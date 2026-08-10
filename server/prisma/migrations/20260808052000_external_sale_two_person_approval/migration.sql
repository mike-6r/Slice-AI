CREATE TABLE "ExternalSaleVerificationApproval" (
    "id" TEXT NOT NULL,
    "saleVerificationId" TEXT NOT NULL,
    "verifierUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalSaleVerificationApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalSaleVerificationApproval_saleVerificationId_verifierUserId_key"
ON "ExternalSaleVerificationApproval"("saleVerificationId", "verifierUserId");

CREATE INDEX "ExternalSaleVerificationApproval_saleVerificationId_createdAt_id_idx"
ON "ExternalSaleVerificationApproval"("saleVerificationId", "createdAt", "id");

ALTER TABLE "ExternalSaleVerificationApproval"
ADD CONSTRAINT "ExternalSaleVerificationApproval_saleVerificationId_fkey"
FOREIGN KEY ("saleVerificationId") REFERENCES "ExternalSaleVerification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExternalSaleVerificationApproval"
ADD CONSTRAINT "ExternalSaleVerificationApproval_verifierUserId_fkey"
FOREIGN KEY ("verifierUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
