CREATE TYPE "DiscordTicketTranscriptStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED');

ALTER TABLE "DiscordTicketTranscript"
  ADD COLUMN "status" "DiscordTicketTranscriptStatus" NOT NULL DEFAULT 'COMPLETE',
  ADD COLUMN "messageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "deliveryChannelId" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
