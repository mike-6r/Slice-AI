import type { PortfolioRepository } from "@/data/repositories";
import type {
  GbpMinorUnits,
  PortfolioCashSummary,
  PortfolioHolding,
  PortfolioLot,
  PortfolioSummary,
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
  };
};

export const mapHolding = (raw: unknown): PortfolioHolding => {
  const value = object(raw);
  return {
    assetId: requiredString(value.assetId, "holding.assetId"),
    slug: nullableString(value.slug),
    title: nullableString(value.title),
    ownedUnits: units(value.ownedUnits, "holding.ownedUnits"),
    reservedUnits: units(value.reservedUnits, "holding.reservedUnits"),
    availableUnits: units(value.availableUnits, "holding.availableUnits"),
    estimatedValueMinor:
      value.estimatedValueMinor === null
        ? null
        : minor(value.estimatedValueMinor, "holding.estimatedValueMinor"),
    valuationAsOf: nullableString(value.valuationAsOf) as PortfolioHolding["valuationAsOf"],
    valuationStatus: valuation(value.valuationStatus),
    costBasisMinor:
      value.costBasisMinor === null ? null : minor(value.costBasisMinor, "holding.costBasisMinor"),
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
});
