import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CollectorWorkspaceModule } from '../../collector-workspace/collector-workspace.module';
import { DiscordLinkController } from './discord-link.controller';
import { DiscordBotServiceGuard } from './discord-bot-service.guard';
import { DiscordLinkService } from './discord-link.service';

@Module({
  imports: [AuthModule, CollectorWorkspaceModule],
  controllers: [DiscordLinkController],
  providers: [DiscordLinkService, DiscordBotServiceGuard],
  exports: [DiscordLinkService],
})
export class DiscordLinkModule {}
