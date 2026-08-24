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

  it("keeps the illustrative Slice maths internally consistent", () => {
    expect(HOMEPAGE_OWNERSHIP_EXAMPLE).toMatchObject({
      externalReferenceValue: "$343,098.00 USD",
      illustrativeValuation: "£10,000.00",
      totalSlices: "1,000 Slices",
      totalSlicesCount: 1000,
      slicePrice: "£10.00",
      exampleSlices: "25 Slices",
      exampleInvestment: "£250.00",
      exampleOwnership: "2.50%",
      exampleSellSlices: "5 Slices",
      exampleSellProceeds: "£50.00",
      remainingSlices: "20 Slices",
      remainingOwnership: "2.00%",
    });
  });

  it("keeps the PriceCharting PSA 10 guide in its source currency", () => {
    expect(HOMEPAGE_FEATURED_ASSET.displayPrice).toBe("$343,098.00 USD");
  });
});
