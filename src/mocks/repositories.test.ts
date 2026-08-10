import { describe, expect, it } from "vitest";
import { mockRepositories } from "./repositories";

describe("mock repositories", () => {
  it("searches assets by title", async () => {
    const assets = await mockRepositories.assets.searchAssets("charizard");
    expect(assets[0]?.details.title.toLowerCase()).toContain("charizard");
  });
  it("returns a descending confidence trending list", async () => {
    const assets = await mockRepositories.assets.getTrendingAssets();
    expect(
      assets.every(
        (asset, index) =>
          index === 0 || (assets[index - 1]?.confidence ?? 0) >= (asset.confidence ?? 0),
      ),
    ).toBe(true);
  });
  it("returns a consistent asset id for a price history", async () => {
    const asset = (await mockRepositories.assets.getFeaturedAssets())[0];
    expect(asset).toBeDefined();
    const history = await mockRepositories.market.getPriceHistory(asset!.id, "30D");
    expect(history.length).toBeGreaterThan(0);
  });
});
