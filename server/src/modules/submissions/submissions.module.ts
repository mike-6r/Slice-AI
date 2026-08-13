import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { MarketResearchModule } from '../market-research/market-research.module';
import { SubmissionService } from './application/submission.service';
import {
  LocalMalwareScanner,
  LocalSubmissionStorage,
} from './infrastructure/local-submission-storage';
import { SubmissionController } from './http/submission.controller';
import {
  MALWARE_SCANNER,
  OBJECT_STORAGE,
} from './ports/submission-storage.ports';
import { RawCardPreGradeService } from './application/raw-card-pregrade.service';
import {
  RAW_CARD_PREGRADE_PROVIDER,
  XimilarRawCardPreGradeProvider,
} from './application/raw-card-pregrade.provider';

@Module({
  imports: [AuthModule, AccessControlModule, MarketResearchModule],
  controllers: [SubmissionController],
  providers: [
    SubmissionService,
    RawCardPreGradeService,
    XimilarRawCardPreGradeProvider,
    { provide: RAW_CARD_PREGRADE_PROVIDER, useExisting: XimilarRawCardPreGradeProvider },
    LocalSubmissionStorage,
    LocalMalwareScanner,
    { provide: OBJECT_STORAGE, useExisting: LocalSubmissionStorage },
    { provide: MALWARE_SCANNER, useExisting: LocalMalwareScanner },
  ],
  exports: [RawCardPreGradeService],
})
export class SubmissionsModule {}
