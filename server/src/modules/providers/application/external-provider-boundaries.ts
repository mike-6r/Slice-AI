import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import type { IdentityVerificationProvider } from '../domain/provider.types';
import { ProviderCryptoService } from './provider-crypto.service';
import { StripeClientFactory } from './stripe-provider.client';

export type ActiveProviderCode = 'LOCAL_TEST' | 'STRIPE_SANDBOX' | 'STRIPE_LIVE';

@Injectable()
export class UnavailableExternalIdentityProvider implements IdentityVerificationProvider {
  constructor(private readonly code: ActiveProviderCode) {}
  async createSession(_input: { userId: string; requestId: string }): Promise<never> {
    void _input;
    throw providerUnavailable(this.code, 'Identity verification is not available yet.');
  }
  async getIdentityVerification(_verificationId: string): Promise<never> {
    void _verificationId;
    throw providerUnavailable(this.code, 'Identity verification is not available yet.');
  }
}

/** Stripe customer-funding boundary. Only safe projections leave this service. */
@Injectable()
export class BankConnectionService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    private readonly stripeFactory: StripeClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createLinkToken(actor: Actor, idempotencyKey: string) {
    if (this.config.stripeBankFundingRail !== 'bacs_debit') {
      throw this.domainError('GBP_FUNDING_RAIL_UNSUPPORTED', 'The configured GBP funding rail is not supported.');
    }
    const stripe = this.stripeFactory.get();
    const customer = await this.customerFor(actor.userId, stripe);
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.externalCustomerId,
      payment_method_types: ['bacs_debit'],
      usage: 'off_session',
      metadata: {
        slice_user_id: actor.userId,
        slice_environment: customer.environment,
        slice_funding_rail: 'bacs_debit',
      },
    }, { idempotencyKey: `slice-bacs-setup:${this.stripeFactory.environment()}:${idempotencyKey}` });
    if (!setupIntent.client_secret || setupIntent.livemode !== (this.config.providerMode === 'stripe_live')) {
      throw providerUnavailable(providerCode(this.config.providerMode), 'Stripe Bacs setup is not usable.');
    }
    try {
      await this.db.bacsSetupSession.create({
        data: {
          id: randomUUID(), userId: actor.userId, provider: customer.provider,
          environment: customer.environment, externalSetupIntentId: setupIntent.id,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
    return {
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
      publishableKey: this.stripeFactory.publishableKey(),
      expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
      paymentMethodType: 'bacs_debit' as const,
    };
  }

  async completeLink(actor: Actor, setupIntentId: string, requestId: string, idempotencyKey: string) {
    void requestId;
    void idempotencyKey;
    if (this.config.stripeBankFundingRail !== 'bacs_debit') {
      throw this.domainError('GBP_FUNDING_RAIL_UNSUPPORTED', 'The configured GBP funding rail is not supported.');
    }
    const stripe = this.stripeFactory.get();
    const customer = await this.customerFor(actor.userId, stripe);
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (setupIntent.livemode !== (this.config.providerMode === 'stripe_live') || String(setupIntent.customer) !== customer.externalCustomerId) {
      throw this.domainError('BACS_SETUP_INTENT_MISMATCH', 'Bank setup could not be verified.');
    }
    const sessionRow = await this.db.bacsSetupSession.findUnique({
      where: { provider_environment_externalSetupIntentId: { provider: customer.provider, environment: customer.environment, externalSetupIntentId: setupIntentId } },
    });
    if (!sessionRow || sessionRow.userId !== actor.userId) throw this.domainError('BACS_SETUP_INTENT_UNKNOWN', 'Bank setup has expired.');
    if (sessionRow.status === 'COMPLETED') return { connections: await this.list(actor.userId), replayed: true };
    if (setupIntent.status !== 'succeeded') throw this.domainError('BACS_MANDATE_NOT_READY', 'Complete the bank mandate before saving this funding account.');
    const paymentMethod = typeof setupIntent.payment_method === 'string'
      ? await stripe.paymentMethods.retrieve(setupIntent.payment_method)
      : setupIntent.payment_method;
    if (!paymentMethod || paymentMethod.type !== 'bacs_debit' || String(paymentMethod.customer) !== customer.externalCustomerId) {
      throw this.domainError('BACS_PAYMENT_METHOD_UNSUPPORTED', 'The selected funding method is not a verified Bacs Direct Debit method.');
    }
    const referenceHash = this.crypto.hash(paymentMethod.id);
    const existing = await this.db.externalFinancialAccount.findUnique({ where: { provider_providerReferenceHash: { provider: customer.provider, providerReferenceHash: referenceHash } } });
    if (existing && existing.userId !== actor.userId) throw this.domainError('BACS_PAYMENT_METHOD_OWNER_MISMATCH', 'This funding method belongs to another Slice account.');
    const bacs = paymentMethod.bacs_debit;
    const row = existing ?? await this.db.externalFinancialAccount.create({
      data: {
        id: randomUUID(), userId: actor.userId, provider: customer.provider,
        providerReferenceCiphertext: this.crypto.encrypt(paymentMethod.id, 'financial-account'),
        providerReferenceHash: referenceHash, encryptionKeyVersion: this.crypto.keyVersion,
        itemReferenceCiphertext: this.crypto.encrypt(setupIntent.id, `bacs-setup:${setupIntent.id}`), itemReferenceHash: this.crypto.hash(setupIntent.id),
        externalPaymentMethodId: paymentMethod.id, institutionName: null,
        accountName: paymentMethod.billing_details?.name ?? null, accountMask: bacs?.last4 ?? null, currency: 'GBP',
        accountType: 'bacs_debit', status: 'CONNECTED', ownershipStatus: 'NOT_AVAILABLE',
        isDefault: false, lastSyncedAt: new Date(),
      },
    });
    if (existing) {
      await this.db.externalFinancialAccount.update({ where: { id: existing.id }, data: { status: 'CONNECTED', accountName: paymentMethod.billing_details?.name ?? existing.accountName, accountMask: bacs?.last4 ?? existing.accountMask, lastSyncedAt: new Date() } });
    }
    await this.db.$transaction(async (db) => {
      const hasDefault = await db.externalFinancialAccount.count({ where: { userId: actor.userId, provider: customer.provider, currency: 'GBP', accountType: 'bacs_debit', isDefault: true, status: 'CONNECTED' } });
      if (!hasDefault) await db.externalFinancialAccount.update({ where: { id: row.id }, data: { isDefault: true } });
      await db.bacsSetupSession.update({ where: { id: sessionRow.id }, data: { status: 'COMPLETED' } });
    });
    return { connections: await this.list(actor.userId), replayed: Boolean(existing) };
  }

  async createDepositPayment(input: { userId: string; movementId: string; amountMinor: string }) {
    if (this.config.stripeBankFundingRail !== 'bacs_debit') {
      throw this.domainError('GBP_FUNDING_RAIL_UNSUPPORTED', 'The configured GBP funding rail is not supported.');
    }
    const stripe = this.stripeFactory.get();
    const customer = await this.customerFor(input.userId, stripe);
    const bank = await this.db.externalFinancialAccount.findFirst({
      where: { userId: input.userId, provider: customer.provider, currency: 'GBP', accountType: 'bacs_debit', status: 'CONNECTED', isDefault: true },
    });
    if (!bank?.externalPaymentMethodId) throw this.domainError('BACS_FUNDING_METHOD_REQUIRED', 'Set up a default UK bank mandate before adding funds.');
    const amount = BigInt(input.amountMinor);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw this.domainError('STRIPE_AMOUNT_OUT_OF_RANGE', 'Deposit amount is too large.');
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Number(amount),
        currency: 'gbp',
        customer: customer.externalCustomerId,
        payment_method: bank.externalPaymentMethodId,
        payment_method_types: ['bacs_debit'],
        confirm: true,
        off_session: true,
        metadata: { slice_movement_id: input.movementId, slice_currency: 'GBP', slice_funding_rail: 'bacs_debit' },
      }, { idempotencyKey: `slice-deposit:${this.stripeFactory.environment()}:${input.movementId}` });
    } catch (_error) {
      void _error;
      throw new ServiceUnavailableException({ code: 'STRIPE_PAYMENT_FAILED', message: 'The bank deposit could not be started. No Slice cash was made available.' });
    }
    return {
      providerReference: intent.id,
      externalAccountId: bank.id,
      status: intent.status === 'canceled' ? 'FAILED' as const : intent.status === 'processing' || intent.status === 'requires_action' || intent.status === 'succeeded' ? 'PROCESSING' as const : 'PENDING_PROVIDER' as const,
      failureCode: intent.last_payment_error?.code ?? undefined,
    };
  }

  async list(userId: string) {
    if (!this.db?.externalFinancialAccount) return { items: [] };
    const provider = providerCode(this.config.providerMode);
    const rows = await this.db.externalFinancialAccount.findMany({ where: { userId, provider, currency: 'GBP', accountType: 'bacs_debit' }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    return { items: rows.map((row) => ({ id: row.id, institutionName: row.institutionName, accountName: row.accountName, accountMask: row.accountMask, accountType: row.accountType, currency: 'GBP' as const, status: row.status as 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED', isDefault: row.isDefault, updatedAt: row.updatedAt.toISOString() })) };
  }

  async disconnect(actor: Actor, connectionId: string, requestId: string) {
    const provider = providerCode(this.config.providerMode);
    const row = await this.db.externalFinancialAccount.findFirst({ where: { id: connectionId, userId: actor.userId, provider, currency: 'GBP', accountType: 'bacs_debit' } });
    if (!row) throw new Error('BANK_CONNECTION_NOT_FOUND');
    if (row.status === 'DISCONNECTED') return { disconnected: true, replayed: true };
    const stripe = this.stripeFactory.get();
    const accountId = this.crypto.decrypt(row.providerReferenceCiphertext, 'financial-account');
    try {
      await stripe.paymentMethods.detach(accountId);
    } catch (_error) {
      void _error;
      throw new ServiceUnavailableException({ code: 'STRIPE_DISCONNECT_FAILED', message: 'The bank could not be disconnected. Try again shortly.' });
    }
    await this.db.externalFinancialAccount.update({ where: { id: row.id }, data: { status: 'DISCONNECTED', isDefault: false, lastSyncedAt: new Date() } });
    void requestId;
    return { disconnected: true, replayed: false };
  }

  async setDefault(actor: Actor, connectionId: string) {
    const provider = providerCode(this.config.providerMode);
    const row = await this.db.externalFinancialAccount.findFirst({ where: { id: connectionId, userId: actor.userId, provider, currency: 'GBP', accountType: 'bacs_debit', status: 'CONNECTED' } });
    if (!row) throw new Error('BANK_CONNECTION_NOT_FOUND');
    await this.db.$transaction([
      this.db.externalFinancialAccount.updateMany({ where: { userId: actor.userId, provider, currency: 'GBP', accountType: 'bacs_debit' }, data: { isDefault: false } }),
      this.db.externalFinancialAccount.update({ where: { id: connectionId }, data: { isDefault: true } }),
    ]);
    return { selected: true };
  }

  private async customerFor(userId: string, stripe: Stripe) {
    const provider = providerCode(this.config.providerMode);
    const environment = this.stripeFactory.environment();
    const existing = await this.db.externalProviderCustomer.findUnique({ where: { provider_environment_userId: { provider, environment, userId } } });
    if (existing) return existing;
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const external = await stripe.customers.create({ email: user.email, metadata: { slice_user_id: userId, slice_environment: environment } }, { idempotencyKey: `slice-customer:${environment}:${userId}` });
    try {
      return await this.db.externalProviderCustomer.create({ data: { id: randomUUID(), userId, provider, environment, externalCustomerId: external.id } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return this.db.externalProviderCustomer.findUniqueOrThrow({ where: { provider_environment_userId: { provider, environment, userId } } });
    }
  }

  private domainError(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}

export function providerCode(mode: AppConfig['providerMode']): ActiveProviderCode {
  if (mode === 'local') return 'LOCAL_TEST';
  return mode === 'stripe_live' ? 'STRIPE_LIVE' : 'STRIPE_SANDBOX';
}

export function providerUnavailable(code: ActiveProviderCode, message: string) {
  return new ServiceUnavailableException({ code: code === 'LOCAL_TEST' ? 'PROVIDER_NOT_CONFIGURED' : 'EXTERNAL_PROVIDER_NOT_IMPLEMENTED', provider: code, message });
}
