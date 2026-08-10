import type { MarketplaceAsset } from "@/components/marketplace/market-api-presentation";

export type MarketView = "grid" | "compact" | "detailed";
export type MarketSort = "trending" | "price-high" | "price-low" | "biggest-movers" | "newest";
export type QuickFilterId = "trending" | "biggest-movers" | "new-listings";

export type MarketFilters = { category: string; grade: string };
export const EMPTY_MARKET_FILTERS: MarketFilters = { category: "All Assets", grade: "Any grade" };

export const MARKET_SORTS: Array<{ value: MarketSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "price-high", label: "Estimated value: high to low" },
  { value: "price-low", label: "Estimated value: low to high" },
  { value: "biggest-movers", label: "Biggest movers" },
  { value: "newest", label: "Newest" },
];

export const categoryGroup = (category: string) => category;
export const marketStatus = (asset: MarketplaceAsset) => ({
  label:
    asset.dataStatus === "LIVE"
      ? "Live data"
      : asset.dataStatus === "DELAYED"
        ? "Delayed"
        : "Estimated",
  tone: asset.dataStatus === "LIVE" ? "green" : "blue",
});

export const sortMarketAssets = (assets: MarketplaceAsset[], sort: MarketSort) =>
  [...assets].sort((a, b) => {
    const valueA = a.estimatedMarketValueMinor ?? -1;
    const valueB = b.estimatedMarketValueMinor ?? -1;
    switch (sort) {
      case "price-high":
        return valueB - valueA;
      case "price-low":
        return valueA - valueB;
      case "biggest-movers":
        return (b.change24hBps ?? -Infinity) - (a.change24hBps ?? -Infinity);
      case "newest":
        return b.slug.localeCompare(a.slug);
      default:
        return a.title.localeCompare(b.title);
    }
  });
