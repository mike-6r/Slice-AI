import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { Inject } from '@nestjs/common';

@Injectable()
export class DiscordBotServiceGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.discordBotServiceToken;
    if (!expected) {
      throw new ServiceUnavailableException({
        code: 'DISCORD_BOT_SERVICE_UNAVAILABLE',
        message: 'Discord account linking is temporarily unavailable.',
      });
    }
    const request = context.switchToHttp().getRequest<Request>();
    const value = request.header('authorization');
    const supplied = value?.startsWith('Bearer ') ? value.slice(7) : '';
    if (!sameSecret(supplied, expected)) {
      throw new UnauthorizedException({
        code: 'DISCORD_BOT_SERVICE_UNAUTHORIZED',
        message: 'Discord account linking is unavailable.',
      });
    }
    return true;
  }
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
