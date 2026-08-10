import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
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

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [SubmissionController],
  providers: [
    SubmissionService,
    LocalSubmissionStorage,
    LocalMalwareScanner,
    { provide: OBJECT_STORAGE, useExisting: LocalSubmissionStorage },
    { provide: MALWARE_SCANNER, useExisting: LocalMalwareScanner },
  ],
})
export class SubmissionsModule {}
