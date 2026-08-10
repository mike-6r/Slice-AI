-- AlterTable
ALTER TABLE "TradingMarket" ADD COLUMN     "makerFeeBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minimumNotionalMinor" BIGINT NOT NULL DEFAULT 100,
ADD COLUMN     "selfTradePrevention" TEXT NOT NULL DEFAULT 'REJECT_TAKER',
ADD COLUMN     "takerFeeBps" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "tradingEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "TradingMarket" ALTER COLUMN "feeScheduleVersion" SET DEFAULT 'INITIAL_POLICY_V1';

ALTER TABLE "TradingMarket"
  ADD CONSTRAINT "TradingMarket_minimum_notional_positive"
  CHECK ("minimumNotionalMinor" > 0),
  ADD CONSTRAINT "TradingMarket_fee_bps_bounds"
  CHECK ("makerFeeBps" BETWEEN 0 AND 1000 AND "takerFeeBps" BETWEEN 0 AND 1000),
  ADD CONSTRAINT "TradingMarket_self_trade_policy"
  CHECK ("selfTradePrevention" = 'REJECT_TAKER');
