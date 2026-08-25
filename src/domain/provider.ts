import type { ISODateTime } from "./common";

/** Safe, user-facing projection of the provider-neutral Document 016 authority. */
export type ComplianceState = "NOT_STARTED" | "PENDING" | "APPROVED" | "REVIEW" | "REJECTED";
export type IdentityVerificationState =
  "NOT_STARTED" | "REQUIRES_INPUT" | "PROCESSING" | "VERIFIED" | "FAILED" | "CANCELED";

export interface ComplianceSummary {
  status: ComplianceState;
  identityState?: IdentityVerificationState;
  provider?: "LOCAL_TEST" | "STRIPE_SANDBOX" | "STRIPE_LIVE";
  expiresAt: ISODateTime | null;
  updatedAt: ISODateTime | null;
  capability?: "NOT_REQUIRED_IN_CURRENT_BETA" | "NOT_CONFIGURED";
}

export interface ComplianceSession {
  status: ComplianceState;
  identityState?: IdentityVerificationState;
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
  riskState?:
    | "CLEAR"
    | "SHARED_INSTRUMENT_REVIEW"
    | "DUPLICATE_INSTRUMENT_BLOCKED"
    | "MANUAL_REVIEW_REQUIRED";
  isDefault: boolean;
  updatedAt: ISODateTime;
}

export interface BankConnectionCheckoutSession {
  checkoutSessionId: string;
  checkoutUrl: string;
  expiration: ISODateTime;
  paymentMethodType: "bacs_debit";
  replayed: boolean;
}

export type ConnectAccountStatus =
  "NOT_STARTED" | "ACTION_REQUIRED" | "UNDER_REVIEW" | "READY" | "RESTRICTED" | "DISABLED";
export interface ConnectPayoutSetup {
  status: ConnectAccountStatus;
  requirementsSummary: {
    currentlyDueCount: number;
    pastDueCount: number;
    pendingVerificationCount: number;
    hasValidationErrors: boolean;
    hasDisabledReason: boolean;
  } | null;
  onboardingUrl: string | null;
  expiresAt: ISODateTime | null;
}

export type ProviderLiquidityStatus =
  | "AVAILABLE"
  | "INSUFFICIENT"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE";

export interface WithdrawalPreflight {
  currency: "GBP";
  walletAvailableMinor: string;
  customerEligibleMinor: string;
  withdrawableMinor: string;
  settlingMinor: string;
  reservedMinor: string;
  grossMinor: string;
  feeMinor: string;
  netPayoutMinor: string;
  customerEligibilityStatus: "AVAILABLE" | "MATURITY_PENDING" | "INSUFFICIENT_CASH";
  providerLiquidityStatus: ProviderLiquidityStatus;
  nextAvailabilityAt: ISODateTime | null;
  checkedAt: ISODateTime;
}

/** Backend-authoritative fee disclosure used before customer actions. */
export interface FeePolicy {
  currency: "GBP";
  movementScheduleVersion: string;
  deposit: { sliceFeeBps: number; providerFeeSeparate: boolean };
  withdrawal: { sliceFeeBps: number; providerFeeSeparate: boolean };
  secondaryTrading: { scheduleVersion: string; makerFeeBps: number; takerFeeBps: number };
  initialOffering: { scheduleVersion: string; feeBps: number };
}

export type WalletMovementType = "DEPOSIT" | "WITHDRAWAL";
export type WalletMovementStatus =
  | "CREATED"
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
  sliceFeeMinor?: string;
  providerAmountMinor?: string;
  currency: "GBP";
  status: WalletMovementStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  replayed: boolean;
  sourceLabel?: string | null;
  reference?: string | null;
}

export interface WalletMovementPage {
  items: WalletMovementView[];
  nextCursor: string | null;
}
