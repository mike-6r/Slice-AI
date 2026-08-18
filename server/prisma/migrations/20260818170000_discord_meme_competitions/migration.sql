-- Discord-only weekly meme competitions. This migration is additive and stores
-- message references plus non-financial community XP award markers only.
CREATE TYPE "DiscordMemeCompetitionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'AWARDED', 'CANCELLED');
CREATE TYPE "DiscordMemeCompetitionAuditAction" AS ENUM ('OPENED', 'SUBMISSION_REGISTERED', 'CLOSED_MANUALLY', 'CLOSED_AUTOMATICALLY', 'WINNER_SELECTED', 'XP_AWARDED', 'CANCELLED');

CREATE TABLE "DiscordMemeCompetition" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "announcementMessageId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "DiscordMemeCompetitionStatus" NOT NULL DEFAULT 'OPEN',
  "rewardXp" INTEGER NOT NULL,
  "winnerDiscordUserId" TEXT,
  "winningSubmissionId" TEXT,
  "closingClaimedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "awardedAt" TIMESTAMP(3),
  "resultAnnouncedAt" TIMESTAMP(3),
  "resultAnnouncementClaimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordMemeCompetition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordMemeSubmission" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "discordUserId" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidatedAt" TIMESTAMP(3),
  "invalidReason" TEXT,
  "finalVoteCount" INTEGER,
  CONSTRAINT "DiscordMemeSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordMemeAward" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "recipientDiscordUserId" TEXT NOT NULL,
  "xpAmount" INTEGER NOT NULL,
  "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordMemeAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordMemeCompetitionAuditEvent" (
  "id" TEXT NOT NULL,
  "competitionId" TEXT NOT NULL,
  "action" "DiscordMemeCompetitionAuditAction" NOT NULL,
  "actorDiscordId" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordMemeCompetitionAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordMemeCompetition_announcementMessageId_key" ON "DiscordMemeCompetition"("announcementMessageId");
CREATE UNIQUE INDEX "DiscordMemeCompetition_guildId_periodKey_key" ON "DiscordMemeCompetition"("guildId", "periodKey");
CREATE INDEX "DiscordMemeCompetition_guildId_status_endsAt_idx" ON "DiscordMemeCompetition"("guildId", "status", "endsAt");
CREATE INDEX "DiscordMemeCompetition_status_endsAt_idx" ON "DiscordMemeCompetition"("status", "endsAt");
CREATE UNIQUE INDEX "DiscordMemeSubmission_messageId_key" ON "DiscordMemeSubmission"("messageId");
CREATE UNIQUE INDEX "DiscordMemeSubmission_competitionId_discordUserId_key" ON "DiscordMemeSubmission"("competitionId", "discordUserId");
CREATE INDEX "DiscordMemeSubmission_competitionId_invalidatedAt_idx" ON "DiscordMemeSubmission"("competitionId", "invalidatedAt");
CREATE INDEX "DiscordMemeSubmission_guildId_channelId_messageId_idx" ON "DiscordMemeSubmission"("guildId", "channelId", "messageId");
CREATE UNIQUE INDEX "DiscordMemeAward_competitionId_key" ON "DiscordMemeAward"("competitionId");
CREATE INDEX "DiscordMemeAward_recipientDiscordUserId_awardedAt_idx" ON "DiscordMemeAward"("recipientDiscordUserId", "awardedAt");
CREATE INDEX "DiscordMemeCompetitionAuditEvent_competitionId_createdAt_idx" ON "DiscordMemeCompetitionAuditEvent"("competitionId", "createdAt");
CREATE INDEX "DiscordMemeCompetitionAuditEvent_action_createdAt_idx" ON "DiscordMemeCompetitionAuditEvent"("action", "createdAt");

ALTER TABLE "DiscordMemeSubmission" ADD CONSTRAINT "DiscordMemeSubmission_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "DiscordMemeCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordMemeAward" ADD CONSTRAINT "DiscordMemeAward_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "DiscordMemeCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordMemeCompetitionAuditEvent" ADD CONSTRAINT "DiscordMemeCompetitionAuditEvent_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "DiscordMemeCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
