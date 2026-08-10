CREATE TABLE "DiscordModerationCounter" ("guildId" TEXT NOT NULL,"nextCaseNumber" INTEGER NOT NULL DEFAULT 1,CONSTRAINT "DiscordModerationCounter_pkey" PRIMARY KEY ("guildId"));
