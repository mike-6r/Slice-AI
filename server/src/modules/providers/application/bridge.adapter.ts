import {
  BadRequestException,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createVerify } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type {
  BridgeTransferState,
  ExternalMovementProvider,
  NormalizedMovementStatus,
  WebhookVerifier,
} from '../domain/provider.types';
import { ProviderResilienceService } from './provider-resilience.service';

export type BridgeFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export class BridgeProviderError extends Error {
  constructor(
    readonly kind:
      | 'VALIDATION'
      | 'AUTHENTICATION'
      | 'RATE_LIMIT'
      | 'TEMPORARY'
      | 'TIMEOUT'
      | 'REJECTED',
    readonly status: number | null,
    message = 'Bridge request failed.',
  ) {
    super(message);
  }
}

type BridgeTransfer = { id: string; state: BridgeTransferState };

/**
 * Thin Bridge v0 boundary. The callers own which supported rail/account data is
 * appropriate; Slice never invents a rail or provider balance.
 */
export class BridgeAdapter implements ExternalMovementProvider {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: Pick<
      AppConfig,
      'bridgeApiKey' | 'bridgeApiBaseUrl' | 'bridgeRequestTimeoutMs' | 'isBeta'
    >,
    private readonly fetcher: BridgeFetch = fetch,
    private readonly resilience = new ProviderResilienceService(),
  ) {}

  async createCustomer(input: {
    idempotencyKey: string;
    body: Record<string, unknown>;
  }) {
    return this.request('POST', '/customers', input.body, input.idempotencyKey);
  }

  async createExternalAccount(input: {
    customerId: string;
    idempotencyKey: string;
    body: Record<string, unknown>;
  }) {
    return this.request(
      'POST',
      `/customers/${encodeURIComponent(input.customerId)}/external_accounts`,
      input.body,
      input.idempotencyKey,
    );
  }

  async createTransfer(input: {
    idempotencyKey: string;
    body: Record<string, unknown>;
  }): Promise<BridgeTransfer> {
    return this.request(
      'POST',
      '/transfers',
      input.body,
      input.idempotencyKey,
    ) as Promise<BridgeTransfer>;
  }

  async getTransfer(providerReference: string): Promise<BridgeTransfer> {
    return this.request(
      'GET',
      `/transfers/${encodeURIComponent(providerReference)}`,
    ) as Promise<BridgeTransfer>;
  }

  async createDeposit(): Promise<never> {
    throw new ServiceUnavailableException({
      code: 'BRIDGE_DEPOSIT_CONFIGURATION_REQUIRED',
      message:
        'Bridge deposits require a configured supported virtual-account or transfer rail.',
    });
  }

  async createWithdrawal(): Promise<never> {
    throw new ServiceUnavailableException({
      code: 'BRIDGE_WITHDRAWAL_CONFIGURATION_REQUIRED',
      message:
        'Bridge withdrawals require a configured customer, wallet, and external-account destination.',
    });
  }

  async lookup(input: {
    providerReference: string;
  }): Promise<{ status: NormalizedMovementStatus }> {
    const transfer = await this.getTransfer(input.providerReference);
    return { status: mapBridgeTransferState(transfer.state) };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    if (this.config.isBeta)
      throw new ServiceUnavailableException({
        code: 'BETA_DISABLED',
        message:
          'External money movement is not enabled during the current Beta.',
      });
    if (!this.config.bridgeApiKey)
      throw new ServiceUnavailableException({
        code: 'BRIDGE_CREDENTIALS_UNAVAILABLE',
        message: 'Bridge credentials are unavailable.',
      });
    this.resilience.beforeOutbound('BRIDGE');
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.bridgeRequestTimeoutMs,
    );
    try {
      const response = await this.fetcher(
        `${this.config.bridgeApiBaseUrl}${path}`,
        {
          method,
          headers: {
            'Api-Key': this.config.bridgeApiKey,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        },
      );
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) throw this.error(response.status);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new BridgeProviderError(
          'TEMPORARY',
          response.status,
          'Bridge returned an invalid response.',
        );
      this.resilience.success('BRIDGE');
      return parsed as Record<string, unknown>;
    } catch (error) {
      const normalized =
        error instanceof BridgeProviderError
          ? error
          : error instanceof ServiceUnavailableException
            ? null
            : error instanceof Error && error.name === 'AbortError'
              ? new BridgeProviderError(
                  'TIMEOUT',
                  null,
                  'Bridge request timed out.',
                )
              : new BridgeProviderError(
                  'TEMPORARY',
                  null,
                  'Bridge request failed.',
                );
      if (normalized) this.resilience.failure('BRIDGE', normalized.kind);
      throw normalized ?? error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private error(status: number) {
    if (status === 401 || status === 403)
      return new BridgeProviderError('AUTHENTICATION', status);
    if (status === 422 || status === 400)
      return new BridgeProviderError('VALIDATION', status);
    if (status === 409) return new BridgeProviderError('REJECTED', status);
    if (status === 429) return new BridgeProviderError('RATE_LIMIT', status);
    return new BridgeProviderError('TEMPORARY', status);
  }
}

