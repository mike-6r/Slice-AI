import { describe, expect, it } from "vitest";
import {
  convertMinorForDisplay,
  formatAuthoritativeMoney,
  formatDisplayMoney,
} from "./currency-presentation";

const rates = {
  baseCurrency: "GBP" as const,
  rates: { GBP: 1, USD: 1.25, CAD: 1.7, EUR: 1.16 },
  asOf: "2026-08-12",
  fetchedAt: "2026-08-12T12:00:00.000Z",
  source: "test",
  cached: false,
};

describe("currency presentation", () => {
  it("converts display-only GBP figures using the current rate snapshot", () => {
    expect(formatDisplayMoney("10000", "GBP", "USD", rates)).toContain("$125.00");
    expect(formatDisplayMoney("10000", "GBP", "EUR", rates)).toContain("€116.00");
  });

  it("converts in integer minor units and rounds once at the display boundary", () => {
    expect(convertMinorForDisplay("10001", "GBP", "USD", rates)).toBe(12501n);
    expect(convertMinorForDisplay("10000", "USD", "GBP", rates)).toBe(8000n);
    expect(formatDisplayMoney("10001", "GBP", "USD", rates)).toBe("$125.01");
  });

  it("keeps the original amount visible when conversion is unavailable", () => {
    expect(formatDisplayMoney("10000", "GBP", "CAD", null)).toBe("£100.00");
  });

  it("keeps trading amounts authoritative in GBP and labels the conversion approximate", () => {
    expect(formatAuthoritativeMoney("10000", "GBP", "USD", rates)).toMatch(/£100\.00 \(approx\./);
  });
});
