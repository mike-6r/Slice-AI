import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { LocalWebhookVerifier } from './local-provider.adapters';
import { BridgeWebhookVerifier } from './bridge.adapter';
import { PlaidAdapter } from './plaid.adapter';
import { ComplianceService } from './compliance.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { WalletMovementService } from './wallet-movement.service';

type Provider = 'BRIDGE' | 'PLAID';

/**
 * Raw-body inbox boundary: local mode uses the deterministic verifier; Bridge
 * mode uses Bridge's documented RSA signature verifier and fails closed.
 */
@Injectable()
export class ProviderWebhookService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    private readonly compliance: ComplianceService,
    private readonly movements: WalletMovementService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
      await this.process(input.provider, verified.eventType, verified.payload, verified.eventId, input.requestId);
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
    if (this.config.providerMode !== 'local') {
      if (provider === 'BRIDGE') return new BridgeWebhookVerifier(this.config.bridgeWebhookPublicKey, this.config.providerWebhookToleranceSeconds).verify({ rawBody, headers, now: new Date() });
      return new PlaidAdapter(this.config).verify({ rawBody, headers, now: new Date() });
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

  private async process(provider: Provider, type: string, payload: Record<string, unknown>, eventId: string, requestId: string) {
    if (provider === 'PLAID') {
      const webhookType = this.text(payload.webhook_type);
      const webhookCode = this.text(payload.webhook_code);
      const userId = this.text(payload.client_user_id);
      const verificationId = this.text(payload.identity_verification_id);
      if (webhookType === 'IDENTITY_VERIFICATION' && ['STATUS_UPDATED', 'STEP_UPDATED', 'RETRIED'].includes(webhookCode ?? '') && userId && verificationId) {
        // Plaid does not guarantee webhook order, so retrieve current authority.
        await this.compliance.refreshPlaidDecision(userId, verificationId, eventId, requestId);
      }
      return;
    }
    if (provider === 'BRIDGE' && this.text(payload.event_category) === 'transfer') {
      await this.processBridgeTransfer(payload, eventId, requestId);
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

  private async processBridgeTransfer(payload: Record<string, unknown>, eventId: string, requestId: string) {
    const transfer = payload.event_object;
    if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer)) return;
    const object = transfer as Record<string, unknown>;
    // Slice creates Bridge transfers with its movement id as client_reference_id.
    const movementId = this.text(object.client_reference_id);
    const reference = this.text(object.id) ?? this.text(payload.event_object_id);
    const state = this.text(object.state) ?? this.text(payload.event_object_status);
    if (!movementId || !reference || !state) return;
    if (state === 'payment_processed') {
      await this.movements.completeFromProvider({ movementId, providerReference: reference, providerEventId: eventId, requestId });
    } else if (state === 'in_review') {
      await this.movements.holdFromProvider({ movementId, reasonCode: 'BRIDGE_IN_REVIEW', requestId });
    } else if (state === 'canceled') {
      await this.movements.cancelFromProvider({ movementId, reasonCode: 'BRIDGE_CANCELLED', requestId });
    } else if (state === 'returned' || state === 'refunded') {
      await this.movements.reverseFromProvider({ movementId, reasonCode: `BRIDGE_${state.toUpperCase()}`, requestId });
    } else if (state === 'undeliverable' || state === 'error') {
      await this.movements.failFromProvider({ movementId, reasonCode: `BRIDGE_${state.toUpperCase()}`, requestId });
    }
  }

  private text(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : null; }
}
