CREATE TABLE "DiscordAnalyticsDailyGuild" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "day" TIMESTAMP(3) NOT NULL,
  "messages" INTEGER NOT NULL DEFAULT 0, "supportMessages" INTEGER NOT NULL DEFAULT 0,
  "joins" INTEGER NOT NULL DEFAULT 0, "leaves" INTEGER NOT NULL DEFAULT 0,
  "commandRuns" INTEGER NOT NULL DEFAULT 0, "commandSuccesses" INTEGER NOT NULL DEFAULT 0,
  "commandUserErrors" INTEGER NOT NULL DEFAULT 0, "commandDenied" INTEGER NOT NULL DEFAULT 0,
  "commandFailures" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordAnalyticsDailyGuild_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordAnalyticsDailyChannel" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "day" TIMESTAMP(3) NOT NULL,
  "messages" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DiscordAnalyticsDailyChannel_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordAnalyticsDailyCommand" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "day" TIMESTAMP(3) NOT NULL, "commandName" TEXT NOT NULL,
  "subcommand" TEXT NOT NULL DEFAULT '', "runs" INTEGER NOT NULL DEFAULT 0, "successes" INTEGER NOT NULL DEFAULT 0,
  "userErrors" INTEGER NOT NULL DEFAULT 0, "permissionDenied" INTEGER NOT NULL DEFAULT 0,
  "internalErrors" INTEGER NOT NULL DEFAULT 0, "durationTotalMs" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordAnalyticsDailyCommand_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordAnalyticsDailyMemberActivity" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "discordUserId" TEXT NOT NULL, "day" TIMESTAMP(3) NOT NULL,
  "messaged" BOOLEAN NOT NULL DEFAULT false, "usedCommand" BOOLEAN NOT NULL DEFAULT false,
  "communityInteraction" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DiscordAnalyticsDailyMemberActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordWorkerHeartbeat" (
  "workerName" TEXT NOT NULL, "instanceId" TEXT NOT NULL, "lastStartedAt" TIMESTAMP(3) NOT NULL,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL, "lastSuccessfulScanAt" TIMESTAMP(3), "lastErrorAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'HEALTHY', "metadata" JSONB, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordWorkerHeartbeat_pkey" PRIMARY KEY ("workerName")
);
CREATE UNIQUE INDEX "DiscordAnalyticsDailyGuild_guildId_day_key" ON "DiscordAnalyticsDailyGuild"("guildId", "day");
CREATE INDEX "DiscordAnalyticsDailyGuild_guildId_day_idx" ON "DiscordAnalyticsDailyGuild"("guildId", "day");
CREATE UNIQUE INDEX "DiscordAnalyticsDailyChannel_guildId_channelId_day_key" ON "DiscordAnalyticsDailyChannel"("guildId", "channelId", "day");
CREATE INDEX "DiscordAnalyticsDailyChannel_guildId_day_messages_idx" ON "DiscordAnalyticsDailyChannel"("guildId", "day", "messages");
CREATE UNIQUE INDEX "DiscordAnalyticsDailyCommand_guildId_day_commandName_subcommand_key" ON "DiscordAnalyticsDailyCommand"("guildId", "day", "commandName", "subcommand");
CREATE INDEX "DiscordAnalyticsDailyCommand_guildId_day_runs_idx" ON "DiscordAnalyticsDailyCommand"("guildId", "day", "runs");
CREATE UNIQUE INDEX "DiscordAnalyticsDailyMemberActivity_guildId_discordUserId_day_key" ON "DiscordAnalyticsDailyMemberActivity"("guildId", "discordUserId", "day");
CREATE INDEX "DiscordAnalyticsDailyMemberActivity_guildId_day_idx" ON "DiscordAnalyticsDailyMemberActivity"("guildId", "day");
CREATE INDEX "DiscordWorkerHeartbeat_lastHeartbeatAt_idx" ON "DiscordWorkerHeartbeat"("lastHeartbeatAt");
