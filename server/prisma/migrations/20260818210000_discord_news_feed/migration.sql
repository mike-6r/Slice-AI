-- Bot-owned, metadata-only trusted-news polling state. No Slice business or
-- market authority is created by this additive migration.
CREATE TYPE "DiscordNewsCategory" AS ENUM ('POKEMON_OFFICIAL', 'TCG_PRODUCT', 'TOURNAMENT', 'GRADING', 'AUCTION', 'INDUSTRY');
CREATE TYPE "DiscordNewsItemStatus" AS ENUM ('DISCOVERED', 'PUBLISHED', 'DELIVERY_UNCERTAIN');
CREATE TYPE "DiscordNewsDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'RETRYABLE_FAILURE', 'DELIVERY_UNCERTAIN');

CREATE TABLE "DiscordNewsSourceState" (
  "sourceId" TEXT NOT NULL, "lastPollAt" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "etag" TEXT, "lastModified" TEXT,
  "nextPollAt" TIMESTAMP(3), "consecutiveFailures" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordNewsSourceState_pkey" PRIMARY KEY ("sourceId")
);
CREATE TABLE "DiscordNewsItem" (
  "id" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "dedupKey" TEXT NOT NULL, "externalId" TEXT, "canonicalUrl" TEXT NOT NULL,
  "canonicalUrlHash" TEXT NOT NULL, "title" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL, "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category" "DiscordNewsCategory" NOT NULL, "priority" TEXT NOT NULL, "summary" TEXT NOT NULL, "contentHash" TEXT NOT NULL,
  "status" "DiscordNewsItemStatus" NOT NULL DEFAULT 'DISCOVERED', "postedAt" TIMESTAMP(3),
  CONSTRAINT "DiscordNewsItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscordNewsDelivery" (
  "id" TEXT NOT NULL, "guildId" TEXT NOT NULL, "channelId" TEXT NOT NULL, "newsItemId" TEXT NOT NULL,
  "status" "DiscordNewsDeliveryStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0, "claimedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3), "discordMessageId" TEXT, "failureCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordNewsDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscordNewsItem_dedupKey_key" ON "DiscordNewsItem"("dedupKey");
CREATE UNIQUE INDEX "DiscordNewsItem_sourceId_contentHash_key" ON "DiscordNewsItem"("sourceId", "contentHash");
CREATE INDEX "DiscordNewsItem_sourceId_publishedAt_idx" ON "DiscordNewsItem"("sourceId", "publishedAt");
CREATE INDEX "DiscordNewsItem_status_discoveredAt_idx" ON "DiscordNewsItem"("status", "discoveredAt");
CREATE INDEX "DiscordNewsItem_canonicalUrlHash_idx" ON "DiscordNewsItem"("canonicalUrlHash");
CREATE UNIQUE INDEX "DiscordNewsDelivery_guildId_newsItemId_key" ON "DiscordNewsDelivery"("guildId", "newsItemId");
CREATE INDEX "DiscordNewsDelivery_status_createdAt_idx" ON "DiscordNewsDelivery"("status", "createdAt");
ALTER TABLE "DiscordNewsDelivery" ADD CONSTRAINT "DiscordNewsDelivery_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "DiscordNewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
