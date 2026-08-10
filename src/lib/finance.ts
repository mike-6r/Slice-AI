import type { BasisPoints, CryptoAmount, Money, OwnershipUnits, Percentage } from "@/domain";

export const formatMoney = (value: Money, options: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(value.amount / 100);
export const formatGbp = (minor: number) =>
  formatMoney({ amount: minor as Money["amount"], currency: "GBP" });
export const formatUsdc = (amount: CryptoAmount) =>
  `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 6 }).format(Number(amount))} USDC`;
export const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export const formatPercentage = (value: Percentage | number, signed = false) =>
  `${signed && Number(value) > 0 ? "+" : ""}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(Number(value))}%`;
export const formatRelativeTime = (value: Date | string, now = Date.now()) => {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
};
export const ownershipUnitsToPercentage = (
  units: OwnershipUnits | number,
  totalUnits: OwnershipUnits | number,
) => (Number(units) / Number(totalUnits)) * 100;
export const percentageToBasisPoints = (value: number) => Math.round(value * 100) as BasisPoints;
export const basisPointsToPercentage = (value: BasisPoints | number) => Number(value) / 100;
export const formatGrade = (company: string, label: string) => `${company} ${label}`.trim();
export const formatCertification = (value: string) =>
  value.replace(/\s+/g, " ").trim().toUpperCase();
export const slicePriceHistory = <T>(points: readonly T[], range: import("@/domain").TimeRange) =>
  points.slice(-{ "24H": 16, "7D": 28, "30D": 42, "90D": 64, "1Y": 82, ALL: points.length }[range]);
export const formatProfitLoss = (amount: Money, change: Percentage) => ({
  amount: formatMoney(amount),
  percentage: formatPercentage(change, true),
  isPositive: Number(amount.amount) >= 0,
});
