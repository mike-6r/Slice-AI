import { ConflictException, Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { TwoFactorService } from '../../identity/two-factor/two-factor.service';
import { TransactionalEmailService } from '../../identity/email-delivery/transactional-email.service';
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
    @Optional() private readonly recentAuth?: RecentAuthService,
    @Optional() private readonly twoFactor?: TwoFactorService,
    @Optional() private readonly limiter?: ControlRateLimitService,
    @Optional() private readonly transactionalEmail?: TransactionalEmailService,
  ) {}

  async createLinkCheckout(actor: Actor, idempotencyKey: string) {
    await this.capabilities?.require(actor, 'LINK_BANK');
    await this.limiter?.enforce('bankLink', 'server', actor.userId);
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
    await this.recordBankEvent({
      userId: actor.userId,
      provider: providerCode(this.config.providerMode),
      environment: customer.environment,
      eventType: 'BANK_LINK_REQUESTED',
      metadata: { setupSessionId: setupSession.id },
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
      }, { idempotencyKey: `slice-bacs-checkout:${this.environment()}:${setupSession.id}:${idempotencyKey}` });
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
    void idempotencyKey;
    const result = await this.completeCheckoutSession(providerCode(this.config.providerMode), checkoutSessionId, actor.userId, requestId);
    return { connections: await this.list(actor.userId), replayed: result.replayed };
  }

  async completeCheckoutSession(provider: ActiveProviderCode, checkoutSessionId: string, expectedUserId?: string, requestId?: string) {
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
    const fingerprint = bacs?.fingerprint ?? null;
    const fingerprintHash = fingerprint ? this.crypto.hash(fingerprint) : null;
    const environment = customer.environment;
    const result = await this.db.$transaction(async (db) => {
      if (fingerprintHash) {
        await db.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${customer.provider}:${environment}:${fingerprintHash}`}))`);
      }
      const identity = fingerprintHash
        ? await db.bankInstrumentIdentity.upsert({
            where: { provider_environment_instrumentFingerprintHash: { provider: customer.provider, environment, instrumentFingerprintHash: fingerprintHash } },
            create: { id: randomUUID(), provider: customer.provider, environment, instrumentFingerprintHash: fingerprintHash, accountLast4: bacs?.last4 ?? null, bankCountry: 'GB' },
            update: { accountLast4: bacs?.last4 ?? undefined, lastSeenAt: new Date() },
          })
        : null;
      const linked = identity
        ? await db.externalFinancialAccount.findMany({ where: { instrumentIdentityId: identity.id }, select: { id: true, userId: true, status: true } })
        : [];
      const otherUser = linked.find((item) => item.userId !== sessionRow.userId);
      if (otherUser && identity) {
        await db.bankInstrumentIdentity.update({ where: { id: identity.id }, data: { riskState: 'SHARED_INSTRUMENT_REVIEW' } });
        await db.bankSecurityEvent.create({ data: { id: randomUUID(), userId: sessionRow.userId, instrumentIdentityId: identity.id, provider: customer.provider, environment, eventType: 'BANK_SHARED_INSTRUMENT_REVIEW', metadata: { otherAccountCount: linked.filter((item) => item.userId !== sessionRow.userId).length } } });
        await db.auditEvent.create({ data: { id: randomUUID(), actorUserId: sessionRow.userId, actorType: 'USER', action: 'BANK_SHARED_INSTRUMENT_REVIEW', resourceType: 'bank-instrument-identity', resourceId: identity.id, requestId: requestId ?? null, sessionId: null, result: 'FAILURE', metadata: { otherAccountCount: linked.filter((item) => item.userId !== sessionRow.userId).length } } });
        return { blocked: 'SHARED' as const, replayed: false };
      }
      const sameUserActive = linked.find((item) => item.userId === sessionRow.userId && item.status === 'CONNECTED');
      if (sameUserActive) {
        await db.bankSecurityEvent.create({ data: { id: randomUUID(), userId: sessionRow.userId, externalAccountId: sameUserActive.id, instrumentIdentityId: identity?.id, provider: customer.provider, environment, eventType: 'BANK_DUPLICATE_DETECTED', metadata: { scope: 'SAME_USER' } } });
        await db.auditEvent.create({ data: { id: randomUUID(), actorUserId: sessionRow.userId, actorType: 'USER', action: 'BANK_DUPLICATE_DETECTED', resourceType: 'external-financial-account', resourceId: sameUserActive.id, requestId: requestId ?? null, sessionId: null, result: 'FAILURE', metadata: { scope: 'SAME_USER' } } });
        return { blocked: 'SAME_USER' as const, replayed: false };
      }
      let row = existing;
      if (!row) {
        row = await db.externalFinancialAccount.create({
          data: {
            id: randomUUID(), userId: sessionRow.userId, provider: customer.provider, environment,
            providerReferenceCiphertext: this.crypto.encrypt(paymentMethod.id, 'financial-account'),
            providerReferenceHash: referenceHash, encryptionKeyVersion: this.crypto.keyVersion,
            itemReferenceCiphertext: this.crypto.encrypt(setupIntent.id, `bacs-setup:${setupIntent.id}`), itemReferenceHash: this.crypto.hash(setupIntent.id),
            externalPaymentMethodId: null, institutionName: null,
            accountName: paymentMethod.billing_details?.name ?? null, accountMask: bacs?.last4 ?? null, currency: 'GBP',
            accountType: 'bacs_debit', status: 'CONNECTED', ownershipStatus: 'NOT_AVAILABLE',
            instrumentIdentityId: identity?.id ?? null, riskState: 'CLEAR', isDefault: false, lastSyncedAt: new Date(),
          },
        });
      } else {
        row = await db.externalFinancialAccount.update({ where: { id: row.id }, data: { status: 'CONNECTED', environment, instrumentIdentityId: identity?.id ?? row.instrumentIdentityId, riskState: 'CLEAR', accountName: paymentMethod.billing_details?.name ?? row.accountName, accountMask: bacs?.last4 ?? row.accountMask, lastSyncedAt: new Date() } });
      }
      const hasDefault = await db.externalFinancialAccount.count({ where: { userId: sessionRow.userId, provider: customer.provider, currency: 'GBP', accountType: 'bacs_debit', isDefault: true, status: 'CONNECTED' } });
      if (!hasDefault) await db.externalFinancialAccount.update({ where: { id: row.id }, data: { isDefault: true } });
      await db.user.update({ where: { id: sessionRow.userId }, data: { bankWithdrawalHoldUntil: this.bankHoldUntil(new Date()) } });
      await db.bacsSetupSession.update({ where: { id: sessionRow.id }, data: { status: 'COMPLETE' } });
      await db.bankSecurityEvent.create({ data: { id: randomUUID(), userId: sessionRow.userId, externalAccountId: row.id, instrumentIdentityId: identity?.id, provider: customer.provider, environment, eventType: existing ? 'BANK_RELINKED' : 'BANK_LINKED', metadata: { accountLast4: bacs?.last4 ?? null } } });
      await db.auditEvent.create({ data: { id: randomUUID(), actorUserId: sessionRow.userId, actorType: 'USER', action: existing ? 'BANK_RELINKED' : 'BANK_LINKED', resourceType: 'external-financial-account', resourceId: row.id, requestId: requestId ?? null, sessionId: null, result: 'SUCCESS', metadata: { accountLast4: bacs?.last4 ?? null } } });
      return { blocked: null, replayed: Boolean(existing) };
    });
    if (result.blocked === 'SHARED') throw this.domainError('BANK_SHARED_INSTRUMENT_REVIEW', 'This bank account is already associated with another Slice account and needs review.');
    if (result.blocked === 'SAME_USER') throw this.domainError('BANK_ALREADY_CONNECTED', 'This bank account is already connected.');
    void this.transactionalEmail?.safeSecurityNotification({ userId: sessionRow.userId, event: result.replayed ? 'BANK_RELINKED' : 'BANK_LINKED', idempotencyKey: `bank-security:${sessionRow.id}:${result.replayed ? 'relinked' : 'linked'}`, last4: bacs?.last4 ?? undefined });
    return { userId: sessionRow.userId, replayed: result.replayed };
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
      }, { idempotencyKey: `slice-deposit:${this.environment()}:${input.movementId}` });
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
    const rows = await this.db.externalFinancialAccount.findMany({ where: { userId, provider, environment: this.environment(), currency: 'GBP', accountType: 'bacs_debit' }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    return { items: rows.map((row) => ({ id: row.id, institutionName: row.institutionName, accountName: row.accountName, accountMask: row.accountMask, accountType: row.accountType, currency: 'GBP' as const, status: row.status as 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED', riskState: row.riskState, isDefault: row.isDefault, updatedAt: row.updatedAt.toISOString() })) };
  }

  /** Admin-only fraud visibility. Provider fingerprints remain hashed and are never projected. */
  async listRisk(limit = 50) {
    const provider = providerCode(this.config.providerMode);
    const identities = await this.db.bankInstrumentIdentity.findMany({
      where: {
        provider,
        environment: this.environment(),
        riskState: { not: 'CLEAR' },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        provider: true,
        environment: true,
        accountLast4: true,
        bankCountry: true,
        riskState: true,
        firstSeenAt: true,
        lastSeenAt: true,
        accounts: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            userId: true,
            status: true,
            isDefault: true,
            accountMask: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { email: true } },
          },
        },
        _count: { select: { accounts: true, securityEvents: true } },
      },
    });
    return {
      items: identities.map((identity) => ({
        id: identity.id,
        provider: identity.provider,
        environment: identity.environment,
        accountLast4: identity.accountLast4,
        bankCountry: identity.bankCountry,
        riskState: identity.riskState,
        firstSeenAt: identity.firstSeenAt.toISOString(),
        lastSeenAt: identity.lastSeenAt.toISOString(),
        accountCount: identity._count.accounts,
        eventCount: identity._count.securityEvents,
        accounts: identity.accounts.map((account) => ({
          id: account.id,
          userId: account.userId,
          email: account.user.email,
          status: account.status,
          isDefault: account.isDefault,
          accountMask: account.accountMask,
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
        })),
      })),
    };
  }

  async beginDisconnectChallenge(actor: Actor, connectionId: string, ip: string, requestId: string) {
    const row = await this.findOwnedBank(actor.userId, connectionId);
    if (row.status !== 'CONNECTED') return { required: false, method: null, challenge: null, phone: null, expiresAt: null };
    if (!this.twoFactor) throw providerUnavailable(providerCode(this.config.providerMode), 'Account security is unavailable.');
    return this.twoFactor.beginSensitiveActionChallenge(actor, { kind: 'BANK_DISCONNECT', resourceId: connectionId }, ip, requestId);
  }

  async disconnect(actor: Actor, connectionId: string, input: { confirmed: boolean; mfaCode?: string; mfaChallenge?: string }, requestId: string, ip: string) {
    if (!input.confirmed) throw this.domainError('BANK_DISCONNECT_CONFIRMATION_REQUIRED', 'Confirm that this bank will no longer be available for new deposits.');
    await this.limiter?.enforce('bankDisconnect', ip, actor.userId);
    const provider = providerCode(this.config.providerMode);
    const row = await this.findOwnedBank(actor.userId, connectionId);
    if (row.status === 'DISCONNECTED') return { disconnected: true, replayed: true };
    if (!this.twoFactor) throw providerUnavailable(provider, 'Account security is unavailable.');
    await this.twoFactor.verifySensitiveAction(actor, { action: { kind: 'BANK_DISCONNECT', resourceId: connectionId }, code: input.mfaCode, challenge: input.mfaChallenge }, ip, requestId);
    const replacementCount = await this.db.externalFinancialAccount.count({ where: { userId: actor.userId, provider, environment: row.environment, currency: 'GBP', accountType: 'bacs_debit', status: 'CONNECTED', id: { not: row.id } } });
    if (row.isDefault && replacementCount > 0) {
      await this.recordBankEvent({ userId: actor.userId, externalAccountId: row.id, instrumentIdentityId: row.instrumentIdentityId, provider, environment: row.environment, eventType: 'BANK_DISCONNECT_BLOCKED', metadata: { reasonCode: 'DEFAULT_REPLACEMENT_REQUIRED', replacementCount } });
      throw this.domainError('BANK_DEFAULT_REPLACEMENT_REQUIRED', 'Choose another verified bank as your default before disconnecting this one.');
    }
    const pendingCount = await this.db.moneyMovement.count({ where: { externalAccountId: row.id, status: { in: ['CREATED', 'PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW', 'HELD'] } } });
    const now = new Date();
    const disconnected = await this.db.$transaction(async (db) => {
      const updated = await db.externalFinancialAccount.updateMany({ where: { id: row.id, userId: actor.userId, status: 'CONNECTED' }, data: { status: 'DISCONNECTED', isDefault: false, lastSyncedAt: now } });
      if (updated.count !== 1) return false;
      await db.user.update({ where: { id: actor.userId }, data: { bankWithdrawalHoldUntil: this.bankHoldUntil(now) } });
      await db.bankSecurityEvent.create({ data: { id: randomUUID(), userId: actor.userId, externalAccountId: row.id, instrumentIdentityId: row.instrumentIdentityId, provider, environment: row.environment, eventType: 'BANK_DISCONNECTED', metadata: { pendingMovementCount: pendingCount, logicalOnly: true } } });
      await db.auditEvent.create({ data: { id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'BANK_DISCONNECTED', resourceType: 'external-financial-account', resourceId: row.id, requestId, sessionId: actor.sessionId, result: 'SUCCESS', metadata: { pendingMovementCount: pendingCount, logicalOnly: true }, createdAt: now } });
      return true;
    });
    if (!disconnected) return { disconnected: true, replayed: true };
    void this.transactionalEmail?.safeSecurityNotification({ userId: actor.userId, event: 'BANK_DISCONNECTED', idempotencyKey: `bank-security:disconnected:${row.id}:${now.toISOString()}`, last4: row.accountMask ?? undefined });
    return { disconnected: true, replayed: false, pendingMovementCount: pendingCount };
  }

  async setDefault(actor: Actor, connectionId: string, requestId: string, ip: string) {
    const provider = providerCode(this.config.providerMode);
    await this.limiter?.enforce('bankLink', ip, actor.userId);
    const row = await this.db.externalFinancialAccount.findFirst({ where: { id: connectionId, userId: actor.userId, provider, environment: this.environment(), currency: 'GBP', accountType: 'bacs_debit', status: 'CONNECTED' } });
    if (!row) throw this.domainError('BANK_CONNECTION_NOT_FOUND', 'This bank connection is no longer available.');
    this.recentAuth?.require(actor);
    await this.db.$transaction([
      this.db.externalFinancialAccount.updateMany({ where: { userId: actor.userId, provider, environment: row.environment, currency: 'GBP', accountType: 'bacs_debit' }, data: { isDefault: false } }),
      this.db.externalFinancialAccount.update({ where: { id: connectionId }, data: { isDefault: true } }),
      this.db.user.update({ where: { id: actor.userId }, data: { bankWithdrawalHoldUntil: this.bankHoldUntil(new Date()) } }),
    ]);
    await this.recordBankEvent({ userId: actor.userId, externalAccountId: row.id, instrumentIdentityId: row.instrumentIdentityId, provider, environment: row.environment, eventType: 'BANK_DEFAULT_CHANGED', metadata: { accountLast4: row.accountMask ?? null } });
    void this.transactionalEmail?.safeSecurityNotification({ userId: actor.userId, event: 'BANK_DEFAULT_CHANGED', idempotencyKey: `bank-security:default:${row.id}:${new Date().toISOString()}`, last4: row.accountMask ?? undefined });
    return { selected: true };
  }

  private bankHoldUntil(now: Date) {
    return this.config.bankChangeWithdrawalHoldHours > 0
      ? new Date(now.getTime() + this.config.bankChangeWithdrawalHoldHours * 3_600_000)
      : null;
  }

  private async findOwnedBank(userId: string, connectionId: string) {
    const row = await this.db.externalFinancialAccount.findFirst({
      where: { id: connectionId, userId, provider: providerCode(this.config.providerMode), environment: this.environment(), currency: 'GBP', accountType: 'bacs_debit' },
    });
    if (!row) throw this.domainError('BANK_CONNECTION_NOT_FOUND', 'This bank connection is no longer available.');
    return row;
  }

  private async recordBankEvent(input: {
    userId?: string;
    externalAccountId?: string;
    instrumentIdentityId?: string | null;
    provider: ActiveProviderCode;
    environment: 'SANDBOX' | 'LIVE';
    eventType: string;
    ip?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!this.db.bankSecurityEvent) return;
    await this.db.bankSecurityEvent.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        externalAccountId: input.externalAccountId,
        instrumentIdentityId: input.instrumentIdentityId ?? undefined,
        provider: input.provider,
        environment: input.environment,
        eventType: input.eventType,
        ipHash: input.ip ? this.crypto.hash(input.ip) : undefined,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  private async customerFor(userId: string, stripe: Stripe) {
    const provider = providerCode(this.config.providerMode);
    const environment = this.environment();
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

  private environment(): 'SANDBOX' | 'LIVE' {
    return this.stripeFactory.environment?.() ?? (this.config.providerMode === 'stripe_live' ? 'LIVE' : 'SANDBOX');
  }
}

export function providerCode(mode: AppConfig['providerMode']): ActiveProviderCode {
  if (mode === 'local') return 'LOCAL_TEST';
  return mode === 'stripe_live' ? 'STRIPE_LIVE' : 'STRIPE_SANDBOX';
}

export function providerUnavailable(code: ActiveProviderCode, message: string) {
  return new ServiceUnavailableException({ code: code === 'LOCAL_TEST' ? 'PROVIDER_NOT_CONFIGURED' : 'EXTERNAL_PROVIDER_NOT_IMPLEMENTED', provider: code, message });
}
