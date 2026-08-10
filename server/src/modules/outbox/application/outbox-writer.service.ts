import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type OutboxEventStatus } from '@prisma/client';
import { assertDomainEvent, type DomainEventEnvelope } from '../domain/domain-event';

type Db = Prisma.TransactionClient;

/** Transaction-scoped phase-1 append authority. Dispatch is intentionally later. */
@Injectable()
export class OutboxWriter {
  private readonly logger = new Logger(OutboxWriter.name);

  async append(db: Db, event: DomainEventEnvelope) {
    try {
      assertDomainEvent(event);
      const existing = await db.outboxEvent.findUnique({ where: { eventId: event.eventId } });
      if (existing) return existing;
      return await db.outboxEvent.create({ data: {
        eventId: event.eventId, eventType: event.eventType,
        aggregateType: event.aggregate.type, aggregateId: event.aggregate.id,
        schemaVersion: event.schemaVersion, occurredAt: event.occurredAt,
        payload: event.payload as Prisma.InputJsonValue,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
        correlationId: event.correlationId, causationId: event.causationId,
        actorUserId: event.actorUserId, status: 'PENDING', availableAt: event.occurredAt,
      } });
    } catch (error) {
      this.logger.error({ eventId: event.eventId, eventType: event.eventType, aggregateType: event.aggregate.type, aggregateId: event.aggregate.id }, 'Outbox append failed');
      throw error;
    }
  }

  getByEventId(db: Db, eventId: string) { return db.outboxEvent.findUnique({ where: { eventId } }); }

  /** Deterministic future-worker query. No claim/lease/delivery logic in phase 1. */
  pending(db: Db, limit = 100, status: OutboxEventStatus = 'PENDING') {
    return db.outboxEvent.findMany({ where: { status }, orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: Math.min(Math.max(limit, 1), 100) });
  }
}
