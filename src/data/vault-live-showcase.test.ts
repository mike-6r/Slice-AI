import { describe, expect, it } from "vitest";
import type { VaultLiveAsset, VaultLiveProjection } from "./repositories";
import { resolveVaultLiveContent, vaultLiveShowcase } from "./vault-live-showcase";

const realAsset: VaultLiveAsset = {
  publicId: "public-charizard",
  slug: "real-charizard",
  title: "Real Charizard",
  shortName: null,
  year: 1999,
  category: { slug: "pokemon", name: "Pokémon" },
  collectibleSet: { slug: "base-set", name: "Base Set" },
  grading: { companyCode: "PSA", grade: "10", label: "10" },
  market: {
    estimatedValueMinor: "2458000",
    currency: "GBP",
    change24hBps: 1243,
    availableBps: 2460,
    ownersCount: 1250,
    confidence: 92,
    asOf: "2026-08-11T00:00:00.000Z",
    dataStatus: "LIVE",
  },
};

const emptyProjection: VaultLiveProjection = {
  dataStatus: "LIVE_PUBLIC_PROJECTION",
  windowStartedAt: "2026-08-10T00:00:00.000Z",
  metrics: { publicVaultEvents: 0, newlyPublished: 0, valuationsUpdated: 0, marketActivity: "0" },
  featuredAsset: null,
  recentEvents: [],
  recentlyReviewed: [],
  readiness: [],
  publishedAssets: [],
  marketActivity: [],
  categories: [],
  eventAssetCount: 0,
};

describe("Vault Live educational content", () => {
  it("contains only the customer-safe lifecycle explainer", () => {
    expect(vaultLiveShowcase.journey.map(([, title]) => title)).toEqual([
      "Submitted",
      "Reviewed",
      "Valued",
      "Readiness",
      "Market live",
    ]);
  });

  it("uses a clearly illustrative showcase when a valid public projection is empty", () => {
    const content = resolveVaultLiveContent(emptyProjection);

    expect(content.mode).toBe("showcase");
    expect(content.featuredAsset.source).toBe("showcase");
    expect(content.featuredAsset.asset.title).toBe("1999 Base Set 1st Edition Charizard");
    expect(content.recentlyReviewed).toHaveLength(5);
    expect(content.metrics.publicVaultEvents).toBe("8 examples");
    expect(content.marketActivity.every((item) => item.units.includes("shares"))).toBe(true);
  });

  it("uses real public records over every illustrative fallback section", () => {
    const content = resolveVaultLiveContent({
      ...emptyProjection,
      metrics: {
        publicVaultEvents: 1,
        newlyPublished: 1,
        valuationsUpdated: 1,
        marketActivity: "12",
      },
      featuredAsset: realAsset,
      recentlyReviewed: [realAsset],
      readiness: [realAsset],
      publishedAssets: [realAsset],
      recentEvents: [
        {
          id: "event-1",
          publicLabel: "Asset reviewed",
          occurredAt: "2026-08-11T00:00:00.000Z",
          publicSummary: "Public review milestone.",
          asset: realAsset,
        },
      ],
      marketActivity: [
        {
          asset: realAsset,
          units: "12",
          latestPriceMinor: "1000",
          occurredAt: "2026-08-11T00:00:00.000Z",
        },
      ],
      categories: [{ slug: "pokemon", name: "Pokémon" }],
    });

    expect(content.mode).toBe("public");
    expect(content.featuredAsset).toMatchObject({
      source: "real",
      asset: { slug: "real-charizard" },
    });
    expect(content.recentEvents[0]).toMatchObject({ source: "real", asset: { source: "real" } });
    expect(content.metrics.marketActivity).toBe("12");
  });
});
