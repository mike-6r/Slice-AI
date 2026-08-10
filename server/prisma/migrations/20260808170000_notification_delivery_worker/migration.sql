-- Document 017 phase 4: fenced delivery worker and idempotent first-party notifications.
ALTER TABLE "Notification" ADD COLUMN "deliveryId" TEXT;
CREATE UNIQUE INDEX "Notification_deliveryId_key" ON "Notification"("deliveryId");
ALTER TABLE "NotificationDelivery"
  ADD COLUMN "lockedAt" TIMESTAMP(3), ADD COLUMN "lockedBy" TEXT,
  ADD COLUMN "claimToken" TEXT, ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3), ADD COLUMN "deadLetteredAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "NotificationDelivery_claimToken_key" ON "NotificationDelivery"("claimToken");
CREATE INDEX "NotificationDelivery_status_leaseExpiresAt_id_idx" ON "NotificationDelivery"("status", "leaseExpiresAt", "id");
