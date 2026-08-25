import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import type { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../auth/auth.service';
import { DiscordLinkService } from './discord-link.service';

const config: AppConfig = {
  environment: 'test',
  host: '127.0.0.1',
  port: 3001,
  corsOrigins: ['http://127.0.0.1:5173'],
  serviceVersion: 'test',
  bodyLimit: '1mb',
  trustProxyHops: 0,
  dbConnectTimeoutMs: 3000,
  redisConnectTimeoutMs: 3000,
  jwtAccessSecret: 'test-only-jwt-secret-must-never-be-used-outside-tests',
  jwtIssuer: 'slice-api',
  jwtAudience: 'slice-web',
  accessTokenTtlSeconds: 900,
  recentAuthWindowSeconds: 300,
  refreshTokenTtlSeconds: 3600,
  refreshCookieName: 'slice_refresh',
  cookieSecure: false,
  appPublicUrl: 'http://127.0.0.1:5173',
  emailDeliveryMode: 'local_test',
  emailEnabled: true,
  emailVerificationTtlSeconds: 3_600,
  emailVerificationResendSeconds: 60,
  passwordResetTtlSeconds: 900,
  phoneVerificationEnabled: true,
  phoneDeliveryMode: 'local_test',
  phoneVerificationTtlSeconds: 600,
  phoneVerificationResendSeconds: 60,
  phoneVerificationMaxAttempts: 5,
  captcha: { enabled: false, provider: 'local_test' },
  signupConsent: { required: false },
  twoFactorChallengeTtlSeconds: 300,
  twoFactorIssuer: 'Slice',
  providerMode: 'local',
  providersProductionEnabled: false,
  stripeLiveEnabled: false,
  stripeBankFundingRail: 'bacs_debit',
  bankChangeWithdrawalHoldHours: 0,
  blockchainAnalysisApiBaseUrl: 'https://blockchainanalysis.io/api/v1',
  blockchainAnalysisRequestTimeoutMs: 10_000,
  providerWebhookToleranceSeconds: 300,
  withdrawalLimitPerMovementMinor: 500_000,
  withdrawalLimit24hMinor: 1_000_000,
  withdrawalLimit7dMinor: 2_500_000,
  outboxWorkerEnabled: false,
  outboxPollIntervalMs: 1000,
  outboxBatchSize: 25,
  outboxLeaseMs: 30_000,
  outboxMaxAttempts: 5,
  outboxRetryBaseMs: 1000,
  outboxRetryMaxMs: 60_000,
  marketRefreshWorkerEnabled: false,
  marketRefreshPollIntervalMs: 300_000,
  marketRefreshBatchSize: 10,
  marketRefreshLeaseMs: 120_000,
  marketRefreshMaxAttempts: 5,
  marketRefreshRetryBaseMs: 30_000,
  marketRefreshRetryMaxMs: 3_600_000,
  priceChartingRequestTimeoutMs: 10_000,
  operationalFeatures: {
    trading: true,
    deposits: true,
    withdrawals: true,
    realtime: true,
    listing: true,
  },
  localSubmissionStorageEnabled: true,
};

const actor = {
  userId: 'user' as Actor['userId'],
  sessionId: 'session',
  status: 'ACTIVE',
  roles: [],
  sessionRevokedAt: null,
  sessionRevocationReason: null,
  authenticatedAt: new Date(),
} satisfies Actor;

function database() {
  const tx = {
    discordOAuthState: { deleteMany: jest.fn(), create: jest.fn() },
    auditEvent: { create: jest.fn() },
    discordAccountLink: { findUnique: jest.fn(), delete: jest.fn() },
    discordBotLinkChallenge: { deleteMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  };
  return {
    discordAccountLink: { findUnique: jest.fn() },
    discordOAuthState: { findUnique: jest.fn(), updateMany: jest.fn() },
    discordBotLinkChallenge: { findUnique: jest.fn() },
    $transaction: jest.fn((work) => work(tx)),
    tx,
  };
}

describe('DiscordLinkService', () => {
  it('fails closed until the OAuth identity provider is configured', async () => {
    const db = database();
    const service = new DiscordLinkService(
      db as unknown as PrismaService,
      config,
    );
    await expect(service.begin(actor, 'request')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns a Discord bot handoff when OAuth is unavailable but the bot link is configured', async () => {
    const db = database();
    const service = new DiscordLinkService(db as unknown as PrismaService, {
      ...config,
      discordBotServiceToken: 'b'.repeat(32),
      discordBotGuildId: '1534870723276046496',
    });

    await expect(service.self('user')).resolves.toMatchObject({
      connected: false,
      configured: true,
      connectionMode: 'bot',
    });
    await expect(service.begin(actor, 'request')).resolves.toEqual({
      authorizationUrl: 'https://discord.com/channels/1534870723276046496',
      mode: 'bot',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('persists only a hash of the short-lived state and requests the identify scope', async () => {
    const db = database();
    const service = new DiscordLinkService(db as unknown as PrismaService, {
      ...config,
      discordOauthClientId: 'client',
      discordOauthClientSecret: 'a-safe-test-secret-value',
      discordOauthRedirectUri:
        'http://127.0.0.1:3001/api/v1/auth/discord/callback',
    });
    const result = await service.begin(actor, 'request');
    expect(result.authorizationUrl).toContain('scope=identify');
    expect(result.authorizationUrl).not.toContain('a-safe-test-secret-value');
    expect(db.tx.discordOAuthState.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user',
          stateHash: expect.not.stringMatching(/^.{43}$/),
        }),
      }),
    );
  });

  it('stores only a hash for a bot-created link challenge and binds it to the Discord identity', async () => {
    const db = database();
    const service = new DiscordLinkService(db as unknown as PrismaService, config);
    const result = await service.createBotChallenge({ discordUserId: 'discord-user', discordUsername: 'slice-member', guildId: 'guild' }, 'request');
    expect(result.challengeUrl).toContain('/account?discordLink=');
    expect(db.tx.discordBotLinkChallenge.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ discordUserId: 'discord-user', tokenHash: expect.not.stringContaining('discord-user') }) }));
    expect(JSON.stringify(db.tx.discordBotLinkChallenge.create.mock.calls)).not.toContain(new URL(result.challengeUrl).searchParams.get('discordLink')!);
  });

  it('rejects expired, used, or unknown bot link challenges', async () => {
    const db = database();
    const service = new DiscordLinkService(db as unknown as PrismaService, config);
    await expect(service.consumeBotChallenge(actor, 'unknown-token', 'request')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks cross-account claims and concurrent replay of a bot challenge', async () => {
    const record = {
      id: 'challenge',
      tokenHash: 'hash',
      discordUserId: 'discord-user',
      discordUsername: 'member',
      discordDisplayName: null,
      guildId: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    };
    const db = database();
    db.discordBotLinkChallenge.findUnique.mockResolvedValue(record);
    db.tx.discordBotLinkChallenge.updateMany.mockResolvedValue({ count: 1 });
    db.tx.discordAccountLink.findUnique
      .mockResolvedValueOnce({ userId: 'other-user' })
      .mockResolvedValueOnce(null);
    const service = new DiscordLinkService(db as unknown as PrismaService, config);
    await expect(service.consumeBotChallenge(actor, 'token', 'request')).rejects.toBeInstanceOf(ConflictException);

    db.tx.discordBotLinkChallenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.consumeBotChallenge(actor, 'token', 'request')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('delegates operations data to the existing Admin projection using current Slice roles', async () => {
    const db = database();
    db.discordAccountLink.findUnique.mockResolvedValue({
      userId: 'admin-user',
      user: { accountStatus: 'ACTIVE', roleAssignments: [{ role: 'ADMIN' }] },
    });
    const operationsOverview = jest.fn().mockResolvedValue({ counts: { pendingReviews: 1 } });
    const service = new DiscordLinkService(
      db as unknown as PrismaService,
      config,
      undefined,
      { operationsOverview } as never,
    );

    await expect(service.botAdminOperations('discord-user')).resolves.toEqual({ counts: { pendingReviews: 1 } });
    expect(operationsOverview).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-user', roles: ['ADMIN'] }));
  });

  it('returns My Slice data only for the account bound to the Discord identity', async () => {
    const db = database();
    db.discordAccountLink.findUnique.mockResolvedValue({
      userId: 'linked-user',
      user: { profile: { publicUsername: 'collector', displayName: 'Collector', preferredCurrency: 'GBP' }, roleAssignments: [{ role: 'COLLECTOR' }] },
    });
    const portfolio = { portfolioForUser: jest.fn().mockResolvedValue({ currency: 'GBP', estimatedPortfolioValueMinor: '100', estimatedHoldingsValueMinor: '50', cash: { accounts: [{ availableMinor: '40', reservedMinor: '10' }] }, holdings: [], valuationStatus: 'AVAILABLE' }) };
    const trading = { customerOpenOrderSummary: jest.fn().mockResolvedValue({ openCount: 1, recent: [] }) };
    const workspace = { overview: jest.fn().mockResolvedValue({ kpis: { totalCollectibles: 1, marketLive: 0, inReview: 1 }, actionSummary: { waitingOnYou: 0 } }), subscription: jest.fn().mockResolvedValue({ current: null, usage: {} }) };
    const service = new DiscordLinkService(db as unknown as PrismaService, config, workspace as never, undefined, portfolio as never, trading as never);

    await expect(service.botMySlice('discord-user')).resolves.toMatchObject({ linked: true, identity: { username: 'collector', capabilities: { collector: true } }, orders: { openCount: 1 } });
    expect(db.discordAccountLink.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { discordUserId: 'discord-user' } }));
    expect(portfolio.portfolioForUser).toHaveBeenCalledWith('linked-user');
    expect(trading.customerOpenOrderSummary).toHaveBeenCalledWith('linked-user');
  });
});
