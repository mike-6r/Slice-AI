import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type OutboxEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { outboxWorkerTestFailurePoint } from './outbox-worker-test-failure-injection';

export type OutboxClaim = OutboxEvent & { claimToken: string; reclaimed: boolean };

@Injectable()
export class OutboxWorkerRepository {
  constructor(private readonly db: PrismaService) {}

  /** A short transaction selects and fences each item; handler work is never in this transaction. */
  async claimBatch(input: { workerId: string; batchSize: number; leaseMs: number; now: Date }): Promise<OutboxClaim[]> {
    const { workerId, batchSize, leaseMs, now } = input;
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    return this.db.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status"::text AS "status" FROM "OutboxEvent"
        WHERE (
          "status" = 'PENDING'::"OutboxEventStatus"
          AND "availableAt" <= ${now}
        ) OR (
          "status" = 'PROCESSING'::"OutboxEventStatus"
          AND "leaseExpiresAt" <= ${now}
        )
        ORDER BY "availableAt" ASC, "createdAt" ASC, "id" ASC
        LIMIT ${Math.min(Math.max(batchSize, 1), 100)}
        FOR UPDATE SKIP LOCKED
      `);
      const ids = candidates.map((candidate) => candidate.id);
      const reclaimed = new Set(candidates.filter((candidate) => candidate.status === 'PROCESSING').map((candidate) => candidate.id));
      const claims = new Map<string, string>();
      for (const id of ids) {
        const claimToken = randomUUID();
        claims.set(id, claimToken);
        await tx.outboxEvent.update({ where: { id }, data: {
          status: 'PROCESSING', lockedBy: workerId, lockedAt: now,
          claimToken, leaseExpiresAt,
        } });
      }
      if (ids.length === 0) return [];
      const rows = await tx.outboxEvent.findMany({ where: { id: { in: ids } } });
      const rowsById = new Map(rows.map((row) => [row.id, row]));
      return ids.map((id) => ({ ...rowsById.get(id)!, claimToken: claims.get(id)!, reclaimed: reclaimed.has(id) }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /** Count an attempt when work actually begins, not when merely leased. */
  async beginAttempt(eventId: string, claimToken: string, now: Date): Promise<OutboxEvent | null> {
    return this.db.$transaction(async (tx) => {
      const updated = await tx.outboxEvent.updateMany({ where: {
        id: eventId, status: 'PROCESSING', claimToken,
      }, data: { attempts: { increment: 1 }, lastAttemptAt: now } });
      if (updated.count !== 1) return null;
      return tx.outboxEvent.findUnique({ where: { id: eventId } });
    });
  }

  async finalizeSuccess(eventId: string, claimToken: string, now: Date): Promise<boolean> {
    await outboxWorkerTestFailurePoint('outbox.before-success-finalize');
    const updated = await this.db.outboxEvent.updateMany({ where: {
      id: eventId, status: 'PROCESSING', claimToken,
    }, data: {
      status: 'DELIVERED', deliveredAt: now, lockedAt: null, lockedBy: null,
      claimToken: null, leaseExpiresAt: null, lastErrorSafe: null,
    } });
    return updated.count === 1;
  }

  async finalizeFailure(input: {
    eventId: string; claimToken: string; now: Date; errorCode: string;
    terminal: boolean; retryAt?: Date;
  }): Promise<boolean> {
    const updated = await this.db.outboxEvent.updateMany({ where: {
      id: input.eventId, status: 'PROCESSING', claimToken: input.claimToken,
    }, data: input.terminal ? {
      status: 'DEAD_LETTER', deadLetteredAt: input.now, lockedAt: null, lockedBy: null,
      claimToken: null, leaseExpiresAt: null, lastErrorSafe: input.errorCode,
    } : {
      status: 'PENDING', availableAt: input.retryAt!, lockedAt: null, lockedBy: null,
      claimToken: null, leaseExpiresAt: null, lastErrorSafe: input.errorCode,
    } });
    return updated.count === 1;
  }
}
