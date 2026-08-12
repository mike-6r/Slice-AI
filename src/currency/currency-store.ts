import type { CurrencyRates, SupportedCurrency } from "@/data/repositories";

let presentation: { currency: SupportedCurrency; rates: CurrencyRates | null } = {
  currency: "GBP",
  rates: null,
};

export function setCurrencyPresentation(currency: SupportedCurrency, rates: CurrencyRates | null) {
  presentation = { currency, rates };
}

export function getCurrencyPresentation() {
  return presentation;
}
