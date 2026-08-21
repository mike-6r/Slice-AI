import { ConflictException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
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
    @Optional() private readonly capabilities?: AccountCapabilityService,
  ) {}

  async createLinkCheckout(actor: Actor, idempotencyKey: string) {
    await this.capabilities?.require(actor, 'LINK_BANK');
    if (this.config.stripeBankFundingRail !== 'bacs_debit') {
      throw this.domainError('GBP_FUNDING_RAIL_UNSUPPORTED', 'The configured GBP funding rail is not supported.');
    }
    const stripe = this.stripeFactory.get();
    const customer = await this.customerFor(actor.userId, stripe);
    const active = await this.db.bacsSetupSession.findFirst({
      where: {
        userId: actor.userId,
        provider: customer.provider,
        environment: customer.environment,
        status: { in: ['CREATED', 'CHECKOUT_OPEN', 'PROCESSING'] },
        externalCheckoutSessionReferenceHash: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (active?.externalCheckoutSessionReferenceCiphertext) {
      const activeCheckoutId = this.crypto.decrypt(active.externalCheckoutSessionReferenceCiphertext, `bacs-checkout:${active.id}`);
      const existingCheckout = await stripe.checkout.sessions.retrieve(activeCheckoutId);
      if (existingCheckout.status !== 'expired' && existingCheckout.url) {
        return {
          checkoutSessionId: activeCheckoutId,
          checkoutUrl: existingCheckout.url,
          expiration: new Date((existingCheckout.expires_at ?? Math.floor(Date.now() / 1000) + 30 * 60) * 1000).toISOString(),
          paymentMethodType: 'bacs_debit' as const,
          replayed: true,
        };
      }
      await this.db.bacsSetupSession.update({ where: { id: active.id }, data: { status: 'CANCELED' } });
    }
    const setupSession = await this.db.bacsSetupSession.create({
      data: {
        id: randomUUID(), userId: actor.userId, provider: customer.provider,
        environment: customer.environment, status: 'CREATED',
      },
    });
    let checkout: Stripe.Checkout.Session;
    try {
      checkout = await stripe.checkout.sessions.create({
        mode: 'setup',
        payment_method_types: ['bacs_debit'],
        customer: customer.externalCustomerId,
        success_url: `${this.config.appPublicUrl}/wallet/bank/setup/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.config.appPublicUrl}/wallet`,
          metadata: {
            slice_bacs_setup_session_id: setupSession.id,
            slice_user_id: actor.userId,
            slice_environment: customer.environment,
            slice_funding_rail: 'bacs_debit',
          },
          setup_intent_data: {
            metadata: {
              slice_bacs_setup_session_id: setupSession.id,
              slice_user_id: actor.userId,
              slice_environment: customer.environment,
              slice_funding_rail: 'bacs_debit',
            },
          },
      }, { idempotencyKey: `slice-bacs-checkout:${this.stripeFactory.environment()}:${setupSession.id}:${idempotencyKey}` });
    } catch {
      await this.db.bacsSetupSession.update({ where: { id: setupSession.id }, data: { status: 'FAILED' } });
      throw new ServiceUnavailableException({ code: 'STRIPE_BACS_CHECKOUT_FAILED', message: 'The secure UK bank setup could not be started.' });
    }
    if (!checkout.url || checkout.mode !== 'setup' || checkout.livemode !== (this.config.providerMode === 'stripe_live') || String(checkout.customer) !== customer.externalCustomerId) {
      await this.db.bacsSetupSession.update({ where: { id: setupSession.id }, data: { status: 'FAILED' } });
      throw providerUnavailable(providerCode(this.config.providerMode), 'Stripe Bacs Checkout setup is not usable.');
    }
    await this.db.bacsSetupSession.update({
      where: { id: setupSession.id },
      data: {
        externalCheckoutSessionReferenceCiphertext: this.crypto.encrypt(checkout.id, `bacs-checkout:${setupSession.id}`),
        externalCheckoutSessionReferenceHash: this.crypto.hash(checkout.id),
        status: 'CHECKOUT_OPEN',
      },
    });
    return {
      checkoutSessionId: checkout.id,
      checkoutUrl: checkout.url,
      expiration: new Date((checkout.expires_at ?? Math.floor(Date.now() / 1000) + 30 * 60) * 1000).toISOString(),
      paymentMethodType: 'bacs_debit' as const,
      replayed: false,
    };
  }

  async completeLink(actor: Actor, checkoutSessionId: string, requestId: string, idempotencyKey: string) {
    void requestId;
    void idempotencyKey;
    const result = await this.completeCheckoutSession(providerCode(this.config.providerMode), checkoutSessionId, actor.userId);
    return { connections: await this.list(actor.userId), replayed: result.replayed };
  }

  async completeCheckoutSession(provider: ActiveProviderCode, checkoutSessionId: string, expectedUserId?: string) {
    if (this.config.stripeBankFundingRail !== 'bacs_debit') {
      throw this.domainError('GBP_FUNDING_RAIL_UNSUPPORTED', 'The configured GBP funding rail is not supported.');
    }
    if (provider !== providerCode(this.config.providerMode)) {
      throw this.domainError('BACS_PROVIDER_ENVIRONMENT_MISMATCH', 'Bank setup belongs to another provider environment.');
    }
    const sessionHash = this.crypto.hash(checkoutSessionId);
    const sessionRow = await this.db.bacsSetupSession.findUnique({ where: { externalCheckoutSessionReferenceHash: sessionHash } });
    if (!sessionRow || (expectedUserId && sessionRow.userId !== expectedUserId)) throw this.domainError('BACS_CHECKOUT_SESSION_UNKNOWN', 'Bank setup has expired.');
    if (sessionRow.status === 'COMPLETE' || sessionRow.status === 'COMPLETED') return { userId: sessionRow.userId, replayed: true };
    const stripe = this.stripeFactory.get();
    const checkout = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    const customer = await this.customerFor(sessionRow.userId, stripe);
    if (checkout.livemode !== (this.config.providerMode === 'stripe_live') || checkout.mode !== 'setup' || String(checkout.customer) !== customer.externalCustomerId || checkout.metadata?.slice_bacs_setup_session_id !== sessionRow.id) {
      throw this.domainError('BACS_CHECKOUT_SESSION_MISMATCH', 'Bank setup could not be verified.');
    }
    if (checkout.status !== 'complete') {
      if (checkout.status === 'expired') await this.db.bacsSetupSession.update({ where: { id: sessionRow.id }, data: { status: 'CANCELED' } });
      throw this.domainError('BACS_CHECKOUT_NOT_COMPLETE', 'Complete the secure bank setup before returning to Slice.');
    }
    const setupIntentId = this.providerObjectId(checkout.setup_intent);
    if (!setupIntentId) throw this.domainError('BACS_SETUP_INTENT_MISSING', 'Stripe did not return the completed bank mandate.');
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    if (setupIntent.livemode !== (this.config.providerMode === 'stripe_live') || String(setupIntent.customer) !== customer.externalCustomerId) {
      throw this.domainError('BACS_SETUP_INTENT_MISMATCH', 'Bank setup could not be verified.');
    }
    await this.db.bacsSetupSession.update({
      where: { id: sessionRow.id },
      data: {
        externalSetupIntentReferenceCiphertext: this.crypto.encrypt(setupIntent.id, `bacs-setup:${sessionRow.id}`),
        externalSetupIntentReferenceHash: this.crypto.hash(setupIntent.id),
        status: setupIntent.status === 'succeeded' ? 'PROCESSING' : 'PROCESSING',
      },
    });
    if (setupIntent.status !== 'succeeded') throw this.domainError('BACS_MANDATE_NOT_READY', 'Complete the bank mandate before saving this funding account.');
    const paymentMethodId = this.providerObjectId(setupIntent.payment_method);
    const paymentMethod = paymentMethodId ? await stripe.paymentMethods.retrieve(paymentMethodId) : null;
    if (!paymentMethod || paymentMethod.type !== 'bacs_debit' || String(paymentMethod.customer) !== customer.externalCustomerId) {
      throw this.domainError('BACS_PAYMENT_METHOD_UNSUPPORTED', 'The selected funding method is not a verified Bacs Direct Debit method.');
    }
    await this.db.bacsSetupSession.update({
      where: { id: sessionRow.id },
      data: {
        externalPaymentMethodReferenceCiphertext: this.crypto.encrypt(paymentMethod.id, `bacs-payment-method:${sessionRow.id}`),
        externalPaymentMethodReferenceHash: this.crypto.hash(paymentMethod.id),
      },
    });
    const referenceHash = this.crypto.hash(paymentMethod.id);
    const existing = await this.db.externalFinancialAccount.findUnique({ where: { provider_providerReferenceHash: { provider: customer.provider, providerReferenceHash: referenceHash } } });
    if (existing && existing.userId !== sessionRow.userId) throw this.domainError('BACS_PAYMENT_METHOD_OWNER_MISMATCH', 'This funding method belongs to another Slice account.');
    const bacs = paymentMethod.bacs_debit;
    let row = existing;
    if (!row) {
      try {
        row = await this.db.externalFinancialAccount.create({
          data: {
            id: randomUUID(), userId: sessionRow.userId, provider: customer.provider,
            providerReferenceCiphertext: this.crypto.encrypt(paymentMethod.id, 'financial-account'),
            providerReferenceHash: referenceHash, encryptionKeyVersion: this.crypto.keyVersion,
            itemReferenceCiphertext: this.crypto.encrypt(setupIntent.id, `bacs-setup:${setupIntent.id}`), itemReferenceHash: this.crypto.hash(setupIntent.id),
            externalPaymentMethodId: null, institutionName: null,
            accountName: paymentMethod.billing_details?.name ?? null, accountMask: bacs?.last4 ?? null, currency: 'GBP',
            accountType: 'bacs_debit', status: 'CONNECTED', ownershipStatus: 'NOT_AVAILABLE',
            isDefault: false, lastSyncedAt: new Date(),
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        row = await this.db.externalFinancialAccount.findUniqueOrThrow({ where: { provider_providerReferenceHash: { provider: customer.provider, providerReferenceHash: referenceHash } } });
      }
    }
    if (existing) {
      await this.db.externalFinancialAccount.update({ where: { id: existing.id }, data: { status: 'CONNECTED', accountName: paymentMethod.billing_details?.name ?? existing.accountName, accountMask: bacs?.last4 ?? existing.accountMask, lastSyncedAt: new Date() } });
    }
    await this.db.$transaction(async (db) => {
      const hasDefault = await db.externalFinancialAccount.count({ where: { userId: sessionRow.userId, provider: customer.provider, currency: 'GBP', accountType: 'bacs_debit', isDefault: true, status: 'CONNECTED' } });
      if (!hasDefault) await db.externalFinancialAccount.update({ where: { id: row.id }, data: { isDefault: true } });
      await db.bacsSetupSession.update({ where: { id: sessionRow.id }, data: { status: 'COMPLETE' } });
    });
    return { userId: sessionRow.userId, replayed: Boolean(existing) };
  }

  async processSetupIntentEvent(provider: ActiveProviderCode, setupIntentId: string, status: string, setupSessionId?: string) {
    const row = await this.db.bacsSetupSession.findUnique({ where: { externalSetupIntentReferenceHash: this.crypto.hash(setupIntentId) } })
      ?? (setupSessionId ? await this.db.bacsSetupSession.findUnique({ where: { id: setupSessionId } }) : null);
    if (!row || row.provider !== provider || ['COMPLETE', 'COMPLETED', 'CANCELED', 'FAILED'].includes(row.status)) return;
    await this.db.bacsSetupSession.update({
      where: { id: row.id },
      data: {
        externalSetupIntentReferenceCiphertext: this.crypto.encrypt(setupIntentId, `bacs-setup:${row.id}`),
        externalSetupIntentReferenceHash: this.crypto.hash(setupIntentId),
        status: status === 'canceled' ? 'CANCELED' : status === 'requires_payment_method' ? 'FAILED' : 'PROCESSING',
      },
    });
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
    if (!bank?.providerReferenceCiphertext && !bank?.externalPaymentMethodId) throw this.domainError('BACS_FUNDING_METHOD_REQUIRED', 'Set up a default UK bank mandate before adding funds.');
    const paymentMethodId = bank.externalPaymentMethodId ?? this.crypto.decrypt(bank.providerReferenceCiphertext!, 'financial-account');
    const amount = BigInt(input.amountMinor);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw this.domainError('STRIPE_AMOUNT_OUT_OF_RANGE', 'Deposit amount is too large.');
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Number(amount),
        currency: 'gbp',
        customer: customer.externalCustomerId,
        payment_method: paymentMethodId,
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
    const accountId = row.externalPaymentMethodId ?? this.crypto.decrypt(row.providerReferenceCiphertext, 'financial-account');
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

  private providerObjectId(value: unknown) {
    return typeof value === 'string' ? value : value && typeof value === 'object' ? (typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : null) : null;
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
