import { Module } from '@nestjs/common';
import { AuthModule } from '../identity/auth/auth.module';
import { AccessControlModule } from '../identity/access/access-control.module';
import { OutboxModule } from '../outbox/outbox.module';
import { InitialOfferingService } from './application/initial-offering.service';
import { InitialOfferingController } from './http/initial-offering.controller';

@Module({
  imports: [AuthModule, AccessControlModule, OutboxModule],
  controllers: [InitialOfferingController],
  providers: [InitialOfferingService],
  exports: [InitialOfferingService],
})
export class InitialOfferingModule {}
