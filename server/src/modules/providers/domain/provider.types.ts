/** Active provider codes. Legacy enum values remain readable in persistence only. */
export type ProviderName = 'LOCAL_TEST' | 'STRIPE_SANDBOX' | 'STRIPE_LIVE';
export type NormalizedComplianceStatus = 'NOT_STARTED' | 'PENDING' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'MANUAL_REVIEW' | 'SUSPENDED';
export type IdentityVerificationState = 'NOT_STARTED' | 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'FAILED' | 'CANCELED';
export type RiskDecision = 'ALLOW' | 'MANUAL_REVIEW' | 'BLOCK';
export type NormalizedMovementStatus = 'CREATED' | 'PENDING_PROVIDER' | 'PROCESSING' | 'SETTLED' | 'FAILED' | 'CANCELLED' | 'RETURNED' | 'REVERSED' | 'MANUAL_REVIEW' | 'HELD';

/**
 * Customer-safe identity fields returned only after a verified session. This
 * deliberately excludes document images, document numbers, raw provider
 * payloads, and provider references.
 */
export interface VerifiedIdentityDetails {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string | null;
  } | null;
}

/** SDK DTOs remain inside adapters; this is the sole provider-neutral contract. */
export interface IdentityVerificationProvider {
  createSession(input: { userId: string; requestId: string; idempotencyKey?: string }): Promise<{ providerReference: string; sessionUrl: string | null; status: NormalizedComplianceStatus; identityState?: IdentityVerificationState }>;
  getIdentityVerification?(verificationId: string): Promise<{ status: NormalizedComplianceStatus; sessionUrl: string | null; identityState?: IdentityVerificationState; safeFailureCode?: string | null; verifiedDetails?: VerifiedIdentityDetails | null }>;
}
export interface TransactionScreeningProvider {
  screen(input: { address: string; currency: string; chain?: string; from?: string }): Promise<{ decision: RiskDecision; providerReference: string; reasonCode: string }>;
}

/**
 * Future compliance-provider boundaries. These contracts deliberately do not
 * claim that Stripe Identity, Connect, or the current transaction adapter
 * performs sanctions, PEP, fraud, or AML monitoring for Slice.
 */
export interface SanctionsScreeningProvider {
  screen(input: { subjectId: string; name?: string; countryCode?: string }): Promise<{
    decision: RiskDecision;
    providerReference: string;
    reasonCode: string;
  }>;
}

export interface RiskScreeningProvider {
  evaluate(input: {
    subjectId: string;
    operation: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE' | 'PAYOUT';
    amountMinor?: string;
    currency?: string;
  }): Promise<{
    decision: RiskDecision;
    providerReference: string;
    reasonCode: string;
  }>;
}

export type ComplianceRiskEventType =
  | 'DEPOSIT_INITIATED'
  | 'DEPOSIT_SETTLED'
  | 'WITHDRAWAL_INITIATED'
  | 'WITHDRAWAL_SETTLED'
  | 'TRADE_SETTLED'
  | 'OWNERSHIP_CHANGED'
  | 'PROVIDER_ATTEMPT_FAILED'
  | 'MOVEMENT_REVERSED';

/** Provider-neutral internal signal surface; it assigns no suspiciousness. */
export type ComplianceRiskEvent = Readonly<{
  type: ComplianceRiskEventType;
  subjectId: string;
  aggregateType: 'money-movement' | 'trading-execution' | 'ownership-account';
  aggregateId: string;
  occurredAt: Date;
  source: 'SYSTEM' | 'PROVIDER' | 'ADMIN';
  amountMinor?: string;
  currency?: string;
  reasonCode?: string;
}>;

export interface ComplianceRiskEventSink {
  publish(event: ComplianceRiskEvent): Promise<void>;
}
export interface WebhookVerifier {
  verify(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; now: Date }): Promise<{ eventId: string; eventType: string; occurredAt: Date; payload: Record<string, unknown> }>;
}

export type ProviderFailureKind = 'VALIDATION' | 'AUTHENTICATION' | 'RATE_LIMIT' | 'TEMPORARY' | 'TIMEOUT' | 'REJECTED';
export type ProviderCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export interface ExternalMovementProvider {
  createDeposit(input: { movementId: string; amountMinor: string; currency: 'GBP' }): Promise<{ providerReference: string; status: 'PENDING' }>;
  createWithdrawal(input: { movementId: string; amountMinor: string; currency: 'GBP' }): Promise<{ providerReference: string; status: 'PENDING' }>;
  lookup(input: { providerReference: string }): Promise<{ status: NormalizedMovementStatus }>;
}
