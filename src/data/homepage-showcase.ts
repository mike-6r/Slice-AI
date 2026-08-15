import bedardImage from "@/assets/connor-bedard-young-guns-psa10.png";
import charizardBaseSetImage from "@/assets/charizard-slab-transparent.png";
import charizardImage from "@/assets/charizard-ex-obsidian-flames-psa10.jpg";
import stroudImage from "@/assets/cj-stroud-purple-pulsar-psa10.jpg";
import pikachuImage from "@/assets/pikachu-grey-felt-hat-psa10.jpg";
import umbreonImage from "@/assets/umbreon-vmax-psa10.jpg";
import wembanyamaImage from "@/assets/victor-wembanyama-prizm-bgs95.jpg";

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
  realAssetId: string;
  fallbackRoute: "/marketplace";
  staticExample?: boolean;
}>;

export type ShowcaseDestination =
  Readonly<{ kind: "asset"; id: string }> | Readonly<{ kind: "marketplace"; to: "/marketplace" }>;

/**
 * ILLUSTRATIVE SLICE OWNERSHIP EXAMPLE. The external listing/sale references
 * on each linked asset page remain separate from these terms.
 */
export const HOMEPAGE_OWNERSHIP_EXAMPLE = {
  referenceValue: "\u00a31,950",
  collectibleValue: "£4,277",
  totalShares: "195 shares",
  totalSharesCount: 195,
  availableShares: "62 shares",
  sharePrice: "£10.00",
  exampleShares: "25 shares",
  exampleInvestment: "£250",
  exampleOwnership: "12.82%",
  availableOwnership: "31.8%",
  minimumPurchase: "Illustrative · 1 share · £10",
} as const;

const catalogue: readonly HomepageShowcaseAsset[] = [
  {
    showcaseKey: "umbreon-vmax-moonbreon",
    symbol: "UMB.215",
    title: "2021 Umbreon VMAX Alternate Art",
    category: "Pokémon TCG",
    grade: "PSA 10 · Gem Mint",
    image: umbreonImage,
    displayPrice: "£1,950",
    displaySharePrice: "Illustrative from £10 / share",
    displayMovement: "Reference only",
    displayAvailability: "32.0%",
    movementTone: "positive",
    realAssetId: "slice-demo-umbreon-vmax-moonbreon",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "pikachu-grey-felt-hat",
    symbol: "PIK.085",
    title: "2023 Pikachu with Grey Felt Hat",
    category: "Pokémon TCG",
    grade: "PSA 10 · Gem Mint",
    image: pikachuImage,
    displayPrice: "US$470",
    displaySharePrice: "Illustrative from £10 / share",
    displayMovement: "Reference only",
    displayAvailability: "41.0%",
    movementTone: "positive",
    realAssetId: "slice-demo-pikachu-grey-felt-hat",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "charizard-ex-obsidian-flames",
    symbol: "CHZ.223",
    title: "2023 Charizard ex Special Illustration Rare",
    category: "Pokémon TCG",
    grade: "PSA 10 · Gem Mint",
    image: charizardImage,
    displayPrice: "US$399.99",
    displaySharePrice: "Illustrative from £10 / share",
    displayMovement: "Reference only",
    displayAvailability: "52.0%",
    movementTone: "positive",
    realAssetId: "slice-demo-charizard-ex-obsidian-flames",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "victor-wembanyama-prizm-rookie",
    symbol: "WEM.136",
    title: "2023-24 Prizm Victor Wembanyama Rookie",
    category: "Sports Cards",
    grade: "BGS 9.5 · Mint",
    image: wembanyamaImage,
    displayPrice: "US$215",
    displaySharePrice: "Illustrative from £10 / share",
    displayMovement: "Reference only",
    displayAvailability: "60.0%",
    movementTone: "positive",
    realAssetId: "slice-demo-victor-wembanyama-prizm-rookie",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "connor-bedard-young-guns",
    symbol: "BED.451",
    title: "2023-24 Connor Bedard Young Guns Rookie",
    category: "Sports Cards",
    grade: "PSA 10 · Gem Mint",
    image: bedardImage,
    displayPrice: "CA$750",
    displaySharePrice: "Illustrative from £10 / share",
    displayMovement: "Reference only",
    displayAvailability: "47.0%",
    movementTone: "positive",
    realAssetId: "slice-demo-connor-bedard-young-guns",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "cj-stroud-purple-pulsar-rookie",
    symbol: "STR.339",
    title: "2023 Prizm C.J. Stroud Purple Pulsar Rookie",
    category: "Sports Cards",
    grade: "PSA 10 · Gem Mint",
    image: stroudImage,
    displayPrice: "US$550",
    displaySharePrice: "Illustrative from £10 / share",
    displayMovement: "Reference only",
    displayAvailability: "38.0%",
    movementTone: "positive",
    realAssetId: "slice-demo-cj-stroud-purple-pulsar-rookie",
    fallbackRoute: "/marketplace",
  },
] as const;

