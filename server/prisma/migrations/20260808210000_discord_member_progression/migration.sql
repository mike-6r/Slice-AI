-- Guild-scoped, non-financial Discord community progression.
CREATE TABLE "DiscordMemberProgression" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "totalMessagesEligible" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3),
    "lastDailyClaimAt" TIMESTAMP(3),
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordMemberProgression_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordReputationGrant" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "giverDiscordUserId" TEXT NOT NULL,
    "receiverDiscordUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordReputationGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordMemberAchievement" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordMemberAchievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordReputationCooldown" (
    "guildId" TEXT NOT NULL,
    "giverDiscordUserId" TEXT NOT NULL,
    "nextAvailableAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordReputationCooldown_pkey" PRIMARY KEY ("guildId", "giverDiscordUserId")
);

CREATE UNIQUE INDEX "DiscordMemberProgression_guildId_discordUserId_key" ON "DiscordMemberProgression"("guildId", "discordUserId");
CREATE INDEX "DiscordMemberProgression_guildId_xp_discordUserId_idx" ON "DiscordMemberProgression"("guildId", "xp", "discordUserId");
CREATE INDEX "DiscordMemberProgression_guildId_reputation_discordUserId_idx" ON "DiscordMemberProgression"("guildId", "reputation", "discordUserId");
CREATE INDEX "DiscordReputationGrant_guildId_giverDiscordUserId_createdAt_idx" ON "DiscordReputationGrant"("guildId", "giverDiscordUserId", "createdAt");
CREATE INDEX "DiscordReputationGrant_guildId_receiverDiscordUserId_createdAt_idx" ON "DiscordReputationGrant"("guildId", "receiverDiscordUserId", "createdAt");
CREATE UNIQUE INDEX "DiscordMemberAchievement_guildId_discordUserId_achievementKey_key" ON "DiscordMemberAchievement"("guildId", "discordUserId", "achievementKey");
CREATE INDEX "DiscordMemberAchievement_guildId_discordUserId_unlockedAt_idx" ON "DiscordMemberAchievement"("guildId", "discordUserId", "unlockedAt");

ALTER TABLE "DiscordMemberAchievement" ADD CONSTRAINT "DiscordMemberAchievement_guildId_discordUserId_fkey" FOREIGN KEY ("guildId", "discordUserId") REFERENCES "DiscordMemberProgression"("guildId", "discordUserId") ON DELETE CASCADE ON UPDATE CASCADE;
