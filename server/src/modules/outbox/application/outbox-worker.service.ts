import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { OutboxHandlerError, OutboxHandlerRegistry } from './outbox-handler';
import { OutboxWorkerRepository, type OutboxClaim } from './outbox-worker.repository';

export type OutboxWorkerConfig = Pick<AppConfig,
  'outboxWorkerEnabled' | 'outboxWorkerId' | 'outboxPollIntervalMs' |
  'outboxBatchSize' | 'outboxLeaseMs' | 'outboxMaxAttempts' |
  'outboxRetryBaseMs' | 'outboxRetryMaxMs'
>;

export type OutboxWorkerRuntime = {
  now?: () => Date;
  random?: () => number;
  workerId?: string;
};

const OUTBOX_WORKER_RUNTIME = 'OUTBOX_WORKER_RUNTIME';

@Injectable()
export class OutboxWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly workerId: string;
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private inFlight: Promise<void> | undefined;

  constructor(
    private readonly repository: OutboxWorkerRepository,
    @Inject(APP_CONFIG) private readonly config: OutboxWorkerConfig,
    private readonly registry: OutboxHandlerRegistry = new OutboxHandlerRegistry(),
    @Optional() @Inject(OUTBOX_WORKER_RUNTIME) runtime: OutboxWorkerRuntime = {},
  ) {
    this.now = runtime.now ?? (() => new Date());
    this.random = runtime.random ?? Math.random;
    this.workerId = runtime.workerId ?? config.outboxWorkerId ?? `outbox-${process.pid}-${randomUUID()}`;
  }

  onApplicationBootstrap() {
    if (this.config.outboxWorkerEnabled) this.start();
  }

  start() {
    if (this.timer || this.stopping) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.config.outboxPollIntervalMs);
    this.timer.unref();
  }

  private poll() {
    if (this.stopping || this.inFlight) return;
    this.inFlight = this.runOnce().catch((error: unknown) => {
      this.logger.error({ workerId: this.workerId, code: 'OUTBOX_WORKER_RUN_FAILED' }, 'Outbox worker iteration failed');
      void error;
    }).finally(() => { this.inFlight = undefined; });
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.inFlight;
  }

  async runOnce(): Promise<void> {
    if (this.stopping) return;
    const now = this.now();
    const claims = await this.repository.claimBatch({
      workerId: this.workerId, batchSize: this.config.outboxBatchSize,
      leaseMs: this.config.outboxLeaseMs, now,
    });
    for (const claim of claims) {
      if (this.stopping) break;
      this.logger.log({ eventId: claim.eventId, eventType: claim.eventType, workerId: this.workerId, correlationId: claim.correlationId }, claim.reclaimed ? 'Outbox lease reclaimed' : 'Outbox event claimed');
      try {
        await this.processClaim(claim);
      } catch {
        // A finalization write can itself fail. Leave its durable lease intact
        // for expiry/reclaim rather than writing an unsafe compensating state.
        this.logger.error({ eventId: claim.eventId, eventType: claim.eventType, workerId: this.workerId, code: 'OUTBOX_FINALIZATION_FAILED' }, 'Outbox finalization failed; lease recovery will retry');
      }
    }
  }

  private async processClaim(claim: OutboxClaim): Promise<void> {
    const startedAt = this.now();
    const event = await this.repository.beginAttempt(claim.id, claim.claimToken, startedAt);
    if (!event) return;
    try {
      await this.registry.dispatch(event);
    } catch (error) {
      const failure = classifyFailure(error);
      const terminal = failure.kind === 'NON_RETRYABLE' || event.attempts >= this.config.outboxMaxAttempts;
      const retryAt = terminal ? undefined : new Date(startedAt.getTime() + this.retryDelayMs(event.attempts));
      const finalized = await this.repository.finalizeFailure({
        eventId: event.id, claimToken: claim.claimToken, now: this.now(),
        errorCode: failure.code, terminal, retryAt,
      });
      if (finalized) {
        this.logger.warn({ eventId: event.eventId, eventType: event.eventType, attempt: event.attempts, workerId: this.workerId, correlationId: event.correlationId, code: failure.code, terminal }, terminal ? 'Outbox event dead-lettered' : 'Outbox event scheduled for retry');
      }
      return;
    }
    const finalized = await this.repository.finalizeSuccess(event.id, claim.claimToken, this.now());
    if (finalized) {
      this.logger.log({ eventId: event.eventId, eventType: event.eventType, attempt: event.attempts, workerId: this.workerId, correlationId: event.correlationId }, 'Outbox event delivered');
    }
  }

  /** Exponential retry with bounded injected jitter; attempt starts at one. */
  retryDelayMs(attempt: number): number {
    const exponential = Math.min(
      this.config.outboxRetryMaxMs,
      this.config.outboxRetryBaseMs * 2 ** Math.max(0, attempt - 1),
    );
    const jitterLimit = Math.min(this.config.outboxRetryBaseMs, exponential);
    return Math.min(this.config.outboxRetryMaxMs, exponential + Math.floor(this.random() * jitterLimit));
  }
}

function classifyFailure(error: unknown): OutboxHandlerError {
  if (error instanceof OutboxHandlerError) return error;
  return new OutboxHandlerError('RETRYABLE', 'OUTBOX_HANDLER_RETRYABLE_FAILURE');
}
