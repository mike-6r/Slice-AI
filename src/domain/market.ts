import type { AssetId } from "./asset";
import type { BasisPoints, ISODateTime, Money, Percentage } from "./common";

export type TimeRange = "24H" | "7D" | "30D" | "90D" | "1Y" | "ALL";
export type ValuationSource = "demo-market" | "auction-comparable" | "manual-appraisal";
export interface PricePoint {
  timestamp: ISODateTime;
  value: Money;
}
/**
 * A persisted market-history response. The array shape keeps existing chart
 * consumers compatible while preserving backend movement/source metadata for
 * surfaces that need to distinguish external reference history from Slice
 * valuation history.
 */
export type PriceHistory = PricePoint[] & {
  source?: "PRICECHARTING" | "SLICE_VALUATION";
  movementBps?: number | null;
  range?: TimeRange;
};
export interface ComparableSale {
  id: string;
  occurredAt: ISODateTime;
  venue: string;
  price: Money;
  grade?: string;
}
export interface Valuation {
  assetId: AssetId;
  value: Money;
  source: ValuationSource;
  confidence: Percentage;
  comparableSales: ComparableSale[];
  asOf: ISODateTime;
}
export interface MarketMovement {
  changeBps: number;
  range: TimeRange;
}
export interface MarketConfidence {
  score: Percentage;
  factors: string[];
}
export interface MarketSummary {
  totalMarketValue: Money;
  volume24h: Money;
  activeAssets: number;
  verifiedAssets: number;
  activeCollectors: number;
}
export interface OrderBookLevel {
  pricePerUnit: Money;
  units: number;
  orderCount: number;
}
export interface OrderBook {
  assetId: AssetId;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spreadBps?: BasisPoints;
  updatedAt: ISODateTime;
}
