import { describe, expect, it } from "vitest";

import type { ISODateTime, PortfolioSummary } from "@/domain";
import {
  PORTFOLIO_EMPTY_STATES,
  PORTFOLIO_ERROR_STATES,
  deriveHoldingAllocation,
  portfolioValueLabel,
  valuationDescription,
} from "./-portfolio-presentation";

const summary: PortfolioSummary = {
  currency: "GBP",
  cash: { currency: "GBP", totalMinor: "10000", reservedMinor: "2000", availableMinor: "8000" },
  holdings: [
    {
      assetId: "one",
      slug: "one",
      title: "One",
      category: "Pokémon TCG",
      grade: "PSA 10 · Gem Mint",
      ownedUnits: "1",
      reservedUnits: "0",
      availableUnits: "1",
      estimatedValueMinor: "6000",
      valuationAsOf: "2026-08-09T00:00:00.000Z" as ISODateTime,
      valuationStatus: "FULL",
      costBasisMinor: "5000",
    },
    {
      assetId: "two",
      slug: "two",
      title: "Two",
      category: "Sports Cards",
      grade: "PSA 10 · Gem Mint",
      ownedUnits: "1",
      reservedUnits: "0",
      availableUnits: "1",
      estimatedValueMinor: "4000",
      valuationAsOf: "2026-08-09T00:00:00.000Z" as ISODateTime,
      valuationStatus: "FULL",
      costBasisMinor: null,
    },
  ],
  estimatedHoldingsValueMinor: "10000",
  estimatedPortfolioValueMinor: "18000",
  valuationStatus: "FULL",
};

describe("portfolio presentation authority", () => {
  it("renders a total only for a complete authoritative valuation", () => {
    expect(portfolioValueLabel(summary)).toBe("£180.00");
    expect(portfolioValueLabel({ ...summary, valuationStatus: "PARTIAL" })).toBe("Partial");
    expect(
      portfolioValueLabel({
        ...summary,
        valuationStatus: "UNAVAILABLE",
        estimatedPortfolioValueMinor: null,
      }),
    ).toBe("Unavailable");
  });

  it("derives allocation only from complete marked holdings using bounded display precision", () => {
    expect(deriveHoldingAllocation(summary)).toEqual([
      { assetId: "one", label: "One", valueMinor: "6000", percentageBps: 6000 },
      { assetId: "two", label: "Two", valueMinor: "4000", percentageBps: 4000 },
    ]);
    expect(deriveHoldingAllocation({ ...summary, valuationStatus: "PARTIAL" })).toBeNull();
    expect(deriveHoldingAllocation({ ...summary, holdings: [] })).toBeNull();
  });

  it("keeps missing performance and panel failures explicit", () => {
    expect(valuationDescription("UNAVAILABLE")).toBe("No authoritative valuation available.");
    expect(PORTFOLIO_EMPTY_STATES.performance).toBe("No portfolio performance history available.");
    expect(PORTFOLIO_EMPTY_STATES.allocation).toBe("No holdings to allocate.");
    expect(PORTFOLIO_EMPTY_STATES.holdings).toBe("No holdings recorded.");
    expect(PORTFOLIO_EMPTY_STATES.transactions).toBe("No recorded transactions.");
    expect(Object.values(PORTFOLIO_ERROR_STATES)).toEqual(
      expect.arrayContaining(["Unable to load holdings.", "Unable to load transactions."]),
    );
  });
});
