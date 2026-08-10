CREATE TABLE "DiscordInvestorProfilePreference" (
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'MEMBERS_ONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordInvestorProfilePreference_pkey" PRIMARY KEY ("guildId", "discordUserId")
);
CREATE INDEX "DiscordInvestorProfilePreference_guildId_visibility_idx" ON "DiscordInvestorProfilePreference"("guildId", "visibility");
