import type { PortfolioRepository } from "@/data/repositories";
import type {
  GbpMinorUnits,
  PortfolioCashSummary,
  PortfolioHolding,
  PortfolioLot,
  PortfolioSummary,
  PortfolioPerformance,
  PortfolioPerformanceRange,
  PortfolioTransaction,
  PortfolioValuationStatus,
} from "@/domain";
import type { ApiClient } from "@/api/http-client";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid finance response.");
  return value as RecordValue;
};
const requiredString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Missing finance field: ${field}.`);
  return value;
};
const minor = (value: unknown, field: string): GbpMinorUnits => {
  if (typeof value !== "string" || !/^-?\d+$/.test(value))
    throw new Error(`Invalid GBP minor-unit field: ${field}.`);
  return value;
};
const units = (value: unknown, field: string) => {
  if (typeof value !== "string" || !/^\d+$/.test(value))
    throw new Error(`Invalid ownership-unit field: ${field}.`);
  return value;
};
const nullableString = (value: unknown) => (typeof value === "string" ? value : null);
const valuation = (value: unknown): PortfolioValuationStatus =>
  value === "AVAILABLE" || value === "FULL"
    ? "FULL"
    : value === "PARTIAL"
      ? "PARTIAL"
      : "UNAVAILABLE";
const sumMinor = (values: string[]) =>
  values.reduce((total, value) => total + BigInt(value), 0n).toString();

export const mapCash = (raw: unknown): PortfolioCashSummary => {
  const body = object(raw);
  if (body.currency !== "GBP" || !Array.isArray(body.accounts))
    throw new Error("Invalid wallet balance response.");
  const accounts = body.accounts.map((account) => object(account));
  return {
    currency: "GBP",
    totalMinor: sumMinor(accounts.map((account) => minor(account.totalMinor, "wallet.totalMinor"))),
    reservedMinor: sumMinor(
      accounts.map((account) => minor(account.reservedMinor, "wallet.reservedMinor")),
    ),
    availableMinor: sumMinor(
      accounts.map((account) => minor(account.availableMinor, "wallet.availableMinor")),
    ),
    ...(body.pendingMinor !== undefined
      ? { pendingMinor: minor(body.pendingMinor, "wallet.pendingMinor") }
      : {}),
    ...(body.pendingWithdrawalMinor !== undefined
      ? {
          pendingWithdrawalMinor: minor(
            body.pendingWithdrawalMinor,
            "wallet.pendingWithdrawalMinor",
          ),
        }
      : {}),
    ...(body.orderReservedMinor !== undefined
      ? { orderReservedMinor: minor(body.orderReservedMinor, "wallet.orderReservedMinor") }
      : {}),
    ...(body.withdrawalReservedMinor !== undefined
      ? {
          withdrawalReservedMinor: minor(
            body.withdrawalReservedMinor,
            "wallet.withdrawalReservedMinor",
          ),
        }
      : {}),
    ...(body.collectorProceedsMinor !== undefined
      ? {
          collectorProceedsMinor: minor(
            body.collectorProceedsMinor,
            "wallet.collectorProceedsMinor",
          ),
        }
      : {}),
    ...(body.collectorProceedsReservedMinor !== undefined
      ? {
          collectorProceedsReservedMinor: minor(
            body.collectorProceedsReservedMinor,
            "wallet.collectorProceedsReservedMinor",
          ),
        }
      : {}),
  };
};

export const mapHolding = (raw: unknown): PortfolioHolding => {
  const value = object(raw);
  return {
    assetId: requiredString(value.assetId, "holding.assetId"),
    slug: nullableString(value.slug),
    title: nullableString(value.title),
    category: nullableString(value.category),
    grade: nullableString(value.grade),
    totalUnits: nullableString(value.totalUnits),
    issuedUnits: nullableString(value.issuedUnits),
    totalIssuedQuantity: nullableString(value.totalIssuedQuantity),
    userOwnershipPercent: nullableString(value.userOwnershipPercent),
    availableToSellPercent: nullableString(value.availableToSellPercent),
    availableToBuyQuantity: nullableString(value.availableToBuyQuantity),
    availableToBuyPercent: nullableString(value.availableToBuyPercent),
    ownedUnits: units(value.ownedUnits, "holding.ownedUnits"),
    reservedUnits: units(value.reservedUnits, "holding.reservedUnits"),
    availableToSellUnits:
      value.availableToSellUnits === undefined
        ? undefined
        : units(value.availableToSellUnits, "holding.availableToSellUnits"),
    availableUnits: units(value.availableUnits, "holding.availableUnits"),
    estimatedValueMinor:
      value.estimatedValueMinor === null
        ? null
        : minor(value.estimatedValueMinor, "holding.estimatedValueMinor"),
    valuationAsOf: nullableString(value.valuationAsOf) as PortfolioHolding["valuationAsOf"],
    valuationStatus: valuation(value.valuationStatus),
    costBasisMinor:
      value.costBasisMinor === null ? null : minor(value.costBasisMinor, "holding.costBasisMinor"),
    unrealisedPnlMinor:
      value.unrealisedPnlMinor === null || value.unrealisedPnlMinor === undefined
        ? value.unrealisedPnlMinor === undefined
          ? undefined
          : null
        : minor(value.unrealisedPnlMinor, "holding.unrealisedPnlMinor"),
    unrealisedPnlPercent: nullableString(value.unrealisedPnlPercent),
    valuationSource: nullableString(value.valuationSource),
    valuationFreshness: nullableString(value.valuationFreshness) ?? "UNAVAILABLE",
    lastSuccessfulRefreshAt: nullableString(
      value.lastSuccessfulRefreshAt,
    ) as PortfolioHolding["lastSuccessfulRefreshAt"],
  };
};
export const mapLot = (raw: unknown): PortfolioLot => {
  const value = object(raw);
  return {
    assetSlug: nullableString(value.assetSlug),
    assetTitle: nullableString(value.assetTitle),
    acquiredUnits: units(value.acquiredUnits, "lot.acquiredUnits"),
    remainingUnits: units(value.remainingUnits, "lot.remainingUnits"),
    totalCostMinor:
      value.totalCostMinor === null ? null : minor(value.totalCostMinor, "lot.totalCostMinor"),
    acquiredAt: requiredString(value.acquiredAt, "lot.acquiredAt") as PortfolioLot["acquiredAt"],
    status: requiredString(value.status, "lot.status"),
  };
};
export const mapTransaction = (raw: unknown): PortfolioTransaction => {
  const value = object(raw);
  const side = value.side === "DEBIT" || value.side === "CREDIT" ? value.side : null;
  if (!side) throw new Error("Invalid financial transaction side.");
  return {
    type: requiredString(value.type, "transaction.type"),
    side,
    amountMinor: minor(value.amountMinor, "transaction.amountMinor"),
    effectiveAt: requiredString(
      value.effectiveAt,
      "transaction.effectiveAt",
    ) as PortfolioTransaction["effectiveAt"],
    status: nullableString(value.status),
    reference: nullableString(value.reference),
  };
};
export const mapPortfolio = (raw: unknown): PortfolioSummary => {
  const body = object(raw);
  if (body.currency !== "GBP" || !Array.isArray(body.holdings))
    throw new Error("Invalid portfolio response.");
  const status = valuation(body.valuationStatus);
  return {
    currency: "GBP",
    cash: mapCash(body.cash),
    holdings: body.holdings.map(mapHolding),
    estimatedHoldingsValueMinor:
      status === "UNAVAILABLE" || body.estimatedHoldingsValueMinor === null
        ? null
        : minor(body.estimatedHoldingsValueMinor, "portfolio.estimatedHoldingsValueMinor"),
    estimatedPortfolioValueMinor:
      status === "FULL" && body.estimatedPortfolioValueMinor !== null
        ? minor(body.estimatedPortfolioValueMinor, "portfolio.estimatedPortfolioValueMinor")
        : null,
    valuationStatus: status,
    investedCostMinor:
      body.investedCostMinor === null || body.investedCostMinor === undefined
        ? body.investedCostMinor === undefined
          ? undefined
          : null
        : minor(body.investedCostMinor, "portfolio.investedCostMinor"),
    unrealisedPnlMinor:
      body.unrealisedPnlMinor === null || body.unrealisedPnlMinor === undefined
        ? body.unrealisedPnlMinor === undefined
          ? undefined
          : null
        : minor(body.unrealisedPnlMinor, "portfolio.unrealisedPnlMinor"),
    unrealisedPnlPercent: nullableString(body.unrealisedPnlPercent),
  };
};
export const mapPerformance = (raw: unknown): PortfolioPerformance => {
  const body = object(raw);
  const range = body.range;
  if (!["1D", "1W", "1M", "3M", "1Y", "ALL"].includes(String(range)) || !Array.isArray(body.points))
    throw new Error("Invalid portfolio performance response.");
  const direction =
    body.direction === "POSITIVE" || body.direction === "NEGATIVE" || body.direction === "NEUTRAL"
      ? body.direction
      : "NEUTRAL";
  return {
    range: range as PortfolioPerformanceRange,
    points: body.points.map((rawPoint) => {
      const point = object(rawPoint);
      return {
        timestamp: requiredString(
          point.timestamp,
          "performance.timestamp",
        ) as PortfolioPerformance["points"][number]["timestamp"],
        valueMinor: minor(point.valueMinor, "performance.valueMinor"),
        currency: "GBP" as const,
        freshness: nullableString(point.freshness) ?? "UNAVAILABLE",
      };
    }),
    periodChangeMinor:
      body.periodChangeMinor === null
        ? null
        : minor(body.periodChangeMinor, "performance.periodChangeMinor"),
    periodChangeBps: typeof body.periodChangeBps === "number" ? body.periodChangeBps : null,
    netCashFlowMinor: minor(body.netCashFlowMinor, "performance.netCashFlowMinor"),
    direction,
    freshness: nullableString(body.freshness) ?? "UNAVAILABLE",
  };
};

export const createFinanceApiRepository = (client: ApiClient): PortfolioRepository => ({
  async getPortfolio() {
    return mapPortfolio(await client.get<unknown>("/me/portfolio"));
  },
  async getHoldings() {
    const body = await client.get<unknown>("/me/portfolio/assets");
    if (!Array.isArray(body)) throw new Error("Invalid holdings response.");
    return body.map(mapHolding);
  },
  async getLots() {
    const body = await client.get<unknown>("/me/portfolio/lots");
    if (!Array.isArray(body)) throw new Error("Invalid lots response.");
    return body.map(mapLot);
  },
  async getTransactions(input) {
    const body = object(await client.get<unknown>("/me/wallet/transactions", input));
    if (!Array.isArray(body.items)) throw new Error("Invalid transaction history response.");
    return { items: body.items.map(mapTransaction), nextCursor: nullableString(body.nextCursor) };
  },
  async getPerformance(range = "1M") {
    return mapPerformance(await client.get<unknown>("/me/portfolio/performance", { range }));
  },
});
