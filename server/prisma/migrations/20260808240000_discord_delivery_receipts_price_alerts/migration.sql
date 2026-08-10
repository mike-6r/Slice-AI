CREATE TABLE "DiscordDeliveryReceipt" (
    "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "backendDeliveryId" TEXT NOT NULL,
    "backendEventId" TEXT NOT NULL, "logicalDestination" TEXT NOT NULL, "discordChannelId" TEXT,
    "discordMessageId" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordDeliveryReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordPriceAlert" (
    "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "discordUserId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
    "condition" TEXT NOT NULL, "thresholdMinor" BIGINT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DiscordPriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscordDeliveryReceipt_backendDeliveryId_key" ON "DiscordDeliveryReceipt"("backendDeliveryId");
CREATE INDEX "DiscordDeliveryReceipt_guildId_logicalDestination_status_idx" ON "DiscordDeliveryReceipt"("guildId", "logicalDestination", "status");
CREATE INDEX "DiscordDeliveryReceipt_backendEventId_idx" ON "DiscordDeliveryReceipt"("backendEventId");
CREATE INDEX "DiscordPriceAlert_guildId_assetId_enabled_idx" ON "DiscordPriceAlert"("guildId", "assetId", "enabled");
CREATE INDEX "DiscordPriceAlert_guildId_discordUserId_enabled_idx" ON "DiscordPriceAlert"("guildId", "discordUserId", "enabled");
