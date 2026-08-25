import type { ISODateTime } from "./common";

/** Decimal-free API values; they must not be coerced to JavaScript numbers. */
export type GbpMinorUnits = string;
export type PortfolioValuationStatus = "FULL" | "PARTIAL" | "UNAVAILABLE";

export interface BacsRiskHeldDeposit {
  id: string;
  amountMinor: GbpMinorUnits;
  providerAvailableOn: ISODateTime | null;
  expectedReleaseAt: ISODateTime | null;
}

export interface PortfolioCashSummary {
  currency: "GBP";
  totalMinor: GbpMinorUnits;
  reservedMinor: GbpMinorUnits;
  availableMinor: GbpMinorUnits;
  pendingMinor?: GbpMinorUnits;
  pendingDepositCount?: number;
  pendingWithdrawalMinor?: GbpMinorUnits;
  pendingWithdrawalCount?: number;
  orderReservedMinor?: GbpMinorUnits;
  withdrawalReservedMinor?: GbpMinorUnits;
  /** Posted GBP cash that is eligible for an external withdrawal. */
  withdrawableMinor?: GbpMinorUnits;
  /** Posted GBP cash that is eligible for orders and executions. */
  tradeAvailableMinor?: GbpMinorUnits;
  /** Provider-confirmed Bacs cash held while return risk is unresolved. */
  riskHeldMinor?: GbpMinorUnits;
  riskHeldDepositCount?: number;
  riskHeldDeposits?: BacsRiskHeldDeposit[];
  withdrawableSources?: Array<{
    code: string;
    availableMinor: GbpMinorUnits;
  }>;
  collectorProceedsMinor?: GbpMinorUnits;
  collectorProceedsReservedMinor?: GbpMinorUnits;
}

/** Safe, customer-facing identity shared by portfolio surfaces. */
export interface PortfolioAssetSummary {
  slug: string | null;
  title: string;
  category: string | null;
  setName?: string | null;
  thumbnailUrl?: string | null;
}

export interface WalletInsights {
  period: "month";
  currency: "GBP";
  totalDepositsMinor: GbpMinorUnits;
  totalWithdrawalsMinor: GbpMinorUnits;
  netMovementMinor: GbpMinorUnits;
  previousPeriod: {
    totalDepositsMinor: GbpMinorUnits;
    totalWithdrawalsMinor: GbpMinorUnits;
    netMovementMinor: GbpMinorUnits;
  } | null;
}

export interface PortfolioHolding {
  assetId: string;
  slug: string | null;
  title: string | null;
  category: string | null;
  setName?: string | null;
  grade: string | null;
  thumbnailUrl?: string | null;
  ownedUnits: string;
  totalUnits?: string | null;
  issuedUnits?: string | null;
  totalIssuedQuantity?: string | null;
  userOwnershipPercent?: string | null;
  availableToSellPercent?: string | null;
  availableToBuyQuantity?: string | null;
  availableToBuyPercent?: string | null;
  reservedUnits: string;
  /** Settled ownership that is not reserved by an open sell order. */
  availableToSellUnits?: string;
  availableUnits: string;
  estimatedValueMinor: GbpMinorUnits | null;
  pricePerSliceMinor?: GbpMinorUnits | null;
  valuationAsOf: ISODateTime | null;
  valuationStatus: PortfolioValuationStatus;
  costBasisMinor: GbpMinorUnits | null;
  unrealisedPnlMinor?: GbpMinorUnits | null;
  unrealisedPnlPercent?: string | null;
  valuationSource?: string | null;
  valuationFreshness?: "FRESH" | "AGING" | "STALE" | "UNAVAILABLE" | string;
  lastSuccessfulRefreshAt?: ISODateTime | null;
}

export type PortfolioHoldingSort = "VALUE_DESC" | "OWNERSHIP_DESC" | "TITLE_ASC";

export interface PortfolioHoldingPage {
  items: PortfolioHolding[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
  /** Total account value: total cash (including active reservations) + marked holdings. */
  totalAccountValueMinor?: GbpMinorUnits | null;
  availableCashMinor?: GbpMinorUnits | null;
  reservedCashMinor?: GbpMinorUnits | null;
  valuationStatus: PortfolioValuationStatus;
  investedCostMinor?: GbpMinorUnits | null;
  unrealisedPnlMinor?: GbpMinorUnits | null;
  unrealisedPnlPercent?: string | null;
}

export type PortfolioPerformanceRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
export interface PortfolioPerformancePoint {
  timestamp: ISODateTime;
  valueMinor: GbpMinorUnits;
  currency: "GBP";
  freshness: string;
  cashValueMinor?: GbpMinorUnits | null;
  /** Cash available after active reservations. */
  availableCashMinor?: GbpMinorUnits | null;
  holdingsValueMinor?: GbpMinorUnits | null;
  reservedValueMinor?: GbpMinorUnits | null;
  costBasisMinor?: GbpMinorUnits | null;
  unrealisedPnlMinor?: GbpMinorUnits | null;
  /** External cash movement since the first point in the selected range. */
  netExternalCashFlowMinor?: GbpMinorUnits | null;
  /** Account-value change after removing external cash movement. */
  cashFlowAdjustedChangeMinor?: GbpMinorUnits | null;
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
