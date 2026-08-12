import type { PortfolioHolding, PortfolioSummary, PortfolioValuationStatus } from "@/domain";
import { formatDisplayMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";

export function formatPortfolioMoney(value: string) {
  const { currency, rates } = getCurrencyPresentation();
  return formatDisplayMoney(value, "GBP", currency, rates, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export type PortfolioHoldingValuation = {
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

/** A holding-level marked-value / open-cost comparison. This is deliberately
 * not presented as a historical return. */
export function deriveHoldingValuation(
  holding: PortfolioHolding,
): PortfolioHoldingValuation | null {
  if (holding.estimatedValueMinor === null || holding.costBasisMinor === null) return null;
  return {
    unrealisedValueMinor: (
      BigInt(holding.estimatedValueMinor) - BigInt(holding.costBasisMinor)
    ).toString(),
  };
}

/** The freshest authoritative holding mark is the only refresh time the
 * portfolio read model currently exposes. */
export function latestPortfolioMarkAt(summary: PortfolioSummary) {
  const marks = summary.holdings
    .map((holding) => holding.valuationAsOf)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
  if (!marks.length) return null;
  return marks.reduce((latest, value) => (value > latest ? value : latest));
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

export type PortfolioCategoryAllocationItem = Omit<PortfolioAllocationItem, "assetId">;

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

/** Asset-class allocation uses the same complete marked-value guard as the
 * per-holding allocation. It never blends cash into collectible allocation. */
export function deriveCategoryAllocation(
  summary: PortfolioSummary,
): PortfolioCategoryAllocationItem[] | null {
  const holdings = deriveHoldingAllocation(summary);
  if (!holdings) return null;
  const categories = new Map<string, bigint>();
  for (const holding of summary.holdings) {
    if (holding.estimatedValueMinor === null) return null;
    const label = holding.category?.trim() || "Other";
    categories.set(label, (categories.get(label) ?? 0n) + BigInt(holding.estimatedValueMinor));
  }
  const total = Array.from(categories.values()).reduce((sum, value) => sum + value, 0n);
  if (total <= 0n) return null;
  return Array.from(categories, ([label, value]) => ({
    label,
    valueMinor: value.toString(),
    percentageBps: Number((value * 10_000n) / total),
  })).sort((left, right) => Number(BigInt(right.valueMinor) - BigInt(left.valueMinor)));
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
