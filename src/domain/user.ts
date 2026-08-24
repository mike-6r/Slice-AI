import type { ISODateTime } from "./common";

export type UserId = import("./common").Brand<string, "UserId">;
export type UserVerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type KycStatus = "not-started" | "in-review" | "approved" | "rejected" | "expired";
export type AccountStatus = "active" | "restricted" | "suspended" | "closed";

export interface User {
  id: UserId;
  email: string;
  handle: string;
  createdAt: ISODateTime;
  accountStatus: AccountStatus;
}

export interface UserProfile {
  userId: UserId;
  displayName: string;
  avatarUrl?: string;
  countryCode: "GB";
  verificationStatus: UserVerificationStatus;
  kycStatus: KycStatus;
}

export type AccountCapabilityName =
  | "BROWSE_MARKETS"
  | "VIEW_PUBLIC_ASSETS"
  | "VIEW_COLLECTORS"
  | "VIEW_VAULT_LIVE"
  | "VIEW_PORTFOLIO"
  | "MANAGE_PROFILE"
  | "MANAGE_ACCOUNT_SECURITY"
  | "LINK_BANK"
  | "DEPOSIT_FUNDS"
  | "WITHDRAW_FUNDS"
  | "PLACE_BUY_ORDER"
  | "PLACE_SELL_ORDER"
  | "LIST_ASSET";

export type AccountCapabilityReason =
  | "EMAIL_VERIFICATION_REQUIRED"
  | "PHONE_VERIFICATION_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "IDENTITY_VERIFICATION_REQUIRED"
  | "COMPLIANCE_REVIEW_REQUIRED"
  | "BANK_ACCOUNT_REQUIRED"
  | "PAYOUT_ACCOUNT_REQUIRED"
  | "PAYOUT_ACCOUNT_REVIEW_REQUIRED"
  | "COLLECTOR_PAYOUTS_REQUIRED"
  | "TRADING_UNAVAILABLE"
  | "DEPOSITS_UNAVAILABLE"
  | "WITHDRAWALS_UNAVAILABLE"
  | "ACCOUNT_RESTRICTED"
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_DELETION_PENDING"
  | "ACCOUNT_REVIEW_REQUIRED"
  | "FEATURE_DISABLED";

export type AccountCapabilityStatus =
  "AVAILABLE" | "ACTION_REQUIRED" | "TEMPORARILY_UNAVAILABLE" | "BLOCKED";

export interface AccountCapability {
  capability: AccountCapabilityName;
  allowed: boolean;
  status: AccountCapabilityStatus;
  reason: AccountCapabilityReason | null;
  requirements: Array<{
    type: string;
    satisfied: boolean;
  }>;
}
