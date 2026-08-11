import boosterImage from "@/assets/booster.jpg";
import charizardImage from "@/assets/charizard.jpg";
import charizardSlabImage from "@/assets/charizard-slab.jpg";
import jordanImage from "@/assets/jordan.jpg";
import mtgImage from "@/assets/mtg.jpg";
import onePieceImage from "@/assets/onepiece.jpg";
import pikachuImage from "@/assets/pikachu.jpg";

export type HomepageShowcaseAsset = Readonly<{
  showcaseKey: string;
  symbol: string;
  title: string;
  category: string;
  grade: string;
  image: string;
  displayPrice: string;
  displaySharePrice: string;
  displayMovement: string;
  displayAvailability: string;
  movementTone: "positive" | "negative";
  realAssetId?: string;
  fallbackRoute: "/marketplace";
}>;

export type ShowcaseDestination =
  Readonly<{ kind: "asset"; id: string }> | Readonly<{ kind: "marketplace"; to: "/marketplace" }>;

/**
 * ILLUSTRATIVE PUBLIC MARKETING DATA. NOT LIVE MARKET DATA. NOT CUSTOMER
 * FINANCIAL DATA.
 *
 * Product pages remain API-authoritative. A realAssetId may only be added
 * after a published asset is confirmed in the target environment; absent
 * mappings always fail safely to the real marketplace rather than
 * manufacturing an asset route.
 */
export const HOMEPAGE_OWNERSHIP_EXAMPLE = {
  collectibleValue: "\u00a324,580",
  totalUnits: "2,458 units",
  sharePrice: "\u00a310.00",
  exampleUnits: "25 units",
  exampleInvestment: "\u00a3250",
  exampleOwnership: "1.02%",
  availableOwnership: "24.6%",
  minimumPosition: "1 share",
} as const;

export const HOMEPAGE_FEATURED_ASSET: HomepageShowcaseAsset = {
  showcaseKey: "featured-charizard",
  symbol: "CHZ.IO",
  title: "1999 Charizard",
  category: "Pokemon TCG",
  grade: "Base Set \u00b7 Holo",
  image: charizardSlabImage,
  displayPrice: "\u00a324,580",
  displaySharePrice: "\u00a310.00 / share",
  displayMovement: "+12.43%",
  displayAvailability: "24.6%",
  movementTone: "positive",
  fallbackRoute: "/marketplace",
};

