import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { CollectibleMarketResearchService } from './market-research.service';
import { TrustedReferenceImportController } from './trusted-reference-import.controller';
import { TrustedReferenceImportService } from './trusted-reference-import.service';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [TrustedReferenceImportController],
  providers: [CollectibleMarketResearchService, TrustedReferenceImportService],
  exports: [CollectibleMarketResearchService],
})
export class MarketResearchModule {}
