import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';
import { PreSaleService } from './application/pre-sale.service';

@Injectable()
export class PreSaleWorker implements OnModuleInit, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly presales: PreSaleService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  onModuleInit() { if (this.config.environment !== 'test') { void this.run(); this.timer = setInterval(() => void this.run(), 60_000); this.timer.unref(); } }
  async onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }
  private async run() { if (this.running) return; this.running = true; try { await this.presales.syncPhysicalStatuses(); await this.presales.expireDue(); } finally { this.running = false; } }
}
