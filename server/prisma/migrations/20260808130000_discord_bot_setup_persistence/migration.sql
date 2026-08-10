-- Bot-owned operational persistence. These tables never contain financial,
-- identity, account-linking, KYC, or other Slice product authority.
CREATE TYPE "DiscordSetupStatus" AS ENUM ('NOT_CONFIGURED', 'APPLIED', 'PARTIAL', 'ERROR');
CREATE TYPE "DiscordManagedResourceType" AS ENUM ('ROLE', 'CATEGORY', 'CHANNEL', 'PANEL', 'MESSAGE');

CREATE TABLE "DiscordGuildConfig" (
    "guildId" TEXT NOT NULL,
    "setupVersion" INTEGER NOT NULL DEFAULT 0,
    "setupStatus" "DiscordSetupStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordGuildConfig_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "DiscordManagedResource" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "resourceType" "DiscordManagedResourceType" NOT NULL,
    "logicalKey" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "expectedName" TEXT NOT NULL,
    "parentLogicalKey" TEXT,
    "setupVersion" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordManagedResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordPanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "logicalKey" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "artworkKey" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordPanel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordManagedResource_guildId_resourceType_logicalKey_key" ON "DiscordManagedResource"("guildId", "resourceType", "logicalKey");
CREATE INDEX "DiscordManagedResource_guildId_discordId_idx" ON "DiscordManagedResource"("guildId", "discordId");
CREATE INDEX "DiscordManagedResource_guildId_resourceType_idx" ON "DiscordManagedResource"("guildId", "resourceType");
CREATE UNIQUE INDEX "DiscordPanel_guildId_logicalKey_key" ON "DiscordPanel"("guildId", "logicalKey");
CREATE INDEX "DiscordPanel_guildId_channelId_idx" ON "DiscordPanel"("guildId", "channelId");
CREATE INDEX "DiscordGuildConfig_setupStatus_updatedAt_idx" ON "DiscordGuildConfig"("setupStatus", "updatedAt");

ALTER TABLE "DiscordManagedResource" ADD CONSTRAINT "DiscordManagedResource_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "DiscordGuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordPanel" ADD CONSTRAINT "DiscordPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "DiscordGuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
