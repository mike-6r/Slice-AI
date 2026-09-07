import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { CollectorWorkspaceController } from './collector-workspace.controller';
import { CollectorWorkspaceService } from './collector-workspace.service';
import { OutboxModule } from '../outbox/outbox.module';
import { ProvidersModule } from '../providers/providers.module';
import { SubmissionStorageModule } from '../submissions/submission-storage.module';

@Module({
  imports: [AuthModule, OutboxModule, ProvidersModule, SubmissionStorageModule],
  controllers: [CollectorWorkspaceController],
  providers: [CollectorWorkspaceService],
  exports: [CollectorWorkspaceService],
})
export class CollectorWorkspaceModule {}
