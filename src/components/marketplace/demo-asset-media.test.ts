import { describe, expect, it } from "vitest";
import { assetShowcaseMedia } from "./demo-asset-media";

describe("staging marketplace media", () => {
  it("maps only exact catalogue identities to their approved media", () => {
    expect(assetShowcaseMedia("slice-demo-charizard-ex-obsidian-flames")?.key).toBe(
      "charizard-psa10",
    );
    expect(assetShowcaseMedia("slice-demo-pikachu-grey-felt-hat")?.key).toBe("pikachu-psa10");
    expect(assetShowcaseMedia("slice-demo-umbreon-vmax-moonbreon")?.key).toBe("umbreon-psa10");
    expect(assetShowcaseMedia("slice-demo-victor-wembanyama-prizm-rookie")?.key).toBe(
      "wembanyama-bgs95",
    );
    expect(assetShowcaseMedia("slice-demo-connor-bedard-young-guns")?.key).toBe("bedard-psa10");
    expect(assetShowcaseMedia("slice-demo-cj-stroud-purple-pulsar-rookie")?.key).toBe(
      "stroud-psa10",
    );
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
