ALTER TABLE "DiscordTicket" ADD COLUMN "formVersionId" TEXT;
ALTER TABLE "DiscordTicket" ADD COLUMN "assignedTeamKey" TEXT;
ALTER TABLE "DiscordTicket" ADD COLUMN "firstStaffResponseAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "firstResponseDueAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "resolutionDueAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "firstResponseRiskAlertedAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "firstResponseBreachAlertedAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "resolutionRiskAlertedAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "resolutionBreachAlertedAt" TIMESTAMP(3);
ALTER TABLE "DiscordTicket" ADD COLUMN "protectedFromAutoClose" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DiscordTicketFormVersion" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "category" TEXT NOT NULL, "version" INTEGER NOT NULL,
  "fields" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTicketFormVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketIntakeResponse" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "fieldKey" TEXT NOT NULL, "fieldLabel" TEXT NOT NULL,
  "fieldType" TEXT NOT NULL, "value" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTicketIntakeResponse_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketInternalNote" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "authorDiscordUserId" TEXT NOT NULL, "content" TEXT NOT NULL,
  "referencedMessageId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTicketInternalNote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketTag" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordTicketTag_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketTagAssignment" (
  "ticketId" TEXT NOT NULL, "tagId" TEXT NOT NULL, "addedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordTicketTagAssignment_pkey" PRIMARY KEY ("ticketId", "tagId")
);
CREATE TABLE "DiscordTicketCategoryPolicy" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "category" TEXT NOT NULL, "routingRoleKey" TEXT,
  "defaultPriority" "DiscordTicketPriority" NOT NULL DEFAULT 'NORMAL', "firstResponseMinutes" INTEGER NOT NULL DEFAULT 240,
  "resolutionMinutes" INTEGER NOT NULL DEFAULT 2880, "inactivityWarningHours" INTEGER NOT NULL DEFAULT 48,
  "inactivityCloseHours" INTEGER NOT NULL DEFAULT 120, "protectedFromAutoClose" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DiscordTicketCategoryPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordTicketStaffTranscript" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "status" "DiscordTicketTranscriptStatus" NOT NULL DEFAULT 'COMPLETE',
  "content" TEXT NOT NULL, "messageCount" INTEGER NOT NULL DEFAULT 0, "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordTicketStaffTranscript_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordTicketFormVersion_guildId_category_version_key" ON "DiscordTicketFormVersion"("guildId", "category", "version");
CREATE INDEX "DiscordTicketFormVersion_guildId_category_active_idx" ON "DiscordTicketFormVersion"("guildId", "category", "active");
CREATE UNIQUE INDEX "DiscordTicketIntakeResponse_ticketId_fieldKey_key" ON "DiscordTicketIntakeResponse"("ticketId", "fieldKey");
CREATE INDEX "DiscordTicketIntakeResponse_ticketId_createdAt_idx" ON "DiscordTicketIntakeResponse"("ticketId", "createdAt");
CREATE INDEX "DiscordTicketInternalNote_ticketId_createdAt_idx" ON "DiscordTicketInternalNote"("ticketId", "createdAt");
CREATE UNIQUE INDEX "DiscordTicketTag_guildId_key_key" ON "DiscordTicketTag"("guildId", "key");
CREATE INDEX "DiscordTicketTag_guildId_enabled_sortOrder_idx" ON "DiscordTicketTag"("guildId", "enabled", "sortOrder");
CREATE INDEX "DiscordTicketTagAssignment_tagId_createdAt_idx" ON "DiscordTicketTagAssignment"("tagId", "createdAt");
CREATE UNIQUE INDEX "DiscordTicketCategoryPolicy_guildId_category_key" ON "DiscordTicketCategoryPolicy"("guildId", "category");
CREATE UNIQUE INDEX "DiscordTicketStaffTranscript_ticketId_key" ON "DiscordTicketStaffTranscript"("ticketId");
CREATE INDEX "DiscordTicketCategoryPolicy_guildId_enabled_idx" ON "DiscordTicketCategoryPolicy"("guildId", "enabled");

ALTER TABLE "DiscordTicket" ADD CONSTRAINT "DiscordTicket_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "DiscordTicketFormVersion"("id") ON DELETE SET NULL;
ALTER TABLE "DiscordTicketIntakeResponse" ADD CONSTRAINT "DiscordTicketIntakeResponse_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DiscordTicket"("id") ON DELETE CASCADE;
ALTER TABLE "DiscordTicketInternalNote" ADD CONSTRAINT "DiscordTicketInternalNote_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DiscordTicket"("id") ON DELETE CASCADE;
ALTER TABLE "DiscordTicketTagAssignment" ADD CONSTRAINT "DiscordTicketTagAssignment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DiscordTicket"("id") ON DELETE CASCADE;
ALTER TABLE "DiscordTicketTagAssignment" ADD CONSTRAINT "DiscordTicketTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DiscordTicketTag"("id") ON DELETE RESTRICT;
ALTER TABLE "DiscordTicketStaffTranscript" ADD CONSTRAINT "DiscordTicketStaffTranscript_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "DiscordTicket"("id") ON DELETE CASCADE;
