import { describe, expect, it } from "vitest";
import { HOMEPAGE_OWNERSHIP_EXAMPLE } from "@/data/homepage-showcase";
import { HOME_EXAMPLE_PRESETS, homepageExampleSelection } from "./homepage-example";

describe("homepage interactive ownership example", () => {
  it.each([1, 10, 25, 100, 250, 500, 999, 1000])(
    "keeps the grid, cost and ownership consistent for %i Slices",
    (count) => {
      const selection = homepageExampleSelection(count);
      expect(selection.count).toBe(count);
      expect(selection.costMinor).toBe(count * HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor);
      expect(selection.ownershipPercent).toBeCloseTo(count / 10);
      expect(selection.remainingCount + count).toBe(1000);
      expect(selection.remainingPercent + selection.ownershipPercent).toBeCloseTo(100);
      expect(selection.tileFills).toHaveLength(100);
      expect(selection.tileFills.reduce((sum, fill) => sum + fill, 0)).toBeCloseTo(count * 10);
    },
  );
  it("fills every row at full ownership, not only the first row", () => {
    const selection = homepageExampleSelection(1000);
    expect(selection.tileFills.every((fill) => fill === 100)).toBe(true);
    expect(selection.rangePercent).toBe(100);
    expect(selection.costMinor).toBe(HOMEPAGE_OWNERSHIP_EXAMPLE.illustrativeValuationMinor);
    expect(selection.remainingCount).toBe(0);
    expect(HOME_EXAMPLE_PRESETS).toContain(1000);
  });
  it("keeps a partial tile accurate and the minimum reachable", () => {
    expect(homepageExampleSelection(25).tileFills.slice(0, 4)).toEqual([100, 100, 50, 0]);
    expect(homepageExampleSelection(1).rangePercent).toBe(0);
  });
  it.each([
    [0, 1],
    [-50, 1],
    [1001, 1000],
    [25.2, 25],
    [NaN, 1],
    [Infinity, 1],
  ])("bounds invalid selection %s to %i", (input, expected) =>
    expect(homepageExampleSelection(input).count).toBe(expected),
  );
});
