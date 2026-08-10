import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { NotificationDeliveryWorkerRepository } from './notification-delivery-worker.repository';
import { NotificationTransportRegistry } from './notification-transport-registry';
import { notificationDeliveryWorkerTestFailure } from './notification-delivery-worker-test-failure';

type DeliveryWorkerConfig = Pick<
  AppConfig,
  | 'outboxWorkerEnabled'
  | 'outboxWorkerId'
  | 'outboxPollIntervalMs'
  | 'outboxBatchSize'
  | 'outboxLeaseMs'
  | 'outboxMaxAttempts'
  | 'outboxRetryBaseMs'
  | 'outboxRetryMaxMs'
>;

/**
 * Consumes the durable delivery queue after the outbox worker has routed an
 * event. It shares the bounded, opt-in worker controls with the outbox
 * producer so a deployed API has no unserviced in-app delivery backlog.
 */
@Injectable()
export class NotificationDeliveryWorkerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationDeliveryWorkerService.name);
  private readonly workerId: string;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly repository: NotificationDeliveryWorkerRepository,
    private readonly transports: NotificationTransportRegistry,
    @Inject(APP_CONFIG) private readonly config: DeliveryWorkerConfig,
  ) {
    this.workerId = `delivery-${config.outboxWorkerId ?? process.pid}-${randomUUID()}`;
  }

  onApplicationBootstrap() {
    if (this.config.outboxWorkerEnabled) this.start();
  }

  start() {
    if (this.timer || this.stopping) return;
    this.poll();
    this.timer = setInterval(
      () => this.poll(),
      this.config.outboxPollIntervalMs,
    );
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.inFlight;
  }

  private poll() {
    if (this.stopping || this.inFlight) return;
    this.inFlight = this.runOnce()
      .catch(() => {
        this.logger.error(
          {
            workerId: this.workerId,
            code: 'NOTIFICATION_DELIVERY_WORKER_RUN_FAILED',
          },
          'Notification delivery worker iteration failed',
        );
      })
      .finally(() => {
        this.inFlight = undefined;
      });
  }

  async runOnce(now = new Date(), workerId = this.workerId) {
    if (this.stopping) return;
    const claims = await this.repository.claimBatch(
      workerId,
      this.config.outboxBatchSize,
      this.config.outboxLeaseMs,
      now,
    );

    for (const claim of claims) {
      if (this.stopping) break;
      const row = await this.repository.begin(claim.id, claim.claimToken, now);
      if (!row) continue;

      const transport = this.transports.get(row.channel);
      if (!transport) {
        await this.repository.failure(
          row.id,
          claim.claimToken,
          now,
          'TRANSPORT_NOT_IMPLEMENTED',
          true,
        );
        this.logger.warn(
          { deliveryId: row.deliveryId, channel: row.channel },
          'Notification delivery transport unavailable',
        );
        continue;
      }

      const result = await transport.deliver(row);
      if (result.status === 'DELIVERED') {
        await notificationDeliveryWorkerTestFailure();
        await this.repository.success(row.id, claim.claimToken, now);
        continue;
      }

      const terminal =
        result.status === 'NON_RETRYABLE_FAILURE' ||
        result.status === 'SUPPRESSED' ||
        row.attempts >= this.config.outboxMaxAttempts;
      const delay = Math.min(
        this.config.outboxRetryMaxMs,
        this.config.outboxRetryBaseMs * 2 ** Math.max(0, row.attempts - 1),
      );
      await this.repository.failure(
        row.id,
        claim.claimToken,
        now,
        result.code ?? 'DELIVERY_FAILED',
        terminal,
        new Date(now.getTime() + delay),
      );
    }
  }
}
