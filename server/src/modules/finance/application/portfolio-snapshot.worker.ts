import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

@Injectable()
export class PortfolioSnapshotWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PortfolioSnapshotWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopping = false;
  constructor(private readonly snapshots: PortfolioSnapshotService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  onApplicationBootstrap() { if (this.config.marketRefreshWorkerEnabled) this.start(); }
  start() { if (this.timer || this.stopping) return; void this.run(); this.timer = setInterval(() => void this.run(), this.config.marketRefreshPollIntervalMs); this.timer.unref(); }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); }
  private async run() { if (this.running || this.stopping) return; this.running = true; try { await this.snapshots.captureAll(); } catch (error) { this.logger.error({ code: 'PORTFOLIO_SNAPSHOT_FAILED', error: error instanceof Error ? error.message : String(error) }); } finally { this.running = false; } }
}
