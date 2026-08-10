CREATE TABLE "DiscordSuggestion" (
    "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "referenceNumber" INTEGER NOT NULL,
    "creatorDiscordUserId" TEXT NOT NULL, "content" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
    "messageId" TEXT, "channelId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DiscordSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordSuggestionVote" (
    "id" TEXT NOT NULL, "suggestionId" TEXT NOT NULL, "discordUserId" TEXT NOT NULL, "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordSuggestionVote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordPoll" (
    "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "creatorDiscordUserId" TEXT NOT NULL, "question" TEXT NOT NULL,
    "options" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "closesAt" TIMESTAMP(3), "messageId" TEXT,
    "channelId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordPoll_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordPollVote" (
    "id" TEXT NOT NULL, "pollId" TEXT NOT NULL, "discordUserId" TEXT NOT NULL, "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordPollVote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordBirthday" (
    "guildId" TEXT NOT NULL, "discordUserId" TEXT NOT NULL, "month" INTEGER NOT NULL, "day" INTEGER NOT NULL,
    "lastAnnouncedOn" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordBirthday_pkey" PRIMARY KEY ("guildId", "discordUserId")
);
CREATE TABLE "DiscordCommunityScheduleState" (
    "guildId" TEXT NOT NULL, "scheduleKey" TEXT NOT NULL, "lastPeriodKey" TEXT NOT NULL,
    "lastPostedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordCommunityScheduleState_pkey" PRIMARY KEY ("guildId", "scheduleKey")
);
CREATE UNIQUE INDEX "DiscordSuggestion_guildId_referenceNumber_key" ON "DiscordSuggestion"("guildId", "referenceNumber");
CREATE UNIQUE INDEX "DiscordSuggestion_messageId_key" ON "DiscordSuggestion"("messageId");
CREATE INDEX "DiscordSuggestion_guildId_status_createdAt_idx" ON "DiscordSuggestion"("guildId", "status", "createdAt");
CREATE UNIQUE INDEX "DiscordSuggestionVote_suggestionId_discordUserId_key" ON "DiscordSuggestionVote"("suggestionId", "discordUserId");
CREATE INDEX "DiscordSuggestionVote_suggestionId_value_idx" ON "DiscordSuggestionVote"("suggestionId", "value");
CREATE UNIQUE INDEX "DiscordPoll_messageId_key" ON "DiscordPoll"("messageId");
CREATE INDEX "DiscordPoll_guildId_status_closesAt_idx" ON "DiscordPoll"("guildId", "status", "closesAt");
CREATE UNIQUE INDEX "DiscordPollVote_pollId_discordUserId_key" ON "DiscordPollVote"("pollId", "discordUserId");
CREATE INDEX "DiscordPollVote_pollId_optionIndex_idx" ON "DiscordPollVote"("pollId", "optionIndex");
CREATE INDEX "DiscordBirthday_guildId_month_day_idx" ON "DiscordBirthday"("guildId", "month", "day");
ALTER TABLE "DiscordSuggestionVote" ADD CONSTRAINT "DiscordSuggestionVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "DiscordSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordPollVote" ADD CONSTRAINT "DiscordPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "DiscordPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
