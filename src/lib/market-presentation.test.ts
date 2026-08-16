import { describe, expect, it } from "vitest";
import { formatAvailability, formatMinorAmount, formatPricePerUnit } from "./market-presentation";

describe("market presentation", () => {
  it("keeps authoritative money exact", () => {
    expect(formatMinorAmount("1250", "GBP")).toBe("£12.50");
    expect(formatMinorAmount("0", "GBP")).toBe("£0.00");
  });
  it("explains a retained sub-penny remainder", () => {
    expect(formatPricePerUnit("0", "GBP", "7")).toBe("< £0.01");
    expect(formatPricePerUnit("0", "GBP", "0")).toBe("£0.00");
    expect(formatPricePerUnit(null, "GBP")).toBe("Not available");
  });
  it("does not confuse zero availability with unavailable data", () => {
    expect(formatAvailability(0)).toBe("0%");
    expect(formatAvailability("0")).toBe("0%");
    expect(formatAvailability(12.5)).toBe("12.5%");
    expect(formatAvailability(null)).toBe("Not yet available");
    expect(formatAvailability("unavailable")).toBe("Not yet available");
  });
});
