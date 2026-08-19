import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { StripeClientFactory } from './stripe-provider.client';

export type ConnectAccountStatus = 'NOT_STARTED' | 'ACTION_REQUIRED' | 'UNDER_REVIEW' | 'READY' | 'RESTRICTED' | 'DISABLED';

export type ConnectPayoutWebhookEffect = {
  movementId: string;
  action: 'PROCESSING' | 'COMPLETE' | 'FAIL' | 'HOLD';
  providerReference?: string;
  reasonCode?: string;
};

export class ConnectPayoutExternalTransferError extends Error {
  readonly externalTransferCreated = true;
  constructor(message: string) {
    super(message);
    this.name = 'ConnectPayoutExternalTransferError';
  }
}

export function mapConnectAccountStatus(account: Pick<Stripe.Account, 'details_submitted' | 'payouts_enabled' | 'requirements' | 'capabilities'>): ConnectAccountStatus {
  const requirements = account.requirements;
  const currentlyDue = requirements?.currently_due ?? [];
  const pastDue = requirements?.past_due ?? [];
  const pending = requirements?.pending_verification ?? [];
  const transfers = account.capabilities?.transfers;
  if (requirements?.disabled_reason || pastDue.length > 0 || transfers === 'inactive') return requirements?.disabled_reason ? 'DISABLED' : 'RESTRICTED';
  if (requirements?.errors?.length || currentlyDue.length > 0 || !account.details_submitted) return 'ACTION_REQUIRED';
  if (pending.length > 0 || transfers === 'pending') return 'UNDER_REVIEW';
  if (account.payouts_enabled && transfers === 'active') return 'READY';
  return 'RESTRICTED';
}

function requirementsSummary(account: Stripe.Account) {
  const requirements = account.requirements;
  return {
    currentlyDueCount: requirements?.currently_due?.length ?? 0,
    pastDueCount: requirements?.past_due?.length ?? 0,
    pendingVerificationCount: requirements?.pending_verification?.length ?? 0,
    hasValidationErrors: Boolean(requirements?.errors?.length),
    hasDisabledReason: Boolean(requirements?.disabled_reason),
  };
}

