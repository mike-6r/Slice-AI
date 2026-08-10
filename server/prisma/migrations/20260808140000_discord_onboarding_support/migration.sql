CREATE TYPE "DiscordTicketStatus" AS ENUM ('OPEN', 'CLAIMED', 'WAITING_USER', 'WAITING_STAFF', 'ESCALATED', 'RESOLVED', 'CLOSED');
CREATE TYPE "DiscordTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "DiscordNotificationPreference" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "discordUserId" TEXT NOT NULL, "logicalKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordNotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicket" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "creatorDiscordId" TEXT NOT NULL, "category" TEXT NOT NULL, "channelId" TEXT,
  "subject" TEXT NOT NULL, "safeSummary" TEXT NOT NULL, "safeReferenceId" TEXT, "status" "DiscordTicketStatus" NOT NULL DEFAULT 'OPEN', "priority" "DiscordTicketPriority" NOT NULL DEFAULT 'NORMAL', "assignedStaffId" TEXT,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "inactivityWarnedAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordTicket_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketEvent" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "type" TEXT NOT NULL, "actorDiscordId" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTicketEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketTranscript" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "content" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTicketTranscript_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscordNotificationPreference_guildId_discordUserId_logicalKey_key" ON "DiscordNotificationPreference"("guildId", "discordUserId", "logicalKey");
CREATE INDEX "DiscordNotificationPreference_guildId_discordUserId_idx" ON "DiscordNotificationPreference"("guildId", "discordUserId");
CREATE UNIQUE INDEX "DiscordTicket_channelId_key" ON "DiscordTicket"("channelId");
CREATE INDEX "DiscordTicket_guildId_creatorDiscordId_status_idx" ON "DiscordTicket"("guildId", "creatorDiscordId", "status");
CREATE INDEX "DiscordTicket_guildId_status_lastActivityAt_idx" ON "DiscordTicket"("guildId", "status", "lastActivityAt");
CREATE INDEX "DiscordTicket_guildId_assignedStaffId_status_idx" ON "DiscordTicket"("guildId", "assignedStaffId", "status");
CREATE INDEX "DiscordTicketEvent_ticketId_createdAt_idx" ON "DiscordTicketEvent"("ticketId", "createdAt");
CREATE UNIQUE INDEX "DiscordTicketTranscript_ticketId_key" ON "DiscordTicketTranscript"("ticketId");
ALTER TABLE "DiscordNotificationPreference" ADD CONSTRAINT "DiscordNotificationPreference_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "DiscordGuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordTicket" ADD CONSTRAINT "DiscordTicket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "DiscordGuildConfig"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordTicketEvent" ADD CONSTRAINT "DiscordTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DiscordTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordTicketTranscript" ADD CONSTRAINT "DiscordTicketTranscript_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DiscordTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
