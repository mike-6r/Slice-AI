import type { WalletMovementView } from "@/domain";
import { formatDisplayMoney } from "@/currency/currency-presentation";
import { getCurrencyPresentation } from "@/currency/currency-store";

export type WalletMovementFilter = "ALL" | "DEPOSIT" | "WITHDRAWAL";

export function formatWalletMoney(value: string) {
  const { currency, rates } = getCurrencyPresentation();
  return formatDisplayMoney(value, "GBP", currency, rates, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseWalletGbp(value: string) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return (BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))).toString();
}

/** Display-only insight from settled provider movements. Pending/failed records are excluded. */
export function settledMovementFlow(items: WalletMovementView[]) {
  const settled = items.filter((item) => item.status === "SETTLED");
  if (!settled.length) return null;
  const inflow = settled
    .filter((item) => item.type === "DEPOSIT")
    .reduce((total, item) => total + BigInt(item.amountMinor), 0n);
  const outflow = settled
    .filter((item) => item.type === "WITHDRAWAL")
    .reduce((total, item) => total + BigInt(item.amountMinor), 0n);
  if (inflow === 0n && outflow === 0n) return null;
  return { inflowMinor: inflow.toString(), outflowMinor: outflow.toString() };
}

export function filterWalletMovements(items: WalletMovementView[], filter: WalletMovementFilter) {
  return filter === "ALL" ? items : items.filter((item) => item.type === filter);
}

export function walletAccessPresentation(
  complianceStatus: string | undefined,
  connectedBank: boolean,
) {
  if (complianceStatus !== "APPROVED") {
    return { status: "RESTRICTED", detail: "Complete identity verification to request a movement" };
  }
  if (!connectedBank) {
    return {
      status: "AVAILABLE",
      detail: "Deposits are available; connect a bank for withdrawals",
    };
  }
  return { status: "AVAILABLE", detail: "Deposit and withdrawal requests are available" };
}

export const WALLET_EMPTY_STATES = {
  bank: "No bank connected.",
  movements: "No money movements yet.",
  insights: "Wallet insights unavailable.",
  activity: "No recent wallet activity.",
} as const;

export const WALLET_ERROR_STATES = {
  cash: "Unable to load wallet balances.",
  compliance: "Unable to load verification status.",
  bank: "Unable to load bank connections.",
  movements: "Unable to load money movements.",
} as const;
