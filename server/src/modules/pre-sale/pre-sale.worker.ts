import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PreSaleService } from './application/pre-sale.service';

@Injectable()
export class PreSaleWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PreSaleWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;
  constructor(
    private readonly presales: PreSaleService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}
  onModuleInit() {
    if (
      this.config.environment === 'test' ||
      this.config.deploymentChannel === 'preview' ||
      this.timer ||
      this.stopping
    )
      return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }
  private async run() {
    if (this.running || this.stopping) return;
    this.running = true;
    let phase: 'physical-status' | 'expiry' = 'physical-status';
    try {
      await this.presales.syncPhysicalStatuses();
      if (this.stopping) return;
      phase = 'expiry';
      await this.presales.expireDue();
    } catch (error) {
      // The domain transaction still rejects/rolls back. Contain the rejected
      // background promise so a retryable worker failure cannot terminate HTTP.
      // Do not log raw provider/database messages, which can contain secrets.
      this.logger.error({
        code: 'PRE_SALE_WORKER_RUN_FAILED',
        phase,
        cause:
          error instanceof Error &&
          error.message === 'AUDIT_METADATA_NOT_PERMITTED'
            ? 'AUDIT_METADATA_NOT_PERMITTED'
            : 'BACKGROUND_OPERATION_FAILED',
      });
    } finally {
      this.running = false;
    }
  }
}
