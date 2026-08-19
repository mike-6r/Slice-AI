import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../auth/auth.service';
import { Inject, Optional } from '@nestjs/common';
import { CollectorWorkspaceService } from '../../collector-workspace/collector-workspace.service';
import { AdminService } from '../../admin/admin.service';
import { PortfolioQueryService } from '../../finance/application/portfolio-query.service';
import { TradingService } from '../../trading/application/trading.service';

type DiscordIdentity = {
  id: string;
  username: string;
  global_name?: string | null;
};

@Injectable()
export class DiscordLinkService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly collectorWorkspace?: CollectorWorkspaceService,
    private readonly admin?: AdminService,
    @Optional() private readonly portfolio?: PortfolioQueryService,
    @Optional() private readonly trading?: TradingService,
  ) {}

  async createBotChallenge(
    input: {
      discordUserId: string;
      discordUsername: string;
      discordDisplayName?: string | null;
      guildId?: string | null;
    },
    requestId: string,
  ) {
    const discordUserId = requiredText(input.discordUserId, 'Discord identity');
    const discordUsername = requiredText(input.discordUsername, 'Discord username');
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.db.$transaction(async (tx) => {
      await tx.discordBotLinkChallenge.deleteMany({
        where: {
          discordUserId,
          OR: [{ consumedAt: { not: null } }, { expiresAt: { lte: new Date() } }],
        },
      });
      // There is only one valid handoff per Discord identity. Repeated button
      // presses replace the old opaque token instead of creating a token pile.
      await tx.discordBotLinkChallenge.deleteMany({
        where: { discordUserId, consumedAt: null, expiresAt: { gt: new Date() } },
      });
      await tx.discordBotLinkChallenge.create({
        data: {
          tokenHash: this.hash(rawToken),
          discordUserId,
          discordUsername,
          discordDisplayName: optionalText(input.discordDisplayName),
          guildId: optionalText(input.guildId),
          expiresAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorType: 'SYSTEM',
          action: 'DISCORD_BOT_LINK_CHALLENGE_CREATED',
          resourceType: 'discord_bot_link_challenge',
          requestId,
          result: 'SUCCESS',
          metadata: { discordUserId, expiresAt: expiresAt.toISOString() },
        },
      });
    });
    const handoff = new URL('/account', this.config.appPublicUrl);
    handoff.searchParams.set('discordLink', rawToken);
    return { challengeUrl: handoff.toString(), expiresAt: expiresAt.toISOString() };
  }

  async consumeBotChallenge(actor: Actor, rawToken: string, requestId: string) {
    const tokenHash = this.hash(requiredText(rawToken, 'Link challenge'));
    const record = await this.db.discordBotLinkChallenge.findUnique({
      where: { tokenHash },
    });
    if (!record || record.consumedAt || record.expiresAt <= new Date()) {
      throw this.invalidBotChallenge();
    }
    try {
      await this.db.$transaction(async (tx) => {
        const claim = await tx.discordBotLinkChallenge.updateMany({
          where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
          data: { consumedAt: new Date() },
        });
        if (claim.count !== 1) throw this.invalidBotChallenge();
        const [forDiscord, forUser] = await Promise.all([
          tx.discordAccountLink.findUnique({ where: { discordUserId: record.discordUserId } }),
          tx.discordAccountLink.findUnique({ where: { userId: actor.userId } }),
        ]);
        if (forDiscord && forDiscord.userId !== actor.userId) {
          throw new ConflictException({
            code: 'DISCORD_ACCOUNT_ALREADY_LINKED',
            message: 'This Discord account is already connected to a Slice account.',
          });
        }
        if (forUser && forUser.discordUserId !== record.discordUserId) {
          throw new ConflictException({
            code: 'SLICE_ACCOUNT_ALREADY_LINKED',
            message: 'This Slice account is already connected to another Discord account. Disconnect it first from Account Settings.',
          });
        }
        if (!forDiscord) {
          await tx.discordAccountLink.create({
            data: {
              userId: actor.userId,
              discordUserId: record.discordUserId,
              username: record.discordUsername,
              displayName: record.discordDisplayName,
            },
          });
        }
        await tx.auditEvent.create({
          data: {
            actorUserId: actor.userId,
            actorType: 'USER',
            action: 'DISCORD_ACCOUNT_LINKED',
            resourceType: 'discord_account_link',
            requestId,
            sessionId: actor.sessionId,
            result: 'SUCCESS',
            metadata: { discordUserId: record.discordUserId, source: 'discord_bot' },
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof UnauthorizedException) throw error;
      throw error;
    }
    return { connected: true };
  }

  async botStatus(discordUserId: string) {
    const link = await this.db.discordAccountLink.findUnique({
      where: { discordUserId: requiredText(discordUserId, 'Discord identity') },
      select: {
        userId: true,
        user: {
          select: {
            profile: { select: { publicUsername: true, displayName: true, preferredCurrency: true } },
            roleAssignments: { where: { revokedAt: null }, select: { role: true } },
          },
        },
      },
    });
    if (!link) return { linked: false as const };
    const roles = [...new Set(link.user.roleAssignments.map((assignment) => assignment.role))];
    const collector = roles.includes('COLLECTOR')
      ? await this.collectorProjection(link.userId)
      : { enabled: false, membership: null, openActionCount: null };
    return {
      linked: true as const,
      user: {
        username: link.user.profile?.publicUsername ?? null,
        displayName: link.user.profile?.displayName ?? null,
        roles,
        preferredCurrency: link.user.profile?.preferredCurrency ?? null,
        collector,
        portfolio: { available: false },
        orders: { available: false },
      },
    };
  }

  async unlinkDiscordUser(discordUserId: string, requestId: string) {
    const link = await this.db.discordAccountLink.findUnique({
      where: { discordUserId: requiredText(discordUserId, 'Discord identity') },
    });
    if (!link) return { disconnected: false };
    await this.db.$transaction(async (tx) => {
      await tx.discordAccountLink.delete({ where: { id: link.id } });
      await tx.auditEvent.create({
        data: {
          actorUserId: link.userId,
          actorType: 'USER',
          action: 'DISCORD_ACCOUNT_UNLINKED',
          resourceType: 'discord_account_link',
          resourceId: link.id,
          requestId,
          result: 'SUCCESS',
          metadata: { discordUserId: link.discordUserId, source: 'discord_bot' },
        },
      });
    });
    return { disconnected: true };
  }

  async botCollectorActions(discordUserId: string) {
    const link = await this.db.discordAccountLink.findUnique({
      where: { discordUserId: requiredText(discordUserId, 'Discord identity') },
      select: {
        userId: true,
        user: {
          select: {
            roleAssignments: {
              where: { revokedAt: null, role: 'COLLECTOR' },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!link || link.user.roleAssignments.length === 0) return { linked: false as const, actions: [] };
    if (!this.collectorWorkspace) return { linked: true as const, actions: [] };
    const actions = await this.collectorWorkspace.requests(link.userId);
    return {
      linked: true as const,
      actions: actions.slice(0, 10).map((action) => ({
        id: action.id,
        title: action.asset.title,
        grade: action.asset.grade,
        type: action.type,
        message: action.reason,
        actionUrl: action.targetRoute,
      })),
    };
  }

  /** One customer-safe summary bound to the canonical Discord link. This is
   * intentionally a read/navigation projection, never a Discord trading or
   * billing authority. Optional sections fail independently. */
  async botMySlice(discordUserId: string) {
    const link = await this.db.discordAccountLink.findUnique({
      where: { discordUserId: requiredText(discordUserId, 'Discord identity') },
      select: {
        userId: true,
        user: {
          select: {
            profile: {
              select: {
                publicUsername: true,
                displayName: true,
                preferredCurrency: true,
              },
            },
            roleAssignments: { where: { revokedAt: null }, select: { role: true } },
          },
        },
      },
    });
    if (!link) return { linked: false as const };
    const roles = [...new Set(link.user.roleAssignments.map((assignment) => assignment.role))];
    const collector = roles.includes('COLLECTOR');
    const [portfolio, orders, collectorData] = await Promise.allSettled([
      this.customerPortfolio(link.userId),
      this.trading ? this.trading.customerOpenOrderSummary(link.userId) : Promise.resolve(null),
      collector ? this.customerCollector(link.userId) : Promise.resolve(null),
    ]);
    return {
      linked: true as const,
      identity: {
        username: link.user.profile?.publicUsername ?? null,
        displayName: link.user.profile?.displayName ?? null,
        preferredCurrency: link.user.profile?.preferredCurrency ?? 'GBP',
        capabilities: { investor: true, collector },
      },
      portfolio: settled(portfolio),
      orders: settled(orders),
      collector: settled(collectorData),
    };
  }

  /** The bot only relays the existing Admin Operations projection after the
   * linked Slice account passes the same RBAC check as the web console. */
  async botAdminOperations(discordUserId: string) {
    if (!this.admin) {
      throw new ServiceUnavailableException({
        code: 'DISCORD_ADMIN_OPERATIONS_UNAVAILABLE',
        message: 'Slice operations are temporarily unavailable.',
      });
    }
    return this.admin.operationsOverview(await this.botActor(discordUserId));
  }

  /** Bot-service-only approval projection. It deliberately exposes the
   * linked Discord identity only alongside a currently public Collector
   * profile, so Discord can prove a spotlight request belongs to its owner. */
  async botCollectorSpotlight(slug: string) {
    const profile = await this.db.publicCollectorProfile.findUnique({
      where: { slug: requiredText(slug, 'Collector slug') },
      select: {
        slug: true, headline: true, specialism: true, isPublic: true,
        user: { select: { profile: { select: { displayName: true } }, discordAccountLink: { select: { discordUserId: true } }, _count: { select: { submissions: { where: { asset: { is: { status: 'PUBLISHED' } } } } } } } },
      },
    });
    if (!profile || !profile.isPublic) return { eligible: false as const };
    return {
      eligible: Boolean(profile.user.discordAccountLink),
      isPublic: true as const,
      linkedDiscordUserId: profile.user.discordAccountLink?.discordUserId ?? null,
      collector: { slug: profile.slug, headline: profile.headline, specialism: profile.specialism, displayName: profile.user.profile?.displayName ?? null, publishedListingCount: profile.user._count.submissions },
    };
  }

  async self(userId: string) {
    const link = await this.db.discordAccountLink.findUnique({
      where: { userId },
    });
    return {
      connected: Boolean(link),
      configured: this.isConfigured() || this.isBotHandoffConfigured(),
      connectionMode: this.isConfigured() ? ('oauth' as const) : this.isBotHandoffConfigured() ? ('bot' as const) : ('unavailable' as const),
      username: link?.username ?? null,
      displayName: link?.displayName ?? null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
    };
  }

  async begin(actor: Actor, requestId: string) {
    if (!this.isConfigured()) {
      if (!this.isBotHandoffConfigured()) this.requireConfiguration();
      return {
        authorizationUrl: `https://discord.com/channels/${this.config.discordBotGuildId}`,
        mode: 'bot' as const,
      };
    }
    this.requireConfiguration();
    const rawState = randomBytes(32).toString('base64url');
    const stateHash = this.hash(rawState);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.db.$transaction(async (tx) => {
      await tx.discordOAuthState.deleteMany({
        where: {
          userId: actor.userId,
          OR: [
            { consumedAt: { not: null } },
            { expiresAt: { lt: new Date() } },
          ],
        },
      });
      await tx.discordOAuthState.create({
        data: { userId: actor.userId, stateHash, expiresAt },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'DISCORD_LINK_OAUTH_STARTED',
          resourceType: 'discord_account_link',
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { expiresAt: expiresAt.toISOString() },
        },
      });
    });
    const parameters = new URLSearchParams({
      client_id: this.config.discordOauthClientId!,
      redirect_uri: this.config.discordOauthRedirectUri!,
      response_type: 'code',
      scope: 'identify',
      state: rawState,
    });
    return {
      authorizationUrl: `https://discord.com/oauth2/authorize?${parameters.toString()}`,
      mode: 'oauth' as const,
    };
  }

  async complete(state: string, code: string) {
    const stateHash = this.hash(state);
    const record = await this.db.discordOAuthState.findUnique({
      where: { stateHash },
    });
    if (!record || record.consumedAt || record.expiresAt <= new Date())
      throw this.invalidState();
    const claim = await this.db.discordOAuthState.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (claim.count !== 1) throw this.invalidState();
    const identity = await this.fetchIdentity(code);
    try {
      await this.db.$transaction(async (tx) => {
        const existing = await tx.discordAccountLink.findUnique({
          where: { discordUserId: identity.id },
        });
        if (existing && existing.userId !== record.userId) {
          throw new ConflictException({
            code: 'DISCORD_ACCOUNT_ALREADY_LINKED',
            message:
              'This Discord account is already linked to another Slice account.',
          });
        }
        await tx.discordAccountLink.upsert({
          where: { userId: record.userId },
          create: {
            userId: record.userId,
            discordUserId: identity.id,
            username: identity.username,
            displayName: identity.global_name ?? null,
          },
          update: {
            discordUserId: identity.id,
            username: identity.username,
            displayName: identity.global_name ?? null,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: record.userId,
            actorType: 'USER',
            action: 'DISCORD_ACCOUNT_LINKED',
            resourceType: 'discord_account_link',
            result: 'SUCCESS',
            metadata: { discordUserId: identity.id },
          },
        });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw error;
    }
  }

  async disconnect(actor: Actor, requestId: string) {
    await this.db.$transaction(async (tx) => {
      const link = await tx.discordAccountLink.findUnique({
        where: { userId: actor.userId },
      });
      if (!link) return;
      await tx.discordAccountLink.delete({ where: { userId: actor.userId } });
      await tx.auditEvent.create({
        data: {
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'DISCORD_ACCOUNT_UNLINKED',
          resourceType: 'discord_account_link',
          resourceId: link.id,
          requestId,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { discordUserId: link.discordUserId },
        },
      });
    });
  }

  private isConfigured() {
    return Boolean(
      this.config.discordOauthClientId &&
      this.config.discordOauthClientSecret &&
      this.config.discordOauthRedirectUri,
    );
  }

  private isBotHandoffConfigured() {
    return Boolean(this.config.discordBotServiceToken && this.config.discordBotGuildId);
  }

  private requireConfiguration() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'DISCORD_OAUTH_UNAVAILABLE',
        message: 'Discord account linking is not configured.',
      });
    }
  }

  private async fetchIdentity(code: string): Promise<DiscordIdentity> {
    this.requireConfiguration();
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.discordOauthClientId!,
        client_secret: this.config.discordOauthClientSecret!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.discordOauthRedirectUri!,
      }),
    });
    if (!tokenResponse.ok)
      throw new UnauthorizedException({
        code: 'DISCORD_OAUTH_EXCHANGE_FAILED',
        message: 'Discord authorization could not be completed.',
      });
    const token = (await tokenResponse.json()) as { access_token?: unknown };
    if (typeof token.access_token !== 'string' || !token.access_token)
      throw new UnauthorizedException({
        code: 'DISCORD_OAUTH_EXCHANGE_FAILED',
        message: 'Discord authorization could not be completed.',
      });
    const identityResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!identityResponse.ok)
      throw new UnauthorizedException({
        code: 'DISCORD_IDENTITY_UNAVAILABLE',
        message: 'Discord identity could not be verified.',
      });
    const identity =
      (await identityResponse.json()) as Partial<DiscordIdentity>;
    if (
      typeof identity.id !== 'string' ||
      typeof identity.username !== 'string'
    )
      throw new UnauthorizedException({
        code: 'DISCORD_IDENTITY_INVALID',
        message: 'Discord returned an invalid identity.',
      });
    return {
      id: identity.id,
      username: identity.username,
      global_name:
        typeof identity.global_name === 'string' ? identity.global_name : null,
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private invalidState() {
    return new UnauthorizedException({
      code: 'DISCORD_OAUTH_STATE_INVALID',
      message: 'Discord account linking has expired or was already used.',
    });
  }

  private invalidBotChallenge() {
    return new UnauthorizedException({
      code: 'DISCORD_BOT_LINK_CHALLENGE_INVALID',
      message: 'This Discord link has expired or was already used. Return to Discord and try again.',
    });
  }

  private async collectorProjection(userId: string) {
    if (!this.collectorWorkspace) {
      return { enabled: true, membership: null, openActionCount: null };
    }
    const [subscription, overview] = await Promise.all([
      this.collectorWorkspace.subscription(userId),
      this.collectorWorkspace.overview(userId),
    ]);
    const current = subscription.current;
    const usage = collectorUsage(subscription.usage);
    return {
      enabled: true,
      membership: current
        ? {
            planName: current.displayName,
            status: current.status,
            activeCollectibles: usage.activeCollectibles,
            maxActiveCollectibles: usage.maxActiveCollectibles,
            monthlySubmissions: usage.monthlySubmissionsUsed,
            monthlyLimit: usage.maxMonthlySubmissions,
            concurrentIntake: usage.concurrentIntake,
            concurrentIntakeLimit: usage.maxConcurrentIntake,
            billingState: subscription.billing.configured ? current.status : 'UNCONFIGURED',
            manageUrl: '/collector-workspace',
          }
        : null,
      openActionCount: overview.actionSummary.waitingOnYou,
    };
  }

  private async customerPortfolio(userId: string) {
    if (!this.portfolio) return null;
    const summary = await this.portfolio.portfolioForUser(userId);
    const availableCashMinor = summary.cash.accounts.reduce(
      (total, account) => total + BigInt(account.availableMinor),
      0n,
    );
    const reservedCashMinor = summary.cash.accounts.reduce(
      (total, account) => total + BigInt(account.reservedMinor),
      0n,
    );
    return {
      currency: summary.currency,
      estimatedPortfolioValueMinor: summary.estimatedPortfolioValueMinor,
      estimatedHoldingsValueMinor: summary.estimatedHoldingsValueMinor,
      availableCashMinor: availableCashMinor.toString(),
      reservedCashMinor: reservedCashMinor.toString(),
      holdings: summary.holdings.length,
      valuationStatus: summary.valuationStatus,
    };
  }

  private async customerCollector(userId: string) {
    if (!this.collectorWorkspace) return null;
    const [overview, subscription] = await Promise.all([
      this.collectorWorkspace.overview(userId),
      this.collectorWorkspace.subscription(userId),
    ]);
    const current = subscription.current;
    const usage = collectorUsage(subscription.usage);
    return {
      collectibles: overview.kpis.totalCollectibles,
      marketLive: overview.kpis.marketLive,
      inReview: overview.kpis.inReview,
      openActionCount: overview.actionSummary.waitingOnYou,
      membership: current
        ? {
            planName: current.displayName,
            status: current.status,
            activeCollectibles: usage.activeCollectibles,
            maxActiveCollectibles: usage.maxActiveCollectibles,
            monthlySubmissions: usage.monthlySubmissionsUsed,
            monthlyLimit: usage.maxMonthlySubmissions,
            concurrentIntake: usage.concurrentIntake,
            concurrentIntakeLimit: usage.maxConcurrentIntake,
          }
        : null,
    };
  }

  private async botActor(discordUserId: string): Promise<Actor> {
    const link = await this.db.discordAccountLink.findUnique({
      where: { discordUserId: requiredText(discordUserId, 'Discord identity') },
      select: {
        userId: true,
        user: {
          select: {
            accountStatus: true,
            roleAssignments: {
              where: { revokedAt: null, scopeType: 'GLOBAL', scopeId: '*' },
              select: { role: true },
            },
          },
        },
      },
    });
    if (!link) {
      throw new UnauthorizedException({
        code: 'DISCORD_ACCOUNT_NOT_LINKED',
        message: 'Connect your Slice account to use this feature.',
      });
    }
    return {
      userId: link.userId as Actor['userId'],
      // A bot service call has no browser session; the canonical linked user
      // and current backend roles remain the authorization subject.
      sessionId: `discord-bot:${link.userId}`,
      status: link.user.accountStatus,
      roles: link.user.roleAssignments.map((assignment) => assignment.role),
      sessionRevokedAt: null,
      sessionRevocationReason: null,
      authenticatedAt: new Date(),
    };
  }
}

function requiredText(value: string | null | undefined, label: string): string {
  const result = value?.trim();
  if (!result || result.length > 128) {
    throw new UnauthorizedException({ code: 'DISCORD_BOT_INPUT_INVALID', message: `${label} is invalid.` });
  }
  return result;
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function collectorUsage(value: unknown) {
  const usage = value as {
    activeCollectibles: number;
    maxActiveCollectibles: number | null;
    monthlySubmissionsUsed: number;
    maxMonthlySubmissions: number | null;
    concurrentIntake: number;
    maxConcurrentIntake: number | null;
  };
  return usage;
}

function optionalText(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result.slice(0, 128) : null;
}
