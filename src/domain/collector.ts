import type { AssetId } from "./asset";
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
  media?: Array<{ id: string; slot: string; url: string; alt: string }>;
  estimatedMarketValue?: Money;
  asOf?: string;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
}
export interface CollectorProfile {
  userId: UserId;
  handle: string;
  displayName: string;
  avatarUrl?: string | null;
  focus: string;
  category: CollectorCategory;
  publicSince?: string;
  isFeatured?: boolean;
  followers?: number;
  performance?: CollectorPerformance;
  publishedListingCount?: number;
  publishedListings?: CollectorPublishedListing[];
  /** Public holdings are unavailable until authoritative ownership exists. */
  holdings?: CollectorHolding[];
}

export type CollectorDirectorySort = "featured" | "recent" | "name";

export interface CollectorDirectoryPage {
  items: CollectorProfile[];
  featured: CollectorProfile[];
  specialties: string[];
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
