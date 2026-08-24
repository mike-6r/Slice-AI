import type { AppConfig } from '../../../config/app-config';
import { AccountCapabilityService } from './account-capability.service';

const config = (overrides: Partial<AppConfig> = {}) =>
  ({
    providerMode: 'local',
    operationalFeatures: {
      trading: true,
      deposits: true,
      withdrawals: true,
      listing: true,
    },
    ...overrides,
  }) as AppConfig;

const user = (overrides: Record<string, unknown> = {}) => ({
  accountStatus: 'ACTIVE',
  emailVerifiedAt: new Date(),
  phoneVerifiedAt: new Date(),
  twoFactor: { enabledAt: new Date() },
  complianceCases: [{ status: 'APPROVED' }],
  complianceHolds: [],
  deletionRequests: [],
  roleAssignments: [],
  externalFinancialAccounts: [],
  externalConnectAccounts: [],
  financialAccounts: [
    {
      normalSide: 'CREDIT',
      balance: { postedDebitMinor: 0n, postedCreditMinor: 10_000n, reservedMinor: 0n },
    },
  ],
  ...overrides,
});

describe('AccountCapabilityService', () => {
  const actor = {
    userId: 'user-1',
    status: 'ACTIVE',
    roles: [],
    sessionId: 'session-1',
  } as never;

  it('keeps browsing and account security available to a pending unverified account', async () => {
    const service = subject(
      user({
        accountStatus: 'PENDING_REVIEW',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        twoFactor: null,
        complianceCases: [],
      }),
    );
    await expect(
      service.evaluate('user-1', 'BROWSE_MARKETS'),
    ).resolves.toMatchObject({ allowed: true, reason: null });
    await expect(
      service.evaluate('user-1', 'MANAGE_ACCOUNT_SECURITY'),
    ).resolves.toMatchObject({ allowed: true, reason: null });
    await expect(
      service.evaluate('user-1', 'PLACE_BUY_ORDER'),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'ACCOUNT_REVIEW_REQUIRED',
    });
  });

  it('returns an ordered, safe remediation reason for each missing high-risk requirement', async () => {
    await expect(
      subject(user({ emailVerifiedAt: null })).evaluate(
        'user-1',
        'PLACE_BUY_ORDER',
      ),
    ).resolves.toMatchObject({ reason: 'EMAIL_VERIFICATION_REQUIRED' });
    await expect(
      subject(user({ phoneVerifiedAt: null })).evaluate(
        'user-1',
        'WITHDRAW_FUNDS',
      ),
    ).resolves.toMatchObject({ reason: 'PHONE_VERIFICATION_REQUIRED' });
    await expect(
      subject(user({ twoFactor: null })).evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({ reason: 'TWO_FACTOR_REQUIRED' });
    await expect(
      subject(user({ complianceCases: [] })).evaluate(
        'user-1',
        'PLACE_SELL_ORDER',
      ),
    ).resolves.toMatchObject({ reason: 'IDENTITY_VERIFICATION_REQUIRED' });
  });

  it('gives account restrictions priority over verified state and roles', async () => {
    const service = subject(user({ accountStatus: 'RESTRICTED' }));
    await expect(
      service.evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({ allowed: false, reason: 'ACCOUNT_RESTRICTED' });
    await expect(
      service.require(actor, 'WITHDRAW_FUNDS'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_RESTRICTED' }),
    });

    const elevatedActor = {
      userId: 'user-1',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      sessionId: 'session-1',
    } as never;
    await expect(
      subject(user({ complianceCases: [] })).require(
        elevatedActor,
        'PLACE_BUY_ORDER',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'IDENTITY_VERIFICATION_REQUIRED',
      }),
    });
  });

  it('allows an active user only after every required state is authoritative', async () => {
    await expect(
      subject(user()).evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({ allowed: true, reason: null });
    await expect(
      subject(user()).evaluate('user-1', 'PLACE_SELL_ORDER'),
    ).resolves.toMatchObject({ allowed: true, reason: null });
  });

  it('denies high-risk actions while deletion is pending without locking security access', async () => {
    const service = subject(user({ deletionRequests: [{ id: 'delete-1' }] }));
    await expect(
      service.evaluate('user-1', 'DEPOSIT_FUNDS'),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'ACCOUNT_DELETION_PENDING',
    });
    await expect(
      service.evaluate('user-1', 'MANAGE_ACCOUNT_SECURITY'),
    ).resolves.toMatchObject({ allowed: true, reason: null });
  });

  it('preserves feature kill switches', async () => {
    const service = subject(
      user(),
      config({
        operationalFeatures: {
          trading: false,
          deposits: true,
          withdrawals: true,
          listing: true,
          realtime: true,
        },
      }),
    );
    await expect(
      service.evaluate('user-1', 'PLACE_BUY_ORDER'),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'TEMPORARILY_UNAVAILABLE',
      reason: 'TRADING_UNAVAILABLE',
    });
  });

  it('reports feature-specific funding availability without bypassing the kill switch', async () => {
    const service = subject(
      user(),
      config({
        providerMode: 'stripe_sandbox',
        operationalFeatures: {
          trading: true,
          deposits: false,
          withdrawals: false,
          listing: true,
          realtime: true,
        },
      }),
    );
    await expect(
      service.evaluate('user-1', 'DEPOSIT_FUNDS'),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'TEMPORARILY_UNAVAILABLE',
      reason: 'DEPOSITS_UNAVAILABLE',
    });
    await expect(
      service.evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'TEMPORARILY_UNAVAILABLE',
      reason: 'WITHDRAWALS_UNAVAILABLE',
    });
  });

  it('separates bank and payout setup from identity and security requirements', async () => {
    const service = subject(
      user(),
      config({
        providerMode: 'stripe_sandbox',
        operationalFeatures: {
          trading: true,
          deposits: true,
          withdrawals: true,
          listing: true,
          realtime: true,
        },
      }),
    );
    await expect(
      service.evaluate('user-1', 'DEPOSIT_FUNDS'),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'BANK_ACCOUNT_REQUIRED',
      requirements: expect.arrayContaining([
        { type: 'BANK_ACCOUNT', satisfied: false },
      ]),
    });
    await expect(
      service.evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'ACTION_REQUIRED',
      reason: 'PAYOUT_ACCOUNT_REQUIRED',
      requirements: expect.arrayContaining([
        { type: 'PAYOUT_ACCOUNT', satisfied: false },
      ]),
    });
  });

  it('allows a verified investor to withdraw when the reusable payout account is ready', async () => {
    const service = subject(
      user({
        roleAssignments: [],
        externalConnectAccounts: [{ status: 'READY' }],
      }),
      config({
        providerMode: 'stripe_sandbox',
        operationalFeatures: {
          trading: true,
          deposits: true,
          withdrawals: true,
          listing: true,
          realtime: true,
        },
      }),
    );
    await expect(
      service.evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({ allowed: true, reason: null });
  });

  it('reports zero withdrawable balance separately from account or provider blockers', async () => {
    const service = subject(
      user({ financialAccounts: [] }),
      config({
        providerMode: 'local',
        operationalFeatures: {
          trading: true,
          deposits: true,
          withdrawals: true,
          listing: true,
          realtime: true,
        },
      }),
    );
    await expect(
      service.evaluate('user-1', 'WITHDRAW_FUNDS'),
    ).resolves.toMatchObject({
      allowed: false,
      reason: 'NO_WITHDRAWABLE_BALANCE',
      requirements: expect.arrayContaining([{ type: 'CASH_BALANCE', satisfied: false }]),
    });
  });

  it('uses the active provider KYC case instead of an approval from another provider', async () => {
    const service = subject(
      user({ complianceCases: [{ status: 'PENDING' }] }),
      config({
        providerMode: 'stripe_sandbox',
        operationalFeatures: {
          trading: true,
          deposits: true,
          withdrawals: true,
          listing: true,
          realtime: true,
        },
      }),
    );
    await expect(
      service.evaluate('user-1', 'PLACE_BUY_ORDER'),
    ).resolves.toMatchObject({
      allowed: false,
      status: 'ACTION_REQUIRED',
      reason: 'COMPLIANCE_REVIEW_REQUIRED',
      requirements: expect.arrayContaining([
        { type: 'IDENTITY_VERIFICATION', satisfied: false },
      ]),
    });
  });

  it('does not expose internal compliance detail in the summary', async () => {
    const result = await subject(
      user({
        complianceCases: [
          { status: 'REVIEW', providerReferenceCiphertext: 'private' },
        ],
      }),
    ).summary(actor);
    expect(JSON.stringify(result)).not.toMatch(
      /providerReference|ciphertext|score|note/i,
    );
    expect(
      result.capabilities.find((item) => item.capability === 'PLACE_BUY_ORDER'),
    ).toMatchObject({ reason: 'COMPLIANCE_REVIEW_REQUIRED' });
  });
});

function subject(record: Record<string, unknown>, currentConfig = config()) {
  return new AccountCapabilityService(
    { user: { findUnique: jest.fn().mockResolvedValue(record) } } as never,
    currentConfig,
  );
}
