import type { AssetId, PreSaleProjection } from "./asset";
import type { Money, Percentage } from "./common";
import type { UserId } from "./user";
export type CollectorCategory = "tcg" | "sports" | "comics" | "memorabilia" | "mixed";
export interface CollectorPerformance {
  portfolioValue: Money;
  annualReturn: Percentage;
  monthlyReturn: Percentage;
}
export interface CollectorHolding {
  assetId: AssetId;
  value: Money;
  allocation: Percentage;
}

/** A public catalogue listing, not a public ownership holding. */
export interface CollectorPublishedListing {
  assetId: AssetId;
  slug: string;
  title: string;
  category: string;
  year?: number | null;
  cardNumber?: string | null;
  variant?: string | null;
  grade?: string | null;
  listedAt?: string | null;
  media?: Array<{ id: string; slot: string; url: string; alt: string }>;
  estimatedMarketValue?: Money;
  asOf?: string;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
  preSale?: PreSaleProjection | null;
}
export interface CollectorPublicActivity {
  id: string;
  type: "PRE_SALE" | "MARKET_LIVE";
  title: string;
  detail: string;
  occurredAt: string;
  assetSlug: string;
}
export interface CollectorSpecialtyOption {
  name: string;
  count?: number;
}
export interface CollectorProfile {
  userId: UserId;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  focus: string;
  specialties?: string[];
  categories?: string[];
  category: CollectorCategory;
  publicSince?: string;
  isFeatured?: boolean;
  featurePriority?: number;
  featuredCaption?: string | null;
  latestPublicListingAt?: string | null;
  followers?: number;
  performance?: CollectorPerformance;
  publishedListingCount?: number;
  liveListingCount?: number;
  preSaleListingCount?: number;
  publishedListings?: CollectorPublishedListing[];
  featuredPreviewAssets?: CollectorPublishedListing[];
  activity?: CollectorPublicActivity[];
  assetPagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  /** Public holdings are unavailable until authoritative ownership exists. */
  holdings?: CollectorHolding[];
}

export type CollectorDirectoryStatus = "all" | "pre-sale" | "market-live" | "both";
export type CollectorDirectorySort = "featured" | "assets" | "recent" | "name";

export interface CollectorDirectoryPage {
  items: CollectorProfile[];
  featured: CollectorProfile[];
  specialties: CollectorSpecialtyOption[];
  stats: {
    eligibleCollectorCount: number;
    publishedAssetCount: number;
    featuredCollectorCount: number;
  };
  nextCursor: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
