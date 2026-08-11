import { describe, expect, it } from "vitest";
import { assetShowcaseMedia } from "./demo-asset-media";

describe("staging marketplace media", () => {
  it("maps only exact catalogue identities to their approved media", () => {
    expect(assetShowcaseMedia("slice-demo-charizard")?.key).toBe("charizard-slab");
    expect(assetShowcaseMedia("slice-demo-pikachu")?.key).toBe("pikachu-illustrator");
    expect(assetShowcaseMedia("slice-demo-jordan")?.key).toBe("jordan-rookie");
    expect(assetShowcaseMedia("slice-demo-black-lotus")?.key).toBe("black-lotus");
    expect(assetShowcaseMedia("slice-demo-one-piece")?.key).toBe("one-piece");
  });

  it.each([
    "slice-demo-blastoise",
    "slice-demo-mantle",
    "slice-demo-dark-magician",
    "slice-demo-luka",
    "slice-demo-rayquaza",
    "slice-demo-specialist-dark-magician",
  ])("never cross-wires %s to another collectible's photograph", (slug) => {
    expect(assetShowcaseMedia(slug)).toBeUndefined();
  });

  it("does not apply a misleading showcase image to unknown public assets", () => {
    expect(assetShowcaseMedia("an-unrelated-live-asset")).toBeUndefined();
  });
});
