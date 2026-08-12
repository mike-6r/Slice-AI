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

/**
 * The portfolio API deliberately exposes only safe public holding metadata. Do
 * not fall back to a slug here: a missing display title should not leak an
 * internal fixture or identifier into the investor experience.
 */
export function holdingDisplayLabel(holding: PortfolioHolding) {
  return holding.title?.trim() || "Collectible";
}

export type PortfolioValuationSnapshot = {
  holdingsValueMinor: string;
  investedCostMinor: string;
  unrealisedValueMinor: string;
};

/**
 * A current marked-value / open-cost snapshot is shown only when every
 * holding has both authoritative values. It is not a time-series return.
 */
export function derivePortfolioValuationSnapshot(
  summary: PortfolioSummary,
): PortfolioValuationSnapshot | null {
  if (summary.holdings.length === 0 || summary.estimatedHoldingsValueMinor === null) return null;
  if (summary.holdings.some((holding) => holding.costBasisMinor === null)) return null;

  const holdingsValue = BigInt(summary.estimatedHoldingsValueMinor);
  const investedCost = summary.holdings.reduce(
    (total, holding) => total + BigInt(holding.costBasisMinor as string),
    0n,
  );

  return {
    holdingsValueMinor: holdingsValue.toString(),
    investedCostMinor: investedCost.toString(),
    unrealisedValueMinor: (holdingsValue - investedCost).toString(),
  };
}

export function formatSignedPortfolioMoney(value: string) {
  const amount = BigInt(value);
  const formatted = formatPortfolioMoney(value);
  if (amount === 0n) return formatted;
  return amount > 0n ? `+${formatted}` : formatted;
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
    label: holdingDisplayLabel(holding),
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
