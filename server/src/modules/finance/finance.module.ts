import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { FinancialLedgerService } from './application/financial-ledger.service';
import { PortfolioLotService } from './application/portfolio-lot.service';
import { PortfolioQueryService } from './application/portfolio-query.service';
import { FinancialReconciliationService } from './application/financial-reconciliation.service';
import { FinanceController } from './http/finance.controller';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [FinanceController],
  providers: [
    FinancialLedgerService,
    PortfolioLotService,
    PortfolioQueryService,
    FinancialReconciliationService,
  ],
  exports: [
    FinancialLedgerService,
    PortfolioLotService,
    PortfolioQueryService,
    FinancialReconciliationService,
  ],
})
export class FinanceModule {}