@Injectable()
export class StripeConnectPayoutService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    private readonly stripeFactory: StripeClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async status(actor: Actor) {
    this.requireCollector(actor);
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const row = await this.db.externalConnectAccount.findUnique({ where: { provider_environment_userId: { provider, environment, userId: actor.userId } } });
    if (!row) return { status: 'NOT_STARTED' as const, requirementsSummary: null, onboardingUrl: null, expiresAt: null };
    const account = await this.stripeFactory.get().accounts.retrieve(this.crypto.decrypt(row.externalAccountIdCiphertext, `connect-account:${row.id}`));
    const updated = await this.syncAccount(row.id, account);
    return { status: updated.status, requirementsSummary: updated.requirementsSummary, onboardingUrl: null, expiresAt: null };
  }

  async createOnboardingLink(actor: Actor, requestId: string) {
    this.requireCollector(actor);
    const stripe = this.stripeFactory.get();
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const user = await this.db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true } });
    let row = await this.db.externalConnectAccount.findUnique({ where: { provider_environment_userId: { provider, environment, userId: actor.userId } } });
    if (!row) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email: user.email,
        default_currency: 'gbp',
        capabilities: { transfers: { requested: true } },
        metadata: { slice_user_id: actor.userId, slice_environment: environment },
      }, { idempotencyKey: `slice-connect-account:${environment}:${actor.userId}` });
      try {
        row = await this.db.externalConnectAccount.create({
          data: {
            id: randomUUID(), userId: actor.userId, provider, environment,
            externalAccountIdCiphertext: this.crypto.encrypt(account.id, `connect-account:${account.id}`),
            externalAccountIdHash: this.crypto.hash(account.id), encryptionKeyVersion: this.crypto.keyVersion,
            status: mapConnectAccountStatus(account), requirementsSummary: requirementsSummary(account),
            detailsSubmitted: account.details_submitted, payoutsEnabled: account.payouts_enabled,
            transfersCapability: account.capabilities?.transfers ?? null, lastSyncedAt: new Date(),
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        row = await this.db.externalConnectAccount.findUniqueOrThrow({ where: { provider_environment_userId: { provider, environment, userId: actor.userId } } });
      }
    } else {
      const account = await stripe.accounts.retrieve(this.crypto.decrypt(row.externalAccountIdCiphertext, `connect-account:${row.id}`));
      row = await this.syncAccount(row.id, account);
    }
    const externalAccountId = this.crypto.decrypt(row.externalAccountIdCiphertext, `connect-account:${row.id}`);
    const link = await stripe.accountLinks.create({
      account: externalAccountId,
      type: 'account_onboarding',
      refresh_url: new URL('/wallet?connect=refresh', this.config.appPublicUrl).toString(),
      return_url: new URL('/wallet?connect=return', this.config.appPublicUrl).toString(),
      collection_options: { fields: 'currently_due', future_requirements: 'include' },
    }, { idempotencyKey: `slice-connect-onboarding:${environment}:${actor.userId}:${requestId}` });
    return { status: row.status, onboardingUrl: link.url, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), requirementsSummary: row.requirementsSummary };
  }

  async createPayout(input: { userId: string; movementId: string; amountMinor: string }) {
    const stripe = this.stripeFactory.get();
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const account = await this.db.externalConnectAccount.findUnique({ where: { provider_environment_userId: { provider, environment, userId: input.userId } } });
    if (!account || account.status !== 'READY') throw new ConflictException({ code: 'CONNECT_PAYOUT_NOT_READY', message: 'Complete payout setup before withdrawing collector proceeds.' });
    const externalAccountId = this.crypto.decrypt(account.externalAccountIdCiphertext, `connect-account:${account.id}`);
    const amount = BigInt(input.amountMinor);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new ConflictException({ code: 'STRIPE_AMOUNT_OUT_OF_RANGE', message: 'Withdrawal amount is too large.' });
    let payout = await this.db.connectPayout.findUnique({ where: { movementId: input.movementId } });
    if (payout?.externalPayoutIdCiphertext) return { providerReference: this.crypto.decrypt(payout.externalPayoutIdCiphertext, `connect-payout:${payout.id}`), status: payout.status };
    if (!payout) payout = await this.db.connectPayout.create({ data: { id: randomUUID(), movementId: input.movementId, connectAccountId: account.id, provider, environment, amountMinor: amount, currency: 'GBP' } });
    let transferId: string;
    try {
      if (payout.externalTransferIdCiphertext) transferId = this.crypto.decrypt(payout.externalTransferIdCiphertext, `connect-transfer:${payout.id}`);
      else {
        const transfer = await stripe.transfers.create({ amount: Number(amount), currency: 'gbp', destination: externalAccountId, metadata: { slice_movement_id: input.movementId, slice_connect_payout_id: payout.id }, transfer_group: `slice:${input.movementId}` }, { idempotencyKey: `slice-connect-transfer:${environment}:${input.movementId}` });
        transferId = transfer.id;
        await this.db.connectPayout.update({ where: { id: payout.id }, data: { externalTransferIdCiphertext: this.crypto.encrypt(transferId, `connect-transfer:${payout.id}`), externalTransferIdHash: this.crypto.hash(transferId), encryptionKeyVersion: this.crypto.keyVersion, status: 'TRANSFERRED', lastSyncedAt: new Date() } });
      }
    } catch (error) {
      void error;
      await this.db.connectPayout.update({ where: { id: payout.id }, data: { status: 'FAILED', failureCode: 'STRIPE_TRANSFER_FAILED' } });
      throw new ConflictException({ code: 'STRIPE_TRANSFER_FAILED', message: 'The external payout could not be started. Your Slice balance was not consumed.' });
    }
    try {
      const externalPayout = await stripe.payouts.create({ amount: Number(amount), currency: 'gbp', method: 'standard', metadata: { slice_movement_id: input.movementId, slice_connect_payout_id: payout.id } }, { stripeAccount: externalAccountId, idempotencyKey: `slice-connect-payout:${environment}:${input.movementId}` });
      const status = mapPayoutStatus(externalPayout.status);
      await this.db.connectPayout.update({ where: { id: payout.id }, data: { externalPayoutIdCiphertext: this.crypto.encrypt(externalPayout.id, `connect-payout:${payout.id}`), externalPayoutIdHash: this.crypto.hash(externalPayout.id), status, lastSyncedAt: new Date() } });
      return { providerReference: externalPayout.id, status };
    } catch (error) {
      void error;
      await this.db.connectPayout.update({ where: { id: payout.id }, data: { status: 'MANUAL_REVIEW', failureCode: 'STRIPE_PAYOUT_FAILED', lastSyncedAt: new Date() } });
      throw new ConnectPayoutExternalTransferError('The payout requires review because the connected-account transfer was created.');
    }
  }

  async processWebhook(provider: 'STRIPE_SANDBOX' | 'STRIPE_LIVE', type: string, payload: Record<string, unknown>): Promise<ConnectPayoutWebhookEffect | null> {
    if (provider !== this.stripeFactory.provider()) return null;
    if (type === 'account.updated') {
      const id = this.text(payload.id);
      if (!id) return null;
      const row = await this.db.externalConnectAccount.findUnique({ where: { provider_environment_externalAccountIdHash: { provider, environment: this.stripeFactory.environment(), externalAccountIdHash: this.crypto.hash(id) } } });
      if (!row) return null;
      await this.syncAccount(row.id, payload as unknown as Stripe.Account);
      return null;
    }
    const payoutId = this.text(payload.id);
    if (!payoutId || !type.startsWith('payout.')) return null;
    const mapping = await this.db.connectPayout.findUnique({ where: { provider_externalPayoutIdHash: { provider, externalPayoutIdHash: this.crypto.hash(payoutId) } } });
    if (!mapping) return null;
    if (type === 'payout.paid') {
      await this.db.connectPayout.update({ where: { id: mapping.id }, data: { status: 'PAID', lastSyncedAt: new Date() } });
      return { movementId: mapping.movementId, action: 'COMPLETE', providerReference: payoutId };
    }
    if (type === 'payout.failed' || type === 'payout.canceled') {
      await this.db.connectPayout.update({ where: { id: mapping.id }, data: { status: type === 'payout.canceled' ? 'CANCELED' : 'FAILED', failureCode: type.toUpperCase().replace('.', '_'), lastSyncedAt: new Date() } });
      return { movementId: mapping.movementId, action: 'HOLD', reasonCode: type === 'payout.canceled' ? 'STRIPE_PAYOUT_CANCELED_AFTER_TRANSFER' : 'STRIPE_PAYOUT_FAILED_AFTER_TRANSFER' };
    }
    await this.db.connectPayout.update({ where: { id: mapping.id }, data: { status: 'PROCESSING', lastSyncedAt: new Date() } });
    return { movementId: mapping.movementId, action: 'PROCESSING' };
  }

  private async syncAccount(id: string, account: Stripe.Account) {
    const status = mapConnectAccountStatus(account);
    return this.db.externalConnectAccount.update({ where: { id }, data: { status, requirementsSummary: requirementsSummary(account), detailsSubmitted: account.details_submitted, payoutsEnabled: account.payouts_enabled, transfersCapability: account.capabilities?.transfers ?? null, lastSyncedAt: new Date() } });
  }

  private requireCollector(actor: Actor) {
    if (!actor.roles.includes('COLLECTOR')) throw new ForbiddenException({ code: 'COLLECTOR_PAYOUTS_REQUIRED', message: 'Payout setup is available to collector accounts.' });
  }

  private text(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : null; }
}

function mapPayoutStatus(status: string) {
  if (status === 'paid') return 'PAID' as const;
  if (status === 'failed') return 'FAILED' as const;
  if (status === 'canceled') return 'CANCELED' as const;
  return 'PROCESSING' as const;
}
