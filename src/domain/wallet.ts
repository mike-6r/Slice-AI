import type { Brand, CryptoAmount, ISODateTime, Money } from "./common";
import type { UserId } from "./user";
export type Network = "ethereum" | "polygon" | "base";
export type CryptoAsset = "USDC";
export type ComplianceStatus = "not-required" | "pending" | "approved" | "blocked";
export interface WalletBalance {
  asset: CryptoAsset;
  available: CryptoAmount;
  reserved: CryptoAmount;
  fiatEquivalent: Money;
}
export interface WalletTransaction {
  id: Brand<string, "WalletTransactionId">;
  userId: UserId;
  type: "deposit" | "withdrawal" | "trade" | "distribution";
  asset: CryptoAsset;
  amount: CryptoAmount;
  status: "demo" | "pending" | "completed" | "failed";
  createdAt: ISODateTime;
}
export interface Deposit {
  id: string;
  network: Network;
  asset: CryptoAsset;
  amount: CryptoAmount;
  status: "demo" | "pending" | "completed";
}
export interface Withdrawal {
  id: string;
  network: Network;
  asset: CryptoAsset;
  amount: CryptoAmount;
  destination: string;
  complianceStatus: ComplianceStatus;
  status: "demo" | "pending" | "completed" | "rejected";
}
