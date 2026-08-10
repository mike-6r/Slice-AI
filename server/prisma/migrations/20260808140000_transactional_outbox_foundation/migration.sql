-- Document 017 phase 1: transactionally appended, safe domain-event envelopes.
-- No worker, external consumer, or delivery side effect is introduced here.
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "correlationId" TEXT,
    "causationId" TEXT,
    "actorUserId" TEXT,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "lastErrorSafe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_eventId_key" ON "OutboxEvent"("eventId");
CREATE INDEX "OutboxEvent_status_availableAt_createdAt_id_idx" ON "OutboxEvent"("status", "availableAt", "createdAt", "id");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_occurredAt_id_idx" ON "OutboxEvent"("aggregateType", "aggregateId", "occurredAt", "id");
CREATE INDEX "OutboxEvent_correlationId_idx" ON "OutboxEvent"("correlationId");
