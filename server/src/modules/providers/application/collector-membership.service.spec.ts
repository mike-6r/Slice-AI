import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import type { PrismaService } from '../../../database/prisma.service';
import { CollectorMembershipService } from './collector-membership.service';
import type { ProviderCryptoService } from './provider-crypto.service';
import type { StripeClientFactory } from './stripe-provider.client';

function config(providerMode: AppConfig['providerMode']): AppConfig {
  return { providerMode } as AppConfig;
}

function service(options?: {
  providerMode?: AppConfig['providerMode'];
  db?: Partial<Record<string, unknown>>;
}) {
  const db = {
    collectorSubscription: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    assetSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    ...options?.db,
  } as unknown as PrismaService;
  const stripeFactory = {
    get: jest.fn(),
    environment: jest.fn().mockReturnValue('sandbox'),
  } as unknown as StripeClientFactory;
  const crypto = { hash: jest.fn().mockReturnValue('event-hash') } as unknown as ProviderCryptoService;
  return {
    service: new CollectorMembershipService(
      db,
      stripeFactory,
      crypto,
      config(options?.providerMode ?? 'local'),
    ),
    db,
    stripeFactory,
  };
}

describe('CollectorMembershipService', () => {
  it('fails closed in local mode before any provider call', async () => {
    const { service: membership, stripeFactory } = service();

    await expect(
      membership.action('collector-1', 'CHECKOUT', 'PRO', 'request-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(stripeFactory.get).not.toHaveBeenCalled();
  });

  it('requires a persisted access-status membership for market research', async () => {
    const { service: membership, db } = service();
    const findFirst = (db.collectorSubscription as unknown as { findFirst: jest.Mock }).findFirst;
    findFirst.mockResolvedValue(null);

    await expect(membership.assertMarketResearchAccess('collector-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COLLECTOR_PLAN_REQUIRED' }),
    });
  });

  it('allows market research only when the persisted plan includes the capability', async () => {
    const { service: membership, db } = service();
    const findFirst = (db.collectorSubscription as unknown as { findFirst: jest.Mock }).findFirst;
    findFirst.mockResolvedValue({
      status: 'ACTIVE',
      plan: { entitlements: { marketResearchTier: 'STANDARD' } },
    });

    await expect(membership.assertMarketResearchAccess('collector-1')).resolves.toBeUndefined();
  });

  it('records checkout completion as a pending projection without activating it', async () => {
    const { service: membership, db } = service({ providerMode: 'stripe_sandbox' });
    const updateMany = (db.collectorSubscription as unknown as { updateMany: jest.Mock }).updateMany;

    await membership.handleWebhook(
      'checkout.session.completed',
      {
        id: 'cs_test_membership',
        mode: 'subscription',
        customer: 'cus_test_membership',
        subscription: 'sub_test_membership',
        client_reference_id: 'membership-1',
        metadata: { slice_membership_id: 'membership-1' },
      },
      'evt_checkout',
      new Date('2026-08-22T12:00:00.000Z'),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'membership-1', provider: 'STRIPE_SANDBOX' },
      data: {
        providerCustomerId: 'cus_test_membership',
        providerSubscriptionId: 'sub_test_membership',
        providerCheckoutSessionId: 'cs_test_membership',
      },
    });
  });

  it('rejects malformed idempotency keys before touching Stripe', async () => {
    const { service: membership, stripeFactory } = service({ providerMode: 'stripe_sandbox' });

    await expect(
      membership.action('collector-1', 'CHECKOUT', 'PRO', 'bad key'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stripeFactory.get).not.toHaveBeenCalled();
  });
});
