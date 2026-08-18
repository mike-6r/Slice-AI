import type { ProviderCode } from '@prisma/client';

/** Normalized lifecycle vocabulary used by Slice, independent of provider SDKs. */
export type NormalizedMoneyMovementStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SETTLED'
  | 'FAILED'
  | 'RETURNED'
  | 'CANCELLED';

export type MoneyMovementProviderEvent = Readonly<{
  eventId: string;
  movementId: string;
  providerReference?: string;
  status: NormalizedMoneyMovementStatus;
  reasonCode?: string;
}>;

type ProviderMovementStatus = Readonly<{
  providerReference: string;
  status: 'PENDING' | 'PROCESSING' | 'SETTLED' | 'FAILED' | 'RETURNED' | 'CANCELLED';
}>;

/** Provider-neutral seam for local/test and future external money providers. */
export interface MoneyMovementProvider {
  readonly code: ProviderCode;
  createDeposit(input: { movementId: string; amountMinor: string; currency: 'GBP' }): Promise<{ providerReference: string; status: 'PENDING' }>;
  getDeposit(input: { movementId: string; providerReference: string }): Promise<ProviderMovementStatus>;
  createWithdrawal(input: { movementId: string; amountMinor: string; currency: 'GBP'; destinationReference: string }): Promise<{ providerReference: string; status: 'PENDING' }>;
  getWithdrawal(input: { movementId: string; providerReference: string }): Promise<ProviderMovementStatus>;
  cancelMovement(input: { movementId: string; providerReference?: string }): Promise<{ status: 'CANCELLED' }>;
  parseWebhookEvent(input: { eventId: string; movementId: string; providerReference?: string; status: string; reasonCode?: string }): MoneyMovementProviderEvent;
  verifyWebhook(input: { rawBody: string; signature?: string }): boolean;
  normalizeStatus(status: string): NormalizedMoneyMovementStatus;
}

/** Local-only adapter. It never performs network I/O or creates real money. */
export class LocalTestMoneyMovementProvider implements MoneyMovementProvider {
  readonly code = 'LOCAL_TEST' as const;

  async createDeposit(input: { movementId: string; amountMinor: string; currency: 'GBP' }) {
    void input.amountMinor;
    void input.currency;
    return { providerReference: `local-test:deposit:${input.movementId}`, status: 'PENDING' as const };
  }

  async getDeposit(input: { movementId: string; providerReference: string }) {
    void input.movementId;
    return { providerReference: input.providerReference, status: 'PENDING' as const };
  }

  async createWithdrawal(input: { movementId: string; amountMinor: string; currency: 'GBP'; destinationReference: string }) {
    void input.amountMinor;
    void input.currency;
    void input.destinationReference;
    return { providerReference: `local-test:withdrawal:${input.movementId}`, status: 'PENDING' as const };
  }

  async getWithdrawal(input: { movementId: string; providerReference: string }) {
    void input.movementId;
    return { providerReference: input.providerReference, status: 'PENDING' as const };
  }

  async cancelMovement(input: { movementId: string; providerReference?: string }) {
    void input;
    return { status: 'CANCELLED' as const };
  }

  parseWebhookEvent(input: { eventId: string; movementId: string; providerReference?: string; status: string; reasonCode?: string }) {
    return {
      eventId: input.eventId,
      movementId: input.movementId,
      providerReference: input.providerReference,
      status: this.normalizeStatus(input.status),
      reasonCode: input.reasonCode,
    };
  }

  verifyWebhook(input: { rawBody: string; signature?: string }) {
    void input.rawBody;
    void input.signature;
    return true;
  }

  normalizeStatus(status: string): NormalizedMoneyMovementStatus {
    const normalized = status.trim().toUpperCase();
    if (['PENDING', 'PENDING_PROVIDER', 'CREATED'].includes(normalized)) return 'PENDING';
    if (['PROCESSING', 'IN_PROGRESS'].includes(normalized)) return 'PROCESSING';
    if (['SETTLED', 'COMPLETED', 'SUCCEEDED', 'PAYMENT_PROCESSED'].includes(normalized)) return 'SETTLED';
    if (['RETURNED', 'REFUNDED', 'REVERSED'].includes(normalized)) return 'RETURNED';
    if (['CANCELLED', 'CANCELED'].includes(normalized)) return 'CANCELLED';
    return 'FAILED';
  }
}

export function moneyMovementProviderCode(mode: 'local' | 'stripe_sandbox' | 'stripe_live'): ProviderCode {
  if (mode === 'local') return 'LOCAL_TEST';
  return mode === 'stripe_live' ? 'STRIPE_LIVE' : 'STRIPE_SANDBOX';
}
