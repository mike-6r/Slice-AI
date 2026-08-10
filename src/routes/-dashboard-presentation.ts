import type { PortfolioSummary, PortfolioValuationStatus } from "@/domain";

export function formatDashboardMoney(value: string) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}\u00a3${(absolute / 100n).toLocaleString("en-GB")}.${(
    absolute % 100n
  )
    .toString()
    .padStart(2, "0")}`;
}

export function dashboardPortfolioValue(portfolio: PortfolioSummary) {
  return portfolio.valuationStatus === "FULL" && portfolio.estimatedPortfolioValueMinor !== null
    ? formatDashboardMoney(portfolio.estimatedPortfolioValueMinor)
    : "Unavailable";
}

export function dashboardValuationCopy(status: PortfolioValuationStatus) {
  if (status === "FULL") return "All holdings have authoritative marks.";
  if (status === "PARTIAL") return "Only some holdings have authoritative marks.";
  return "No authoritative valuation available.";
}

/** Panel-level fallbacks preserve the approved composition without fabricating account data. */
export const DASHBOARD_EMPTY_STATES = {
  orders: "No open orders.",
  activity: "No recent activity.",
  market: "No market data available.",
  allocation: "Portfolio allocation unavailable.",
  holdings: "No holdings available.",
  transactions: "No recent transactions.",
} as const;

export const DASHBOARD_ERROR_STATES = {
  summary: "Unable to load your account summary.",
  orders: "Unable to load orders.",
  activity: "Unable to load recent activity.",
  market: "Unable to load market data.",
  allocation: "Unable to load allocation.",
  holdings: "Unable to load holdings.",
  transactions: "Unable to load transactions.",
} as const;
