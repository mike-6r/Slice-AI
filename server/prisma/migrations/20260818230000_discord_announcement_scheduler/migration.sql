CREATE TYPE "DiscordAnnouncementScheduleType" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_WEEKDAYS');
CREATE TYPE "DiscordAnnouncementScheduleStatus" AS ENUM ('SCHEDULED', 'PAUSED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED', 'BLOCKED');
CREATE TYPE "DiscordAnnouncementPayloadMode" AS ENUM ('SNAPSHOT', 'LIVE_DRAFT');
CREATE TYPE "DiscordAnnouncementRunStatus" AS ENUM ('PROCESSING', 'PUBLISHED', 'FAILED', 'BLOCKED', 'MISSED', 'UNKNOWN_DELIVERY_STATE', 'CANCELLED');
CREATE TYPE "DiscordAnnouncementScheduleAuditAction" AS ENUM ('SCHEDULE_CREATED', 'SCHEDULE_UPDATED', 'SCHEDULE_PAUSED', 'SCHEDULE_RESUMED', 'SCHEDULE_CANCELLED', 'SCHEDULE_EXECUTION_STARTED', 'SCHEDULE_PUBLISHED', 'SCHEDULE_FAILED', 'SCHEDULE_BLOCKED', 'SCHEDULE_RETRY_REQUESTED', 'SCHEDULE_MANUAL_RUN');

CREATE TABLE "DiscordAnnouncementSchedule" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "draftId" TEXT,
  "createdByDiscordUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scheduleType" "DiscordAnnouncementScheduleType" NOT NULL,
  "timezone" TEXT NOT NULL,
  "localTime" TEXT NOT NULL,
  "localDate" TEXT,
  "weekdays" JSONB,
  "dayOfMonth" INTEGER,
  "payloadMode" "DiscordAnnouncementPayloadMode" NOT NULL DEFAULT 'SNAPSHOT',
  "payloadSnapshot" JSONB,
  "linkButtonsSnapshot" JSONB,
  "targetChannelId" TEXT NOT NULL,
  "status" "DiscordAnnouncementScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "processingStartedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "workerToken" TEXT,
  "pausedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordAnnouncementSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordScheduledPublicationRun" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" "DiscordAnnouncementRunStatus" NOT NULL DEFAULT 'PROCESSING',
  "publicationId" TEXT,
  "discordChannelId" TEXT,
  "discordMessageId" TEXT,
  "errorCode" TEXT,
  "errorSummary" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "workerToken" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordScheduledPublicationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordAnnouncementScheduleAuditEvent" (
  "id" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "actorDiscordUserId" TEXT NOT NULL,
  "action" "DiscordAnnouncementScheduleAuditAction" NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordAnnouncementScheduleAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordScheduledPublicationRun_scheduleId_scheduledFor_key" ON "DiscordScheduledPublicationRun"("scheduleId", "scheduledFor");
CREATE INDEX "DiscordAnnouncementSchedule_guildId_status_nextRunAt_idx" ON "DiscordAnnouncementSchedule"("guildId", "status", "nextRunAt");
CREATE INDEX "DiscordAnnouncementSchedule_status_leaseExpiresAt_idx" ON "DiscordAnnouncementSchedule"("status", "leaseExpiresAt");
CREATE INDEX "DiscordAnnouncementSchedule_draftId_idx" ON "DiscordAnnouncementSchedule"("draftId");
CREATE INDEX "DiscordScheduledPublicationRun_scheduleId_createdAt_idx" ON "DiscordScheduledPublicationRun"("scheduleId", "createdAt");
CREATE INDEX "DiscordScheduledPublicationRun_status_createdAt_idx" ON "DiscordScheduledPublicationRun"("status", "createdAt");
CREATE INDEX "DiscordAnnouncementScheduleAuditEvent_scheduleId_createdAt_idx" ON "DiscordAnnouncementScheduleAuditEvent"("scheduleId", "createdAt");

ALTER TABLE "DiscordScheduledPublicationRun" ADD CONSTRAINT "DiscordScheduledPublicationRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DiscordAnnouncementSchedule"("id") ON DELETE CASCADE;
ALTER TABLE "DiscordAnnouncementScheduleAuditEvent" ADD CONSTRAINT "DiscordAnnouncementScheduleAuditEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DiscordAnnouncementSchedule"("id") ON DELETE CASCADE;
