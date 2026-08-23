import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { FinancialLedgerService } from './application/financial-ledger.service';
import { PortfolioLotService } from './application/portfolio-lot.service';
import { PortfolioQueryService } from './application/portfolio-query.service';
import { FinancialReconciliationService } from './application/financial-reconciliation.service';
import { FinanceController } from './http/finance.controller';
import { PortfolioSnapshotService } from './application/portfolio-snapshot.service';
import { PortfolioSnapshotWorker } from './application/portfolio-snapshot.worker';
import { SubmissionStorageModule } from '../submissions/submission-storage.module';

@Module({
  imports: [AuthModule, AccessControlModule, SubmissionStorageModule],
  controllers: [FinanceController],
  providers: [
    FinancialLedgerService,
    PortfolioLotService,
    PortfolioQueryService,
    FinancialReconciliationService,
    PortfolioSnapshotService,
    PortfolioSnapshotWorker,
  ],
  exports: [
    FinancialLedgerService,
    PortfolioLotService,
    PortfolioQueryService,
    FinancialReconciliationService,
    PortfolioSnapshotService,
  ],
})
export class FinanceModule {}
