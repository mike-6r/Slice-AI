import { describe, expect, it } from "vitest";

import {
  DASHBOARD_EMPTY_STATES,
  DASHBOARD_ERROR_STATES,
  dashboardPortfolioValue,
  dashboardValuationCopy,
  formatDashboardMoney,
} from "./-dashboard-presentation";

describe("authenticated dashboard presentation", () => {
  it("uses authoritative cash values without precision loss", () => {
    expect(formatDashboardMoney("2345080")).toBe("£23,450.80");
    expect(formatDashboardMoney("0")).toBe("£0.00");
    expect(formatDashboardMoney("9007199254740993")).toBe("£90,071,992,547,409.93");
  });

  it("never replaces unavailable or partial valuation with a fabricated value", () => {
    const base = {
      currency: "GBP" as const,
      cash: { currency: "GBP" as const, totalMinor: "0", reservedMinor: "0", availableMinor: "0" },
      holdings: [],
      estimatedHoldingsValueMinor: null,
    };

    expect(
      dashboardPortfolioValue({
        ...base,
        estimatedPortfolioValueMinor: "12345",
        valuationStatus: "PARTIAL",
      }),
    ).toBe("Unavailable");
    expect(
      dashboardPortfolioValue({
        ...base,
        estimatedPortfolioValueMinor: null,
        valuationStatus: "UNAVAILABLE",
      }),
    ).toBe("Unavailable");
    expect(
      dashboardPortfolioValue({
        ...base,
        estimatedPortfolioValueMinor: "12345",
        valuationStatus: "FULL",
      }),
    ).toBe("£123.45");
  });

  it("keeps unavailable allocation and valuation copy explicit", () => {
    expect(dashboardValuationCopy("FULL")).toContain("authoritative marks");
    expect(dashboardValuationCopy("PARTIAL")).toContain("some holdings");
    expect(dashboardValuationCopy("UNAVAILABLE")).toBe("No authoritative valuation available.");
  });

  it("keeps each empty or failed panel in place with a truthful, retry-safe message", () => {
    expect(DASHBOARD_EMPTY_STATES).toEqual({
      orders: "No open orders.",
      activity: "No recent activity.",
      market: "No market data available.",
      allocation: "Portfolio allocation unavailable.",
      holdings: "No holdings available.",
      transactions: "No recent transactions.",
    });
    expect(Object.values(DASHBOARD_ERROR_STATES)).toEqual(
      expect.arrayContaining([
        "Unable to load orders.",
        "Unable to load recent activity.",
        "Unable to load market data.",
        "Unable to load holdings.",
      ]),
    );
  });
});
