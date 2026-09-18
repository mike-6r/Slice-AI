import { describe, expect, it } from "vitest";
import type { CollectorProfile, CollectorPublishedListing } from "@/domain";
import {
  collectorDirectoryKey,
  collectorInitials,
  collectorPageWindow,
  collectorPreviewListings,
  normalizeCollectorSearch,
} from "./directory-presentation";

describe("collector directory navigation", () => {
  it.each([undefined, "garbage", "Infinity", -12, 0, NaN])("normalizes invalid page %s", (page) => {
    expect(normalizeCollectorSearch({ page }).page).toBe(1);
  });
  it("bounds pages, strips blank filters and validates enum fields", () => {
    expect(
      normalizeCollectorSearch({
        q: "  ",
        specialty: " ",
        sort: "unknown",
        status: "all",
        page: 2.8,
      }),
    ).toEqual({ sort: "featured", status: "all", page: 2 });
    expect(normalizeCollectorSearch({ page: 1e9 }).page).toBe(10000);
    expect(
      normalizeCollectorSearch({
        q: " x ",
        specialty: " Pokémon ",
        sort: "recent",
        status: "both",
      }),
    ).toEqual({ q: "x", specialty: "Pokémon", sort: "recent", status: "both", page: 1 });
    expect(
      normalizeCollectorSearch({ q: "x".repeat(150), specialty: "y".repeat(100) }),
    ).toMatchObject({ q: "x".repeat(120), specialty: "y".repeat(80) });
  });
  it("shares default overview queries but separates every filter and page", () => {
    const key = collectorDirectoryKey({});
    expect(collectorDirectoryKey({ page: 1, status: "all", sort: "featured" })).toEqual(key);
    for (const search of [
      { q: "name" },
      { specialty: "sports" },
      { page: 2 },
      { sort: "name" as const },
      { status: "pre-sale" as const },
    ]) {
      expect(collectorDirectoryKey(search)).not.toEqual(key);
    }
  });
  it.each([1, 2, 50, 9999, 10000])("keeps page %i visible within a bounded window", (page) => {
    const pages = collectorPageWindow(page, 10000);
    expect(pages).toContain(page);
    expect(pages[0]).toBe(1);
    expect(pages.at(-1)).toBe(10000);
    expect(pages.length).toBeLessThanOrEqual(7);
  });
  it("handles empty and short directories without gaps", () => {
    expect(collectorPageWindow(1, 0)).toEqual([]);
    expect(collectorPageWindow(1, 1)).toEqual([1]);
    expect(collectorPageWindow(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("deduplicates public previews without changing their priority", () => {
    const first = { assetId: "first" } as CollectorPublishedListing;
    const second = { assetId: "second" } as CollectorPublishedListing;
    expect(
      collectorPreviewListings({
        featuredPreviewAssets: [second],
        publishedListings: [first, second],
      } as CollectorProfile),
    ).toEqual([second, first]);
    expect(collectorPreviewListings({} as CollectorProfile)).toEqual([]);
  });
  it("has stable avatar fallbacks", () => {
    expect(collectorInitials(" North Star Collection ")).toBe("NS");
    expect(collectorInitials("")).toBe("S");
  });
});
