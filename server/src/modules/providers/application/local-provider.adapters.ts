import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IdentityVerificationProvider, TransactionScreeningProvider, WebhookVerifier } from '../domain/provider.types';

export class LocalIdentityVerificationAdapter implements IdentityVerificationProvider {
  async createSession(input: { userId: string; requestId: string }) { return { providerReference: `local-kyc:${input.userId}:${input.requestId}`, sessionUrl: null, status: 'PENDING' as const }; }
}
export class LocalTransactionScreeningAdapter implements TransactionScreeningProvider {
  async screen(input: { address: string; currency: string }) {
    const upper = input.address.toUpperCase();
    const decision = upper.includes('SANCTION') || upper.includes('HIGH') ? 'BLOCK' : upper.includes('MEDIUM') ? 'MANUAL_REVIEW' : 'ALLOW';
    return { decision: decision as 'ALLOW' | 'MANUAL_REVIEW' | 'BLOCK', providerReference: `local-kyt:${input.address}`, reasonCode: `LOCAL_${decision}` };
  }
}
/** HMAC local adapter is deterministic test infrastructure, never sandbox certification. */
export class LocalWebhookVerifier implements WebhookVerifier {
  constructor(private readonly secret: string, private readonly toleranceSeconds = 300) {}
  async verify(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; now: Date }) {
    const timestamp = String(input.headers['x-provider-timestamp'] ?? ''); const signature = String(input.headers['x-provider-signature'] ?? '');
    const epoch = Number(timestamp); if (!Number.isInteger(epoch) || Math.abs(input.now.getTime() - epoch * 1000) > this.toleranceSeconds * 1000) throw new Error('WEBHOOK_TIMESTAMP_INVALID');
    const expected = createHmac('sha256', this.secret).update(`${timestamp}.`).update(input.rawBody).digest('hex');
    const supplied = Buffer.from(signature, 'hex'); const candidate = Buffer.from(expected, 'hex');
    if (supplied.length !== candidate.length || !timingSafeEqual(supplied, candidate)) throw new Error('WEBHOOK_SIGNATURE_INVALID');
    const payload = JSON.parse(input.rawBody.toString('utf8')) as Record<string, unknown>;
    if (typeof payload.eventId !== 'string' || typeof payload.type !== 'string') throw new Error('WEBHOOK_PAYLOAD_INVALID');
    return { eventId: payload.eventId, eventType: payload.type, occurredAt: new Date(epoch * 1000), payload };
  }
}
