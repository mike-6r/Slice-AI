import { describe, expect, it } from "vitest";
import {
  averageCostMinor,
  bestOrderBookLevel,
  formatGbpMinor,
  gbpInputToMinor,
  minorToGbpInput,
  parsePositiveShares,
  publicAvailableShares,
  referenceSharePriceMinor,
} from "./trading-order-presentation";

describe("trading order presentation", () => {
  it("round-trips customer GBP values without floating point math", () => {
    expect(gbpInputToMinor("13.05")).toBe("1305");
    expect(minorToGbpInput("1305")).toBe("13.05");
    expect(formatGbpMinor("1305")).toBe("£13.05");
    expect(gbpInputToMinor("13.005")).toBeNull();
  });

  it("accepts only positive integer shares", () => {
    expect(parsePositiveShares("25")).toBe(25n);
    expect(parsePositiveShares("0")).toBeNull();
    expect(parsePositiveShares("1.5")).toBeNull();
  });

  it("derives public share context from authoritative aggregates", () => {
    expect(referenceSharePriceMinor(1_285_000, "1000")).toBe(1285n);
    expect(publicAvailableShares("1000", 7000)).toBe(700n);
    expect(averageCostMinor("25000", "25")).toBe(1000n);
  });

  it("selects the lowest ask and highest bid", () => {
    const levels = [
      {
        pricePerUnit: { amount: 1310 as never, currency: "GBP" as const },
        units: 3,
        orderCount: 1,
      },
      {
        pricePerUnit: { amount: 1290 as never, currency: "GBP" as const },
        units: 7,
        orderCount: 2,
      },
    ];
    expect(bestOrderBookLevel(levels, "ASK")?.pricePerUnit.amount).toBe(1290);
    expect(bestOrderBookLevel(levels, "BID")?.pricePerUnit.amount).toBe(1310);
  });
});
