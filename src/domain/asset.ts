import type { BasisPoints, Brand, ISODateTime, Money, Percentage } from "./common";

export type AssetId = Brand<string, "AssetId">;
export type AssetCategory =
  | "pokemon"
  | "football"
  | "basketball"
  | "baseball"
  | "formula-1"
  | "magic"
  | "yugioh"
  | "one-piece"
  | "lorcana"
  | "other";
export type AssetStatus = "draft" | "verification" | "vaulted" | "listed" | "sold" | "withdrawn";
export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC" | "TAG" | "ACE" | "other";
export type InsuranceStatus = "pending" | "active" | "lapsed" | "not-covered";

export interface Grade {
  company: GradingCompany;
  label: string;
  numeric?: number;
}
export interface Certification {
  company: GradingCompany;
  number: string;
  verifiedAt?: ISODateTime;
}
export interface AssetMedia {
  id: string;
  url: string;
  alt: string;
  kind: "image" | "video";
  order: number;
}
export interface CardDetails {
  manufacturer?: string;
  set?: string;
  cardNumber?: string;
  year?: number;
  playerOrCharacter?: string;
  variant?: string;
}
export interface AssetDetails {
  title: string;
  description?: string;
  category: AssetCategory;
  card?: CardDetails;
}
export interface VerificationRecord {
  id: string;
  status: "pending" | "verified" | "rejected";
  provider?: string;
  checkedAt?: ISODateTime;
}
export interface VaultRecord {
  facilityLabel: string;
  status: "received" | "stored" | "released";
  insuredStatus: InsuranceStatus;
  updatedAt: ISODateTime;
}
export interface ChainOfCustodyEvent {
  id: string;
  occurredAt: ISODateTime;
  type: "submitted" | "received" | "verified" | "stored" | "released";
  note: string;
}
export interface Asset {
  id: AssetId;
  /** Public catalogue slug. It is the identity used by public market routes. */
  slug?: string;
  symbol: string;
  details: AssetDetails;
  /** Collector-described condition, kept separate from any official grade. */
  conditionLabel?: string;
  status: AssetStatus;
  media: AssetMedia[];
  grade?: Grade;
  certification?: Certification;
  verification?: VerificationRecord;
  vault?: VaultRecord;
  /** Not exposed by the public market API until ownership is implemented. */
  ownershipAvailableBps?: BasisPoints;
  /** Legacy mock-only valuation. New API reads use `market.estimatedMarketValue`. */
  marketValue?: Money;
  confidence?: Percentage;
  marketSummary?: {
    completedSales: MarketObservationSummary | null;
    activeListings: MarketObservationSummary | null;
    priceGuides: MarketObservationSummary | null;
    providerCount: number;
  };
  ownership?: {
    status: string;
    totalUnits: string;
    issuedUnits: string;
  };
  trading?: {
    status: string;
    enabled: boolean;
    hasExecutionHistory: boolean;
  };
  market?: {
    estimatedMarketValue?: Money;
    source?: string;
    asOf?: ISODateTime;
    confidence?: Percentage;
    dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
    markSource?: string;
    freshness?: "FRESH" | "AGING" | "STALE" | "UNAVAILABLE" | string;
    lastSuccessfulRefreshAt?: ISODateTime;
    change24hBps?: number;
    /** Public aggregate availability from the market snapshot, never account ownership. */
    availabilityBps?: BasisPoints;
    /** Public aggregate owner count from the market snapshot. */
    ownersCount?: number;
    hasTradingHistory?: boolean;
    /** Source-labelled external observations. Never a Slice ownership offer. */
    reference?: {
      currentListing?: ExternalMarketObservation;
      recentCompletedSale?: ExternalMarketObservation;
    };
  };
}

export interface MarketObservationSummary {
  count: number;
  mixedCurrency?: boolean;
  currency?: string;
  lowMinor?: string;
  highMinor?: string;
  medianMinor?: string;
  latestMinor?: string;
  latestAt?: ISODateTime;
}

export interface ExternalMarketObservation {
  amount: Money;
  source: string;
  externalReference: string;
  listingUrl: string;
  imageUrl?: string;
  observedAt: ISODateTime;
}
