import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';

export interface HealthResponse {
  status: 'ok';
  service: 'slice-api';
  version: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'slice-api',
      version: this.config.serviceVersion,
      timestamp: new Date().toISOString(),
    };
  }
}
