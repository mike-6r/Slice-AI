import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  CACHE_STORE,
  type CacheStore,
} from '../../../infrastructure/redis/redis.store';
import { evaluatePolicy } from '../domain/policy';
import type { Permission, UserId } from '../domain/identity.types';
import type { Actor } from '../auth/auth.service';
import {
  IDENTITY_UNIT_OF_WORK,
  type IdentityUnitOfWork,
} from '../ports/repositories';

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(IDENTITY_UNIT_OF_WORK) private readonly uow: IdentityUnitOfWork,
    @Inject(CACHE_STORE) private readonly cache: CacheStore,
  ) {}

  async authorize(
    actor: Actor,
    permission: Permission,
    targetUserId?: UserId,
    targetRoles?: string[],
    requestId?: string,
  ) {
    const decision = evaluatePolicy({
      actor: {
        actorType: 'USER',
        userId: actor.userId,
        sessionId: actor.sessionId as never,
        accountStatus: actor.status,
        roles: actor.roles as never,
      },
      action: permission,
      targetUserId,
      targetRoles,
    });
    if (!decision.allowed) {
      if (
        isPrivileged(permission) &&
        (await this.shouldRecordDenied(actor, permission))
      ) {
        const metadata: Record<string, unknown> = {
          permission,
          reasonCode: decision.code,
        };
        if (targetUserId) metadata.targetUserId = targetUserId;
        await this.uow.withinTransaction((tx) =>
          tx.audit.append({
            id: randomUUID(),
            actorUserId: actor.userId,
            actorType: 'USER',
            action: 'ACCESS_DENIED',
            resourceType: 'access-control',
            resourceId: targetUserId ?? null,
            requestId: requestId ?? null,
            sessionId: actor.sessionId as never,
            result: 'FAILURE',
            metadata,
            createdAt: new Date(),
          }),
        );
      }
      throw new ForbiddenException({
        code:
          decision.code === 'ACCOUNT_UNAVAILABLE'
            ? 'ACCOUNT_RESTRICTED'
            : 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }
  }

  /** One durable denial per actor/permission/minute prevents audit-write amplification. */
  private async shouldRecordDenied(actor: Actor, permission: Permission) {
    try {
      const suffix = createHash('sha256')
        .update(
          `${actor.userId}:${permission}:${Math.floor(Date.now() / 60_000)}`,
        )
        .digest('hex');
      const result = await this.cache.incrementWithTtl(
        this.cache.key('access-denied-audit', suffix),
        60,
      );
      return result.count === 1;
    } catch {
      // Security telemetry must not turn an authorization denial into an allow.
      return true;
    }
  }
}

function isPrivileged(permission: Permission) {
  return (
    permission === 'role.assign' ||
    permission === 'role.remove' ||
    permission === 'account.status.change' ||
    permission === 'admin.access' ||
    permission === 'audit.read' ||
    permission === 'finance.manage' ||
    permission === 'trading.manage' ||
    permission === 'community.moderate' ||
    permission === 'governance.manage' ||
    permission === 'distribution.manage'
  );
}
