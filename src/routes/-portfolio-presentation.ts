import type { PortfolioHolding, PortfolioSummary, PortfolioValuationStatus } from "@/domain";

export function formatPortfolioMoney(value: string) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}\u00a3${(absolute / 100n).toLocaleString("en-GB")}.${(
    absolute % 100n
  )
    .toString()
    .padStart(2, "0")}`;
}

export function portfolioValueLabel(summary: PortfolioSummary) {
  if (summary.valuationStatus === "FULL" && summary.estimatedPortfolioValueMinor !== null)
    return formatPortfolioMoney(summary.estimatedPortfolioValueMinor);
  return summary.valuationStatus === "PARTIAL" ? "Partial" : "Unavailable";
}

export function valuationDescription(status: PortfolioValuationStatus) {
  if (status === "FULL") return "All holdings have authoritative marks.";
  if (status === "PARTIAL") return "Only some holdings have authoritative marks.";
  return "No authoritative valuation available.";
}

export type PortfolioAllocationItem = {
  assetId: string;
  label: string;
  valueMinor: string;
  percentageBps: number;
};

/** A display-only allocation, derived only when the backend says all holdings are valued. */
export function deriveHoldingAllocation(
  summary: PortfolioSummary,
): PortfolioAllocationItem[] | null {
  if (summary.valuationStatus !== "FULL" || summary.holdings.length === 0) return null;
  const rows = summary.holdings.map((holding) => holdingToAllocation(holding));
  if (rows.some((row) => row === null)) return null;
  const completeRows = rows as Array<{ assetId: string; label: string; value: bigint }>;
  const total = completeRows.reduce((sum, row) => sum + row.value, 0n);
  if (total <= 0n) return null;
  return completeRows.map((row) => ({
    assetId: row.assetId,
    label: row.label,
    valueMinor: row.value.toString(),
    percentageBps: Number((row.value * 10_000n) / total),
  }));
}

function holdingToAllocation(holding: PortfolioHolding) {
  if (holding.estimatedValueMinor === null) return null;
  const value = BigInt(holding.estimatedValueMinor);
  if (value < 0n) return null;
  return {
    assetId: holding.assetId,
    label: holding.title ?? holding.slug ?? "Asset",
    value,
  };
}

export const PORTFOLIO_EMPTY_STATES = {
  allocation: "No holdings to allocate.",
  performance: "No portfolio performance history available.",
  holdings: "No holdings recorded.",
  transactions: "No recorded transactions.",
} as const;

export const PORTFOLIO_ERROR_STATES = {
  summary: "Unable to load portfolio summary.",
  holdings: "Unable to load holdings.",
  transactions: "Unable to load transactions.",
} as const;
