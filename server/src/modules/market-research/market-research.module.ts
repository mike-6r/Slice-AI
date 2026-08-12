import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { CollectibleMarketResearchService } from './market-research.service';

@Module({
  imports: [AuthModule, AccessControlModule],
  providers: [CollectibleMarketResearchService],
  exports: [CollectibleMarketResearchService],
})
export class MarketResearchModule {}
