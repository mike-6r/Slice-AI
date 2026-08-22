import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, CollectorPlanCode, CollectorSubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { collectorUsageFor, numberEntitlement } from '../../collector-workspace/collector-entitlements';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { ProviderCryptoService } from './provider-crypto.service';
import { StripeClientFactory } from './stripe-provider.client';
import { providerCode } from './external-provider-boundaries';

export type MembershipAction = 'CHECKOUT' | 'PORTAL' | 'CHANGE_PLAN' | 'CANCEL' | 'RESUME';
export type MembershipActionResult = {
  action: MembershipAction;
  status: 'REDIRECT' | 'PROCESSING' | 'COMPLETED';
  checkoutUrl?: string;
  portalUrl?: string;
  planCode?: CollectorPlanCode;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

const projectedMembershipStatuses: CollectorSubscriptionStatus[] = [
  'INCOMPLETE',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCEL_AT_PERIOD_END',
  'SUSPENDED',
];
const accessStatuses: CollectorSubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'CANCEL_AT_PERIOD_END',
];

/**
 * Stripe billing boundary for Collector memberships. Stripe is only the
 * payment/subscription provider; Slice owns this persisted projection and all
 * entitlement decisions.
 */
@Injectable()
export class CollectorMembershipService {
  constructor(
    private readonly db: PrismaService,
    private readonly stripeFactory: StripeClientFactory,
    private readonly crypto: ProviderCryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async projection(userId: string) {
    const [plans, current] = await Promise.all([
      this.db.collectorPlan.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { monthlyPriceMinor: 'asc' }],
      }),
      this.db.collectorSubscription.findFirst({
        where: { userId, status: { in: projectedMembershipStatuses } },
        include: { plan: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const usable = current && accessStatuses.includes(current.status);
    const usage = await collectorUsageFor(
      this.db,
      userId,
      usable ? current.plan.entitlements : null,
    );
    return {
      current: current
        ? {
            id: current.id,
            code: current.plan.code,
            displayName: current.plan.displayName,
            description: current.plan.description,
            status: current.status,
            currentPeriodStart: current.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: current.cancelAtPeriodEnd,
            entitlements: current.plan.entitlements,
            provider: current.provider,
            paymentMethod: current.paymentMethodLast4
              ? {
                  brand: current.paymentMethodBrand ?? 'Card',
                  last4: current.paymentMethodLast4,
                  expiryMonth: current.paymentMethodExpMonth ?? undefined,
                  expiryYear: current.paymentMethodExpYear ?? undefined,
                }
              : null,
          }
        : null,
      plans: plans.map((plan) => ({
        code: plan.code,
        displayName: plan.displayName,
        description: plan.description,
        monthlyPriceMinor: plan.monthlyPriceMinor.toString(),
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        entitlements: plan.entitlements,
        recommended: plan.code === 'PRO',
        availability: this.planAvailability(plan.code),
      })),
      usage,
      billing: {
        configured: this.billingConfigured(),
        provider: current?.provider ?? null,
        paymentMethod: current?.paymentMethodLast4
          ? {
              brand: current.paymentMethodBrand ?? 'Card',
              last4: current.paymentMethodLast4,
              expiryMonth: current.paymentMethodExpMonth ?? undefined,
              expiryYear: current.paymentMethodExpYear ?? undefined,
            }
          : null,
        nextBillingDate: current?.currentPeriodEnd?.toISOString() ?? null,
      },
    };
  }

  async plans() {
    const rows = await this.db.collectorPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { monthlyPriceMinor: 'asc' }],
    });
    return rows.map((plan) => ({
      id: plan.code,
      code: plan.code,
      displayName: plan.displayName,
      description: plan.description,
      monthlyPriceMinor: plan.monthlyPriceMinor.toString(),
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      entitlements: plan.entitlements,
      recommended: plan.code === 'PRO',
      availability: this.planAvailability(plan.code),
    }));
  }

  /**
   * Market research is a Collector workspace capability. The persisted
   * membership projection, rather than a client flag, decides whether a
   * Collector may spend provider quota or create a research snapshot.
   */
  async assertMarketResearchAccess(userId: string) {
    const current = await this.current(userId);
    if (!current || !accessStatuses.includes(current.status)) {
      throw new ConflictException({
        code: 'COLLECTOR_PLAN_REQUIRED',
        message: 'An active Collector plan is required before using market research.',
      });
    }
    const entitlements = current.plan.entitlements;
    const tier = entitlements && typeof entitlements === 'object' && !Array.isArray(entitlements)
      ? (entitlements as Record<string, unknown>).marketResearchTier
      : null;
    if (typeof tier !== 'string' || tier.length === 0) {
      throw new ConflictException({
        code: 'MEMBERSHIP_FEATURE_UNAVAILABLE',
        feature: 'MARKET_RESEARCH',
        message: 'Market research is not included in this membership plan.',
      });
    }
  }

