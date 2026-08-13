import {
  type ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppConfig } from '../../../config/app-config';
import { DiscordBotServiceGuard } from './discord-bot-service.guard';

const context = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ header: () => authorization }),
    }),
  }) as unknown as ExecutionContext;

describe('DiscordBotServiceGuard', () => {
  it('fails closed when the bot service secret is not configured', () => {
    expect(() =>
      new DiscordBotServiceGuard({} as AppConfig).canActivate(context()),
    ).toThrow(ServiceUnavailableException);
  });

  it('accepts only the configured bearer secret', () => {
    const guard = new DiscordBotServiceGuard({
      discordBotServiceToken: 'a'.repeat(32),
    } as AppConfig);
    expect(guard.canActivate(context(`Bearer ${'a'.repeat(32)}`))).toBe(true);
    expect(() => guard.canActivate(context('Bearer incorrect'))).toThrow(
      UnauthorizedException,
    );
  });
});
