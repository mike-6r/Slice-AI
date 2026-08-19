import { BankConnectionService, UnavailableExternalIdentityProvider, providerCode } from './external-provider-boundaries';

describe('Phase 4A external provider boundaries', () => {
  it('maps explicit modes without making an outbound request', async () => {
    expect(providerCode('local')).toBe('LOCAL_TEST');
    expect(providerCode('stripe_sandbox')).toBe('STRIPE_SANDBOX');
    expect(providerCode('stripe_live')).toBe('STRIPE_LIVE');

    const identity = new UnavailableExternalIdentityProvider('STRIPE_SANDBOX');
    await expect(identity.createSession({ userId: 'user-1', requestId: 'request-1' })).rejects.toMatchObject({
      response: {
        code: 'EXTERNAL_PROVIDER_NOT_IMPLEMENTED',
        provider: 'STRIPE_SANDBOX',
      },
    });
  });

  it('keeps bank connection setup fail-closed and returns no fabricated accounts', async () => {
    const service = new BankConnectionService(
      {} as never,
      {} as never,
      { get: () => { throw new Error('Stripe sandbox credentials are not configured.'); } } as never,
      { providerMode: 'stripe_sandbox', stripeBankFundingRail: 'bacs_debit' } as never,
    );
    await expect(service.createLinkToken({ userId: 'user-1' } as never, 'setup-key-1')).rejects.toMatchObject({
      message: 'Stripe sandbox credentials are not configured.',
    });
    await expect(service.list('user-1')).resolves.toEqual({ items: [] });
  });

  it('creates a GBP Bacs SetupIntent and never opens Financial Connections', async () => {
    const setupIntents = { create: jest.fn().mockResolvedValue({ id: 'seti_test', client_secret: 'seti_secret', livemode: false }) };
    const stripe = { setupIntents, financialConnections: { sessions: { create: jest.fn() } } };
    const db = {
      externalProviderCustomer: {
        findUnique: jest.fn().mockResolvedValue({ provider: 'STRIPE_SANDBOX', environment: 'SANDBOX', externalCustomerId: 'cus_test' }),
      },
      bacsSetupSession: { create: jest.fn() },
    };
    const service = new BankConnectionService(
      db as never,
      {} as never,
      { get: () => stripe, environment: () => 'SANDBOX', publishableKey: () => 'pk_test_slice' } as never,
      { providerMode: 'stripe_sandbox', stripeBankFundingRail: 'bacs_debit' } as never,
    );

    await expect(service.createLinkToken({ userId: 'user-1' } as never, 'setup-key')).resolves.toMatchObject({
      setupIntentId: 'seti_test',
      paymentMethodType: 'bacs_debit',
    });
    expect(setupIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_test',
      payment_method_types: ['bacs_debit'],
      usage: 'off_session',
    }), expect.objectContaining({ idempotencyKey: 'slice-bacs-setup:SANDBOX:setup-key' }));
    expect(stripe.financialConnections.sessions.create).not.toHaveBeenCalled();
  });

  it('creates a GBP Bacs PaymentIntent from the user-owned default mandate', async () => {
    const paymentIntents = { create: jest.fn().mockResolvedValue({ id: 'pi_test', status: 'processing', livemode: false }) };
    const stripe = { paymentIntents };
    const db = {
      externalProviderCustomer: {
        findUnique: jest.fn().mockResolvedValue({ provider: 'STRIPE_SANDBOX', environment: 'SANDBOX', externalCustomerId: 'cus_test' }),
      },
      externalFinancialAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bank-1', externalPaymentMethodId: 'pm_bacs', currency: 'GBP', accountType: 'bacs_debit' }),
      },
    };
    const service = new BankConnectionService(
      db as never,
      {} as never,
      { get: () => stripe, environment: () => 'SANDBOX' } as never,
      { providerMode: 'stripe_sandbox', stripeBankFundingRail: 'bacs_debit' } as never,
    );

    await expect(service.createDepositPayment({ userId: 'user-1', movementId: 'movement-1', amountMinor: '12500' })).resolves.toMatchObject({
      providerReference: 'pi_test',
      externalAccountId: 'bank-1',
      status: 'PROCESSING',
    });
    expect(paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 12500,
      currency: 'gbp',
      payment_method: 'pm_bacs',
      payment_method_types: ['bacs_debit'],
      confirm: true,
      off_session: true,
    }), expect.objectContaining({ idempotencyKey: 'slice-deposit:SANDBOX:movement-1' }));
  });

  it('does not expose retained legacy Financial Connections rows as GBP funding methods', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BankConnectionService(
      { externalFinancialAccount: { findMany } } as never,
      {} as never,
      {} as never,
      { providerMode: 'stripe_sandbox', stripeBankFundingRail: 'bacs_debit' } as never,
    );
    await expect(service.list('user-1')).resolves.toEqual({ items: [] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ currency: 'GBP', accountType: 'bacs_debit' }),
    }));
  });
});
