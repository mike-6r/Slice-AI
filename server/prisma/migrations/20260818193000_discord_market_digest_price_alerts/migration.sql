ALTER TABLE "DiscordPriceAlert"
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "lastEvaluatedMinor" BIGINT,
  ADD COLUMN "lastConditionMet" BOOLEAN,
  ADD COLUMN "lastObservedAt" TIMESTAMP(3),
  ADD COLUMN "lastSource" TEXT,
  ADD COLUMN "lastDataStatus" TEXT;

CREATE TABLE "DiscordPriceAlertDelivery" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "assetTitle" TEXT NOT NULL,
  "observedMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "dataStatus" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "discordChannelId" TEXT,
  "discordMessageId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordPriceAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordPriceAlertDelivery_idempotencyKey_key" ON "DiscordPriceAlertDelivery"("idempotencyKey");
CREATE INDEX "DiscordPriceAlertDelivery_status_createdAt_idx" ON "DiscordPriceAlertDelivery"("status", "createdAt");
CREATE INDEX "DiscordPriceAlertDelivery_alertId_status_idx" ON "DiscordPriceAlertDelivery"("alertId", "status");
ALTER TABLE "DiscordPriceAlertDelivery" ADD CONSTRAINT "DiscordPriceAlertDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "DiscordPriceAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DiscordMarketDigestRun" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHING',
  "source" TEXT NOT NULL,
  "dataStatus" TEXT NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  "channelId" TEXT,
  "messageId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscordMarketDigestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordMarketDigestRun_guildId_periodKey_key" ON "DiscordMarketDigestRun"("guildId", "periodKey");
CREATE INDEX "DiscordMarketDigestRun_status_createdAt_idx" ON "DiscordMarketDigestRun"("status", "createdAt");
