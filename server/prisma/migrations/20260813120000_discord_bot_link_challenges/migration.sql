-- Durable, one-time Discord-to-Slice account-link handoffs. Raw tokens are never stored.
CREATE TABLE "DiscordBotLinkChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "discordDisplayName" TEXT,
    "guildId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordBotLinkChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordBotLinkChallenge_tokenHash_key" ON "DiscordBotLinkChallenge"("tokenHash");
CREATE INDEX "DiscordBotLinkChallenge_discordUserId_expiresAt_idx" ON "DiscordBotLinkChallenge"("discordUserId", "expiresAt");
CREATE INDEX "DiscordBotLinkChallenge_expiresAt_idx" ON "DiscordBotLinkChallenge"("expiresAt");
