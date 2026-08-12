export type MinorUnits = number;
import { asSupportedCurrency, formatDisplayMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";

export function formatCurrency(
  valueInMinorUnits: MinorUnits,
  options: Intl.NumberFormatOptions = {},
) {
  const sourceCurrency = asSupportedCurrency(options.currency) ?? "GBP";
  const { currency, rates } = getCurrencyPresentation();
  const { currency: _currency, ...formatOptions } = options;
  return formatDisplayMoney(valueInMinorUnits, sourceCurrency, currency, rates, formatOptions);
}

export function formatCurrencyPrecise(valueInMinorUnits: MinorUnits) {
  const { currency, rates } = getCurrencyPresentation();
  return formatDisplayMoney(valueInMinorUnits, "GBP", currency, rates, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value: number, options: Intl.NumberFormatOptions = {}) {
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1, ...options }).format(value)}%`;
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatOwnership(value: number) {
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
