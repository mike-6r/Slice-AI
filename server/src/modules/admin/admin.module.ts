import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAccountControlController } from './admin-account-control.controller';
import { AdminAccountControlService } from './admin-account-control.service';
import { ConfigModule } from '../../config/config.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { OwnershipModule } from '../ownership/ownership.module';
import { MarketModule } from '../market/market.module';
import { FinanceModule } from '../finance/finance.module';
import { ProvidersModule } from '../providers/providers.module';
import { MarketResearchModule } from '../market-research/market-research.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [DatabaseModule, AuthModule, AccessControlModule, ConfigModule, SubmissionsModule, OwnershipModule, MarketModule, MarketResearchModule, FinanceModule, ProvidersModule, OutboxModule],
  controllers: [AdminController, AdminAccountControlController],
  providers: [AdminService, AdminAccountControlService],
  exports: [AdminService],
})
export class AdminModule {}
