-- Document 014: executions persist configured maker/taker fees in GBP minor units.
ALTER TABLE "TradingExecution"
  DROP CONSTRAINT "TradingExecution_positive_amounts";

ALTER TABLE "TradingExecution"
  ADD CONSTRAINT "TradingExecution_positive_amounts"
  CHECK (
    "priceMinor" > 0
    AND "units" > 0
    AND "grossMinor" = "priceMinor" * "units"
    AND "buyerFeeMinor" >= 0
    AND "sellerFeeMinor" >= 0
  );
