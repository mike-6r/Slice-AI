import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fingerprintRequest } from '../../identity/domain/idempotency';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import { PrismaService } from '../../../database/prisma.service';
import { randomUUID } from 'node:crypto';

type RequeueContext = {
  actor: Actor;
  requestId: string;
  idempotencyKey: string;
};

/**
 * Privileged D17 operational authority. Requeue only makes the original work
 * item claimable again; it never recreates a domain event or repairs business
 * state owned by Documents 012–016.
 */
@Injectable()
export class OutboxOperationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async status() {
    const [outbox, deliveries] = await Promise.all([
      this.db.outboxEvent.groupBy({ by: ['status'], _count: true }),
      this.db.notificationDelivery.groupBy({ by: ['status'], _count: true }),
    ]);
    return {
      outbox: Object.fromEntries(outbox.map((row) => [row.status, row._count])),
      deliveries: Object.fromEntries(
        deliveries.map((row) => [row.status, row._count]),
      ),
    };
  }

  async outboxDeadLetters(limit: number) {
    const rows = await this.db.outboxEvent.findMany({
      where: { status: 'DEAD_LETTER' },
      orderBy: [{ deadLetteredAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row) => this.safeOutbox(row));
  }

  async deliveryDeadLetters(limit: number) {
    const rows = await this.db.notificationDelivery.findMany({
      where: { status: 'DEAD_LETTER' },
      include: { outboxEvent: { select: { eventId: true } } },
      orderBy: [{ deadLetteredAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row) => ({
      deliveryId: row.deliveryId,
      eventId: row.outboxEvent.eventId,
      channel: row.channel,
      destinationKey: row.destinationKey,
      topic: row.topic,
      status: row.status,
      attempts: row.attempts,
      lastErrorSafe: row.lastErrorSafe,
      createdAt: row.createdAt.toISOString(),
      availableAt: row.availableAt.toISOString(),
      deadLetteredAt: row.deadLetteredAt?.toISOString() ?? null,
    }));
  }

  async outboxDetail(eventId: string) {
    const row = await this.db.outboxEvent.findUnique({ where: { eventId } });
    if (!row) throw outboxNotFound();
    return this.safeOutbox(row);
  }

  async requeueOutbox(eventId: string, context: RequeueContext) {
    this.recentAuth.require(context.actor);
    const identity = this.identity(context.actor, 'outbox.requeue', context.idempotencyKey);
    const path = `/v1/admin/outbox/${eventId}/requeue`;
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        fingerprintRequest('POST', path, { eventId }),
        tomorrow(),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT') throw idempotencyConflict();
      if (acquired.state === 'EXISTING_IN_PROGRESS') throw inProgress();
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as OutboxRequeueResult;

      const row = await db.outboxEvent.findUnique({ where: { eventId } });
      if (!row) throw outboxNotFound();
      if (row.status !== 'DEAD_LETTER') throw outboxIneligible();
      const now = new Date();
      const updated = await db.outboxEvent.updateMany({
        where: { id: row.id, status: 'DEAD_LETTER' },
        data: resetForRequeue(now),
      });
      if (updated.count !== 1) throw outboxIneligible();
      const result: OutboxRequeueResult = {
        ...this.safeOutbox({ ...row, status: 'PENDING', availableAt: now, deadLetteredAt: null, lastErrorSafe: null }),
        requeued: true,
      };
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: context.actor.userId,
        actorType: 'USER',
        action: 'OUTBOX_EVENT_REQUEUED',
        resourceType: 'outbox-event',
        resourceId: eventId,
        requestId: context.requestId,
        sessionId: context.actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { eventId, previousStatus: row.status, resultingStatus: 'PENDING' },
        createdAt: now,
      });
      await tx.idempotency.complete(identity, { status: 200, body: result }, now);
      return result;
    });
  }

  async requeueDelivery(deliveryId: string, context: RequeueContext) {
    this.recentAuth.require(context.actor);
    const identity = this.identity(context.actor, 'notification-delivery.requeue', context.idempotencyKey);
    const path = `/v1/admin/notification-deliveries/${deliveryId}/requeue`;
    return this.db.$transaction(async (db) => {
      const tx = createIdentityTransaction(db);
      const acquired = await tx.idempotency.acquire(
        identity,
        fingerprintRequest('POST', path, { deliveryId }),
        tomorrow(),
      );
      if (acquired.state === 'FINGERPRINT_CONFLICT') throw idempotencyConflict();
      if (acquired.state === 'EXISTING_IN_PROGRESS') throw inProgress();
      if (acquired.state === 'EXISTING_COMPLETED')
        return acquired.record.response!.body as DeliveryRequeueResult;

      const row = await db.notificationDelivery.findUnique({ where: { deliveryId } });
      if (!row) throw deliveryNotFound();
      if (row.status !== 'DEAD_LETTER') throw deliveryIneligible();
      const now = new Date();
      const updated = await db.notificationDelivery.updateMany({
        where: { id: row.id, status: 'DEAD_LETTER' },
        data: resetForRequeue(now),
      });
      if (updated.count !== 1) throw deliveryIneligible();
      const result: DeliveryRequeueResult = {
        deliveryId: row.deliveryId,
        status: 'PENDING',
        attempts: row.attempts,
        availableAt: now.toISOString(),
        deadLetteredAt: null,
        requeued: true,
      };
      await tx.audit.append({
        id: randomUUID(),
        actorUserId: context.actor.userId,
        actorType: 'USER',
        action: 'NOTIFICATION_DELIVERY_REQUEUED',
        resourceType: 'notification-delivery',
        resourceId: deliveryId,
        requestId: context.requestId,
        sessionId: context.actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { deliveryId, previousStatus: row.status, resultingStatus: 'PENDING' },
        createdAt: now,
      });
      await tx.idempotency.complete(identity, { status: 200, body: result }, now);
      return result;
    });
  }

  private identity(actor: Actor, scope: string, key: string): IdempotencyIdentity {
    return { actorScope: `user:${actor.userId}`, scope, key };
  }

  private safeOutbox(row: {
    eventId: string;
    eventType: string;
    schemaVersion: number;
    status: string;
    attempts: number;
    lastErrorSafe: string | null;
    createdAt: Date;
    availableAt: Date;
    deadLetteredAt: Date | null;
  }) {
    return {
      eventId: row.eventId,
      eventType: row.eventType,
      schemaVersion: row.schemaVersion,
      status: row.status,
      attempts: row.attempts,
      lastErrorSafe: row.lastErrorSafe,
      createdAt: row.createdAt.toISOString(),
      availableAt: row.availableAt.toISOString(),
      deadLetteredAt: row.deadLetteredAt?.toISOString() ?? null,
    };
  }
}

