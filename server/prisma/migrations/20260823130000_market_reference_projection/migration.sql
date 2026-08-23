ALTER TABLE "MarketProviderMapping"
  ADD COLUMN "currentPriceMinor" BIGINT,
  ADD COLUMN "currentCurrency" TEXT,
  ADD COLUMN "currentObservedAt" TIMESTAMP(3),
  ADD COLUMN "referenceHistoryStartedAt" TIMESTAMP(3),
  ADD COLUMN "referenceMovement24hBps" INTEGER,
  ADD COLUMN "referenceMovement7dBps" INTEGER,
  ADD COLUMN "referenceMovement30dBps" INTEGER,
  ADD COLUMN "referenceMovement90dBps" INTEGER,
  ADD COLUMN "referenceMovement1yBps" INTEGER;
