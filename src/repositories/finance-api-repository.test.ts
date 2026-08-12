import { describe, expect, it } from "vitest";
import { mapCash, mapHolding, mapPortfolio, mapTransaction } from "./finance-api-repository";

describe("Document 013 finance API adapter", () => {
  it("preserves minor-unit precision and never returns account identifiers", () => {
    const cash = mapCash({
      currency: "GBP",
      accounts: [
        {
          id: "private",
          code: "INTERNAL",
          totalMinor: "9007199254740993",
          reservedMinor: "100",
          availableMinor: "9007199254740893",
        },
      ],
    });
    expect(cash).toEqual({
      currency: "GBP",
      totalMinor: "9007199254740993",
      reservedMinor: "100",
      availableMinor: "9007199254740893",
    });
    expect("id" in cash).toBe(false);
    expect("code" in cash).toBe(false);
  });
  it("keeps missing values unavailable and excludes fabricated P&L/allocation values", () => {
    const holding = mapHolding({
      assetId: "asset",
      slug: null,
      title: null,
      category: null,
      grade: null,
      ownedUnits: "10",
      reservedUnits: "2",
      availableUnits: "8",
      estimatedValueMinor: null,
      valuationAsOf: null,
      valuationStatus: "UNAVAILABLE",
      costBasisMinor: null,
    });
    expect(holding.estimatedValueMinor).toBeNull();
    expect(holding.costBasisMinor).toBeNull();
    expect("profitLoss" in holding).toBe(false);
    expect("allocation" in holding).toBe(false);
  });
  it("maps safe history and honest partial/full valuation states", () => {
    const partial = mapPortfolio({
      currency: "GBP",
      cash: { currency: "GBP", accounts: [] },
      holdings: [],
      estimatedHoldingsValueMinor: "200",
      estimatedPortfolioValueMinor: "300",
      valuationStatus: "PARTIAL",
    });
    const full = mapPortfolio({
      currency: "GBP",
      cash: { currency: "GBP", accounts: [] },
      holdings: [],
      estimatedHoldingsValueMinor: "200",
      estimatedPortfolioValueMinor: "300",
      valuationStatus: "AVAILABLE",
    });
    expect(partial.estimatedPortfolioValueMinor).toBeNull();
    expect(full.valuationStatus).toBe("FULL");
    expect(
      mapTransaction({
        type: "DEMO_FUNDING",
        side: "CREDIT",
        amountMinor: "100",
        effectiveAt: "2026-08-07T00:00:00.000Z",
        accountId: "private",
      }),
    ).toEqual({
      type: "DEMO_FUNDING",
      side: "CREDIT",
      amountMinor: "100",
      effectiveAt: "2026-08-07T00:00:00.000Z",
      status: null,
      reference: null,
    });
  });
});
