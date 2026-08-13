import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule, AuthModule, AccessControlModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