/** Bridge documents X-Webhook-Signature as t=<ms>,v0=<base64 RSA signature>. */
export class BridgeWebhookVerifier implements WebhookVerifier {
  constructor(
    private readonly publicKey: string | undefined,
    private readonly toleranceSeconds: number,
  ) {}
  async verify(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
    now: Date;
  }) {
    if (!this.publicKey)
      throw new ServiceUnavailableException({
        code: 'BRIDGE_WEBHOOK_KEY_UNAVAILABLE',
        message: 'Bridge webhook public key is unavailable.',
      });
    const header = value(input.headers, 'x-webhook-signature');
    const timestamp = header
      ?.split(',')
      .find((part) => part.startsWith('t='))
      ?.slice(2);
    const signature = header
      ?.split(',')
      .find((part) => part.startsWith('v0='))
      ?.slice(3);
    if (!timestamp || !signature || !/^\d+$/.test(timestamp))
      throw new BadRequestException({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'Bridge webhook signature is invalid.',
      });
    const age = Math.abs(input.now.getTime() - Number(timestamp));
    if (
      !Number.isSafeInteger(Number(timestamp)) ||
      age > this.toleranceSeconds * 1000
    )
      throw new BadRequestException({
        code: 'WEBHOOK_TIMESTAMP_INVALID',
        message: 'Bridge webhook timestamp is invalid.',
      });
    try {
      const digest = createHash('sha256')
        .update(`${timestamp}.${input.rawBody.toString('utf8')}`)
        .digest();
      const verifier = createVerify('RSA-SHA256');
      verifier.update(digest);
      if (!verifier.verify(this.publicKey, signature, 'base64'))
        throw new Error('invalid');
      const payload: unknown = JSON.parse(input.rawBody.toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('invalid');
      const record = payload as Record<string, unknown>;
      if (
        typeof record.event_id !== 'string' ||
        typeof record.event_type !== 'string'
      )
        throw new Error('invalid');
      const occurredAt =
        typeof record.event_created_at === 'string'
          ? new Date(record.event_created_at)
          : input.now;
      return {
        eventId: record.event_id,
        eventType: record.event_type,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? input.now : occurredAt,
        payload: record,
      };
    } catch {
      throw new BadRequestException({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'Bridge webhook signature is invalid.',
      });
    }
  }
}

function value(
  headers: Record<string, string | string[] | undefined>,
  key: string,
) {
  const found = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === key,
  )?.[1];
  return Array.isArray(found) ? found[0] : found;
}

export function mapBridgeTransferState(
  state: BridgeTransferState,
): NormalizedMovementStatus {
  if (state === 'payment_processed') return 'SETTLED';
  if (state === 'canceled') return 'CANCELLED';
  if (state === 'returned' || state === 'refunded') return 'RETURNED';
  if (state === 'undeliverable' || state === 'error') return 'FAILED';
  if (state === 'in_review') return 'MANUAL_REVIEW';
  if (state === 'funds_received' || state === 'payment_submitted')
    return 'PROCESSING';
  return 'PENDING_PROVIDER';
}
