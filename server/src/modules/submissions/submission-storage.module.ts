import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import {
  LocalSubmissionStorage,
} from './infrastructure/local-submission-storage';
import { S3CompatibleSubmissionStorage } from './infrastructure/s3-compatible-submission-storage';
import { OBJECT_STORAGE } from './ports/submission-storage.ports';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalSubmissionStorage,
    S3CompatibleSubmissionStorage,
    {
      provide: OBJECT_STORAGE,
      inject: [APP_CONFIG, LocalSubmissionStorage, S3CompatibleSubmissionStorage],
      useFactory: (
        config: AppConfig,
        local: LocalSubmissionStorage,
        durable: S3CompatibleSubmissionStorage,
      ) => (config.objectStorageProvider === 'S3_COMPATIBLE' ? durable : local),
    },
  ],
  exports: [OBJECT_STORAGE, LocalSubmissionStorage, S3CompatibleSubmissionStorage],
})
export class SubmissionStorageModule {}
