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
import { DiscordNotificationDeliveryService, type DiscordDeliveryOutcome } from '../../outbox/application/discord-notification-delivery.service';

@Controller()
export class DiscordLinkController {
  constructor(
    private readonly links: DiscordLinkService,
    private readonly deliveries: DiscordNotificationDeliveryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('me/integrations/discord')
  @UseGuards(AccessTokenGuard)
  self(@Req() request: AuthenticatedRequest) {
    return this.links.self(request.actor!.userId);
  }

  @Get('discord/bot/deliveries')
  @UseGuards(DiscordBotServiceGuard)
  pullDeliveries(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.deliveries.pull(Number.isInteger(parsed) ? parsed : 25);
  }

  @Post('discord/bot/deliveries/:deliveryId/ack')
  @UseGuards(DiscordBotServiceGuard)
  acknowledgeDelivery(@Param('deliveryId') deliveryId: string, @Body() body: { claimToken?: unknown; outcome?: unknown }) {
    const outcomes: readonly DiscordDeliveryOutcome[] = ['DELIVERED', 'SUPPRESSED', 'RETRYABLE_FAILURE', 'DESTINATION_UNAVAILABLE', 'NON_RETRYABLE_FAILURE'];
    return this.deliveries.acknowledge(deliveryId, typeof body.claimToken === 'string' ? body.claimToken : '', outcomes.includes(body.outcome as DiscordDeliveryOutcome) ? body.outcome as DiscordDeliveryOutcome : 'NON_RETRYABLE_FAILURE');
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

  @Get('discord/bot/links/:discordUserId/my-slice')
  @UseGuards(DiscordBotServiceGuard)
  botMySlice(@Param('discordUserId') discordUserId: string) {
    return this.links.botMySlice(discordUserId);
  }

  @Get('discord/bot/links/:discordUserId/collector-actions')
  @UseGuards(DiscordBotServiceGuard)
  botCollectorActions(@Param('discordUserId') discordUserId: string) {
    return this.links.botCollectorActions(discordUserId);
  }

  @Get('discord/bot/admin/operations/:discordUserId')
  @UseGuards(DiscordBotServiceGuard)
  botAdminOperations(@Param('discordUserId') discordUserId: string) {
    return this.links.botAdminOperations(discordUserId);
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
