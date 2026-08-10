-- CreateEnum
CREATE TYPE "ProviderCode" AS ENUM ('SUMSUB', 'TRM', 'BVNK', 'LOCAL_TEST');

-- CreateEnum
CREATE TYPE "ComplianceCaseType" AS ENUM ('KYC', 'KYT');

-- CreateEnum
CREATE TYPE "ComplianceCaseStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'MANUAL_REVIEW', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MoneyMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "MoneyMovementStatus" AS ENUM ('CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'SETTLED', 'FAILED', 'CANCELLED', 'REVERSED', 'MANUAL_REVIEW', 'HELD');

-- CreateEnum
CREATE TYPE "WebhookInboxStatus" AS ENUM ('ACCEPTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProviderReconciliationStatus" AS ENUM ('RECONCILED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "ComplianceHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "ProviderIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProviderIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "ComplianceCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "type" "ComplianceCaseType" NOT NULL,
    "status" "ComplianceCaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "providerReferenceCiphertext" TEXT,
    "providerReferenceHash" TEXT,
    "encryptionKeyVersion" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDecision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "status" "ComplianceCaseStatus" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "providerEventIdHash" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalFinancialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "providerReferenceCiphertext" TEXT NOT NULL,
    "providerReferenceHash" TEXT NOT NULL,
    "encryptionKeyVersion" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalFinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "cashAccountId" TEXT NOT NULL,
    "type" "MoneyMovementType" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "MoneyMovementStatus" NOT NULL DEFAULT 'CREATED',
    "provider" "ProviderCode" NOT NULL,
    "providerReferenceCiphertext" TEXT,
    "providerReferenceHash" TEXT,
    "encryptionKeyVersion" TEXT,
    "idempotencyKeyHash" TEXT NOT NULL,
    "reservationId" TEXT,
    "ledgerTransactionId" TEXT,
    "failureCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "MoneyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyMovementHistory" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "fromStatus" "MoneyMovementStatus",
    "toStatus" "MoneyMovementStatus" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyMovementHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookInbox" (
    "id" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "providerEventIdHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadCiphertext" TEXT,
    "payloadHash" TEXT NOT NULL,
    "encryptionKeyVersion" TEXT,
    "signatureVerified" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "WebhookInboxStatus" NOT NULL DEFAULT 'ACCEPTED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,

    CONSTRAINT "WebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderReconciliationRun" (
    "id" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "status" "ProviderReconciliationStatus" NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDiscrepancy" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "movementId" TEXT,
    "expectedMinor" BIGINT,
    "actualMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movementId" TEXT,
    "scope" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ComplianceHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderIncident" (
    "id" TEXT NOT NULL,
    "provider" "ProviderCode" NOT NULL,
    "severity" "ProviderIncidentSeverity" NOT NULL,
    "status" "ProviderIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "code" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceCase_userId_status_updatedAt_idx" ON "ComplianceCase"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ComplianceCase_provider_status_updatedAt_idx" ON "ComplianceCase"("provider", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCase_userId_provider_type_key" ON "ComplianceCase"("userId", "provider", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceCase_provider_providerReferenceHash_key" ON "ComplianceCase"("provider", "providerReferenceHash");

-- CreateIndex
CREATE INDEX "ComplianceDecision_caseId_createdAt_id_idx" ON "ComplianceDecision"("caseId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDecision_caseId_providerEventIdHash_key" ON "ComplianceDecision"("caseId", "providerEventIdHash");

-- CreateIndex
CREATE INDEX "ExternalFinancialAccount_userId_provider_status_idx" ON "ExternalFinancialAccount"("userId", "provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalFinancialAccount_provider_providerReferenceHash_key" ON "ExternalFinancialAccount"("provider", "providerReferenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_reservationId_key" ON "MoneyMovement"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_ledgerTransactionId_key" ON "MoneyMovement"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "MoneyMovement_userId_createdAt_id_idx" ON "MoneyMovement"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MoneyMovement_provider_status_updatedAt_idx" ON "MoneyMovement"("provider", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MoneyMovement_status_createdAt_id_idx" ON "MoneyMovement"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_userId_type_idempotencyKeyHash_key" ON "MoneyMovement"("userId", "type", "idempotencyKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_provider_providerReferenceHash_key" ON "MoneyMovement"("provider", "providerReferenceHash");

-- CreateIndex
CREATE INDEX "MoneyMovementHistory_movementId_createdAt_id_idx" ON "MoneyMovementHistory"("movementId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WebhookInbox_provider_status_receivedAt_id_idx" ON "WebhookInbox"("provider", "status", "receivedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInbox_provider_providerEventIdHash_key" ON "WebhookInbox"("provider", "providerEventIdHash");

-- CreateIndex
CREATE INDEX "ProviderReconciliationRun_provider_createdAt_id_idx" ON "ProviderReconciliationRun"("provider", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ProviderDiscrepancy_runId_code_id_idx" ON "ProviderDiscrepancy"("runId", "code", "id");

-- CreateIndex
CREATE INDEX "ComplianceHold_userId_status_createdAt_idx" ON "ComplianceHold"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceHold_movementId_status_idx" ON "ComplianceHold"("movementId", "status");

-- CreateIndex
CREATE INDEX "ProviderIncident_provider_status_severity_createdAt_idx" ON "ProviderIncident"("provider", "status", "severity", "createdAt");

-- AddForeignKey
ALTER TABLE "ComplianceCase" ADD CONSTRAINT "ComplianceCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDecision" ADD CONSTRAINT "ComplianceDecision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ComplianceCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDecision" ADD CONSTRAINT "ComplianceDecision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalFinancialAccount" ADD CONSTRAINT "ExternalFinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_externalAccountId_fkey" FOREIGN KEY ("externalAccountId") REFERENCES "ExternalFinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "JournalTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovementHistory" ADD CONSTRAINT "MoneyMovementHistory_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderDiscrepancy" ADD CONSTRAINT "ProviderDiscrepancy_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProviderReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceHold" ADD CONSTRAINT "ComplianceHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceHold" ADD CONSTRAINT "ComplianceHold_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderIncident" ADD CONSTRAINT "ProviderIncident_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
