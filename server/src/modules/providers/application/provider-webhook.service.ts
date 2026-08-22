import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { LocalWebhookVerifier } from './local-provider.adapters';
import { ComplianceService } from './compliance.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { WalletMovementService } from './wallet-movement.service';
import { BankConnectionService, providerUnavailable, type ActiveProviderCode } from './external-provider-boundaries';
import { StripeClientFactory } from './stripe-provider.client';
import { StripeConnectPayoutService } from './stripe-connect-payout.service';
import { CollectorMembershipService } from './collector-membership.service';

type Provider = ActiveProviderCode;

/**
 * Raw-body inbox boundary: local mode uses the deterministic verifier and
 * Stripe modes use the shared Stripe signature/livemode boundary. Identity,
 * payment, and Connect events are dispatched internally from this inbox.
 */
@Injectable()
export class ProviderWebhookService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    private readonly compliance: ComplianceService,
    private readonly movements: WalletMovementService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly stripeFactory: StripeClientFactory,
    private readonly bankLinks: BankConnectionService,
    private readonly connectPayouts: StripeConnectPayoutService,
    private readonly memberships: CollectorMembershipService,
  ) {}

  async receive(input: {
    provider: Provider;
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
    requestId: string;
  }) {
    const verified = await this.verify(input.provider, input.rawBody, input.headers);
    const eventHash = this.crypto.hash(verified.eventId);
    const payloadHash = this.crypto.hash(input.rawBody.toString('base64'));
    let inboxId: string;
    try {
      const inbox = await this.db.webhookInbox.create({
        data: {
          id: randomUUID(), provider: input.provider,
          providerEventIdHash: eventHash, eventType: verified.eventType,
          payloadCiphertext: this.crypto.encrypt(input.rawBody.toString('base64'), `webhook:${input.provider}:${eventHash}`),
          payloadHash, encryptionKeyVersion: this.crypto.keyVersion,
          signatureVerified: true,
        },
      });
      inboxId = inbox.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { accepted: true, replayed: true };
      }
      throw error;
    }
    try {
      await this.process(input.provider, verified.eventType, verified.payload, verified.eventId, verified.occurredAt, input.requestId);
      await this.db.webhookInbox.update({ where: { id: inboxId }, data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 } } });
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 96) : 'WEBHOOK_PROCESSING_FAILED';
      await this.db.webhookInbox.update({ where: { id: inboxId }, data: { status: 'FAILED', errorCode, attempts: { increment: 1 } } });
      throw error;
    }
    await this.db.$transaction(async (db) => {
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(), actorUserId: null, actorType: 'SYSTEM', action: 'PROVIDER_WEBHOOK_ACCEPTED',
        resourceType: 'provider-webhook', resourceId: inboxId, requestId: input.requestId,
        sessionId: null, result: 'SUCCESS', metadata: { provider: input.provider, eventType: verified.eventType }, createdAt: new Date(),
      });
    });
    return { accepted: true, replayed: false };
  }

  private async verify(provider: Provider, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    if (provider === 'STRIPE_SANDBOX' || provider === 'STRIPE_LIVE') {
      if ((provider === 'STRIPE_SANDBOX') !== (this.config.providerMode === 'stripe_sandbox')) throw providerUnavailable(provider, 'Stripe webhook environment does not match the active provider mode.');
      if (!this.config.stripeWebhookSecret) throw providerUnavailable(provider, 'Stripe webhook secret is not configured.');
      const signature = headers['stripe-signature'];
      if (!signature || Array.isArray(signature)) throw new BadRequestException({ code: 'STRIPE_SIGNATURE_REQUIRED', message: 'Stripe signature is required.' });
      try {
        const event = this.stripeFactory.get().webhooks.constructEvent(rawBody, signature, this.config.stripeWebhookSecret);
        if (event.livemode !== (this.config.providerMode === 'stripe_live')) throw new BadRequestException({ code: 'STRIPE_LIVEMODE_MISMATCH', message: 'Stripe event belongs to another environment.' });
        return { eventId: event.id, eventType: event.type, occurredAt: new Date(event.created * 1000), payload: { ...(event.data.object as unknown as Record<string, unknown>), __livemode: event.livemode } };
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException({ code: 'STRIPE_SIGNATURE_INVALID', message: 'Stripe webhook signature is invalid.' });
      }
    }
    if (provider !== 'LOCAL_TEST' || this.config.providerMode !== 'local') {
      throw providerUnavailable(provider, 'External webhook verification is not enabled yet.');
    }
    const active = this.config.providerWebhookSigningSecret ?? 'slice-local-webhook-signing-secret-not-production';
    const previousAllowed = this.config.providerWebhookPreviousSigningSecret && (!this.config.providerWebhookPreviousSecretExpiresAt || this.config.providerWebhookPreviousSecretExpiresAt > new Date());
    const candidates = [active, previousAllowed ? this.config.providerWebhookPreviousSigningSecret : undefined].filter((value): value is string => Boolean(value));
    for (const secret of candidates) {
      try {
        return await new LocalWebhookVerifier(secret, this.config.providerWebhookToleranceSeconds).verify({ rawBody, headers, now: new Date() });
      } catch (error) {
        if (error instanceof Error && error.message === 'WEBHOOK_TIMESTAMP_INVALID') {
          throw new BadRequestException({ code: 'WEBHOOK_TIMESTAMP_INVALID', message: 'Webhook timestamp is invalid.' });
        }
        if (!(error instanceof Error) || error.message !== 'WEBHOOK_SIGNATURE_INVALID') throw error;
      }
    }
    throw new BadRequestException({ code: 'WEBHOOK_SIGNATURE_INVALID', message: 'Webhook signature is invalid.' });
  }

  private async process(provider: Provider, type: string, payload: Record<string, unknown>, eventId: string, occurredAt: Date, requestId: string) {
    if (provider === 'STRIPE_SANDBOX' || provider === 'STRIPE_LIVE') {
      await this.processStripeMovement(provider, type, payload, eventId, occurredAt, requestId);
      return;
    }
    if (type.startsWith('compliance.')) {
      const userId = this.text(payload.userId);
      const status = ({ 'compliance.approved': 'APPROVED', 'compliance.rejected': 'REJECTED', 'compliance.review': 'MANUAL_REVIEW' } as const)[type];
      if (!userId || !status) return;
      await this.compliance.ingestProviderDecision(userId, status, this.text(payload.reasonCode) ?? 'PROVIDER_DECISION', eventId, requestId);
      return;
    }
    if (type.startsWith('movement.')) {
      const movementId = this.text(payload.movementId);
      if (!movementId) return;
      if (type === 'movement.completed') {
        const reference = this.text(payload.providerReference);
        if (!reference) throw new BadRequestException({ code: 'WEBHOOK_PAYLOAD_INVALID', message: 'Provider reference is required.' });
        await this.movements.completeFromProvider({ movementId, providerReference: reference, providerEventId: eventId, requestId });
      } else if (type === 'movement.failed') {
        await this.movements.failFromProvider({ movementId, reasonCode: this.text(payload.reasonCode) ?? 'PROVIDER_FAILED', requestId });
      } else if (type === 'movement.review') {
        await this.movements.holdFromProvider({ movementId, reasonCode: this.text(payload.reasonCode) ?? 'PROVIDER_REVIEW', requestId });
      } else if (type === 'movement.returned') {
        await this.movements.returnFromProvider({ movementId, reasonCode: this.text(payload.reasonCode) ?? 'PROVIDER_RETURNED', requestId });
      } else if (type === 'movement.reversed') {
        await this.movements.reverseFromProvider({ movementId, reasonCode: this.text(payload.reasonCode) ?? 'PROVIDER_REVERSAL', requestId });
      } else if (type === 'movement.cancelled') {
        await this.movements.cancelFromProvider({ movementId, reasonCode: this.text(payload.reasonCode) ?? 'PROVIDER_CANCELLED', requestId });
      }
      return;
    }
    // Unknown signed events stay durably recorded but never mutate authority.
    void provider;
  }

  private async processStripeMovement(provider: Provider, type: string, payload: Record<string, unknown>, eventId: string, occurredAt: Date, requestId: string) {
    if (type === 'checkout.session.completed' && payload.mode === 'subscription') {
      await this.memberships.handleWebhook(type, payload, eventId, occurredAt);
      return;
    }
    if (type.startsWith('customer.subscription.') || type === 'invoice.paid' || type === 'invoice.payment_failed' || type === 'invoice.payment_action_required') {
      await this.memberships.handleWebhook(type, payload, eventId, occurredAt);
      return;
    }
    const connectEffect = await this.connectPayouts.processWebhook(provider as 'STRIPE_SANDBOX' | 'STRIPE_LIVE', type, payload);
    if (connectEffect) {
      if (connectEffect.action === 'PROCESSING') await this.movements.processingFromProvider({ movementId: connectEffect.movementId, requestId });
      else if (connectEffect.action === 'COMPLETE' && connectEffect.providerReference) await this.movements.completeFromProvider({ movementId: connectEffect.movementId, providerReference: connectEffect.providerReference, providerEventId: eventId, requestId });
      else if (connectEffect.action === 'FAIL') await this.movements.failFromProvider({ movementId: connectEffect.movementId, reasonCode: connectEffect.reasonCode ?? 'STRIPE_PAYOUT_FAILED', requestId });
      else if (connectEffect.action === 'HOLD') await this.movements.holdFromProvider({ movementId: connectEffect.movementId, reasonCode: connectEffect.reasonCode ?? 'STRIPE_PAYOUT_REVIEW', requestId });
      return;
    }
    if (type === 'checkout.session.completed') {
      const checkoutSessionId = this.text(payload.id);
      if (checkoutSessionId) await this.bankLinks.completeCheckoutSession(provider, checkoutSessionId);
      return;
    }
    if (type.startsWith('setup_intent.')) {
      const setupIntentId = this.text(payload.id);
      const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : {};
      if (setupIntentId) await this.bankLinks.processSetupIntentEvent(provider, setupIntentId, this.text(payload.status) ?? type.split('.').at(-1) ?? 'processing', this.text(metadata.slice_bacs_setup_session_id) ?? undefined);
      return;
    }
    if (type === 'mandate.updated') return;
    if (type.startsWith('identity.verification_session.')) {
      const providerReference = this.text(payload.id);
      if (!providerReference) return;
      const lastError = payload.last_error && typeof payload.last_error === 'object' ? (payload.last_error as Record<string, unknown>).code : null;
      await this.compliance.ingestIdentityProviderEvent({ provider, providerReference, providerStatus: this.text(payload.status) ?? type.split('.').at(-1) ?? 'failed', failureCode: this.text(lastError), providerEventId: eventId, occurredAt, requestId });
      return;
    }
    if (type === 'account.updated') return;
    const isPaymentIntentEvent = type.startsWith('payment_intent.');
    const isBacsReturnEvent = type === 'charge.dispute.created' || type === 'charge.dispute.funds_withdrawn' || type === 'charge.refunded';
    if (!isPaymentIntentEvent && !isBacsReturnEvent) return;
    const paymentIntentId = isPaymentIntentEvent ? this.text(payload.id) : this.providerObjectId(payload.payment_intent);
    if (!paymentIntentId) return;
    const metadata = (payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}) as Record<string, unknown>;
    const movementId = this.text(metadata.slice_movement_id) ?? (await this.db.moneyMovement.findUnique({ where: { provider_providerReferenceHash: { provider, providerReferenceHash: this.crypto.hash(paymentIntentId) } }, select: { id: true } }))?.id;
    if (!movementId) return;
    const current = await this.db.moneyMovement.findUnique({ where: { id: movementId }, select: { status: true, provider: true } });
    if (!current || current.provider !== provider) return;
    if (['SETTLED', 'FAILED', 'CANCELLED', 'RETURNED', 'REVERSED', 'MANUAL_REVIEW', 'HELD'].includes(current.status)) return;
    if (isBacsReturnEvent) {
      const returnedAmount = typeof payload.amount === 'number'
        ? payload.amount
        : typeof payload.amount_refunded === 'number'
          ? payload.amount_refunded
          : null;
      const movement = await this.db.moneyMovement.findUnique({ where: { id: movementId }, select: { amountMinor: true, currency: true } });
      if (!movement || movement.currency !== 'GBP' || returnedAmount === null || BigInt(returnedAmount) !== movement.amountMinor) {
        throw new BadRequestException({ code: 'STRIPE_RETURN_AMOUNT_MISMATCH', message: 'The provider return requires reconciliation review.' });
      }
      await this.movements.returnFromProvider({ movementId, reasonCode: `STRIPE_${type.replaceAll('.', '_').toUpperCase()}`, requestId });
    } else if (type === 'payment_intent.processing' || type === 'payment_intent.requires_action') {
      await this.movements.processingFromProvider({ movementId, requestId });
    } else if (type === 'payment_intent.succeeded') {
      await this.movements.completeFromProvider({ movementId, providerReference: paymentIntentId, providerEventId: eventId, requestId });
    } else if (type === 'payment_intent.payment_failed') {
      const error = payload.last_payment_error && typeof payload.last_payment_error === 'object' ? (payload.last_payment_error as Record<string, unknown>).code : undefined;
      await this.movements.failFromProvider({ movementId, reasonCode: this.text(error) ?? 'STRIPE_PAYMENT_FAILED', requestId });
    } else if (type === 'payment_intent.canceled') {
      await this.movements.cancelFromProvider({ movementId, reasonCode: 'STRIPE_PAYMENT_CANCELED', requestId });
    }
  }

  private providerObjectId(value: unknown) {
    return typeof value === 'string' ? value : value && typeof value === 'object' ? this.text((value as Record<string, unknown>).id) : null;
  }

  private text(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : null; }
}
