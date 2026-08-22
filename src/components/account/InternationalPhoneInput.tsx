import type { ChangeEvent } from "react";

export const PHONE_COUNTRIES = [
  ["US", "+1", "United States"],
  ["CA", "+1", "Canada"],
  ["GB", "+44", "United Kingdom"],
  ["AU", "+61", "Australia"],
  ["NZ", "+64", "New Zealand"],
  ["IE", "+353", "Ireland"],
  ["DE", "+49", "Germany"],
  ["FR", "+33", "France"],
  ["ES", "+34", "Spain"],
  ["NL", "+31", "Netherlands"],
  ["IN", "+91", "India"],
  ["JP", "+81", "Japan"],
  ["SG", "+65", "Singapore"],
  ["BR", "+55", "Brazil"],
  ["ZA", "+27", "South Africa"],
] as const;

type Props = {
  id: string;
  phone: string;
  country: string;
  onPhoneChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  disabled?: boolean;
};

export function InternationalPhoneInput({
  id,
  phone,
  country,
  onPhoneChange,
  onCountryChange,
  disabled = false,
}: Props) {
  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) =>
    onPhoneChange(event.target.value);

  return (
    <div className="international-phone-input">
      <label className="international-phone-input__country" htmlFor={`${id}-country`}>
        <span>Country (for local numbers)</span>
        <select
          id={`${id}-country`}
          className="form-control"
          value={country}
          onChange={(event) => onCountryChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">International number</option>
          {PHONE_COUNTRIES.map(([code, callingCode, name]) => (
            <option key={code} value={code}>
              {name} ({callingCode})
            </option>
          ))}
        </select>
      </label>
      <label className="international-phone-input__number" htmlFor={id}>
        <span>Phone number</span>
        <input
          id={id}
          className="form-control"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="+1 202 555 0103 or local format"
          disabled={disabled}
          required
        />
      </label>
      <small>
        Enter a number beginning with <strong>+</strong>, or choose a country to use a local format.
      </small>
    </div>
  );
}
