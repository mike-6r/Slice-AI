-- AlterTable
ALTER TABLE "TradingOrder" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TradingOrder_assetId_status_expiresAt_id_idx" ON "TradingOrder"("assetId", "status", "expiresAt", "id");
