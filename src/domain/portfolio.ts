import type { ISODateTime } from "./common";

/** Decimal-free API values; they must not be coerced to JavaScript numbers. */
export type GbpMinorUnits = string;
export type PortfolioValuationStatus = "FULL" | "PARTIAL" | "UNAVAILABLE";

export interface PortfolioCashSummary {
  currency: "GBP";
  totalMinor: GbpMinorUnits;
  reservedMinor: GbpMinorUnits;
  availableMinor: GbpMinorUnits;
}

export interface PortfolioHolding {
  assetId: string;
  slug: string | null;
  title: string | null;
  category: string | null;
  grade: string | null;
  ownedUnits: string;
  totalUnits?: string | null;
  issuedUnits?: string | null;
  reservedUnits: string;
  /** Settled ownership that is not reserved by an open sell order. */
  availableToSellUnits?: string;
  availableUnits: string;
  estimatedValueMinor: GbpMinorUnits | null;
  valuationAsOf: ISODateTime | null;
  valuationStatus: PortfolioValuationStatus;
  costBasisMinor: GbpMinorUnits | null;
  valuationSource?: string | null;
  valuationFreshness?: "FRESH" | "AGING" | "STALE" | "UNAVAILABLE" | string;
  lastSuccessfulRefreshAt?: ISODateTime | null;
}

export interface PortfolioLot {
  assetSlug: string | null;
  assetTitle: string | null;
  acquiredUnits: string;
  remainingUnits: string;
  totalCostMinor: GbpMinorUnits | null;
  acquiredAt: ISODateTime;
  status: string;
}

export interface PortfolioTransaction {
  type: string;
  side: "DEBIT" | "CREDIT";
  amountMinor: GbpMinorUnits;
  effectiveAt: ISODateTime;
  status: string | null;
  reference: string | null;
}

export interface PortfolioTransactionPage {
  items: PortfolioTransaction[];
  nextCursor: string | null;
}

export interface PortfolioSummary {
  currency: "GBP";
  cash: PortfolioCashSummary;
  holdings: PortfolioHolding[];
  estimatedHoldingsValueMinor: GbpMinorUnits | null;
  estimatedPortfolioValueMinor: GbpMinorUnits | null;
  valuationStatus: PortfolioValuationStatus;
}

export type PortfolioPerformanceRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export interface PortfolioPerformancePoint {
  timestamp: ISODateTime;
  valueMinor: GbpMinorUnits;
  currency: "GBP";
  freshness: string;
}
export interface PortfolioPerformance {
  range: PortfolioPerformanceRange;
  points: PortfolioPerformancePoint[];
  periodChangeMinor: GbpMinorUnits | null;
  periodChangeBps: number | null;
  netCashFlowMinor: GbpMinorUnits;
  direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  freshness: string;
}
