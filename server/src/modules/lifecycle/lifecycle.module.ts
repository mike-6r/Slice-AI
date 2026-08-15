import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { LifecycleService } from './application/lifecycle.service';
import { LifecycleController } from './http/lifecycle.controller';
import {
  AUTHENTICATION_EVIDENCE_PROVIDER,
  GRADING_EVIDENCE_PROVIDER,
  INSURANCE_PROVIDER,
  LOGISTICS_PROVIDER,
  ManualLifecycleProvider,
  VALUATION_PROVIDER,
  VAULT_CUSTODY_PROVIDER,
} from './ports/lifecycle-provider.ports';

@Module({
  imports: [AuthModule, AccessControlModule, SubmissionsModule],
  controllers: [LifecycleController],
  providers: [
    LifecycleService,
    {
      provide: LOGISTICS_PROVIDER,
      useValue: new ManualLifecycleProvider('logistics'),
    },
    {
      provide: AUTHENTICATION_EVIDENCE_PROVIDER,
      useValue: new ManualLifecycleProvider('authentication'),
    },
    {
      provide: GRADING_EVIDENCE_PROVIDER,
      useValue: new ManualLifecycleProvider('grading'),
    },
    {
      provide: VAULT_CUSTODY_PROVIDER,
      useValue: new ManualLifecycleProvider('custody'),
    },
    {
      provide: VALUATION_PROVIDER,
      useValue: new ManualLifecycleProvider('valuation'),
    },
    {
      provide: INSURANCE_PROVIDER,
      useValue: new ManualLifecycleProvider('insurance'),
    },
  ],
})
export class LifecycleModule {}
