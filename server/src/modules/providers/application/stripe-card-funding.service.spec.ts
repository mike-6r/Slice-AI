import { jest } from '@jest/globals';
import { StripeCardFundingService } from './stripe-card-funding.service';

describe('StripeCardFundingService', () => {
  const config = {
    providerMode: 'stripe_sandbox',
    stripeCardFundingEnabled: true,
  };

  it('fails closed when card funding is not explicitly enabled', () => {
    const service = new StripeCardFundingService(
      {} as never,
      {} as never,
      {
        provider: () => 'STRIPE_SANDBOX',
        publishableKey: () => 'pk_test_slice',
      } as never,
      { ...config, stripeCardFundingEnabled: false } as never,
    );

    expect(service.options()).toEqual({
      available: false,
      provider: 'STRIPE_SANDBOX',
      currency: 'GBP',
      reason: 'Card funding is not enabled for this environment.',
    });
  });

  it('creates a GBP PaymentIntent with a Slice movement idempotency key and no card data', async () => {
    const paymentIntentsCreate = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      id: 'pi_test_card_123',
      client_secret: 'pi_test_card_123_secret_only_for_customer',
      currency: 'gbp',
      livemode: false,
    });
    const db = {
      externalProviderCustomer: {
        findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
        create: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          id: 'customer-row',
          externalCustomerId: 'cus_test_123',
        }),
      },
      user: {
        findUniqueOrThrow: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          email: 'buyer@example.test',
        }),
      },
    };
    const service = new StripeCardFundingService(
      db as never,
      {} as never,
      {
        get: () => ({
          customers: {
            create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'cus_test_123' }),
          },
          paymentIntents: { create: paymentIntentsCreate },
        }),
        provider: () => 'STRIPE_SANDBOX',
        environment: () => 'SANDBOX',
        publishableKey: () => 'pk_test_slice',
      } as never,
      config as never,
    );

    await expect(
      service.createPaymentIntent({
        userId: 'user-1',
        movementId: 'movement-1',
        amountMinor: '1250',
        savePaymentMethod: true,
      }),
    ).resolves.toMatchObject({
      providerReference: 'pi_test_card_123',
      clientSecret: 'pi_test_card_123_secret_only_for_customer',
      publishableKey: 'pk_test_slice',
      status: 'PENDING_PROVIDER',
    });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1250,
        currency: 'gbp',
        customer: 'cus_test_123',
        payment_method_types: ['card'],
        setup_future_usage: 'on_session',
        metadata: {
          slice_movement_id: 'movement-1',
          slice_currency: 'GBP',
          slice_funding_rail: 'card',
        },
      }),
      expect.objectContaining({
        idempotencyKey: 'slice-card-funding:SANDBOX:movement-1',
      }),
    );
  });
});
