import type { MarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import {
  marketCategoryPresentation,
  marketplaceEditorialTag,
} from "@/components/marketplace/marketplace-presentation";

export type MarketView = "grid" | "compact" | "detailed";
export type MarketSort = "trending" | "price-high" | "price-low" | "biggest-movers" | "newest";
export type QuickFilterId =
  "trending" | "biggest-movers" | "new-listings" | "most-watched" | "editors-picks";

export type MarketFilters = {
  category: string;
  grade: string;
  priceRange: string;
  setEdition: string;
};
export const EMPTY_MARKET_FILTERS: MarketFilters = {
  category: "All Assets",
  grade: "Any grade",
  priceRange: "Any price",
  setEdition: "Any set / edition",
};

export const MARKET_SORTS: Array<{ value: MarketSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "price-high", label: "Estimated value: high to low" },
  { value: "price-low", label: "Estimated value: low to high" },
  { value: "biggest-movers", label: "Biggest movers" },
  { value: "newest", label: "Newest" },
];

export const categoryGroup = (category: string) => marketCategoryPresentation(category).slug;

const matchesPriceRange = (asset: MarketplaceAsset, range: string) => {
  if (range === "Any price") return true;
  const value = asset.estimatedMarketValueMinor;
  if (value === undefined) return false;
  if (range === "Under £5,000") return value < 500_000;
  if (range === "£5,000 – £15,000") return value >= 500_000 && value <= 1_500_000;
  if (range === "£15,000+") return value > 1_500_000;
  return true;
};

export function filterMarketAssets(
  assets: MarketplaceAsset[],
  filters: MarketFilters,
  query: string,
  quickFilter: QuickFilterId,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return assets.filter((asset) => {
    const category = marketCategoryPresentation(asset.category);
    const tag = marketplaceEditorialTag(asset);
    const matchesQuery =
      !normalizedQuery ||
      [asset.title, category.label, asset.setName, asset.grade]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesCategory = filters.category === "All Assets" || category.slug === filters.category;
    const matchesGrade = filters.grade === "Any grade" || asset.grade === filters.grade;
    const matchesSet =
      filters.setEdition === "Any set / edition" || asset.setName === filters.setEdition;
    const matchesQuickFilter =
      quickFilter === "most-watched"
        ? tag.label === "Most Watched"
        : quickFilter === "editors-picks"
          ? tag.label === "Editor's Pick"
          : quickFilter === "new-listings"
            ? tag.label === "New Listing"
            : true;
    return (
      matchesQuery &&
      matchesCategory &&
      matchesGrade &&
      matchesSet &&
      matchesPriceRange(asset, filters.priceRange) &&
      matchesQuickFilter
    );
  });
}

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
        return (
          Number(marketplaceEditorialTag(b).label === "Trending") -
            Number(marketplaceEditorialTag(a).label === "Trending") ||
          (b.change24hBps ?? -Infinity) - (a.change24hBps ?? -Infinity)
        );
    }
  });
