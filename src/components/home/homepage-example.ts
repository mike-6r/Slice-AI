import { HOMEPAGE_OWNERSHIP_EXAMPLE } from "@/data/homepage-showcase";

const terms = HOMEPAGE_OWNERSHIP_EXAMPLE;
export const HOME_EXAMPLE_PRESETS = [1, 25, 100, 250, 500, 1000] as const;

/** Teaching-only values; never used to place an order or value a real holding. */
export function homepageExampleSelection(value: number) {
  const count = Math.min(
    terms.totalSlicesCount,
    Math.max(1, Number.isFinite(value) ? Math.round(value) : 1),
  );
  const ownershipPercent = (count / terms.totalSlicesCount) * 100;
  const slicesPerTile = terms.totalSlicesCount / 100;
  return {
    count,
    costMinor: count * terms.slicePriceMinor,
    ownershipPercent,
    remainingCount: terms.totalSlicesCount - count,
    remainingPercent: 100 - ownershipPercent,
    rangePercent: ((count - 1) / (terms.totalSlicesCount - 1)) * 100,
    tileFills: Array.from({ length: 100 }, (_, index) =>
      Math.min(100, Math.max(0, (count / slicesPerTile - index) * 100)),
    ),
  };
}

export const exampleMoney = (minor: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(minor / 100);

export const examplePercent = (percent: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(percent) + "%";
