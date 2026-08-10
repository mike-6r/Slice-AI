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
import { Inject } from '@nestjs/common';

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
  ) {}

  async self(userId: string) {
    const link = await this.db.discordAccountLink.findUnique({
      where: { userId },
    });
    return {
      connected: Boolean(link),
      configured: this.isConfigured(),
      username: link?.username ?? null,
      displayName: link?.displayName ?? null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
    };
  }

  async begin(actor: Actor, requestId: string) {
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
}
