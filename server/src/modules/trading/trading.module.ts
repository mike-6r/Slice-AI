import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { TradingService } from './application/trading.service';
import { TradingController } from './http/trading.controller';
import { OutboxModule } from '../outbox/outbox.module';
import { SubmissionStorageModule } from '../submissions/submission-storage.module';

@Module({
  imports: [AuthModule, AccessControlModule, OutboxModule, SubmissionStorageModule],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