type OutboxRequeueResult = ReturnType<OutboxOperationsService['safeOutbox']> & {
  requeued: true;
};
type DeliveryRequeueResult = {
  deliveryId: string;
  status: 'PENDING';
  attempts: number;
  availableAt: string;
  deadLetteredAt: null;
  requeued: true;
};

function resetForRequeue(availableAt: Date) {
  return {
    status: 'PENDING' as const,
    availableAt,
    lockedAt: null,
    lockedBy: null,
    claimToken: null,
    leaseExpiresAt: null,
    deadLetteredAt: null,
    lastErrorSafe: null,
  };
}
function tomorrow() { return new Date(Date.now() + 86_400_000); }
function idempotencyConflict(): never { throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'The request key cannot be reused for this operation.' }); }
function inProgress(): never { throw new ConflictException({ code: 'PERSISTENCE_CONFLICT', message: 'The request is already in progress. Please retry.' }); }
function outboxNotFound(): never { throw new NotFoundException({ code: 'OUTBOX_EVENT_NOT_FOUND', message: 'Resource not found.' }); }
function deliveryNotFound(): never { throw new NotFoundException({ code: 'NOTIFICATION_DELIVERY_NOT_FOUND', message: 'Resource not found.' }); }
function outboxIneligible(): never { throw new ConflictException({ code: 'OUTBOX_REQUEUE_INELIGIBLE', message: 'Only dead-letter records can be requeued.' }); }
function deliveryIneligible(): never { throw new ConflictException({ code: 'DELIVERY_REQUEUE_INELIGIBLE', message: 'Only dead-letter records can be requeued.' }); }