/**
 * Editorial homepage hero only. This is a static educational reference and
 * intentionally has no published Slice asset id or live market destination.
 */
export const HOMEPAGE_FEATURED_ASSET: HomepageShowcaseAsset = {
  ...catalogue[0],
  showcaseKey: "charizard-base-set-1st-edition",
  symbol: "CHZ.004",
  title: "1999 Base Set 1st Edition Charizard",
  grade: "PSA 10 · Gem Mint",
  image: charizardBaseSetImage,
  displayPrice: "Reference only",
  displaySharePrice: "Illustrative ownership only",
  displayMovement: "Static example",
  displayAvailability: "0%",
  realAssetId: "slice-demo-charizard-base-set-1st-edition",
  staticExample: true,
};
export const HOMEPAGE_TRENDING_ASSETS = catalogue;

export const HOMEPAGE_MARKET_METRICS = [
  {
    label: "Reference sale",
    value: "£1,950",
    detail: "External listing observation",
    tone: "positive",
  },
  {
    label: "Share price",
    value: "£10.00",
    detail: "Illustrative ownership unit",
    tone: "positive",
  },
  {
    label: "Available",
    value: "32.0%",
    detail: "Illustrative share availability",
    tone: "positive",
  },
  { label: "Minimum", value: "£10", detail: "Illustrative 1-share minimum", tone: "positive" },
  {
    label: "Reference media",
    value: "6 cards",
    detail: "External listing images",
    tone: "positive",
  },
] as const;

export const HOMEPAGE_MARKET_TICKER = catalogue.map((asset) => ({
  symbol: asset.symbol,
  value: asset.displayPrice,
  movement: "Reference",
  tone: "positive" as const,
}));

export const HOMEPAGE_MARKET_MOVERS = {
  "Modern Chase": [catalogue[0], catalogue[2], catalogue[5]],
  "Most Watched": [catalogue[1], catalogue[3], catalogue[4]],
  "New Listings": [catalogue[4], catalogue[5], catalogue[2]],
} as const;

export const HOMEPAGE_ALLOCATION = [
  { label: "Pokémon", value: "50%", tone: "mint" },
  { label: "Sports", value: "50%", tone: "blue" },
] as const;

export const HOMEPAGE_PORTFOLIO_EXAMPLE = [
  { label: "Umbreon VMAX", shares: "25 shares", ownership: "5.8%" },
  { label: "Wembanyama Rookie", shares: "10 shares", ownership: "1.0%" },
  { label: "Bedard Young Guns", shares: "15 shares", ownership: "1.5%" },
] as const;

export function showcaseDestination(asset: HomepageShowcaseAsset): ShowcaseDestination {
  return asset.realAssetId && !asset.staticExample
    ? { kind: "asset", id: asset.realAssetId }
    : { kind: "marketplace", to: asset.fallbackRoute };
}
