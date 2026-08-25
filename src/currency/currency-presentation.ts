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
  const convertedMinor = convertMinorForDisplay(
    valueInMinorUnits,
    sourceCurrency,
    targetCurrency,
    rates,
  );
  const displayCurrency = convertedMinor === null ? sourceCurrency : targetCurrency;
  return formatExactMinorCurrency(
    convertedMinor ?? valueInMinorUnits,
    displayCurrency,
    withFiatDefaults(options),
  );
}

/**
 * Convert minor units with integer arithmetic. Rates arrive as provider
 * decimals, but the conversion is reduced to a rational number before the
 * final minor-unit rounding so display values are deterministic and never
 * depend on a binary floating-point multiplication.
 */
export function convertMinorForDisplay(
  valueInMinorUnits: number | string | bigint,
  sourceCurrency: SupportedCurrency,
  targetCurrency: SupportedCurrency,
  rates: CurrencyRates | null | undefined,
): bigint | null {
  let minor: bigint;
  try {
    minor = BigInt(valueInMinorUnits);
  } catch {
    return null;
  }
  if (sourceCurrency === targetCurrency) return minor;
  if (!rates || rates.baseCurrency !== "GBP") return null;
  const sourceRate = decimalFraction(rates.rates[sourceCurrency]);
  const targetRate = decimalFraction(rates.rates[targetCurrency]);
  if (!sourceRate || !targetRate) return null;
  return roundRatio(
    minor * targetRate.numerator * sourceRate.denominator,
    sourceRate.numerator * targetRate.denominator,
  );
}

function withFiatDefaults(options: Intl.NumberFormatOptions) {
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  return {
    minimumFractionDigits: options.minimumFractionDigits ?? Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
    ...options,
  };
}

function decimalFraction(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const [mantissa, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ""] = mantissa!.split(".");
  const digits = `${whole}${fraction}`.replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  const scale = fraction.length - exponent;
  if (scale >= 0) {
    return { numerator: BigInt(digits), denominator: 10n ** BigInt(scale) };
  }
  return { numerator: BigInt(digits) * 10n ** BigInt(-scale), denominator: 1n };
}

function roundRatio(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) return 0n;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  return negative ? -rounded : rounded;
}

/** Keep authoritative same-currency values exact, even beyond Number's safe integer range. */
function formatExactMinorCurrency(
  valueInMinorUnits: number | string | bigint,
  currency: SupportedCurrency,
  options: Intl.NumberFormatOptions,
) {
  const minor = BigInt(valueInMinorUnits);
  const fractionDigits = Math.min(2, Math.max(0, options.maximumFractionDigits ?? 2));
  const roundingUnit = 10n ** BigInt(2 - fractionDigits);
  const absoluteMinor = minor < 0n ? -minor : minor;
  const roundedMinor = ((absoluteMinor + roundingUnit / 2n) / roundingUnit) * roundingUnit;
  const whole = roundedMinor / 100n;
  const formatter = new Intl.NumberFormat(currencyLocales[currency], {
    style: "currency",
    currency,
    ...options,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const parts = formatter.formatToParts(minor < 0n ? -whole : whole);
  if (fractionDigits === 0) return parts.map((part) => part.value).join("");
  const fraction = String((roundedMinor % 100n) / roundingUnit).padStart(fractionDigits, "0");
  const lastNumber = Math.max(
    ...parts.map((part, index) => (part.type === "integer" || part.type === "group" ? index : -1)),
  );
  parts.splice(
    lastNumber + 1,
    0,
    { type: "decimal", value: "." },
    { type: "fraction", value: fraction },
  );
  return parts.map((part) => part.value).join("");
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
