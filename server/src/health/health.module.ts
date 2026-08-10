import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReadinessController } from './readiness.controller';
import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';

@Module({
  controllers: [HealthController, ReadinessController],
  providers: [HealthService, ReadinessService],
})
export class HealthModule {}
