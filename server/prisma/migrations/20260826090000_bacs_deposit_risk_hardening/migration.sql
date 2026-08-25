-- Keep provider-confirmed Bacs deposits out of spendable cash until an
-- explicit configured risk policy releases them.
CREATE TYPE "FinancialDeficitStatus" AS ENUM ('OPEN', 'PARTIALLY_RECOVERED', 'RECOVERED');

CREATE TABLE "FinancialDeficit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceMovementId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "recoveredMinor" BIGINT NOT NULL DEFAULT 0,
  "status" "FinancialDeficitStatus" NOT NULL DEFAULT 'OPEN',
  "reasonCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "FinancialDeficit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialDeficit_sourceMovementId_key"
  ON "FinancialDeficit"("sourceMovementId");
CREATE INDEX "FinancialDeficit_userId_status_createdAt_id_idx"
  ON "FinancialDeficit"("userId", "status", "createdAt", "id");

ALTER TABLE "FinancialDeficit"
  ADD CONSTRAINT "FinancialDeficit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialDeficit"
  ADD CONSTRAINT "FinancialDeficit_sourceMovementId_fkey"
  FOREIGN KEY ("sourceMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
