-- CreateEnum
CREATE TYPE "FinancialAccountOwnerType" AS ENUM ('USER', 'PLATFORM', 'CLEARING', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "DebitCredit" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "FinancialAccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JournalTransactionType" AS ENUM ('DEMO_FUNDING', 'CASH_RESERVATION', 'CASH_RELEASE', 'FEE', 'REFUND', 'REVERSAL', 'ADMIN_CORRECTION');

-- CreateEnum
CREATE TYPE "JournalTransactionStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CashReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PortfolioLotStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinancialReconciliationStatus" AS ENUM ('RECONCILED', 'MISMATCH');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "ownerType" "FinancialAccountOwnerType" NOT NULL,
    "ownerUserId" TEXT,
    "accountType" "FinancialAccountType" NOT NULL,
    "code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "normalSide" "DebitCredit" NOT NULL,
    "status" "FinancialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTransaction" (
    "id" TEXT NOT NULL,
    "type" "JournalTransactionType" NOT NULL,
    "status" "JournalTransactionStatus" NOT NULL DEFAULT 'POSTED',
    "currency" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "descriptionCode" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdByUserId" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "side" "DebitCredit" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBalance" (
    "accountId" TEXT NOT NULL,
    "postedDebitMinor" BIGINT NOT NULL DEFAULT 0,
    "postedCreditMinor" BIGINT NOT NULL DEFAULT 0,
    "reservedMinor" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBalance_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "CashReservation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purposeType" TEXT NOT NULL,
    "purposeId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "status" "CashReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "acquiredUnits" BIGINT NOT NULL,
    "remainingUnits" BIGINT NOT NULL,
    "totalCostMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceReference" TEXT NOT NULL,
    "status" "PortfolioLotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotDisposal" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "units" BIGINT NOT NULL,
    "allocatedCostMinor" BIGINT NOT NULL,
    "proceedsMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "realizedPnlMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotDisposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReconciliationRun" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "FinancialReconciliationStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "debitMinor" BIGINT NOT NULL,
    "creditMinor" BIGINT NOT NULL,
    "mismatchCodes" JSONB NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialAccount_ownerUserId_currency_status_idx" ON "FinancialAccount"("ownerUserId", "currency", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_ownerType_ownerUserId_code_currency_key" ON "FinancialAccount"("ownerType", "ownerUserId", "code", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_correlationId_key" ON "JournalTransaction"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_reversalOfId_key" ON "JournalTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalTransaction_currency_effectiveAt_id_idx" ON "JournalTransaction"("currency", "effectiveAt", "id");

-- CreateIndex
CREATE INDEX "JournalEntry_accountId_createdAt_id_idx" ON "JournalEntry"("accountId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_transactionId_sequence_key" ON "JournalEntry"("transactionId", "sequence");

-- CreateIndex
CREATE INDEX "CashReservation_accountId_status_expiresAt_idx" ON "CashReservation"("accountId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashReservation_accountId_purposeType_purposeId_key" ON "CashReservation"("accountId", "purposeType", "purposeId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioLot_sourceReference_key" ON "PortfolioLot"("sourceReference");

-- CreateIndex
CREATE INDEX "PortfolioLot_userId_assetId_acquiredAt_id_idx" ON "PortfolioLot"("userId", "assetId", "acquiredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LotDisposal_sourceReference_key" ON "LotDisposal"("sourceReference");

-- CreateIndex
CREATE INDEX "LotDisposal_lotId_createdAt_id_idx" ON "LotDisposal"("lotId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FinancialReconciliationRun_scope_createdAt_id_idx" ON "FinancialReconciliationRun"("scope", "createdAt", "id");

-- RenameForeignKey
ALTER TABLE "OwnershipLedgerEntry" RENAME CONSTRAINT "OwnershipLedgerEntry_assetId_supply_fkey" TO "OwnershipLedgerEntry_assetId_fkey";

-- RenameForeignKey
ALTER TABLE "OwnershipPosition" RENAME CONSTRAINT "OwnershipPosition_assetId_supply_fkey" TO "OwnershipPosition_assetId_fkey";

-- RenameForeignKey
ALTER TABLE "OwnershipReservation" RENAME CONSTRAINT "OwnershipReservation_position_fkey" TO "OwnershipReservation_assetId_accountId_fkey";

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "JournalTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountBalance" ADD CONSTRAINT "AccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReservation" ADD CONSTRAINT "CashReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioLot" ADD CONSTRAINT "PortfolioLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioLot" ADD CONSTRAINT "PortfolioLot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotDisposal" ADD CONSTRAINT "LotDisposal_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "PortfolioLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OwnershipReservation_assetId_accountId_purposeType_purposeId_ke" RENAME TO "OwnershipReservation_assetId_accountId_purposeType_purposeI_key";
