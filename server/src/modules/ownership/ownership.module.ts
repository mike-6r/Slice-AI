import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { OwnershipService } from './application/ownership.service';
import { OwnershipOperationsService } from './application/ownership-operations.service';
import { OwnershipController } from './http/ownership.controller';

@Module({
  imports: [AuthModule, AccessControlModule],
  controllers: [OwnershipController],
  providers: [OwnershipService, OwnershipOperationsService],
  exports: [OwnershipService, OwnershipOperationsService],
})
export class OwnershipModule {}
