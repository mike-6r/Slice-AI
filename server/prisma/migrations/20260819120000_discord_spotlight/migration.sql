CREATE TYPE "DiscordSpotlightKind" AS ENUM ('COLLECTOR', 'COLLECTIBLE');
CREATE TYPE "DiscordSpotlightStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'CANCELLED', 'BLOCKED');

CREATE TABLE "DiscordSpotlight" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "kind" "DiscordSpotlightKind" NOT NULL,
  "sourceSlug" TEXT NOT NULL,
  "requesterDiscordUserId" TEXT NOT NULL,
  "approvedByDiscordUserId" TEXT,
  "status" "DiscordSpotlightStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "editorialTitle" TEXT,
  "editorialCopy" TEXT,
  "targetChannelId" TEXT,
  "embedDraftId" TEXT,
  "sourceSnapshot" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "blockedReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordSpotlight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordSpotlightAuditEvent" (
  "id" TEXT NOT NULL,
  "spotlightId" TEXT NOT NULL,
  "actorDiscordUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscordSpotlightAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DiscordSpotlight_guildId_status_createdAt_idx" ON "DiscordSpotlight"("guildId", "status", "createdAt");
CREATE INDEX "DiscordSpotlight_guildId_kind_sourceSlug_publishedAt_idx" ON "DiscordSpotlight"("guildId", "kind", "sourceSlug", "publishedAt");
CREATE INDEX "DiscordSpotlightAuditEvent_spotlightId_createdAt_idx" ON "DiscordSpotlightAuditEvent"("spotlightId", "createdAt");
ALTER TABLE "DiscordSpotlightAuditEvent" ADD CONSTRAINT "DiscordSpotlightAuditEvent_spotlightId_fkey" FOREIGN KEY ("spotlightId") REFERENCES "DiscordSpotlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
