import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { DropsService } from './application/drops.service';
import { DropsController } from './http/drops.controller';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [DropsController],
  providers: [DropsService],
  exports: [DropsService],
})
export class DropsModule {}
