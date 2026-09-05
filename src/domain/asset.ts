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
export type MarketLifecyclePhase =
  | "UNPUBLISHED"
  | "CUSTODY_REQUIRED"
  | "SUPPLY_APPROVAL_REQUIRED"
  | "READY_FOR_ISSUANCE"
  | "ISSUANCE_PENDING"
  | "LIVE"
  | "SUSPENDED"
  | "CLOSED";
export type MarketLifecycleStepState = "complete" | "current" | "upcoming" | "blocked";
export interface MarketLifecycleProjection {
  phase: MarketLifecyclePhase;
  badge: string;
  headline: string;
  statusPill: string;
  explanation: string;
  tradeabilityMessage: string | null;
  canBuy: boolean;
  canSell: boolean;
  currentStep: number;
  nextAction: string;
  blockingDependency: string | null;
  steps: Array<{
    key: "PUBLISHED" | "CUSTODY" | "ISSUANCE" | "TRADING";
    label: string;
    state: MarketLifecycleStepState;
    subtitle: string;
  }>;
  admin: {
    publicState: string;
    internalState: string;
    nextAction: string;
    blockingDependency: string | null;
  };
}
export interface InitialOfferingProjection {
  status: string;
  totalUnits: string;
  offeredUnits: string;
  retainedUnits: string;
  pricePerUnitMinor: string;
  currency: "GBP" | "USD" | "EUR" | "CAD";
  updatedAt?: ISODateTime;
  inventory: {
    offeredUnits: string;
    availableUnits: string;
    reservedUnits: string;
    settledUnits: string;
  } | null;
}
export interface PreSaleProjection {
  id?: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "FINALIZING" | "CONVERTED" | "CANCELLED";
  openedAt?: ISODateTime | null;
  deadlineAt?: ISODateTime | null;
  physicalStatus: string;
  pricePerUnitMinor: string;
  currency: "GBP" | "USD" | "EUR" | "CAD";
  /** Collector's whole-collectible estimate; never used as a Slice quote. */
  collectorEstimateMinor?: string | null;
  offeredPercentageBps?: number;
  totalSupply?: string;
  offeredUnits: string;
  reservedUnits: string;
  availableUnits: string;
  reservedPercentageBps: number;
  /** Percentage of the full supply represented by one Slice. */
  sliceOwnershipPercentageBps?: number;
  /** Collector-retained percentage of the full supply. */
  collectorRetainedPercentageBps?: number;
  reservationCount?: number;
  disclosure?: string;
  nextStep?: string;
}

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
  /** Public API media slot, when supplied (for example front or back). */
  slot?: string;
  kind: "image" | "video";
  order: number;
}
export interface SliceGradeVisualization {
  side: "FRONT" | "BACK";
  type: "overview" | "centering";
  url: string | null;
  centering: Record<string, number> | null;
}
export interface SliceGrade {
  status: "SUCCEEDED";
  provider: string;
  overallEstimate: number | null;
  overallMin: number | null;
  overallMax: number | null;
  centeringScore: number | null;
  cornerScore: number | null;
  edgeScore: number | null;
  surfaceScore: number | null;
  confidence?: number | null;
  conditionLabel: string | null;
  analyzedAt?: ISODateTime | null;
  warnings: string[];
  visualizations: SliceGradeVisualization[];
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
  /** Supporting AI condition evidence; never an official grade or valuation input. */
  sliceGrade?: SliceGrade;
  /** Staff-approved Slice valuation; external market references remain separate. */
  sliceValuation?: {
    id: string;
    amount: Money;
    confidence: Percentage;
    sourceType: string;
    approvedAt: ISODateTime;
    status: "ACTIVE";
  };
  grade?: Grade;
  certification?: Certification;
  verification?: VerificationRecord;
  /** Safe public projection used by customer-facing trust surfaces. */
  publicVerificationStatus?: "VERIFIED" | "IN_PROGRESS" | "UNAVAILABLE";
  publication?: { status: string; asOf: ISODateTime | null };
  /** Public provenance for the catalogue listing, never private account data. */
  listing?: {
    listedAt: ISODateTime | null;
    listedBy: {
      displayName: string;
      username: string | null;
      slug: string;
    } | null;
  };
  custody?: { status: string; asOf: ISODateTime } | null;
  insurance?: { status: string; expiresAt: ISODateTime } | null;
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
  marketLifecycle?: MarketLifecycleProjection;
  initialOffering?: InitialOfferingProjection;
  preSale?: PreSaleProjection;
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
    /** Current Slice sell-side availability, separate from external observations. */
    activeListingsCount?: number;
    availableListingUnits?: string;
    hasTradingHistory?: boolean;
    /** Source-labelled external observations. Never a Slice ownership offer. */
    reference?: {
      currentListing?: ExternalMarketObservation;
      recentCompletedSale?: ExternalMarketObservation;
      movement24hBps?: number | null;
      movement7dBps?: number | null;
      movement30dBps?: number | null;
      movement90dBps?: number | null;
      movement1yBps?: number | null;
      lastRefreshedAt?: ISODateTime | null;
      historyStartedAt?: ISODateTime | null;
      freshness?: "FRESH" | "AGING" | "STALE" | "UNAVAILABLE" | string;
    };
    /** A staff/provider link can exist before the first successful market check. */
    referenceLink?: {
      provider: string;
      externalReference: string;
      url: string | null;
      status: string;
      lastCheckedAt: ISODateTime | null;
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
