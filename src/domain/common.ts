/** Financial primitives used at frontend data boundaries. */
export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type CurrencyCode = "GBP" | "USD" | "EUR";
export type MinorUnits = Brand<number, "MinorUnits">;
export type CryptoAmount = Brand<string, "CryptoAmount">;
export type Percentage = Brand<number, "Percentage">;
export type BasisPoints = Brand<number, "BasisPoints">;
export type OwnershipUnits = Brand<number, "OwnershipUnits">;
export type ISODateTime = Brand<string, "ISODateTime">;

export interface Money {
  amount: MinorUnits;
  currency: CurrencyCode;
}

export const minorUnits = (value: number): MinorUnits => {
  if (!Number.isSafeInteger(value)) throw new Error("Minor units must be a safe integer.");
  return value as MinorUnits;
};

export const cryptoAmount = (value: string): CryptoAmount => {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Crypto amount must be a decimal string.");
  return value as CryptoAmount;
};

export const percentage = (value: number): Percentage => {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error("Percentage must be 0–100.");
  return value as Percentage;
};

export const basisPoints = (value: number): BasisPoints => {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error("Basis points must be an integer from 0 to 10,000.");
  }
  return value as BasisPoints;
};

export const ownershipUnits = (value: number): OwnershipUnits => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Ownership units must be non-negative.");
  return value as OwnershipUnits;
};
