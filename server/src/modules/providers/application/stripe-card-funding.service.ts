/* eslint-disable @typescript-eslint/no-require-imports -- Stripe v22 is CommonJS in the Nest CommonJS build. */
import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Stripe = require('stripe');
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { StripeClientFactory } from './stripe-provider.client';

export type CardFundingOptions = {
  available: boolean;
  provider: 'STRIPE_SANDBOX' | 'STRIPE_LIVE' | null;
  currency: 'GBP';
  reason: string | null;
};

/**
 * Stripe-hosted card collection boundary. The application only creates a
 * PaymentIntent and returns its client secret to the authenticated owner; card
 * number, CVC, 3DS challenge data, and raw Stripe errors never pass through
 * Slice's API or persistence.
 */
@Injectable()
export class StripeCardFundingService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    private readonly stripeFactory: StripeClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  options(): CardFundingOptions {
    if (this.config.providerMode === 'local') {
      return {
        available: false,
        provider: null,
        currency: 'GBP',
        reason: 'Card funding is available only through the configured Stripe environment.',
      };
    }
    if (!this.config.stripeCardFundingEnabled) {
      return {
        available: false,
        provider: this.stripeFactory.provider(),
        currency: 'GBP',
        reason: 'Card funding is not enabled for this environment.',
      };
    }
    try {
      this.stripeFactory.publishableKey();
      return {
        available: true,
        provider: this.stripeFactory.provider(),
        currency: 'GBP',
        reason: null,
      };
    } catch {
      return {
        available: false,
        provider: this.stripeFactory.provider(),
        currency: 'GBP',
        reason: 'Card funding is temporarily unavailable.',
      };
    }
  }

  async createPaymentIntent(input: {
    userId: string;
    movementId: string;
    amountMinor: string;
    savePaymentMethod: boolean;
  }) {
    const options = this.options();
    if (!options.available) {
      throw new ConflictException({
        code: 'CARD_FUNDING_UNAVAILABLE',
        message: options.reason ?? 'Card funding is currently unavailable.',
      });
    }
    const amount = BigInt(input.amountMinor);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ConflictException({
        code: 'STRIPE_AMOUNT_OUT_OF_RANGE',
        message: 'Deposit amount is too large.',
      });
    }
    const stripe = this.stripeFactory.get();
    const customer = await this.customerFor(input.userId, stripe);
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount: Number(amount),
          currency: 'gbp',
          customer: customer.externalCustomerId,
          payment_method_types: ['card'],
          ...(input.savePaymentMethod
            ? { setup_future_usage: 'on_session' as const }
            : {}),
          metadata: {
            slice_movement_id: input.movementId,
            slice_currency: 'GBP',
            slice_funding_rail: 'card',
          },
        },
        {
          idempotencyKey: `slice-card-funding:${this.stripeFactory.environment()}:${input.movementId}`,
        },
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'STRIPE_CARD_FUNDING_FAILED',
        message: 'The secure card payment could not be started. No Slice cash was made available.',
      });
    }
    if (
      !intent.client_secret ||
      intent.currency.toLowerCase() !== 'gbp' ||
      intent.livemode !== (this.config.providerMode === 'stripe_live')
    ) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_CARD_FUNDING_INVALID',
        message: 'The secure card payment could not be prepared. No Slice cash was made available.',
      });
    }
    return {
      providerReference: intent.id,
      clientSecret: intent.client_secret,
      publishableKey: this.stripeFactory.publishableKey(),
      status:
        intent.status === 'canceled'
          ? ('FAILED' as const)
          : ('PENDING_PROVIDER' as const),
    };
  }

  /**
   * Stores only a customer-safe card label after a verified provider event.
   * The full payment method object never becomes a public Slice record.
   */
  async syncInstrumentLabel(movementId: string, paymentIntentId: string) {
    try {
      const intent = await this.stripeFactory
        .get()
        .paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method'] });
      const paymentMethod =
        typeof intent.payment_method === 'string'
          ? await this.stripeFactory.get().paymentMethods.retrieve(intent.payment_method)
          : intent.payment_method;
      if (!paymentMethod || paymentMethod.type !== 'card' || !paymentMethod.card?.last4) return;
      const brand = paymentMethod.card.brand
        ? paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1)
        : 'Card';
      await this.db.moneyMovement.updateMany({
        where: { id: movementId, provider: this.stripeFactory.provider() },
        data: { providerInstrumentLabel: `${brand} •••• ${paymentMethod.card.last4}` },
      });
    } catch {
      // A payment can still settle safely without an optional display label.
      // Reconciliation retains the provider record separately.
    }
  }

  private async customerFor(userId: string, stripe: Stripe) {
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const existing = await this.db.externalProviderCustomer.findUnique({
      where: {
        provider_environment_userId: { provider, environment, userId },
      },
    });
    if (existing) return existing;
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const external = await stripe.customers.create(
      {
        email: user.email,
        metadata: {
          slice_user_id: userId,
          slice_environment: environment,
        },
      },
      { idempotencyKey: `slice-customer:${environment}:${userId}` },
    );
    try {
      return await this.db.externalProviderCustomer.create({
        data: {
          id: randomUUID(),
          userId,
          provider,
          environment,
          externalCustomerId: external.id,
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      return this.db.externalProviderCustomer.findUniqueOrThrow({
        where: {
          provider_environment_userId: { provider, environment, userId },
        },
      });
    }
  }
}
