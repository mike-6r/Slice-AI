import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketProviderRegistry } from './market-provider.registry';
import { MarketRefreshService } from './market-refresh.service';
import { MarketRefreshWorker } from './market-refresh.worker';
import { SubmissionStorageModule } from '../submissions/submission-storage.module';

@Module({
  imports: [SubmissionStorageModule],
  controllers: [MarketController],
  providers: [MarketService, MarketProviderRegistry, MarketRefreshService, MarketRefreshWorker],
  exports: [MarketService, MarketRefreshService, MarketProviderRegistry],
})
export class MarketModule {}
