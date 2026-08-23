import { describe, expect, it } from "vitest";
import type { MarketplaceAsset } from "./market-api-presentation";
import { filterMarketAssets, sortMarketAssets, type MarketFilters } from "./marketplace-helpers";
import { marketCategoryPresentation } from "./marketplace-presentation";

const filters: MarketFilters = {
  category: "All Assets",
  grade: "Any grade",
  priceRange: "Any price",
  setEdition: "Any set / edition",
};

const assets: MarketplaceAsset[] = [
  {
    id: "charizard",
    slug: "slice-demo-charizard",
    title: "1999 Pokémon Base Set Charizard",
    category: "poke-mon",
    setName: "Base Set",
    grade: "PSA 10 Gem Mint",
    estimatedMarketValueMinor: 2_458_000,
    availabilityBps: 2_461,
    change24hBps: 1_243,
    tradingHasExecutionHistory: true,
  },
  {
    id: "black-lotus",
    slug: "slice-demo-black-lotus",
    title: "1993 Magic: The Gathering Black Lotus",
    category: "magic-the-gathering",
    setName: "Unlimited",
    grade: "BGS 9 Mint",
    estimatedMarketValueMinor: 9_200_000,
    availabilityBps: 1_430,
    change24hBps: 522,
    tradingHasExecutionHistory: true,
  },
  {
    id: "one-piece",
    slug: "slice-demo-one-piece",
    title: "One Piece Romance Dawn",
    category: "one-piece",
    setName: "Romance Dawn",
    grade: "PSA 10 Gem Mint",
    estimatedMarketValueMinor: 425_000,
    availabilityBps: 3_500,
    change24hBps: 280,
  },
];

describe("marketplace presentation", () => {
  it("maps backend category aliases to customer-facing names", () => {
    expect(marketCategoryPresentation("poke-mon").label).toBe("Pokémon TCG");
    expect(marketCategoryPresentation("sports-cards").label).toBe("Sports Cards");
    expect(marketCategoryPresentation("magic-the-gathering").label).toBe("Magic: The Gathering");
  });

  it("filters real records by category, grade, price, set, and market activity", () => {
    expect(
      filterMarketAssets(
        assets,
        {
          category: "pokemon-tcg",
          grade: "PSA 10 Gem Mint",
          priceRange: "£15,000+",
          setEdition: "Base Set",
        },
        "charizard",
        "trending",
      ).map((asset) => asset.id),
    ).toEqual(["charizard"]);
    expect(filterMarketAssets(assets, filters, "", "biggest-movers")).toEqual([
      assets[0],
      assets[1],
    ]);
  });

  it("puts assets with real execution history first in trending order", () => {
    expect(sortMarketAssets([assets[1], assets[0]], "trending").map((asset) => asset.id)).toEqual([
      "charizard",
      "black-lotus",
    ]);
  });
});
