-- CreateEnum
CREATE TYPE "TransactionalEmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "EmailVerificationToken"
  ADD COLUMN "deliveryStatus" "TransactionalEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "deliveryFailedAt" TIMESTAMP(3),
  ADD COLUMN "providerMessageId" TEXT;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deliveryStatus" "TransactionalEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "deliveryFailedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX "PasswordResetToken_userId_consumedAt_expiresAt_idx" ON "PasswordResetToken"("userId", "consumedAt", "expiresAt");
CREATE INDEX "PasswordResetToken_userId_deliveryStatus_createdAt_idx" ON "PasswordResetToken"("userId", "deliveryStatus", "createdAt");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TransactionalEmailDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "recipientHash" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TransactionalEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransactionalEmailDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransactionalEmailDelivery_idempotencyKey_key" ON "TransactionalEmailDelivery"("idempotencyKey");
CREATE INDEX "TransactionalEmailDelivery_userId_createdAt_idx" ON "TransactionalEmailDelivery"("userId", "createdAt");
CREATE INDEX "TransactionalEmailDelivery_status_queuedAt_idx" ON "TransactionalEmailDelivery"("status", "queuedAt");
ALTER TABLE "TransactionalEmailDelivery" ADD CONSTRAINT "TransactionalEmailDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
