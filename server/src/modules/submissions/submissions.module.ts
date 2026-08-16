import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { MarketResearchModule } from '../market-research/market-research.module';
import { SubmissionService } from './application/submission.service';
import { LocalMalwareScanner } from './infrastructure/local-submission-storage';
import { SubmissionController } from './http/submission.controller';
import {
  MALWARE_SCANNER,
} from './ports/submission-storage.ports';
import { SubmissionStorageModule } from './submission-storage.module';
import { RawCardPreGradeService } from './application/raw-card-pregrade.service';
import { OutboxModule } from '../outbox/outbox.module';
import {
  RAW_CARD_PREGRADE_PROVIDER,
  XimilarRawCardPreGradeProvider,
} from './application/raw-card-pregrade.provider';

@Module({
  imports: [AuthModule, AccessControlModule, MarketResearchModule, SubmissionStorageModule, OutboxModule],
  controllers: [SubmissionController],
  providers: [
    SubmissionService,
    RawCardPreGradeService,
    XimilarRawCardPreGradeProvider,
    { provide: RAW_CARD_PREGRADE_PROVIDER, useExisting: XimilarRawCardPreGradeProvider },
    LocalMalwareScanner,
    { provide: MALWARE_SCANNER, useExisting: LocalMalwareScanner },
  ],
  exports: [RawCardPreGradeService, SubmissionStorageModule],
})
export class SubmissionsModule {}
