-- Discord-only community giveaway state. This migration is additive and does
-- not reference Slice accounts, ownership, financial, custody, or provider data.
CREATE TYPE "DiscordGiveawayStatus" AS ENUM ('OPEN', 'ENDING', 'ENDED', 'CANCELLED');
CREATE TYPE "DiscordGiveawaySelectionType" AS ENUM ('ORIGINAL', 'REROLL');
CREATE TYPE "DiscordGiveawayAuditAction" AS ENUM ('CREATED', 'ENDED_MANUALLY', 'ENDED_AUTOMATICALLY', 'REROLLED', 'CANCELLED');

CREATE TABLE "DiscordGiveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdByDiscordUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "DiscordGiveawayStatus" NOT NULL DEFAULT 'OPEN',
    "winnerCount" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedByDiscordUserId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByDiscordUserId" TEXT,
    "completionAnnouncedAt" TIMESTAMP(3),
    "completionAnnouncementClaimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordGiveaway_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordGiveawayEntry" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordGiveawayEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordGiveawayWinner" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "selectionType" "DiscordGiveawaySelectionType" NOT NULL,
    "rerollSequence" INTEGER NOT NULL DEFAULT 0,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "selectedByDiscordId" TEXT NOT NULL,
    CONSTRAINT "DiscordGiveawayWinner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordGiveawayAuditEvent" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "action" "DiscordGiveawayAuditAction" NOT NULL,
    "actorDiscordId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordGiveawayAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordGiveaway_messageId_key" ON "DiscordGiveaway"("messageId");
CREATE INDEX "DiscordGiveaway_guildId_status_idx" ON "DiscordGiveaway"("guildId", "status");
CREATE INDEX "DiscordGiveaway_status_endsAt_idx" ON "DiscordGiveaway"("status", "endsAt");
CREATE UNIQUE INDEX "DiscordGiveawayEntry_giveawayId_discordUserId_key" ON "DiscordGiveawayEntry"("giveawayId", "discordUserId");
CREATE INDEX "DiscordGiveawayEntry_giveawayId_idx" ON "DiscordGiveawayEntry"("giveawayId");
CREATE UNIQUE INDEX "DiscordGiveawayWinner_giveawayId_discordUserId_selectionType_rerollSequence_key" ON "DiscordGiveawayWinner"("giveawayId", "discordUserId", "selectionType", "rerollSequence");
CREATE INDEX "DiscordGiveawayWinner_giveawayId_selectionType_rerollSequence_idx" ON "DiscordGiveawayWinner"("giveawayId", "selectionType", "rerollSequence");
CREATE INDEX "DiscordGiveawayAuditEvent_giveawayId_createdAt_idx" ON "DiscordGiveawayAuditEvent"("giveawayId", "createdAt");

ALTER TABLE "DiscordGiveawayEntry" ADD CONSTRAINT "DiscordGiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "DiscordGiveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordGiveawayWinner" ADD CONSTRAINT "DiscordGiveawayWinner_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "DiscordGiveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordGiveawayAuditEvent" ADD CONSTRAINT "DiscordGiveawayAuditEvent_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "DiscordGiveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
