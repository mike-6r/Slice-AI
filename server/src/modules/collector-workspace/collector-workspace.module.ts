import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { CollectorWorkspaceController } from './collector-workspace.controller';
import { CollectorWorkspaceService } from './collector-workspace.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [AuthModule, OutboxModule],
  controllers: [CollectorWorkspaceController],
  providers: [CollectorWorkspaceService],
  exports: [CollectorWorkspaceService],
})
export class CollectorWorkspaceModule {}
