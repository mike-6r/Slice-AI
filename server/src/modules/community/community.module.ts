import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { CommunityService } from './application/community.service';
import { DistributionService } from './application/distribution.service';
import { GovernanceService } from './application/governance.service';
import { CommunityController } from './http/community.controller';

@Module({
  imports: [AuthModule, AccessControlModule, FinanceModule],
  providers: [CommunityService, GovernanceService, DistributionService],
  controllers: [CommunityController],
  exports: [CommunityService, GovernanceService, DistributionService],
})
export class CommunityModule {}
