import { useId } from "react";
import { useCurrency } from "./CurrencyProvider";
import { supportedCurrencies } from "./currency-presentation";

export function CurrencySelector({ className = "" }: { className?: string }) {
  const id = useId();
  const { currency, setCurrency, ratesAvailable, preferenceError } = useCurrency();
  return (
    <label className={`currency-selector ${className}`.trim()} htmlFor={id}>
      <span>Display currency</span>
      <select
        id={id}
        value={currency}
        onChange={(event) => setCurrency(event.target.value as typeof currency)}
      >
        {supportedCurrencies.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      {!ratesAvailable && currency !== "GBP" ? (
        <small>Showing GBP until live FX is available.</small>
      ) : null}
      {preferenceError ? <small role="status">{preferenceError}</small> : null}
    </label>
  );
}
