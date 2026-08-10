import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityPersistenceModule } from '../persistence/identity-persistence.module';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';
import { AuditQueryService } from './audit-query.service';
import { AuthorizationService } from './authorization.service';
import { ControlRateLimitService } from './control-rate-limit.service';
import { PermissionGuard } from './permission.guard';
import { RecentAuthService } from './recent-auth.service';
import { AccountCapabilityService } from './account-capability.service';
import { AccountCapabilityController } from './account-capability.controller';

@Module({
  imports: [AuthModule, IdentityPersistenceModule],
  controllers: [AccessControlController, AccountCapabilityController],
  providers: [
    AuthorizationService,
    PermissionGuard,
    ControlRateLimitService,
    RecentAuthService,
    AccessControlService,
    AuditQueryService,
    AccountCapabilityService,
  ],
  exports: [
    PermissionGuard,
    AuthorizationService,
    ControlRateLimitService,
    RecentAuthService,
    AccountCapabilityService,
  ],
})
export class AccessControlModule {}
