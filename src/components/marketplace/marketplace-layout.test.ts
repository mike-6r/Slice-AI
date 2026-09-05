import { describe, expect, it } from "vitest";
import {
  effectiveCardFlipState,
  resolveMarketplaceMedia,
  resolveMarketplaceMediaSides,
} from "./marketplace-layout";

describe("marketplace layout projections", () => {
  it("prefers authoritative public front media over staged fallbacks", () => {
    expect(
      resolveMarketplaceMedia({
        slug: "slice-demo-umbreon-vmax-moonbreon",
        media: [{ url: "https://cdn.example/front.webp", alt: "Approved front image" }],
      }),
    ).toEqual({ src: "https://cdn.example/front.webp", alt: "Approved front image" });
  });

  it("uses an exact staged fallback only when public media is missing", () => {
    expect(
      resolveMarketplaceMedia({ slug: "slice-demo-umbreon-vmax-moonbreon", media: [] })?.src,
    ).toContain("umbreon-vmax-psa10");
    expect(resolveMarketplaceMedia({ slug: "unknown-live-asset", media: [] })).toBeUndefined();
  });

  it("uses authoritative media slots when alt text is not descriptive", () => {
    const sides = resolveMarketplaceMediaSides({
      slug: "live-card",
      media: [
        { url: "https://cdn.example/back.webp", alt: "Approved media", slot: "back" },
        { url: "https://cdn.example/front.webp", alt: "Approved media", slot: "front" },
        { url: "https://cdn.example/label.webp", alt: "Approved media", slot: "grading-label" },
      ],
    });

    expect(sides.front?.src).toBe("https://cdn.example/front.webp");
    expect(sides.back?.src).toBe("https://cdn.example/back.webp");
  });

  it("does not let hover replace an explicit front/back choice", () => {
    expect(effectiveCardFlipState(null, false)).toBe(false);
    expect(effectiveCardFlipState(null, true)).toBe(true);
    expect(effectiveCardFlipState(false, true)).toBe(false);
    expect(effectiveCardFlipState(true, false)).toBe(true);
  });
});
