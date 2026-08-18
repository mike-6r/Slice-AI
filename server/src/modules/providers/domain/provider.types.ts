/** Active provider codes. Legacy enum values remain readable in persistence only. */
export type ProviderName = 'LOCAL_TEST' | 'STRIPE_SANDBOX' | 'STRIPE_LIVE';
export type NormalizedComplianceStatus = 'NOT_STARTED' | 'PENDING' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'MANUAL_REVIEW' | 'SUSPENDED';
export type RiskDecision = 'ALLOW' | 'MANUAL_REVIEW' | 'BLOCK';
export type NormalizedMovementStatus = 'CREATED' | 'PENDING_PROVIDER' | 'PROCESSING' | 'SETTLED' | 'FAILED' | 'CANCELLED' | 'RETURNED' | 'REVERSED' | 'MANUAL_REVIEW' | 'HELD';

/** SDK DTOs remain inside adapters; this is the sole provider-neutral contract. */
export interface IdentityVerificationProvider {
  createSession(input: { userId: string; requestId: string }): Promise<{ providerReference: string; sessionUrl: string | null; status: NormalizedComplianceStatus }>;
  getIdentityVerification?(verificationId: string): Promise<{ status: NormalizedComplianceStatus; sessionUrl: string | null }>;
}
export interface TransactionScreeningProvider {
  screen(input: { address: string; currency: string; chain?: string; from?: string }): Promise<{ decision: RiskDecision; providerReference: string; reasonCode: string }>;
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
