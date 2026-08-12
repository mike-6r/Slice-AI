import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AccessControlModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
