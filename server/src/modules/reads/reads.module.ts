import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { SubmissionStorageModule } from '../submissions/submission-storage.module';
import { ReadsController } from './reads.controller';
@Module({ imports: [AuthModule, SubmissionStorageModule], controllers: [ReadsController] })
export class ReadsModule {}
