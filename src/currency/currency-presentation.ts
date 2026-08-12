import type { CurrencyRates, SupportedCurrency } from "@/data/repositories";

export const supportedCurrencies: ReadonlyArray<{
  code: SupportedCurrency;
  label: string;
}> = [
  { code: "GBP", label: "GBP — British pound" },
  { code: "USD", label: "USD — US dollar" },
  { code: "CAD", label: "CAD — Canadian dollar" },
  { code: "EUR", label: "EUR — Euro" },
];

const currencyLocales: Record<SupportedCurrency, string> = {
  GBP: "en-GB",
  USD: "en-US",
  CAD: "en-CA",
  EUR: "en-IE",
};

export const asSupportedCurrency = (value: unknown): SupportedCurrency | null =>
  value === "GBP" || value === "USD" || value === "CAD" || value === "EUR" ? value : null;

export function formatDisplayMoney(
  valueInMinorUnits: number | string | bigint,
  sourceCurrency: SupportedCurrency = "GBP",
  targetCurrency: SupportedCurrency = "GBP",
  rates: CurrencyRates | null | undefined,
  options: Intl.NumberFormatOptions = {},
) {
  const sourceAmount = Number(valueInMinorUnits) / 100;
  const rate = exchangeRate(sourceCurrency, targetCurrency, rates);
  const displayCurrency = rate === null ? sourceCurrency : targetCurrency;
  const displayAmount = rate === null ? sourceAmount : sourceAmount * rate;
  return new Intl.NumberFormat(currencyLocales[displayCurrency], {
    style: "currency",
    currency: displayCurrency,
    maximumFractionDigits: 0,
    ...options,
  }).format(displayAmount);
}

export function formatAuthoritativeMoney(
  valueInMinorUnits: number | string | bigint,
  currency: SupportedCurrency = "GBP",
  targetCurrency: SupportedCurrency = "GBP",
  rates: CurrencyRates | null | undefined,
) {
  const authoritative = formatDisplayMoney(valueInMinorUnits, currency, currency, rates, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === targetCurrency) return authoritative;
  const converted = formatDisplayMoney(valueInMinorUnits, currency, targetCurrency, rates, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return converted === authoritative ? authoritative : `${authoritative} (approx. ${converted})`;
}

function exchangeRate(
  source: SupportedCurrency,
  target: SupportedCurrency,
  rates: CurrencyRates | null | undefined,
) {
  if (source === target) return 1;
  if (!rates || rates.baseCurrency !== "GBP") return null;
  const sourceRate = rates.rates[source];
  const targetRate = rates.rates[target];
  if (
    !Number.isFinite(sourceRate) ||
    !Number.isFinite(targetRate) ||
    sourceRate <= 0 ||
    targetRate <= 0
  )
    return null;
  return targetRate / sourceRate;
}
