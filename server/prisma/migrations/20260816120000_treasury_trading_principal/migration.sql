-- Treasury listings are first-class market principals. They are never backed
-- by a customer User row or a customer-withdrawable cash account.
CREATE TYPE "TradingPrincipalType" AS ENUM ('USER', 'TREASURY');

ALTER TABLE "TradingOrder"
  ADD COLUMN "principalType" "TradingPrincipalType" NOT NULL DEFAULT 'USER',
  ADD COLUMN "principalId" TEXT,
  ADD COLUMN "actorUserId" TEXT;

UPDATE "TradingOrder"
SET "principalId" = "userId"
WHERE "principalId" IS NULL;

ALTER TABLE "TradingOrder"
  ALTER COLUMN "principalId" SET NOT NULL,
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "TradingOrder"
  ADD CONSTRAINT "TradingOrder_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "TradingOrder_principalType_principalId_createdAt_id_idx"
  ON "TradingOrder"("principalType", "principalId", "createdAt", "id");

CREATE INDEX "TradingOrder_actorUserId_createdAt_id_idx"
  ON "TradingOrder"("actorUserId", "createdAt", "id");
