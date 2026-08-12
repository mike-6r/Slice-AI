import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { CollectorWorkspaceController } from './collector-workspace.controller';
import { CollectorWorkspaceService } from './collector-workspace.service';

@Module({
  imports: [AuthModule],
  controllers: [CollectorWorkspaceController],
  providers: [CollectorWorkspaceService],
})
export class CollectorWorkspaceModule {}
