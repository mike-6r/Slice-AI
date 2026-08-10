export type MinorUnits = number;

export function formatCurrency(
  valueInMinorUnits: MinorUnits,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
    ...options,
  }).format(valueInMinorUnits / 100);
}

export function formatCurrencyPrecise(valueInMinorUnits: MinorUnits) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valueInMinorUnits / 100);
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
