import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { CollectibleMarketResearchService } from './market-research.service';
import { TrustedReferenceImportController } from './trusted-reference-import.controller';
import { TrustedReferenceImportService } from './trusted-reference-import.service';
import { MarketModule } from '../market/market.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [AuthModule, AccessControlModule, MarketModule, ProvidersModule],
  controllers: [TrustedReferenceImportController],
  providers: [CollectibleMarketResearchService, TrustedReferenceImportService],
  exports: [CollectibleMarketResearchService],
})
export class MarketResearchModule {}
