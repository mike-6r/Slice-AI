import type { OrderBookLevel } from "@/domain";
import { formatAuthoritativeMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";

const _legacyFormatGbpMinor = (value: string | bigint) => {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}£${(absolute / 100n).toLocaleString("en-GB")}.${(absolute % 100n)
    .toString()
    .padStart(2, "0")}`;
};

export const formatGbpMinor = (value: string | bigint) => {
  const { currency, rates } = getCurrencyPresentation();
  return formatAuthoritativeMoney(value, "GBP", currency, rates);
};

/** Converts a customer-entered GBP decimal into D14's minor-unit wire value. */
export const gbpInputToMinor = (value: string) => {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return (BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")).toString();
};

export const minorToGbpInput = (value: string | bigint) => {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
};

export const parsePositiveShares = (value: string) => {
  if (!/^[1-9]\d*$/.test(value.trim())) return null;
  return BigInt(value.trim());
};

export const referenceSharePriceMinor = (
  estimatedAssetValueMinor: number | undefined,
  issuedUnits: string | undefined,
) => {
  if (estimatedAssetValueMinor === undefined || !issuedUnits) return null;
  const issued = BigInt(issuedUnits);
  if (issued <= 0n) return null;
  return BigInt(Math.trunc(estimatedAssetValueMinor)) / issued;
};

export const bestOrderBookLevel = (levels: OrderBookLevel[] | undefined, side: "BID" | "ASK") => {
  if (!levels?.length) return null;
  return levels.reduce((best, level) => {
    const price = Number(level.pricePerUnit.amount);
    const bestPrice = Number(best.pricePerUnit.amount);
    return side === "ASK" ? (price < bestPrice ? level : best) : price > bestPrice ? level : best;
  });
};

export const publicAvailableShares = (
  issuedUnits: string | undefined,
  availabilityBps: number | undefined,
) => {
  if (!issuedUnits || availabilityBps === undefined) return null;
  return (BigInt(issuedUnits) * BigInt(Math.max(0, Math.trunc(availabilityBps)))) / 10_000n;
};

export const averageCostMinor = (costBasisMinor: string | null, ownedUnits: string) => {
  const owned = BigInt(ownedUnits);
  if (!costBasisMinor || owned <= 0n) return null;
  return BigInt(costBasisMinor) / owned;
};
