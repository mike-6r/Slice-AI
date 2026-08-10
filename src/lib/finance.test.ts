import { describe, expect, it } from "vitest";
import { basisPoints, cryptoAmount, minorUnits, ownershipUnits, percentage } from "@/domain";
import {
  basisPointsToPercentage,
  formatGbp,
  formatPercentage,
  formatUsdc,
  ownershipUnitsToPercentage,
} from "./finance";

describe("financial formatters", () => {
  it("formats GBP from integer minor units", () =>
    expect(formatGbp(minorUnits(2_458_000))).toBe("£24,580.00"));
  it("formats decimal-safe USDC amounts", () =>
    expect(formatUsdc(cryptoAmount("1250.500000"))).toBe("1,250.5 USDC"));
  it("formats signed percentage changes", () =>
    expect(formatPercentage(percentage(12.43), true)).toBe("+12.43%"));
  it("converts ownership units without settlement floats", () =>
    expect(ownershipUnitsToPercentage(ownershipUnits(2_500), ownershipUnits(10_000))).toBe(25));
  it("converts basis points to percentage", () =>
    expect(basisPointsToPercentage(basisPoints(2_460))).toBe(24.6));
});
