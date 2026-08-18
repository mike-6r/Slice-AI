import type { ISODateTime } from "./common";

/** Safe, user-facing projection of the provider-neutral Document 016 authority. */
export type ComplianceState = "NOT_STARTED" | "PENDING" | "APPROVED" | "REVIEW" | "REJECTED";

export interface ComplianceSummary {
  status: ComplianceState;
  expiresAt: ISODateTime | null;
  updatedAt: ISODateTime | null;
  capability?: "NOT_REQUIRED_IN_CURRENT_BETA" | "NOT_CONFIGURED";
}

export interface ComplianceSession {
  status: ComplianceState;
  provider: "LOCAL_TEST" | "STRIPE_SANDBOX" | "STRIPE_LIVE";
  sessionUrl: string | null;
  capability?: "NOT_REQUIRED_IN_CURRENT_BETA" | "NOT_CONFIGURED";
}

/** Safe persisted bank connection projection. No provider secret is a UI value. */
export interface BankConnection {
  id: string;
  institutionName: string | null;
  accountName: string | null;
  accountMask: string | null;
  accountType: string;
  currency: "GBP";
  status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  updatedAt: ISODateTime;
}

export interface BankConnectionToken {
  linkToken: string;
  expiration: ISODateTime;
}

export type WalletMovementType = "DEPOSIT" | "WITHDRAWAL";
export type WalletMovementStatus =
  | "PENDING_PROVIDER"
  | "PROCESSING"
  | "SETTLED"
  | "FAILED"
  | "CANCELLED"
  | "RETURNED"
  | "MANUAL_REVIEW"
  | "HELD"
  | "REVERSED";

export interface WalletMovementView {
  id: string;
  type: WalletMovementType;
  amountMinor: string;
  currency: "GBP";
  status: WalletMovementStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  replayed: boolean;
}

export interface WalletMovementPage {
  items: WalletMovementView[];
  nextCursor: string | null;
}
