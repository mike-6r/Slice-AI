import {
  Controller,
  Delete,
  Get,
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
