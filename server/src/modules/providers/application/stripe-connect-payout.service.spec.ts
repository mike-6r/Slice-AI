import { jest } from '@jest/globals';
import {
  mapConnectAccountStatus,
  mapV2ConnectAccountStatus,
  StripeConnectPayoutService,
} from './stripe-connect-payout.service';

describe('StripeConnectPayoutService', () => {
  const account = (
    requirements: Record<string, unknown>,
    capabilities: Record<string, unknown>,
    detailsSubmitted = true,
    payoutsEnabled = false,
  ) =>
    ({
      details_submitted: detailsSubmitted,
      payouts_enabled: payoutsEnabled,
      requirements,
      capabilities,
    }) as never;

  it('does not treat onboarding completion alone as payout readiness', () => {
    expect(
      mapConnectAccountStatus(
        account(
          {
            currently_due: [],
            past_due: [],
            pending_verification: [],
            errors: [],
            disabled_reason: null,
          },
          { transfers: 'active' },
        ),
      ),
    ).toBe('RESTRICTED');
    expect(
      mapConnectAccountStatus(
        account(
          {
            currently_due: [],
            past_due: [],
            pending_verification: [],
            errors: [],
            disabled_reason: null,
          },
          { transfers: 'active' },
          true,
          true,
        ),
      ),
    ).toBe('READY');
  });

  it('maps safe Stripe requirement states', () => {
    expect(
      mapConnectAccountStatus(
        account(
          {
            currently_due: ['individual.verification.document'],
            past_due: [],
            pending_verification: [],
            errors: [],
            disabled_reason: null,
          },
          { transfers: 'pending' },
          false,
        ),
      ),
    ).toBe('ACTION_REQUIRED');
    expect(
      mapConnectAccountStatus(
        account(
          {
            currently_due: [],
            past_due: [],
            pending_verification: ['individual.verification'],
            errors: [],
            disabled_reason: null,
          },
          { transfers: 'pending' },
        ),
      ),
    ).toBe('UNDER_REVIEW');
    expect(
      mapConnectAccountStatus(
        account(
          {
            currently_due: [],
            past_due: ['individual.verification'],
            pending_verification: [],
            errors: [],
            disabled_reason: 'requirements.past_due',
          },
          { transfers: 'inactive' },
        ),
      ),
    ).toBe('DISABLED');
  });

  it('maps Accounts v2 recipient capability states safely', () => {
    const v2Account = (
      payouts: string,
      transfers: string,
      entries: unknown[] = [],
    ) =>
      ({
        object: 'v2.core.account',
        id: 'acct_v2_test',
        requirements: { entries },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                payouts: { status: payouts },
                stripe_transfers: { status: transfers },
              },
            },
          },
        },
      }) as never;

    expect(mapV2ConnectAccountStatus(v2Account('active', 'active'))).toBe(
      'READY',
    );
    expect(mapV2ConnectAccountStatus(v2Account('pending', 'active'))).toBe(
      'UNDER_REVIEW',
    );
    expect(
      mapV2ConnectAccountStatus(
        v2Account('active', 'active', [{ awaiting_action_from: 'user' }]),
      ),
    ).toBe('ACTION_REQUIRED');
    expect(mapV2ConnectAccountStatus(v2Account('restricted', 'active'))).toBe(
      'RESTRICTED',
    );
  });

  it('exposes reusable payout setup to a normal user without a collector role', async () => {
    const service = new StripeConnectPayoutService(
      {
        externalConnectAccount: {
          findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
        },
      } as never,
      {} as never,
      {
        provider: () => 'STRIPE_SANDBOX',
        environment: () => 'SANDBOX',
      } as never,
      {} as never,
    );
    await expect(
      service.status({ roles: ['USER'], userId: 'u-1' } as never),
    ).resolves.toMatchObject({ status: 'NOT_STARTED' });
  });

  it('creates an Accounts v2 recipient account for new payout onboarding', async () => {
    const account = {
      object: 'v2.core.account',
      id: 'acct_v2_test',
      requirements: { entries: [{ awaiting_action_from: 'user' }] },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              payouts: { status: 'pending' },
              stripe_transfers: { status: 'pending' },
            },
          },
        },
      },
    } as never;
    const stripe = {
      v2: {
        core: {
          accounts: {
            create: jest.fn().mockResolvedValue(account),
            retrieve: jest.fn(),
          },
          accountLinks: {
            create: jest
              .fn<() => Promise<{ url: string; expires_at: number }>>()
              .mockResolvedValue({
                url: 'https://connect.stripe.test/onboarding',
                expires_at: 1770000000,
              }),
          },
        },
      },
      accounts: {
        retrieve: jest.fn(),
      },
    };
    const findUser = jest
      .fn<
        () => Promise<{
          email: string;
          emailVerifiedAt: Date;
          phoneE164: string;
          phoneVerifiedAt: Date;
          profile: { countryCode: string };
        }>
      >()
      .mockResolvedValue({
        email: 'collector@example.com',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        phoneE164: '+447700900123',
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        profile: { countryCode: 'GB' },
      });
    const findConnect = jest.fn<() => Promise<null>>().mockResolvedValue(null);
    const createConnect = jest
      .fn<
        (input: {
          data: { id: string; externalAccountIdCiphertext: string };
        }) => Promise<{
          id: string;
          status: string;
          requirementsSummary: Record<string, unknown>;
        }>
      >()
      .mockResolvedValue({
        id: 'slice-connect-1',
        status: 'ACTION_REQUIRED',
        requirementsSummary: {
          currentlyDueCount: 1,
          pastDueCount: 0,
          pendingVerificationCount: 0,
          hasValidationErrors: false,
          hasDisabledReason: false,
        },
      });
    const db = {
      user: { findUniqueOrThrow: findUser },
      externalConnectAccount: {
        findUnique: findConnect,
        create: createConnect,
      },
    };
    const encrypt = jest.fn().mockReturnValue('ciphertext');
    const service = new StripeConnectPayoutService(
      db as never,
      {
        encrypt,
        decrypt: jest.fn().mockReturnValue('acct_v2_test'),
        hash: jest.fn().mockReturnValue('hash'),
        keyVersion: 'v1',
      } as never,
      {
        get: () => stripe,
        provider: () => 'STRIPE_SANDBOX',
        environment: () => 'SANDBOX',
      } as never,
      { appPublicUrl: 'https://staging.slicecollectable.com' } as never,
    );

    await expect(
      service.createOnboardingLink(
        { roles: ['USER'], userId: 'u-1' } as never,
        'req-1',
      ),
    ).resolves.toMatchObject({
      onboardingUrl: 'https://connect.stripe.test/onboarding',
      expiresAt: new Date(1770000000 * 1000).toISOString(),
      status: 'ACTION_REQUIRED',
    });
    expect(stripe.v2.core.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: 'collector@example.com',
        contact_phone: '+447700900123',
        dashboard: 'express',
        defaults: {
          currency: 'gbp',
          responsibilities: {
            fees_collector: 'application',
            losses_collector: 'application',
          },
        },
        identity: {
          country: 'GB',
          entity_type: 'individual',
          individual: {
            email: 'collector@example.com',
            phone: '+447700900123',
          },
        },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
      }),
      { idempotencyKey: 'slice-connect-account:SANDBOX:u-1' },
    );
    const rowId = createConnect.mock.calls[0][0].data.id;
    expect(encrypt).toHaveBeenCalledWith(
      'acct_v2_test',
      `connect-account:${rowId}`,
    );
    expect(stripe.v2.core.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_v2_test',
        use_case: expect.objectContaining({ type: 'account_onboarding' }),
      }),
      { idempotencyKey: 'slice-connect-onboarding:SANDBOX:u-1:req-1' },
    );
  });

  it('fills only missing verified contact fields on an existing v2 account', async () => {
    const providerAccount = {
      object: 'v2.core.account',
      id: 'acct_existing',
      contact_email: 'collector@example.com',
      identity: {
        country: 'GB',
        entity_type: 'individual',
        individual: { email: 'collector@example.com' },
      },
      requirements: { entries: [{ awaiting_action_from: 'user' }] },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              payouts: { status: 'pending' },
              stripe_transfers: { status: 'pending' },
            },
          },
        },
      },
    };
    const updatedAccount = {
      ...providerAccount,
      contact_phone: '+447700900123',
      identity: {
        ...providerAccount.identity,
        individual: {
          ...providerAccount.identity.individual,
          phone: '+447700900123',
        },
      },
    };
    const stripe = {
      v2: {
        core: {
          accounts: {
            retrieve: jest
              .fn<() => Promise<unknown>>()
              .mockResolvedValue(providerAccount),
            update: jest
              .fn<
                (
                  id: string,
                  params: Record<string, unknown>,
                  options: Record<string, string>,
                ) => Promise<unknown>
              >()
              .mockResolvedValue(updatedAccount),
          },
          accountLinks: {
            create: jest
              .fn<() => Promise<{ url: string; expires_at: number }>>()
              .mockResolvedValue({
                url: 'https://connect.stripe.test/existing',
                expires_at: 1770000000,
              }),
          },
        },
      },
      accounts: { retrieve: jest.fn() },
    };
    const row = {
      id: 'slice-connect-existing',
      userId: 'u-1',
      provider: 'STRIPE_SANDBOX',
      environment: 'SANDBOX',
      externalAccountIdCiphertext: 'ciphertext',
      status: 'ACTION_REQUIRED',
      requirementsSummary: {
        currentlyDueCount: 1,
        pastDueCount: 0,
        pendingVerificationCount: 0,
        hasValidationErrors: false,
        hasDisabledReason: false,
      },
    };
    const findUser = jest.fn<() => Promise<unknown>>().mockResolvedValue({
      email: 'collector@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      phoneE164: '+447700900123',
      phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      profile: { countryCode: 'GB' },
    });
    const sync = jest
      .fn<(input: { data: Record<string, unknown> }) => Promise<unknown>>()
      .mockImplementation(async ({ data }) => ({ ...row, ...data }));
    const service = new StripeConnectPayoutService(
      {
        user: { findUniqueOrThrow: findUser },
        externalConnectAccount: {
          findUnique: jest
            .fn<() => Promise<unknown>>()
            .mockResolvedValue(row),
          update: sync,
        },
      } as never,
      {
        encrypt: jest.fn(),
        decrypt: jest.fn().mockReturnValue('acct_existing'),
        hash: jest.fn().mockReturnValue('hash'),
        keyVersion: 'v1',
      } as never,
      {
        get: () => stripe,
        provider: () => 'STRIPE_SANDBOX',
        environment: () => 'SANDBOX',
      } as never,
      { appPublicUrl: 'https://staging.slicecollectable.com' } as never,
    );

    await expect(
      service.createOnboardingLink(
        { roles: ['USER'], userId: 'u-1' } as never,
        'req-existing',
      ),
    ).resolves.toMatchObject({ onboardingUrl: 'https://connect.stripe.test/existing' });
    expect(stripe.v2.core.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_existing',
        use_case: expect.objectContaining({
          type: 'account_update',
          account_update: expect.objectContaining({
            configurations: ['recipient'],
            collection_options: {
              fields: 'currently_due',
              future_requirements: 'include',
            },
          }),
        }),
      }),
      { idempotencyKey: 'slice-connect-onboarding:SANDBOX:u-1:req-existing' },
    );
    expect(stripe.v2.core.accounts.update).toHaveBeenCalledWith(
      'acct_existing',
      expect.objectContaining({
        contact_phone: '+447700900123',
        identity: { individual: { phone: '+447700900123' } },
        include: ['configuration.recipient', 'requirements', 'identity'],
      }),
      { idempotencyKey: 'slice-connect-account-prefill:SANDBOX:u-1' },
    );
    expect(stripe.v2.core.accounts.update.mock.calls[0][1]).not.toHaveProperty(
      'identity.individual.given_name',
    );
  });
});
