-- AlterTable
ALTER TABLE "DiscordModerationCase" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DiscordTicketTranscript" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_createdAt_idx" ON "EmailVerificationToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_consumedAt_expiresAt_idx" ON "EmailVerificationToken"("userId", "consumedAt", "expiresAt");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DiscordMemberAchievement_guildId_discordUserId_achievementKey_k" RENAME TO "DiscordMemberAchievement_guildId_discordUserId_achievementK_key";

-- RenameIndex
ALTER INDEX "DiscordNotificationPreference_guildId_discordUserId_logicalKey_" RENAME TO "DiscordNotificationPreference_guildId_discordUserId_logical_key";

-- RenameIndex
ALTER INDEX "DiscordReputationGrant_guildId_receiverDiscordUserId_createdAt_" RENAME TO "DiscordReputationGrant_guildId_receiverDiscordUserId_create_idx";

-- RenameIndex
ALTER INDEX "ExternalSaleVerificationApproval_saleVerificationId_createdAt_i" RENAME TO "ExternalSaleVerificationApproval_saleVerificationId_created_idx";

-- RenameIndex
ALTER INDEX "ExternalSaleVerificationApproval_saleVerificationId_verifierUse" RENAME TO "ExternalSaleVerificationApproval_saleVerificationId_verifie_key";
