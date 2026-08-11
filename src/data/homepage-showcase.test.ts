import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  HOMEPAGE_TRENDING_ASSETS,
  showcaseDestination,
} from "./homepage-showcase";

describe("homepage showcase routing", () => {
  it("keeps every unmapped showcase card on the real marketplace fallback", () => {
    expect(
      [HOMEPAGE_FEATURED_ASSET, ...HOMEPAGE_TRENDING_ASSETS].every(
        (asset) => showcaseDestination(asset).kind === "marketplace",
      ),
    ).toBe(true);
  });

  it("uses a real asset detail route only when an explicit published identifier is mapped", () => {
    const mapped = { ...HOMEPAGE_FEATURED_ASSET, realAssetId: "published-charizard" };
    expect(showcaseDestination(mapped)).toEqual({ kind: "asset", id: "published-charizard" });
  });

  it("never omits a safe marketplace fallback", () => {
    expect(HOMEPAGE_TRENDING_ASSETS).toHaveLength(6);
    expect(HOMEPAGE_TRENDING_ASSETS.every((asset) => asset.fallbackRoute === "/marketplace")).toBe(
      true,
    );
  });

  it("keeps the illustrative share maths internally consistent", () => {
    expect(HOMEPAGE_OWNERSHIP_EXAMPLE).toMatchObject({
      collectibleValue: "£24,580",
      totalShares: "2,458 shares",
      availableShares: "604 shares",
      sharePrice: "£10.00",
      exampleShares: "25 shares",
      exampleInvestment: "£250",
      exampleOwnership: "1.02%",
    });
  });
});
