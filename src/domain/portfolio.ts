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
  reservedUnits: string;
  availableUnits: string;
  estimatedValueMinor: GbpMinorUnits | null;
  valuationAsOf: ISODateTime | null;
  valuationStatus: PortfolioValuationStatus;
  costBasisMinor: GbpMinorUnits | null;
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
