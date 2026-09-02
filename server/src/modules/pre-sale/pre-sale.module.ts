import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { FinanceModule } from '../finance/finance.module';
import { InitialOfferingModule } from '../initial-offering/initial-offering.module';
import { TradingModule } from '../trading/trading.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PreSaleService } from './application/pre-sale.service';
import { PreSaleController } from './http/pre-sale.controller';
import { PreSaleWorker } from './pre-sale.worker';

@Module({ imports: [AuthModule, AccessControlModule, FinanceModule, InitialOfferingModule, TradingModule, OutboxModule], controllers: [PreSaleController], providers: [PreSaleService, PreSaleWorker], exports: [PreSaleService] })
export class PreSaleModule {}
