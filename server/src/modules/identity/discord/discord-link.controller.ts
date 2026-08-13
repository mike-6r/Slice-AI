import {
  Controller,
  Body,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import { DiscordLinkService } from './discord-link.service';
import { DiscordBotServiceGuard } from './discord-bot-service.guard';

@Controller()
export class DiscordLinkController {
  constructor(
    private readonly links: DiscordLinkService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('me/integrations/discord')
  @UseGuards(AccessTokenGuard)
  self(@Req() request: AuthenticatedRequest) {
    return this.links.self(request.actor!.userId);
  }

  @Post('me/integrations/discord/authorize')
  @UseGuards(AccessTokenGuard)
  begin(@Req() request: AuthenticatedRequest) {
    return this.links.begin(request.actor!, request.requestId ?? 'unknown');
  }

  @Delete('me/integrations/discord')
  @UseGuards(AccessTokenGuard)
  async disconnect(@Req() request: AuthenticatedRequest) {
    await this.links.disconnect(request.actor!, request.requestId ?? 'unknown');
    return { disconnected: true };
  }

  @Post('me/integrations/discord/bot-link')
  @UseGuards(AccessTokenGuard)
  async consumeBotLink(
    @Req() request: AuthenticatedRequest,
    @Body() body: { challenge?: unknown },
  ) {
    return this.links.consumeBotChallenge(
      request.actor!,
      typeof body.challenge === 'string' ? body.challenge : '',
      request.requestId ?? 'unknown',
    );
  }

  @Post('discord/bot/link-challenges')
  @UseGuards(DiscordBotServiceGuard)
  createBotChallenge(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      discordUserId?: unknown;
      discordUsername?: unknown;
      discordDisplayName?: unknown;
      guildId?: unknown;
    },
  ) {
    return this.links.createBotChallenge(
      {
        discordUserId:
          typeof body.discordUserId === 'string' ? body.discordUserId : '',
        discordUsername:
          typeof body.discordUsername === 'string' ? body.discordUsername : '',
        discordDisplayName:
          typeof body.discordDisplayName === 'string'
            ? body.discordDisplayName
            : null,
        guildId: typeof body.guildId === 'string' ? body.guildId : null,
      },
      request.requestId ?? 'unknown',
    );
  }

  @Get('discord/bot/links/:discordUserId')
  @UseGuards(DiscordBotServiceGuard)
  botStatus(@Param('discordUserId') discordUserId: string) {
    return this.links.botStatus(discordUserId);
  }

  @Get('discord/bot/links/:discordUserId/collector-actions')
  @UseGuards(DiscordBotServiceGuard)
  botCollectorActions(@Param('discordUserId') discordUserId: string) {
    return this.links.botCollectorActions(discordUserId);
  }

  @Delete('discord/bot/links/:discordUserId')
  @UseGuards(DiscordBotServiceGuard)
  unlinkBotLink(
    @Param('discordUserId') discordUserId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.links.unlinkDiscordUser(discordUserId, request.requestId ?? 'unknown');
  }

  @Get('auth/discord/callback')
  async callback(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Res() response: Response,
  ) {
    try {
      if (!state || !code) throw new Error('missing OAuth callback parameters');
      await this.links.complete(state, code);
      response.redirect(
        new URL(
          '/account?discord=connected',
          this.config.corsOrigins[0],
        ).toString(),
      );
    } catch {
      response.redirect(
        new URL(
          '/account?discord=failed',
          this.config.corsOrigins[0],
        ).toString(),
      );
    }
  }
}