export const HOMEPAGE_TRENDING_ASSETS: readonly HomepageShowcaseAsset[] = [
  {
    showcaseKey: "charizard-base-set",
    symbol: "CHZ.IO",
    title: "1999 Pok\u00e9mon Base Set Charizard",
    category: "Pok\u00e9mon TCG",
    grade: "PSA 10 \u00b7 Gem Mint",
    image: charizardImage,
    displayPrice: "\u00a324,580",
    displaySharePrice: "From \u00a310 / share",
    displayMovement: "+12.43%",
    displayAvailability: "24.6%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "lorcana-ariel",
    symbol: "LOR.ARL",
    title: "Lorcana Ariel Enchanted",
    category: "Disney Lorcana",
    grade: "PSA 10 \u00b7 Gem Mint",
    image: onePieceImage,
    displayPrice: "\u00a36,850",
    displaySharePrice: "From \u00a310 / share",
    displayMovement: "+9.8%",
    displayAvailability: "50%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "blastoise-base-set",
    symbol: "BST.PK",
    title: "1999 Pok\u00e9mon Base Set Blastoise",
    category: "Pok\u00e9mon TCG",
    grade: "PSA 9 \u00b7 Mint",
    image: boosterImage,
    displayPrice: "\u00a34,650",
    displaySharePrice: "From \u00a310 / share",
    displayMovement: "+7.64%",
    displayAvailability: "28.1%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "dark-magician",
    symbol: "YG.DRK",
    title: "Yu-Gi-Oh! Dark Magician 1st Edition",
    category: "Yu-Gi-Oh!",
    grade: "PSA 8 \u00b7 NM-MT",
    image: mtgImage,
    displayPrice: "\u00a33,200",
    displaySharePrice: "From \u00a310 / share",
    displayMovement: "+5.22%",
    displayAvailability: "45%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "pikachu-illustrator",
    symbol: "PIK.IL",
    title: "Pikachu Illustrator Reprint",
    category: "Pok\u00e9mon TCG",
    grade: "PSA 9 \u00b7 Mint",
    image: pikachuImage,
    displayPrice: "\u00a312,400",
    displaySharePrice: "From \u00a310 / share",
    displayMovement: "+6.31%",
    displayAvailability: "18.7%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "jordan-rookie",
    symbol: "JRD.RC",
    title: "1986 Fleer Michael Jordan Rookie",
    category: "Sports \u00b7 Basketball",
    grade: "PSA 8 \u00b7 NM-MT",
    image: jordanImage,
    displayPrice: "\u00a318,900",
    displaySharePrice: "From \u00a310 / share",
    displayMovement: "+4.2%",
    displayAvailability: "31.2%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
] as const;

export const HOMEPAGE_MARKET_METRICS = [
  {
    label: "Card value",
    value: "\u00a324,580",
    detail: "Featured illustrative example",
    tone: "positive",
  },
  {
    label: "Share price",
    value: "\u00a310.00",
    detail: "Illustrative ownership unit",
    tone: "positive",
  },
  {
    label: "Available",
    value: "24.6%",
    detail: "Available ownership",
    tone: "positive",
  },
  {
    label: "Minimum",
    value: "\u00a310",
    detail: "Example entry point",
    tone: "positive",
  },
  {
    label: "Ownership",
    value: "From 1 share",
    detail: "Build your position",
    tone: "positive",
  },
] as const;

export const HOMEPAGE_MARKET_TICKER = [
  { symbol: "CHK 10", value: "\u00a324,580", movement: "+12.4%", tone: "positive" },
  { symbol: "JRD.RC", value: "\u00a318,900", movement: "+4.2%", tone: "positive" },
  { symbol: "LOT.MTG", value: "\u00a34,650", movement: "+2.8%", tone: "positive" },
  { symbol: "LUF.OP", value: "\u00a33,200", movement: "-1.2%", tone: "negative" },
] as const;

export const HOMEPAGE_MARKET_MOVERS = {
  "Top Gainers": [
    HOMEPAGE_TRENDING_ASSETS[0],
    HOMEPAGE_TRENDING_ASSETS[1],
    HOMEPAGE_TRENDING_ASSETS[2],
  ],
  "Top Losers": [
    {
      ...HOMEPAGE_TRENDING_ASSETS[3],
      displayMovement: "-1.82%",
      movementTone: "negative" as const,
    },
    {
      ...HOMEPAGE_TRENDING_ASSETS[5],
      displayMovement: "-0.74%",
      movementTone: "negative" as const,
    },
    {
      ...HOMEPAGE_TRENDING_ASSETS[4],
      displayMovement: "-0.31%",
      movementTone: "negative" as const,
    },
  ],
  "Most Active": [
    HOMEPAGE_TRENDING_ASSETS[4],
    HOMEPAGE_TRENDING_ASSETS[0],
    HOMEPAGE_TRENDING_ASSETS[5],
  ],
} as const;

export const HOMEPAGE_ALLOCATION = [
  { label: "Pok\u00e9mon", value: "42.7%", tone: "mint" },
  { label: "Sports", value: "28.3%", tone: "blue" },
  { label: "Yu-Gi-Oh!", value: "14.9%", tone: "amber" },
  { label: "Other", value: "14.1%", tone: "violet" },
] as const;

export const HOMEPAGE_PORTFOLIO_EXAMPLE = [
  { label: "Charizard", value: "2.4%" },
  { label: "Jordan Rookie", value: "1.8%" },
  { label: "Dark Magician", value: "4.2%" },
] as const;

export function showcaseDestination(asset: HomepageShowcaseAsset): ShowcaseDestination {
  return asset.realAssetId
    ? { kind: "asset", id: asset.realAssetId }
    : { kind: "marketplace", to: asset.fallbackRoute };
}