  async action(userId: string, action: MembershipAction, planCode: CollectorPlanCode | undefined, idempotencyKey: string): Promise<MembershipActionResult> {
    if (this.config.providerMode === 'local') {
      throw this.unavailable('Collector membership billing requires Stripe Sandbox or Stripe Live.');
    }
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey)) {
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid idempotency key is required.' });
    }
    if (action === 'CHECKOUT') return this.createCheckout(userId, planCode, idempotencyKey);
    if (action === 'PORTAL') return this.createPortal(userId, idempotencyKey);
    if (action === 'CHANGE_PLAN') return this.changePlan(userId, planCode, idempotencyKey);
    if (action === 'CANCEL') return this.cancel(userId, idempotencyKey);
    return this.resume(userId, idempotencyKey);
  }

  async handleWebhook(type: string, payload: Record<string, unknown>, eventId: string, occurredAt: Date) {
    if (type === 'checkout.session.completed') {
      await this.recordCheckoutCompletion(payload);
      return;
    }
    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      await this.syncSubscription(payload, eventId, occurredAt, `WEBHOOK:${type}`);
      return;
    }
    if (type === 'invoice.paid') {
      const subscriptionId = this.objectId(payload.subscription);
      if (!subscriptionId) return;
      const subscription = await this.stripeFactory.get().subscriptions.retrieve(subscriptionId);
      await this.syncSubscription(subscription as unknown as Record<string, unknown>, eventId, occurredAt, 'WEBHOOK:invoice.paid');
      return;
    }
    if (type === 'invoice.payment_failed' || type === 'invoice.payment_action_required') {
      const subscriptionId = this.objectId(payload.subscription);
      if (!subscriptionId) return;
      await this.markPaymentIssue(subscriptionId, eventId, occurredAt, type);
    }
  }

  private async createCheckout(userId: string, requestedPlan: CollectorPlanCode | undefined, idempotencyKey: string): Promise<MembershipActionResult> {
    if (!requestedPlan) throw new ConflictException({ code: 'MEMBERSHIP_PLAN_REQUIRED', message: 'Choose a membership plan.' });
    const plan = await this.plan(requestedPlan);
    const priceId = this.priceId(plan.code);
    const stripe = this.stripeFactory.get();
    const customer = await this.customerFor(userId, stripe);
    const current = await this.current(userId);
    if (current && accessStatuses.includes(current.status)) {
      if (current.plan.code === plan.code) throw new ConflictException({ code: 'MEMBERSHIP_ALREADY_ACTIVE', message: 'That plan is already active.' });
      return this.changePlan(userId, plan.code, idempotencyKey);
    }
    const pending = current?.status === 'INCOMPLETE' && current.providerCustomerId === customer.id && current.providerPriceId === priceId ? current : null;
    if (pending?.providerCheckoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(pending.providerCheckoutSessionId);
      if (existing.status !== 'expired' && existing.url) return { action: 'CHECKOUT', status: 'REDIRECT', checkoutUrl: existing.url, planCode: plan.code };
    }
    const membership = pending ?? await this.db.collectorSubscription.create({
      data: {
        id: randomUUID(),
        userId,
        planId: plan.id,
        status: 'INCOMPLETE',
        provider: providerCode(this.config.providerMode),
        providerCustomerId: customer.id,
        providerPriceId: priceId,
      },
    });
    let checkout: Stripe.Checkout.Session;
    try {
      checkout = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.id,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${this.config.appPublicUrl}/collector-workspace?section=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.config.appPublicUrl}/collector-workspace?section=subscription&checkout=cancelled`,
        client_reference_id: membership.id,
        metadata: this.metadata(userId, membership.id, plan.code),
        subscription_data: { metadata: this.metadata(userId, membership.id, plan.code) },
        allow_promotion_codes: false,
      }, { idempotencyKey: `slice-membership-checkout:${this.stripeFactory.environment()}:${membership.id}:${idempotencyKey}` });
    } catch {
      throw this.unavailable('Secure membership checkout could not be started.');
    }
    if (!checkout.url || checkout.mode !== 'subscription' || checkout.livemode !== (this.config.providerMode === 'stripe_live') || String(checkout.customer) !== customer.id) {
      throw this.unavailable('Secure membership checkout could not be verified.');
    }
    await this.db.collectorSubscription.update({ where: { id: membership.id }, data: { providerCheckoutSessionId: checkout.id } });
    return { action: 'CHECKOUT', status: 'REDIRECT', checkoutUrl: checkout.url, planCode: plan.code };
  }

  private async createPortal(userId: string, idempotencyKey: string): Promise<MembershipActionResult> {
    const current = await this.current(userId);
    if (!current?.providerCustomerId || !current.providerSubscriptionId) throw new ConflictException({ code: 'MEMBERSHIP_PORTAL_UNAVAILABLE', message: 'Billing management becomes available after your subscription is confirmed.' });
    try {
      const portal = await this.stripeFactory.get().billingPortal.sessions.create({ customer: current.providerCustomerId, return_url: `${this.config.appPublicUrl}/collector-workspace?section=subscription` }, { idempotencyKey: `slice-membership-portal:${this.stripeFactory.environment()}:${current.id}:${idempotencyKey}` });
      if (!portal.url) throw new Error('PORTAL_URL_MISSING');
      await this.audit('MEMBERSHIP_BILLING_PORTAL_OPENED', userId, current.id, { result: 'SUCCESS' });
      return { action: 'PORTAL', status: 'REDIRECT', portalUrl: portal.url };
    } catch {
      throw this.unavailable('Billing management is temporarily unavailable.');
    }
  }

  private async changePlan(userId: string, targetCode: CollectorPlanCode | undefined, idempotencyKey: string): Promise<MembershipActionResult> {
    if (!targetCode) throw new ConflictException({ code: 'MEMBERSHIP_PLAN_REQUIRED', message: 'Choose a membership plan.' });
    const current = await this.current(userId);
    if (!current?.providerSubscriptionId || !current.providerCustomerId || !accessStatuses.includes(current.status)) throw new ConflictException({ code: 'MEMBERSHIP_CHANGE_UNAVAILABLE', message: 'Your membership is still being confirmed.' });
    const target = await this.plan(targetCode);
    if (target.code === current.plan.code) throw new ConflictException({ code: 'MEMBERSHIP_PLAN_UNCHANGED', message: 'That plan is already active.' });
    await this.assertWithinPlan(userId, target.entitlements);
    const stripe = this.stripeFactory.get();
    const remote = await stripe.subscriptions.retrieve(current.providerSubscriptionId);
    const item = remote.items.data[0];
    if (!item) throw this.unavailable('Your Stripe subscription has no billable plan item.');
    let updated: Stripe.Subscription;
    try {
      updated = await stripe.subscriptions.update(remote.id, {
        items: [{ id: item.id, price: this.priceId(target.code) }],
        proration_behavior: 'create_prorations',
        payment_behavior: 'pending_if_incomplete',
        metadata: this.metadata(userId, current.id, target.code),
      }, { idempotencyKey: `slice-membership-change:${this.stripeFactory.environment()}:${current.id}:${target.code}:${idempotencyKey}` });
    } catch {
      throw this.unavailable('The membership plan could not be changed.');
    }
    await this.syncSubscription(updated as unknown as Record<string, unknown>, `api:${idempotencyKey}`, new Date(), 'API:CHANGE_PLAN', userId, target.code);
    return { action: 'CHANGE_PLAN', status: 'PROCESSING', planCode: target.code, currentPeriodEnd: subscriptionPeriodEnd(updated) };
  }

  private async cancel(userId: string, idempotencyKey: string): Promise<MembershipActionResult> {
    const current = await this.requireRemoteMembership(userId);
    if (current.cancelAtPeriodEnd) return { action: 'CANCEL', status: 'COMPLETED', cancelAtPeriodEnd: true, currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null };
    try {
      const updated = await this.stripeFactory.get().subscriptions.update(current.providerSubscriptionId!, { cancel_at_period_end: true }, { idempotencyKey: `slice-membership-cancel:${this.stripeFactory.environment()}:${current.id}:${idempotencyKey}` });
      await this.syncSubscription(updated as unknown as Record<string, unknown>, `api:${idempotencyKey}`, new Date(), 'API:CANCEL', userId);
      return { action: 'CANCEL', status: 'PROCESSING', cancelAtPeriodEnd: true, currentPeriodEnd: subscriptionPeriodEnd(updated) };
    } catch {
      throw this.unavailable('Membership cancellation could not be started.');
    }
  }

  private async resume(userId: string, idempotencyKey: string): Promise<MembershipActionResult> {
    const current = await this.requireRemoteMembership(userId);
    if (!current.cancelAtPeriodEnd) return { action: 'RESUME', status: 'COMPLETED', cancelAtPeriodEnd: false, currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null };
    try {
      const updated = await this.stripeFactory.get().subscriptions.update(current.providerSubscriptionId!, { cancel_at_period_end: false }, { idempotencyKey: `slice-membership-resume:${this.stripeFactory.environment()}:${current.id}:${idempotencyKey}` });
      await this.syncSubscription(updated as unknown as Record<string, unknown>, `api:${idempotencyKey}`, new Date(), 'API:RESUME', userId);
      return { action: 'RESUME', status: 'PROCESSING', cancelAtPeriodEnd: false, currentPeriodEnd: subscriptionPeriodEnd(updated) };
    } catch {
      throw this.unavailable('Membership reactivation could not be started.');
    }
  }

  private async recordCheckoutCompletion(payload: Record<string, unknown>) {
    if (this.text(payload.mode) !== 'subscription') return;
    const membershipId = this.text(this.metadataFrom(payload).slice_membership_id) ?? this.text(payload.client_reference_id);
    if (!membershipId) return;
    const subscriptionId = this.objectId(payload.subscription);
    await this.db.collectorSubscription.updateMany({
      where: { id: membershipId, provider: providerCode(this.config.providerMode) },
      data: { providerCustomerId: this.objectId(payload.customer) ?? undefined, providerSubscriptionId: subscriptionId ?? undefined, providerCheckoutSessionId: this.text(payload.id) ?? undefined },
    });
  }

  private async markPaymentIssue(subscriptionId: string, eventId: string, occurredAt: Date, type: string) {
    const row = await this.db.collectorSubscription.findUnique({ where: { providerSubscriptionId: subscriptionId } });
    if (!row || (row.lastProviderEventCreatedAt && row.lastProviderEventCreatedAt > occurredAt)) return;
    await this.db.$transaction(async (db) => {
      const updated = await db.collectorSubscription.update({ where: { id: row.id }, data: { status: 'PAST_DUE', lastProviderEventCreatedAt: occurredAt, lastProviderEventIdHash: this.crypto.hash(eventId) } });
      await this.statusHistory(db, row.id, row.status, updated.status, `WEBHOOK:${type}`, this.crypto.hash(eventId), 'Payment requires attention.');
      await this.auditWithDb(db, 'MEMBERSHIP_PAYMENT_FAILED', row.userId, row.id, { providerEventType: type });
    });
  }

  private async syncSubscription(payload: Record<string, unknown>, eventId: string, occurredAt: Date, source: string, fallbackUserId?: string, fallbackPlanCode?: CollectorPlanCode) {
    const subscriptionId = this.text(payload.id);
    const customerId = this.objectId(payload.customer);
    if (!subscriptionId || !customerId) return;
    const metadata = this.metadataFrom(payload);
    const userId = this.text(metadata.slice_user_id) ?? fallbackUserId;
    const existing = await this.db.collectorSubscription.findFirst({ where: { OR: [{ providerSubscriptionId: subscriptionId }, { providerCustomerId: customerId }, ...(userId ? [{ userId, provider: providerCode(this.config.providerMode) }] : [])] }, include: { plan: true }, orderBy: { updatedAt: 'desc' } });
    const planCode = this.codeForPriceId(this.objectId(this.subscriptionItemPrice(payload))) ?? this.text(metadata.slice_membership_plan) as CollectorPlanCode | null ?? fallbackPlanCode ?? existing?.plan.code;
    if (!userId && !existing) return;
    if (!planCode) return;
    const plan = await this.plan(planCode);
    const status = mapStripeStatus(this.text(payload.status), Boolean(payload.cancel_at_period_end));
    const subscriptionItem = this.subscriptionItem(payload);
    const periodStart = epochDate(subscriptionItem?.current_period_start ?? payload.current_period_start);
    const periodEnd = epochDate(subscriptionItem?.current_period_end ?? payload.current_period_end);
    const eventHash = this.crypto.hash(eventId);
    await this.db.$transaction(async (db) => {
      const current = existing ?? await db.collectorSubscription.findFirst({ where: { userId: userId!, provider: providerCode(this.config.providerMode) }, include: { plan: true }, orderBy: { updatedAt: 'desc' } });
      if (current?.lastProviderEventCreatedAt && current.lastProviderEventCreatedAt > occurredAt) return;
      const updated = current
        ? await db.collectorSubscription.update({ where: { id: current.id }, data: { planId: plan.id, status, provider: providerCode(this.config.providerMode), providerCustomerId: customerId, providerSubscriptionId: subscriptionId, providerPriceId: this.objectId(this.subscriptionItemPrice(payload)) ?? this.priceId(plan.code), currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: Boolean(payload.cancel_at_period_end), lastProviderEventCreatedAt: occurredAt, lastProviderEventIdHash: eventHash } })
        : await db.collectorSubscription.create({ data: { id: randomUUID(), userId: userId!, planId: plan.id, status, provider: providerCode(this.config.providerMode), providerCustomerId: customerId, providerSubscriptionId: subscriptionId, providerPriceId: this.objectId(this.subscriptionItemPrice(payload)) ?? this.priceId(plan.code), currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: Boolean(payload.cancel_at_period_end), lastProviderEventCreatedAt: occurredAt, lastProviderEventIdHash: eventHash } });
      if (!current || current.status !== updated.status || current.planId !== updated.planId) await this.statusHistory(db, updated.id, current?.status ?? null, updated.status, source, eventHash, 'Verified Stripe subscription projection.');
      await this.auditWithDb(db, status === 'PAST_DUE' ? 'MEMBERSHIP_PAYMENT_FAILED' : 'MEMBERSHIP_STATUS_SYNCED', updated.userId, updated.id, { status: updated.status, source });
    });
  }

  private async requireRemoteMembership(userId: string) {
    const current = await this.current(userId);
    if (!current || !current.providerSubscriptionId || !current.providerCustomerId || !accessStatuses.includes(current.status)) throw new ConflictException({ code: 'MEMBERSHIP_MANAGEMENT_UNAVAILABLE', message: 'An active Stripe membership is required for this action.' });
    return current;
  }

  private async assertWithinPlan(userId: string, entitlements: Prisma.JsonValue) {
    const usage = await collectorUsageFor(this.db, userId, entitlements);
    const checks: Array<[string, number, string]> = [
      ['ACTIVE_COLLECTIBLES', usage.activeCollectibles, 'maxActiveCollectibles'],
      ['OPEN_DRAFTS', usage.openDrafts, 'maxOpenDrafts'],
      ['OPEN_SUBMISSIONS', usage.openSubmissions, 'maxOpenSubmissions'],
      ['MONTHLY_SUBMISSIONS', usage.monthlySubmissionsUsed, 'monthlySubmissionLimit'],
      ['CONCURRENT_INTAKE', usage.concurrentIntake, 'maxConcurrentIntake'],
    ];
    for (const [limitType, current, key] of checks) {
      const maximum = numberEntitlement(entitlements, key);
      if (maximum !== null && current > maximum) throw new ConflictException({ code: 'MEMBERSHIP_DOWNGRADE_USAGE_CONFLICT', limitType, current, maximum, message: 'Your current usage is above that plan. Reduce usage before changing plans.' });
    }
  }

  private async current(userId: string) {
    return this.db.collectorSubscription.findFirst({ where: { userId, status: { in: projectedMembershipStatuses } }, include: { plan: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
  }

  private async plan(code: CollectorPlanCode) {
    const plan = await this.db.collectorPlan.findFirst({ where: { code, active: true } });
    if (!plan || plan.currency !== 'GBP' || plan.billingInterval !== 'month') throw new ConflictException({ code: 'MEMBERSHIP_PLAN_UNAVAILABLE', message: 'That membership plan is not available.' });
    return plan;
  }

  private priceId(code: CollectorPlanCode) {
    const priceId = code === 'STARTER' ? this.config.stripeMembershipStarterPriceId : code === 'PRO' ? this.config.stripeMembershipProPriceId : this.config.stripeMembershipElitePriceId;
    if (!priceId || !priceId.startsWith('price_')) throw new ServiceUnavailableException({ code: 'MEMBERSHIP_PRICE_NOT_CONFIGURED', message: 'This membership plan is not configured for Stripe billing.' });
    return priceId;
  }

  private planAvailability(code: CollectorPlanCode) {
    return this.config.providerMode !== 'local' && this.billingConfigured() && Boolean(this.priceIdForProjection(code)) ? 'AVAILABLE' : 'PROVIDER_CONFIGURATION_REQUIRED';
  }

  private priceIdForProjection(code: CollectorPlanCode) {
    return code === 'STARTER' ? this.config.stripeMembershipStarterPriceId : code === 'PRO' ? this.config.stripeMembershipProPriceId : this.config.stripeMembershipElitePriceId;
  }

  private billingConfigured() {
    return this.config.providerMode !== 'local' && Boolean(this.config.stripeSecretKey && this.config.stripePublishableKey && this.config.stripeWebhookSecret);
  }

  private async customerFor(userId: string, stripe: Stripe) {
    const provider = providerCode(this.config.providerMode);
    const environment = this.stripeFactory.environment();
    const existing = await this.db.externalProviderCustomer.findUnique({ where: { provider_environment_userId: { provider, environment, userId } } });
    if (existing) return { id: existing.externalCustomerId, environment };
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const customer = await stripe.customers.create({ email: user.email, metadata: { slice_user_id: userId, slice_environment: environment, slice_billing_scope: 'COLLECTOR_MEMBERSHIP' } }, { idempotencyKey: `slice-customer:${environment}:${userId}` });
    try {
      await this.db.externalProviderCustomer.create({ data: { id: randomUUID(), userId, provider, environment, externalCustomerId: customer.id } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
    return { id: customer.id, environment };
  }

  private metadata(userId: string, membershipId: string, planCode: CollectorPlanCode) {
    return { slice_user_id: userId, slice_membership_id: membershipId, slice_membership_plan: planCode, slice_environment: this.stripeFactory.environment(), slice_billing_scope: 'COLLECTOR_MEMBERSHIP' };
  }

  private metadataFrom(value: Record<string, unknown>) {
    return value.metadata && typeof value.metadata === 'object' ? value.metadata as Record<string, unknown> : {};
  }

  private subscriptionItemPrice(value: Record<string, unknown>) {
    return this.subscriptionItem(value)?.price ?? null;
  }

  private subscriptionItem(value: Record<string, unknown>) {
    const items = value.items && typeof value.items === 'object' ? value.items as Record<string, unknown> : null;
    const data = items?.data;
    return Array.isArray(data) && data[0] && typeof data[0] === 'object' ? data[0] as Record<string, unknown> : null;
  }

  private codeForPriceId(priceId: string | null) {
    if (priceId === this.config.stripeMembershipStarterPriceId) return 'STARTER' as const;
    if (priceId === this.config.stripeMembershipProPriceId) return 'PRO' as const;
    if (priceId === this.config.stripeMembershipElitePriceId) return 'ELITE' as const;
    return null;
  }

  private objectId(value: unknown) {
    return typeof value === 'string' ? value : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : null;
  }

  private text(value: unknown) { return typeof value === 'string' && value.length > 0 ? value : null; }

  private async statusHistory(db: Prisma.TransactionClient, subscriptionId: string, fromStatus: CollectorSubscriptionStatus | null, toStatus: CollectorSubscriptionStatus, source: string, providerEventIdHash: string | null, reason: string) {
    await db.collectorSubscriptionStatusHistory.create({ data: { id: randomUUID(), subscriptionId, fromStatus, toStatus, source, providerEventIdHash, reason } });
  }

  private async audit(action: string, userId: string, resourceId: string, metadata: Record<string, unknown>) {
    await this.db.$transaction(async (db) => this.auditWithDb(db, action, userId, resourceId, metadata));
  }

  private async auditWithDb(db: Prisma.TransactionClient, action: string, userId: string | null, resourceId: string, metadata: Record<string, unknown>) {
    await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: userId ? userId as never : null, actorType: userId ? 'USER' : 'SYSTEM', action, resourceType: 'collector-membership', resourceId, requestId: null, sessionId: null, result: 'SUCCESS', metadata, createdAt: new Date() });
  }

  private unavailable(message: string) { return new ServiceUnavailableException({ code: 'MEMBERSHIP_BILLING_UNAVAILABLE', message }); }
}

function mapStripeStatus(status: string | null, cancelAtPeriodEnd: boolean): CollectorSubscriptionStatus {
  if (status === 'trialing') return 'TRIALING';
  if (status === 'active') return cancelAtPeriodEnd ? 'CANCEL_AT_PERIOD_END' : 'ACTIVE';
  if (status === 'past_due') return 'PAST_DUE';
  if (status === 'canceled') return 'CANCELLED';
  if (status === 'unpaid' || status === 'paused') return 'SUSPENDED';
  if (status === 'incomplete_expired') return 'EXPIRED';
  return 'INCOMPLETE';
}

function epochDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const value = subscription.items.data[0]?.current_period_end;
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
}
