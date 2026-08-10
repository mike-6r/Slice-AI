-- Document 017 phase 2: fenced leases and durable retry/dead-letter state.
ALTER TABLE "OutboxEvent"
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OutboxEvent_claimToken_key" ON "OutboxEvent"("claimToken");
CREATE INDEX "OutboxEvent_status_leaseExpiresAt_id_idx" ON "OutboxEvent"("status", "leaseExpiresAt", "id");
