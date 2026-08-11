import { describe, expect, it } from "vitest";
import { assetShowcaseMedia } from "./demo-asset-media";

describe("staging marketplace media", () => {
  it("maps each published staging catalogue slug to a bundled project asset", () => {
    for (const slug of [
      "slice-demo-charizard",
      "slice-demo-pikachu",
      "slice-demo-blastoise",
      "slice-demo-jordan",
      "slice-demo-mantle",
    ]) {
      const media = assetShowcaseMedia(slug);
      expect(media?.src).toMatch(/\.(?:jpg|jpeg|png)$/i);
      expect(media?.alt).toBeTruthy();
    }
  });

  it("does not apply a misleading showcase image to unknown public assets", () => {
    expect(assetShowcaseMedia("an-unrelated-live-asset")).toBeUndefined();
  });
});
