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
  estimatedMarketValue?: Money;
  asOf?: string;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
}
export interface CollectorProfile {
  userId: UserId;
  handle: string;
  displayName: string;
  focus: string;
  category: CollectorCategory;
  followers?: number;
  performance?: CollectorPerformance;
  publishedListingCount?: number;
  publishedListings?: CollectorPublishedListing[];
  /** Public holdings are unavailable until authoritative ownership exists. */
  holdings?: CollectorHolding[];
}
