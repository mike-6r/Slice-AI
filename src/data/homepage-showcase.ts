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
  displayMovement: string;
  displayAvailability: string;
  movementTone: "positive" | "negative";
  realAssetId?: string;
  fallbackRoute: "/marketplace";
}>;

export type ShowcaseDestination =
  Readonly<{ kind: "asset"; id: string }> | Readonly<{ kind: "marketplace"; to: "/marketplace" }>;

/**
 * Marketing values below are intentionally illustrative. Product pages remain
 * API-authoritative. A realAssetId may only be added after a published asset is
 * confirmed in the target environment; absent mappings always fail safely to
 * the real marketplace rather than manufacturing an asset route.
 */
export const HOMEPAGE_FEATURED_ASSET: HomepageShowcaseAsset = {
  showcaseKey: "featured-charizard",
  symbol: "CHZ.IO",
  title: "1999 Charizard",
  category: "Pokemon TCG",
  grade: "Base Set · Holo",
  image: charizardSlabImage,
  displayPrice: "£24,580",
  displayMovement: "+12.43%",
  displayAvailability: "24.6% available",
  movementTone: "positive",
  fallbackRoute: "/marketplace",
};

export const HOMEPAGE_TRENDING_ASSETS: readonly HomepageShowcaseAsset[] = [
  {
    showcaseKey: "charizard-base-set",
    symbol: "CHZ.IO",
    title: "1999 Pokémon Base Set Charizard",
    category: "Pokémon TCG",
    grade: "PSA 10 · Gem Mint",
    image: charizardImage,
    displayPrice: "£598",
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
    grade: "PSA 10 · Gem Mint",
    image: onePieceImage,
    displayPrice: "£145",
    displayMovement: "+9.8%",
    displayAvailability: "50%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "blastoise-base-set",
    symbol: "BST.PK",
    title: "1999 Pokémon Base Set Blastoise",
    category: "Pokémon TCG",
    grade: "PSA 9 · Mint",
    image: boosterImage,
    displayPrice: "£465",
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
    grade: "PSA 8 · NM-MT",
    image: mtgImage,
    displayPrice: "£68",
    displayMovement: "+5.22%",
    displayAvailability: "45%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "pikachu-illustrator",
    symbol: "PIK.IL",
    title: "Pikachu Illustrator Reprint",
    category: "Pokémon TCG",
    grade: "PSA 9 · Mint",
    image: pikachuImage,
    displayPrice: "£520",
    displayMovement: "+6.31%",
    displayAvailability: "18.7%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
  {
    showcaseKey: "jordan-rookie",
    symbol: "JRD.RC",
    title: "1986 Fleer Michael Jordan Rookie",
    category: "Sports · Basketball",
    grade: "PSA 8 · NM-MT",
    image: jordanImage,
    displayPrice: "£682",
    displayMovement: "+4.2%",
    displayAvailability: "31.2%",
    movementTone: "positive",
    fallbackRoute: "/marketplace",
  },
] as const;

export const HOMEPAGE_MARKET_METRICS = [
  { label: "Total market value", value: "£574.2M", detail: "+5.81% (24H)", tone: "positive" },
  { label: "24H volume", value: "£1.24M", detail: "-8.21%", tone: "negative" },
  { label: "Active assets", value: "12,842", detail: "+328", tone: "positive" },
  { label: "Verified assets", value: "8,736", detail: "98% of market", tone: "positive" },
  { label: "Active collectors", value: "4,217", detail: "+156", tone: "positive" },
] as const;

export const HOMEPAGE_MARKET_TICKER = [
  { symbol: "CHK 10", value: "£598", movement: "+12.4%", tone: "positive" },
  { symbol: "JRD.RC", value: "£682", movement: "+4.2%", tone: "positive" },
  { symbol: "LOT.MTG", value: "£745", movement: "+2.8%", tone: "positive" },
  { symbol: "LUF.OP", value: "£412", movement: "-1.2%", tone: "negative" },
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
  { label: "Pokémon TCG", value: "42.7%", tone: "mint" },
  { label: "Sports cards", value: "28.3%", tone: "blue" },
  { label: "Yu-Gi-Oh!", value: "14.9%", tone: "amber" },
  { label: "Other", value: "14.1%", tone: "violet" },
] as const;

export function showcaseDestination(asset: HomepageShowcaseAsset): ShowcaseDestination {
  return asset.realAssetId
    ? { kind: "asset", id: asset.realAssetId }
    : { kind: "marketplace", to: asset.fallbackRoute };
}
