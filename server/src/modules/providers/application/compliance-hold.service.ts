import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';

@Injectable()
export class ComplianceHoldService {
  constructor(private readonly db: PrismaService, private readonly recentAuth: RecentAuthService) {}
  async create(actor: Actor, input: { userId: string; scope: string; reasonCode: string; requestId: string }) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const existing = await db.complianceHold.findFirst({ where: { userId: input.userId, scope: input.scope, status: 'ACTIVE' } });
      if (existing) throw new ConflictException({ code: 'COMPLIANCE_HOLD_ACTIVE', message: 'An active hold already exists.' });
      const hold = await db.complianceHold.create({ data: { id: randomUUID(), userId: input.userId, scope: input.scope, reasonCode: input.reasonCode, source: 'ADMIN' } });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMPLIANCE_HOLD_CREATED', resourceType: 'compliance-hold', resourceId: hold.id, requestId: input.requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { scope: input.scope, reasonCode: input.reasonCode }, createdAt: new Date() });
      return { id: hold.id, status: hold.status, scope: hold.scope, createdAt: hold.createdAt.toISOString() };
    });
  }
  async release(actor: Actor, holdId: string) {
    this.recentAuth.require(actor);
    return this.db.$transaction(async (db) => {
      const hold = await db.complianceHold.findUnique({ where: { id: holdId } });
      if (!hold) throw new NotFoundException({ code: 'COMPLIANCE_HOLD_NOT_FOUND', message: 'Compliance hold not found.' });
      if (hold.status !== 'ACTIVE') throw new ConflictException({ code: 'COMPLIANCE_HOLD_TERMINAL', message: 'Compliance hold is not active.' });
      const released = await db.complianceHold.update({ where: { id: holdId }, data: { status: 'RELEASED', releasedAt: new Date() } });
      return { id: released.id, status: released.status, scope: released.scope, releasedAt: released.releasedAt!.toISOString() };
    });
  }
}
