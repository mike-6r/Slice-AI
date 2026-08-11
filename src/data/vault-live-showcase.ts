import type { MarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import type { VaultLiveAsset, VaultLiveProjection } from "@/data/repositories";

/**
 * ILLUSTRATIVE PUBLIC VAULT LIVE SHOWCASE DATA.
 *
 * This is deliberately client-side educational presentation data. It is not
 * live market data, a public custody record, or a private operational record.
 * The resolver below replaces each illustrative section with its authoritative
 * public API equivalent as soon as that equivalent is available.
 */
export type VaultLivePresentedAsset = {
  asset: MarketplaceAsset;
  source: "real" | "showcase";
  showcaseKey?: string;
};

export type VaultLivePresentedEvent = {
  id: string;
  publicLabel: string;
  publicSummary: string;
  occurredAt?: string;
  asset: VaultLivePresentedAsset;
  source: "real" | "showcase";
};

export type VaultLivePresentedActivity = {
  asset: VaultLivePresentedAsset;
  units: string;
  source: "real" | "showcase";
};

const showcaseAsset = (
  showcaseKey: string,
  input: Omit<MarketplaceAsset, "id" | "dataStatus">,
): VaultLivePresentedAsset => ({
  asset: {
    ...input,
    id: `showcase:${showcaseKey}`,
    dataStatus: "DEMO",
  },
  source: "showcase",
  showcaseKey,
});

const charizard = showcaseAsset("charizard-1999", {
  slug: "slice-demo-charizard",
  title: "1999 Charizard",
  category: "Pokémon",
  setName: "Base Set · Holo",
  grade: "PSA 10",
  estimatedMarketValueMinor: 2_458_000,
  availabilityBps: 2460,
  ownersCount: 1250,
});
const jordan = showcaseAsset("jordan-rookie", {
  slug: "slice-demo-jordan",
  title: "1986 Fleer Michael Jordan Rookie",
  category: "Sports",
  setName: "Fleer · Rookie",
  grade: "PSA 9",
  estimatedMarketValueMinor: 1_890_000,
  availabilityBps: 3120,
});
const pikachu = showcaseAsset("pikachu-illustrator", {
  slug: "slice-demo-pikachu",
  title: "Pikachu Illustrator",
  category: "Pokémon",
  setName: "Illustrator",
  grade: "PSA 9",
  estimatedMarketValueMinor: 1_240_000,
  availabilityBps: 1870,
});
const darkMagician = showcaseAsset("dark-magician", {
  slug: "slice-demo-dark-magician",
  title: "Dark Magician",
  category: "Yu-Gi-Oh!",
  setName: "1st Edition",
  grade: "PSA 8",
  estimatedMarketValueMinor: 320_000,
  availabilityBps: 4500,
});
const blastoise = showcaseAsset("blastoise", {
  slug: "slice-demo-blastoise",
  title: "1999 Blastoise",
  category: "Pokémon",
  setName: "Base Set",
  grade: "PSA 9",
  estimatedMarketValueMinor: 465_000,
  availabilityBps: 2810,
});

export const vaultLiveShowcase = {
  statusLabel: "Illustrative Vault Live",
  featuredAsset: charizard,
  metrics: {
    publicVaultEvents: "8 examples",
    newlyPublished: "6 examples",
    valuationsUpdated: "4 examples",
    marketActivity: "12 examples",
  },
  recentlyReviewed: [charizard, jordan, pikachu, darkMagician, blastoise],
  readiness: [charizard, jordan, pikachu],
  publishedAssets: [charizard, jordan, darkMagician, blastoise],
  recentEvents: [
    {
      id: "showcase:reviewed-charizard",
      publicLabel: "Asset reviewed",
      publicSummary: "Illustrative public review milestone.",
      asset: charizard,
      source: "showcase" as const,
    },
    {
      id: "showcase:valued-jordan",
      publicLabel: "Valuation updated",
      publicSummary: "Illustrative public reference valuation.",
      asset: jordan,
      source: "showcase" as const,
    },
    {
      id: "showcase:readiness-pikachu",
      publicLabel: "Entering the vault",
      publicSummary: "Illustrative readiness milestone.",
      asset: pikachu,
      source: "showcase" as const,
    },
    {
      id: "showcase:market-dark-magician",
      publicLabel: "Market live",
      publicSummary: "Illustrative marketplace availability.",
      asset: darkMagician,
      source: "showcase" as const,
    },
  ],
  marketActivity: [
    { asset: charizard, units: "12 shares", source: "showcase" as const },
    { asset: jordan, units: "8 shares", source: "showcase" as const },
    { asset: darkMagician, units: "6 shares", source: "showcase" as const },
  ],
  categories: [
    { slug: "pokemon", name: "Pokémon" },
    { slug: "sports", name: "Sports" },
    { slug: "yu-gi-oh", name: "Yu-Gi-Oh!" },
    { slug: "mtg", name: "MTG" },
    { slug: "one-piece", name: "One Piece" },
  ],
  journey: [
    ["01", "Submitted", "A collector submits an asset and supporting evidence."],
    ["02", "Reviewed", "Public-ready metadata and evidence move through review."],
    ["03", "Valued", "A supported public reference valuation is established."],
    ["04", "Readiness", "The collectible moves through marketplace-readiness steps."],
    ["05", "Market live", "Eligible ownership shares become available on Slice."],
  ] as const,
} as const;

function toMarketplaceVaultAsset(asset: VaultLiveAsset): MarketplaceAsset {
  return {
    id: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    category: asset.category.name,
    setName: asset.collectibleSet?.name,
    grade: asset.grading ? `${asset.grading.companyCode} ${asset.grading.label}` : undefined,
    estimatedMarketValueMinor: asset.market ? Number(asset.market.estimatedValueMinor) : undefined,
    source: asset.market?.dataStatus,
    asOf: asset.market?.asOf,
    confidence: asset.market?.confidence ?? undefined,
    availabilityBps: asset.market?.availableBps ?? undefined,
    ownersCount: asset.market?.ownersCount ?? undefined,
    dataStatus: asset.market?.dataStatus === "LIVE" ? "LIVE" : "DEMO",
    change24hBps: asset.market?.change24hBps ?? undefined,
  };
}

const realAsset = (asset: VaultLiveAsset): VaultLivePresentedAsset => ({
  asset: toMarketplaceVaultAsset(asset),
  source: "real",
});

export type VaultLiveContent = {
  mode: "public" | "showcase";
  featuredAsset: VaultLivePresentedAsset;
  metrics: Record<keyof VaultLiveProjection["metrics"], string | number>;
  recentEvents: VaultLivePresentedEvent[];
  recentlyReviewed: VaultLivePresentedAsset[];
  readiness: VaultLivePresentedAsset[];
  publishedAssets: VaultLivePresentedAsset[];
  marketActivity: VaultLivePresentedActivity[];
  categories: Array<{ slug: string; name: string }>;
};

/** Resolves each public section independently: real data always wins. */
export function resolveVaultLiveContent(realData: VaultLiveProjection): VaultLiveContent {
  const hasRealPublicContent = Boolean(
    realData.featuredAsset ||
    realData.recentEvents.length ||
    realData.recentlyReviewed.length ||
    realData.readiness.length ||
    realData.publishedAssets.length ||
    realData.marketActivity.length,
  );

  const useRealMetrics = hasRealPublicContent;
  return {
    mode: hasRealPublicContent ? "public" : "showcase",
    featuredAsset: realData.featuredAsset
      ? realAsset(realData.featuredAsset)
      : vaultLiveShowcase.featuredAsset,
    metrics: useRealMetrics ? realData.metrics : vaultLiveShowcase.metrics,
    recentEvents: realData.recentEvents.length
      ? realData.recentEvents.map((event) => ({
          ...event,
          asset: realAsset(event.asset),
          source: "real" as const,
        }))
      : [...vaultLiveShowcase.recentEvents],
    recentlyReviewed: realData.recentlyReviewed.length
      ? realData.recentlyReviewed.map(realAsset)
      : [...vaultLiveShowcase.recentlyReviewed],
    readiness: realData.readiness.length
      ? realData.readiness.map(realAsset)
      : [...vaultLiveShowcase.readiness],
    publishedAssets: realData.publishedAssets.length
      ? realData.publishedAssets.map(realAsset)
      : [...vaultLiveShowcase.publishedAssets],
    marketActivity: realData.marketActivity.length
      ? realData.marketActivity.map((item) => ({
          asset: realAsset(item.asset),
          units: `${item.units} shares`,
          source: "real" as const,
        }))
      : [...vaultLiveShowcase.marketActivity],
    categories: realData.categories.length
      ? realData.categories
      : [...vaultLiveShowcase.categories],
  };
}
