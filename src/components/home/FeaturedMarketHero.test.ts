import { describe, expect, it } from "vitest";

import type { Asset } from "@/domain";
import { selectFeaturedAsset } from "./featured-asset-selection";

const asset = (id: string): Asset => ({
  id: id as Asset["id"],
  symbol: id.toUpperCase(),
  details: { title: id, category: "pokemon" },
  status: "listed",
  media: [],
});

describe("selectFeaturedAsset", () => {
  it("keeps an editorially selected public asset first", () => {
    expect(selectFeaturedAsset(asset("editorial"), [asset("published")])?.id).toBe("editorial");
  });

  it("uses the deterministic first published asset when no editorial selection exists", () => {
    expect(selectFeaturedAsset(undefined, [asset("first"), asset("second")])?.id).toBe("first");
  });

  it("returns unavailable only when no eligible public asset is supplied", () => {
    expect(selectFeaturedAsset(null, [])).toBeUndefined();
  });
});
