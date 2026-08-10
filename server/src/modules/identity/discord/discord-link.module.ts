import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiscordLinkController } from './discord-link.controller';
import { DiscordLinkService } from './discord-link.service';

@Module({
  imports: [AuthModule],
  controllers: [DiscordLinkController],
  providers: [DiscordLinkService],
  exports: [DiscordLinkService],
})
export class DiscordLinkModule {}
