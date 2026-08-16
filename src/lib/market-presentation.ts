import { asSupportedCurrency, formatDisplayMoney } from "@/currency/currency-presentation";

type MinorValue = number | string | bigint;

function parseMinor(value: MinorValue | null | undefined) {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Formats an authoritative minor-unit amount without hiding cents through rounding. */
export function formatMinorAmount(
  valueInMinorUnits: MinorValue | null | undefined,
  currency?: string | null,
) {
  const minor = parseMinor(valueInMinorUnits);
  const supportedCurrency = asSupportedCurrency(currency) ?? "GBP";
  return minor === null
    ? "Not available"
    : formatDisplayMoney(minor, supportedCurrency, supportedCurrency, null, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

/** Formats a per-unit price, preserving a retained sub-penny remainder. */
export function formatPricePerUnit(
  valueInMinorUnits: MinorValue | null | undefined,
  currency?: string | null,
  remainderMinor?: MinorValue | null,
) {
  const minor = parseMinor(valueInMinorUnits);
  if (minor === null) return "Not available";
  const remainder = parseMinor(remainderMinor) ?? 0n;
  if (minor === 0n && remainder > 0n) return `< ${formatMinorAmount(1n, currency)}`;
  return formatMinorAmount(minor, currency);
}

/** Formats an availability percentage without treating numeric zero as missing. */
export function formatAvailability(value: unknown) {
  let numeric: number;
  if (typeof value === "number") numeric = value;
  else if (typeof value === "bigint") numeric = Number(value);
  else if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))
    numeric = Number(value.trim());
  else return "Not yet available";
  return Number.isFinite(numeric) && numeric >= 0
    ? `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(numeric)}%`
    : "Not yet available";
}
