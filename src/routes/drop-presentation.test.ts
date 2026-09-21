import { describe, expect, it } from "vitest";
import { canSubmitDrop, dropInventorySummary, dropReferenceValueLabel } from "./-drop-presentation";

describe("Drops presentation truthfulness", () => {
  it("keeps a missing authoritative value explicitly unavailable", () => {
    expect(dropReferenceValueLabel(null)).toBe("Reference value unavailable");
    expect(dropReferenceValueLabel({ amountMinor: "12500", currency: "GBP" })).toBe("£125.00");
  });

  it("allows submission only for a ready draft", () => {
    expect(canSubmitDrop({ state: "DRAFT", readiness: { ready: true, checks: [] } })).toBe(true);
    expect(
      canSubmitDrop({ state: "READY_FOR_REVIEW", readiness: { ready: true, checks: [] } }),
    ).toBe(false);
    expect(canSubmitDrop({ state: "DRAFT", readiness: { ready: false, checks: [] } })).toBe(false);
  });

  it("shows server-authoritative inventory counts without fake statistics", () => {
    expect(
      dropInventorySummary({ inventoryCount: 6, openingCount: 0, remainingInventoryCount: 6 }),
    ).toEqual({ selected: 6, opened: 0, remaining: 6 });
  });
});
