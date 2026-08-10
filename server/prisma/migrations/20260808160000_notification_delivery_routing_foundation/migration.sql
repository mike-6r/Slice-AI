-- Document 017 phase 3: provider-neutral durable delivery intents and preferences.
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'DISCORD', 'EMAIL', 'PUSH', 'WEBHOOK');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SUPPRESSED', 'DEAD_LETTER');

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "topic" TEXT NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationPreference_userId_topic_channel_key" ON "NotificationPreference"("userId", "topic", "channel");
CREATE INDEX "NotificationPreference_userId_topic_idx" ON "NotificationPreference"("userId", "topic");

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL, "deliveryId" TEXT NOT NULL, "outboxEventId" TEXT NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL, "destinationKey" TEXT NOT NULL,
  "classification" TEXT NOT NULL, "topic" TEXT NOT NULL, "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "payloadVersion" INTEGER NOT NULL, "payload" JSONB NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deliveredAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "lastErrorSafe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDelivery_outboxEventId_fkey" FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationDelivery_deliveryId_key" ON "NotificationDelivery"("deliveryId");
CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_key" ON "NotificationDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "NotificationDelivery_outboxEventId_channel_destinationKey_key" ON "NotificationDelivery"("outboxEventId", "channel", "destinationKey");
CREATE INDEX "NotificationDelivery_status_availableAt_createdAt_id_idx" ON "NotificationDelivery"("status", "availableAt", "createdAt", "id");
CREATE INDEX "NotificationDelivery_outboxEventId_createdAt_id_idx" ON "NotificationDelivery"("outboxEventId", "createdAt", "id");
