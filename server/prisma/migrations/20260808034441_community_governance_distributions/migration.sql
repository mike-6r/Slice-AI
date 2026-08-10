-- CreateEnum
CREATE TYPE "DiscussionPostStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'REMOVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('HIDE', 'REMOVE', 'LOCK', 'UNHIDE');

-- CreateEnum
CREATE TYPE "SaleProposalStatus" AS ENUM ('DRAFT', 'OPEN', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SALE_PENDING', 'SOLD', 'DISTRIBUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProposalVoteChoice" AS ENUM ('APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "ExternalSaleVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('PENDING', 'READY', 'PROCESSING', 'DISTRIBUTED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "DistributionReconciliationStatus" AS ENUM ('RECONCILED', 'MISMATCH');

-- CreateTable
CREATE TABLE "CollectorFollow" (
    "followerUserId" TEXT NOT NULL,
    "followedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectorFollow_pkey" PRIMARY KEY ("followerUserId","followedUserId")
);

-- CreateTable
CREATE TABLE "DiscussionPost" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "status" "DiscussionPostStatus" NOT NULL DEFAULT 'VISIBLE',
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reportId" TEXT,
    "moderatorId" TEXT NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleProposal" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "status" "SaleProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "offerMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "snapshotSequence" BIGINT,
    "eligibleUnits" BIGINT NOT NULL DEFAULT 0,
    "quorumBps" INTEGER NOT NULL,
    "approvalBps" INTEGER NOT NULL,
    "votingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalEligibility" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT,
    "units" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "eligibilityId" TEXT NOT NULL,
    "castByUserId" TEXT NOT NULL,
    "choice" "ProposalVoteChoice" NOT NULL,
    "weightUnits" BIGINT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalSaleVerification" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "status" "ExternalSaleVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "grossMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "externalReference" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "custodyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "verifierUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalSaleVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'PENDING',
    "grossMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL DEFAULT 0,
    "netMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "financeTransactionId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionLine" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "eligibilityId" TEXT NOT NULL,
    "units" BIGINT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "remainderRank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionReconciliationRun" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "status" "DistributionReconciliationStatus" NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "netMinor" BIGINT NOT NULL,
    "lineMinor" BIGINT NOT NULL,
    "mismatchCodes" JSONB NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectorFollow_followedUserId_createdAt_followerUserId_idx" ON "CollectorFollow"("followedUserId", "createdAt", "followerUserId");

-- CreateIndex
CREATE INDEX "DiscussionPost_assetId_status_createdAt_id_idx" ON "DiscussionPost"("assetId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DiscussionPost_userId_createdAt_id_idx" ON "DiscussionPost"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_id_idx" ON "ContentReport"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_postId_reporterUserId_key" ON "ContentReport"("postId", "reporterUserId");

-- CreateIndex
CREATE INDEX "ModerationAction_postId_createdAt_id_idx" ON "ModerationAction"("postId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ModerationAction_reportId_createdAt_id_idx" ON "ModerationAction"("reportId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SaleProposal_assetId_status_createdAt_id_idx" ON "SaleProposal"("assetId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "SaleProposal_status_closesAt_id_idx" ON "SaleProposal"("status", "closesAt", "id");

-- CreateIndex
CREATE INDEX "ProposalEligibility_proposalId_userId_id_idx" ON "ProposalEligibility"("proposalId", "userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalEligibility_proposalId_accountId_key" ON "ProposalEligibility"("proposalId", "accountId");

-- CreateIndex
CREATE INDEX "ProposalVote_proposalId_isCurrent_createdAt_id_idx" ON "ProposalVote"("proposalId", "isCurrent", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalVote_proposalId_eligibilityId_sequence_key" ON "ProposalVote"("proposalId", "eligibilityId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalSaleVerification_proposalId_key" ON "ExternalSaleVerification"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_proposalId_key" ON "Distribution"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_financeTransactionId_key" ON "Distribution"("financeTransactionId");

-- CreateIndex
CREATE INDEX "Distribution_status_createdAt_id_idx" ON "Distribution"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DistributionLine_distributionId_remainderRank_id_idx" ON "DistributionLine"("distributionId", "remainderRank", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionLine_distributionId_eligibilityId_key" ON "DistributionLine"("distributionId", "eligibilityId");

-- CreateIndex
CREATE INDEX "DistributionReconciliationRun_distributionId_createdAt_id_idx" ON "DistributionReconciliationRun"("distributionId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "CollectorFollow" ADD CONSTRAINT "CollectorFollow_followerUserId_fkey" FOREIGN KEY ("followerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectorFollow" ADD CONSTRAINT "CollectorFollow_followedUserId_fkey" FOREIGN KEY ("followedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DiscussionPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DiscussionPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ContentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProposal" ADD CONSTRAINT "SaleProposal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleProposal" ADD CONSTRAINT "SaleProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalEligibility" ADD CONSTRAINT "ProposalEligibility_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SaleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalEligibility" ADD CONSTRAINT "ProposalEligibility_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OwnershipAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalEligibility" ADD CONSTRAINT "ProposalEligibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVote" ADD CONSTRAINT "ProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SaleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVote" ADD CONSTRAINT "ProposalVote_eligibilityId_fkey" FOREIGN KEY ("eligibilityId") REFERENCES "ProposalEligibility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVote" ADD CONSTRAINT "ProposalVote_castByUserId_fkey" FOREIGN KEY ("castByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSaleVerification" ADD CONSTRAINT "ExternalSaleVerification_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SaleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalSaleVerification" ADD CONSTRAINT "ExternalSaleVerification_verifierUserId_fkey" FOREIGN KEY ("verifierUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "SaleProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionLine" ADD CONSTRAINT "DistributionLine_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionLine" ADD CONSTRAINT "DistributionLine_eligibilityId_fkey" FOREIGN KEY ("eligibilityId") REFERENCES "ProposalEligibility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionReconciliationRun" ADD CONSTRAINT "DistributionReconciliationRun_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
