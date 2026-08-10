ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'DEACTIVATED';

CREATE TYPE "AccountDeletionRequestStatus" AS ENUM (
  'REQUESTED', 'UNDER_REVIEW', 'BLOCKED', 'APPROVED',
  'PROCESSING', 'COMPLETED', 'CANCELLED'
);

CREATE TABLE "AccountDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccountDeletionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT,
  "blockedReason" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AccountDeletionRequest_userId_createdAt_id_idx" ON "AccountDeletionRequest"("userId", "createdAt", "id");
CREATE INDEX "AccountDeletionRequest_status_createdAt_id_idx" ON "AccountDeletionRequest"("status", "createdAt", "id");
CREATE UNIQUE INDEX "AccountDeletionRequest_one_active_per_user"
  ON "AccountDeletionRequest"("userId")
  WHERE "status" IN ('REQUESTED', 'UNDER_REVIEW', 'BLOCKED', 'APPROVED', 'PROCESSING');
