-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubmissionMediaStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'SCANNING', 'SAFE', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "VerificationReviewStatus" AS ENUM ('CLAIMED', 'COMPLETED');

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "PublicCollectorProfile" DROP CONSTRAINT "PublicCollectorProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "VaultPublicEvent" DROP CONSTRAINT "VaultPublicEvent_assetId_fkey";

-- DropForeignKey
ALTER TABLE "WatchlistItem" DROP CONSTRAINT "WatchlistItem_assetId_fkey";

-- DropForeignKey
ALTER TABLE "WatchlistItem" DROP CONSTRAINT "WatchlistItem_userId_fkey";

-- DropIndex
DROP INDEX "Asset_gradeScaleEntryId_idx";

-- DropIndex
DROP INDEX "PublicCollectorProfile_isPublic_createdAt_userId_idx";

-- CreateTable
CREATE TABLE "AssetSubmission" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "assetId" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "categoryId" TEXT NOT NULL,
    "setId" TEXT,
    "gradeScaleEntryId" TEXT,
    "declaredMetadata" JSONB,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "decisionCode" TEXT,
    "decisionNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionMedia" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "status" "SubmissionMediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "scanResultCode" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "VerificationReviewStatus" NOT NULL DEFAULT 'CLAIMED',
    "decision" TEXT,
    "reasonCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetSubmission_ownerUserId_status_createdAt_id_idx" ON "AssetSubmission"("ownerUserId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AssetSubmission_status_submittedAt_id_idx" ON "AssetSubmission"("status", "submittedAt", "id");

-- CreateIndex
CREATE INDEX "AssetSubmission_reviewerId_status_updatedAt_id_idx" ON "AssetSubmission"("reviewerId", "status", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionMedia_objectKey_key" ON "SubmissionMedia"("objectKey");

-- CreateIndex
CREATE INDEX "SubmissionMedia_submissionId_status_slot_idx" ON "SubmissionMedia"("submissionId", "status", "slot");

-- CreateIndex
CREATE INDEX "SubmissionMedia_sha256_idx" ON "SubmissionMedia"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionMedia_submissionId_slot_key" ON "SubmissionMedia"("submissionId", "slot");

-- CreateIndex
CREATE INDEX "VerificationReview_submissionId_createdAt_id_idx" ON "VerificationReview"("submissionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "VerificationReview_reviewerId_status_createdAt_id_idx" ON "VerificationReview"("reviewerId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PublicCollectorProfile_isPublic_createdAt_userId_idx" ON "PublicCollectorProfile"("isPublic", "createdAt", "userId");

-- AddForeignKey
ALTER TABLE "PublicCollectorProfile" ADD CONSTRAINT "PublicCollectorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSubmission" ADD CONSTRAINT "AssetSubmission_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSubmission" ADD CONSTRAINT "AssetSubmission_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSubmission" ADD CONSTRAINT "AssetSubmission_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSubmission" ADD CONSTRAINT "AssetSubmission_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CollectibleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetSubmission" ADD CONSTRAINT "AssetSubmission_gradeScaleEntryId_fkey" FOREIGN KEY ("gradeScaleEntryId") REFERENCES "GradeScaleEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionMedia" ADD CONSTRAINT "SubmissionMedia_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReview" ADD CONSTRAINT "VerificationReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "AssetSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReview" ADD CONSTRAINT "VerificationReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultPublicEvent" ADD CONSTRAINT "VaultPublicEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
