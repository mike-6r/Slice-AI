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
      { providerMode: 'stripe_sandbox', stripeBankFundingRail: 'bacs_debit', appPublicUrl: 'https://staging.slicecollectable.com' } as never,
    );
    await expect(service.createLinkCheckout({ userId: 'user-1' } as never, 'setup-key-1')).rejects.toMatchObject({
      message: 'Stripe sandbox credentials are not configured.',
    });
    await expect(service.list('user-1')).resolves.toEqual({ items: [] });
  });

  it('creates a GBP Bacs Checkout setup session and never opens Financial Connections', async () => {
    const checkoutSessions = { create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/cs_test', mode: 'setup', status: 'open', livemode: false, customer: 'cus_test', expires_at: 1786233600 }) };
    const stripe = { checkout: { sessions: checkoutSessions }, financialConnections: { sessions: { create: jest.fn() } } };
    const db = {
      externalProviderCustomer: {
        findUnique: jest.fn().mockResolvedValue({ provider: 'STRIPE_SANDBOX', environment: 'SANDBOX', externalCustomerId: 'cus_test' }),
      },
      bacsSetupSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'bacs-session-1' }),
        update: jest.fn(),
      },
    };
    const crypto = { encrypt: jest.fn().mockReturnValue('ciphertext'), hash: jest.fn().mockReturnValue('hash') };
    const service = new BankConnectionService(
      db as never,
      crypto as never,
      { get: () => stripe, environment: () => 'SANDBOX' } as never,
      { providerMode: 'stripe_sandbox', stripeBankFundingRail: 'bacs_debit', appPublicUrl: 'https://staging.slicecollectable.com' } as never,
    );

    await expect(service.createLinkCheckout({ userId: 'user-1' } as never, 'setup-key')).resolves.toMatchObject({
      checkoutSessionId: 'cs_test',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test',
      paymentMethodType: 'bacs_debit',
    });
    expect(checkoutSessions.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'setup',
      customer: 'cus_test',
      payment_method_types: ['bacs_debit'],
      success_url: expect.stringContaining('/wallet/bank/setup/success?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: 'https://staging.slicecollectable.com/wallet',
      metadata: expect.objectContaining({ slice_funding_rail: 'bacs_debit' }),
      setup_intent_data: { metadata: expect.objectContaining({ slice_funding_rail: 'bacs_debit' }) },
    }), expect.objectContaining({ idempotencyKey: expect.stringContaining('slice-bacs-checkout:SANDBOX:bacs-session-1:setup-key') }));
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
        findFirst: jest.fn().mockResolvedValue({ id: 'bank-1', externalPaymentMethodId: 'pm_bacs', providerReferenceCiphertext: null, currency: 'GBP', accountType: 'bacs_debit' }),
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
