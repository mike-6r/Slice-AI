import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { TradingService } from './application/trading.service';
import { TradingController } from './http/trading.controller';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [AuthModule, AccessControlModule, OutboxModule],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
