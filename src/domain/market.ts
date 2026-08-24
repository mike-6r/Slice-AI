import type { AssetId } from "./asset";
import type { BasisPoints, CurrencyCode, ISODateTime, Money, Percentage } from "./common";

export type TimeRange = "24H" | "7D" | "30D" | "90D" | "1Y" | "ALL";
export type ValuationSource = "demo-market" | "auction-comparable" | "manual-appraisal";
export interface PricePoint {
  timestamp: ISODateTime;
  value: Money;
}

export interface PriceHistoryPoint extends PricePoint {
  id?: string;
  source?: string;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
  changeFromPrevious?: Money | null;
  changeFromPreviousBps?: number | null;
  changeFromRangeStart?: Money | null;
  changeFromRangeStartBps?: number | null;
}
/**
 * A persisted market-history response. The array shape keeps existing chart
 * consumers compatible while preserving backend movement/source metadata for
 * surfaces that need to distinguish external reference history from Slice
 * valuation history.
 */
export type PriceHistory = PriceHistoryPoint[] & {
  source?: "PRICECHARTING" | "SLICE_VALUATION";
  movementBps?: number | null;
  range?: TimeRange;
  selectedRange?: TimeRange;
  currency?: CurrencyCode | null;
  startingValue?: Money | null;
  latestValue?: Money | null;
  absoluteChange?: Money | null;
  percentageChangeBps?: number | null;
  highValue?: Money | null;
  lowValue?: Money | null;
  historyPointCount?: number;
  displayedPointCount?: number;
  rangeStart?: ISODateTime | null;
  rangeEnd?: ISODateTime | null;
  actualCoverageSeconds?: number;
  lastRefreshedAt?: ISODateTime | null;
  movementAvailability?: "AVAILABLE" | "UNAVAILABLE";
  movementUnavailableReason?: string | null;
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
export type MarketSnapshotStatus = "CURRENT" | "AGING" | "STALE" | "DELAYED" | "UNAVAILABLE";
export type MarketSnapshotPriceKind = "INITIAL_OFFERING" | "LAST_TRADE";
export interface MarketSnapshotItem {
  assetId: AssetId;
  slug: string;
  title: string;
  setName?: string;
  cardNumber?: string;
  sliceMarketPrice?: {
    amount: Money;
    kind: MarketSnapshotPriceKind;
    observedAt: ISODateTime;
  };
  externalReference?: {
    amount: Money;
    source: string;
    movement24hBps?: number | null;
    lastRefreshedAt?: ISODateTime | null;
    freshness?: string | null;
  };
  marketState: "INITIAL_OFFERING" | "SECONDARY_MARKET" | "REFERENCE_ONLY";
  lastUpdatedAt: ISODateTime | null;
}
export interface MarketSnapshot {
  generatedAt: ISODateTime;
  status: MarketSnapshotStatus;
  lastUpdatedAt: ISODateTime | null;
  items: MarketSnapshotItem[];
}
export type SimilarAssetMarketState =
  "LIVE_MARKET" | "INITIAL_OFFERING" | "MARKET_CLOSED" | "REFERENCE_ONLY";
export type SimilarAssetDisplayPriceType =
  "LAST_EXECUTION" | "INITIAL_OFFERING" | "VALUATION" | "UNAVAILABLE";
export interface SimilarAsset {
  assetId: AssetId;
  slug: string;
  title: string;
  category: string;
  setName?: string;
  cardNumber?: string;
  thumbnail?: { url: string; alt: string };
  marketState: SimilarAssetMarketState;
  displayPrice: {
    type: SimilarAssetDisplayPriceType;
    amount: Money | null;
    observedAt: ISODateTime | null;
  };
  movement24hBps?: number | null;
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
