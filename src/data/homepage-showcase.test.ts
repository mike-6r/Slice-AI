import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  HOMEPAGE_TRENDING_ASSETS,
  showcaseDestination,
} from "./homepage-showcase";

describe("homepage showcase routing", () => {
  it("uses the canonical published record when a showcase card is explicitly mapped", () => {
    expect(
      HOMEPAGE_TRENDING_ASSETS.every((asset) => showcaseDestination(asset).kind === "asset"),
    ).toBe(true);
    expect(showcaseDestination(HOMEPAGE_FEATURED_ASSET)).toEqual({
      kind: "marketplace",
      to: "/marketplace",
    });
  });

  it("uses a real asset detail route only when an explicit published identifier is mapped", () => {
    const mapped = {
      ...HOMEPAGE_FEATURED_ASSET,
      realAssetId: "published-charizard",
      staticExample: false,
    };
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
      referenceValue: "$343,098",
      totalShares: "195 shares",
      totalSharesCount: 195,
      availableShares: "62 shares",
      sharePrice: "£10.00",
      exampleShares: "25 shares",
      exampleInvestment: "£250",
      exampleOwnership: "12.82%",
    });
  });

  it("uses the current PriceCharting PSA 10 guide for the featured Charizard", () => {
    expect(HOMEPAGE_FEATURED_ASSET.displayPrice).toBe("$343,098");
  });
});
