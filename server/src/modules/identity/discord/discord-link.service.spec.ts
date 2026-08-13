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
  emailVerificationTtlSeconds: 3_600,
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
  bridgeApiBaseUrl: 'https://api.bridge.xyz/v0',
  bridgeRequestTimeoutMs: 10_000,
  plaidEnvironment: 'sandbox',
  plaidRequestTimeoutMs: 10_000,
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
});
