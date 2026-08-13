import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CollectorWorkspaceModule } from '../../collector-workspace/collector-workspace.module';
import { AdminModule } from '../../admin/admin.module';
import { FinanceModule } from '../../finance/finance.module';
import { TradingModule } from '../../trading/trading.module';
import { DiscordLinkController } from './discord-link.controller';
import { DiscordBotServiceGuard } from './discord-bot-service.guard';
import { DiscordLinkService } from './discord-link.service';

@Module({
  imports: [AuthModule, CollectorWorkspaceModule, AdminModule, FinanceModule, TradingModule],
  controllers: [DiscordLinkController],
  providers: [DiscordLinkService, DiscordBotServiceGuard],
  exports: [DiscordLinkService],
})
export class DiscordLinkModule {}
