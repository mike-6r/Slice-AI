-- Dual-control finance adjustments are proposals plus balanced journal
-- references. They never mutate a customer balance directly.
CREATE TYPE "FinancialAdjustmentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'APPLIED', 'REJECTED');

CREATE TABLE "FinancialAdjustmentRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deficitId" TEXT NOT NULL,
  "initiatorUserId" TEXT NOT NULL,
  "approverUserId" TEXT,
  "status" "FinancialAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "amountMinor" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "submissionIdempotencyKeyHash" TEXT,
  "approvalIdempotencyKeyHash" TEXT,
  "journalTransactionId" TEXT,
  "beforeOutstandingMinor" BIGINT NOT NULL,
  "afterOutstandingMinor" BIGINT,
  "restrictionReleased" BOOLEAN,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialAdjustmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialAdjustmentRequest_idempotencyKeyHash_key"
  ON "FinancialAdjustmentRequest"("idempotencyKeyHash");
CREATE UNIQUE INDEX "FinancialAdjustmentRequest_submissionIdempotencyKeyHash_key"
  ON "FinancialAdjustmentRequest"("submissionIdempotencyKeyHash");
CREATE UNIQUE INDEX "FinancialAdjustmentRequest_approvalIdempotencyKeyHash_key"
  ON "FinancialAdjustmentRequest"("approvalIdempotencyKeyHash");
CREATE UNIQUE INDEX "FinancialAdjustmentRequest_journalTransactionId_key"
  ON "FinancialAdjustmentRequest"("journalTransactionId");
CREATE INDEX "FinancialAdjustmentRequest_status_createdAt_id_idx"
  ON "FinancialAdjustmentRequest"("status", "createdAt", "id");
CREATE INDEX "FinancialAdjustmentRequest_userId_status_createdAt_id_idx"
  ON "FinancialAdjustmentRequest"("userId", "status", "createdAt", "id");
CREATE INDEX "FinancialAdjustmentRequest_deficitId_status_createdAt_id_idx"
  ON "FinancialAdjustmentRequest"("deficitId", "status", "createdAt", "id");
