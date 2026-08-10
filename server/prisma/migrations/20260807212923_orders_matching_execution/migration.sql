-- CreateEnum
CREATE TYPE "TradingMarketStatus" AS ENUM ('OPEN', 'HALTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TradingOrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradingOrderType" AS ENUM ('LIMIT');

-- CreateEnum
CREATE TYPE "TradingTimeInForce" AS ENUM ('GTC', 'IOC');

-- CreateEnum
CREATE TYPE "TradingOrderStatus" AS ENUM ('PENDING_RESERVATION', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TradingExecutionSettlementStatus" AS ENUM ('SETTLED', 'FAILED');

-- AlterEnum
ALTER TYPE "JournalTransactionType" ADD VALUE 'TRADE_SETTLEMENT';

-- CreateTable
CREATE TABLE "TradingMarket" (
    "assetId" TEXT NOT NULL,
    "status" "TradingMarketStatus" NOT NULL DEFAULT 'OPEN',
    "tickSizeMinor" BIGINT NOT NULL DEFAULT 1,
    "lotSizeUnits" BIGINT NOT NULL DEFAULT 1,
    "feeScheduleVersion" TEXT NOT NULL DEFAULT 'LOCAL_ZERO_V1',
    "nextPrioritySequence" BIGINT NOT NULL DEFAULT 1,
    "nextExecutionSequence" BIGINT NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingMarket_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "TradingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "side" "TradingOrderSide" NOT NULL,
    "type" "TradingOrderType" NOT NULL DEFAULT 'LIMIT',
    "timeInForce" "TradingTimeInForce" NOT NULL,
    "status" "TradingOrderStatus" NOT NULL DEFAULT 'PENDING_RESERVATION',
    "limitPriceMinor" BIGINT NOT NULL,
    "originalUnits" BIGINT NOT NULL,
    "remainingUnits" BIGINT NOT NULL,
    "filledUnits" BIGINT NOT NULL DEFAULT 0,
    "averageFillPriceMinor" BIGINT,
    "prioritySequence" BIGINT,
    "cashReservationId" TEXT,
    "ownershipReservationId" TEXT,
    "idempotencyRecordId" TEXT,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingExecution" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "buyOrderId" TEXT NOT NULL,
    "sellOrderId" TEXT NOT NULL,
    "makerOrderId" TEXT NOT NULL,
    "takerOrderId" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "units" BIGINT NOT NULL,
    "grossMinor" BIGINT NOT NULL,
    "buyerFeeMinor" BIGINT NOT NULL DEFAULT 0,
    "sellerFeeMinor" BIGINT NOT NULL DEFAULT 0,
    "marketSequence" BIGINT NOT NULL,
    "settlementStatus" "TradingExecutionSettlementStatus" NOT NULL DEFAULT 'SETTLED',
    "correlationId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "TradingOrderStatus",
    "toStatus" "TradingOrderStatus" NOT NULL,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingMarket_status_updatedAt_assetId_idx" ON "TradingMarket"("status", "updatedAt", "assetId");

-- CreateIndex
CREATE INDEX "TradingOrder_assetId_side_status_limitPriceMinor_prioritySe_idx" ON "TradingOrder"("assetId", "side", "status", "limitPriceMinor", "prioritySequence");

-- CreateIndex
CREATE INDEX "TradingOrder_userId_createdAt_id_idx" ON "TradingOrder"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TradingOrder_assetId_status_createdAt_id_idx" ON "TradingOrder"("assetId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TradingExecution_correlationId_key" ON "TradingExecution"("correlationId");

-- CreateIndex
CREATE INDEX "TradingExecution_assetId_executedAt_id_idx" ON "TradingExecution"("assetId", "executedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TradingExecution_assetId_marketSequence_key" ON "TradingExecution"("assetId", "marketSequence");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_id_idx" ON "OrderStatusHistory"("orderId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "TradingMarket" ADD CONSTRAINT "TradingMarket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_asset_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_market_fkey" FOREIGN KEY ("assetId") REFERENCES "TradingMarket"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_asset_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_market_fkey" FOREIGN KEY ("assetId") REFERENCES "TradingMarket"("assetId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_buyOrderId_fkey" FOREIGN KEY ("buyOrderId") REFERENCES "TradingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_sellOrderId_fkey" FOREIGN KEY ("sellOrderId") REFERENCES "TradingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_makerOrderId_fkey" FOREIGN KEY ("makerOrderId") REFERENCES "TradingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingExecution" ADD CONSTRAINT "TradingExecution_takerOrderId_fkey" FOREIGN KEY ("takerOrderId") REFERENCES "TradingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TradingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Trading arithmetic is integer-only. Application logic enforces tick/lot
-- divisibility and deterministic priority; these checks reject impossible
-- persisted totals even if a caller bypasses that logic.
ALTER TABLE "TradingMarket"
  ADD CONSTRAINT "TradingMarket_tick_and_lot_positive"
  CHECK ("tickSizeMinor" > 0 AND "lotSizeUnits" > 0);

ALTER TABLE "TradingOrder"
  ADD CONSTRAINT "TradingOrder_positive_price_and_units"
  CHECK ("limitPriceMinor" > 0 AND "originalUnits" > 0 AND "remainingUnits" >= 0 AND "filledUnits" >= 0),
  ADD CONSTRAINT "TradingOrder_unit_equation"
  CHECK ("remainingUnits" + "filledUnits" = "originalUnits");

ALTER TABLE "TradingExecution"
  ADD CONSTRAINT "TradingExecution_positive_amounts"
  CHECK ("priceMinor" > 0 AND "units" > 0 AND "grossMinor" = "priceMinor" * "units" AND "buyerFeeMinor" = 0 AND "sellerFeeMinor" = 0);
