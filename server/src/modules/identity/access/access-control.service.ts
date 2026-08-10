import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { evaluateAccountStatusTransition } from '../domain/account-status';
import type { AccountStatus, Role, UserId } from '../domain/identity.types';
import { RepositoryConflict } from '../domain/errors';
import {
  IDENTITY_UNIT_OF_WORK,
  type IdentityTransaction,
  type IdentityUnitOfWork,
} from '../ports/repositories';
import { IdempotencyCoordinator } from '../auth/idempotency-coordinator';
import type { Actor } from '../auth/auth.service';
import { AuthorizationService } from './authorization.service';
import { RecentAuthService } from './recent-auth.service';

@Injectable()
export class AccessControlService {
  constructor(
    @Inject(IDENTITY_UNIT_OF_WORK) private readonly uow: IdentityUnitOfWork,
    private readonly idempotency: IdempotencyCoordinator,
    private readonly authorization: AuthorizationService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async transitionStatus(
    actor: Actor,
    targetUserId: UserId,
    input: { toStatus: AccountStatus; reasonCode: string; restore?: boolean },
    requestId: string,
    key: string,
  ) {
    await this.authorization.authorize(
      actor,
      'account.status.change',
      targetUserId,
      undefined,
      requestId,
    );
    if (['RESTRICTED', 'SUSPENDED', 'CLOSED'].includes(input.toStatus)) {
      await this.requireRecentAuth(
        actor,
        'account.status.change',
        targetUserId,
        requestId,
      );
    }
    const outcome = await this.idempotency.run(
      { actorScope: `user:${actor.userId}`, scope: 'admin.user.status', key },
      'POST',
      `/v1/admin/users/${targetUserId}/status`,
      input,
      (tx) =>
        this.transitionStatusDurable(tx, actor, targetUserId, input, requestId),
    );
    return outcome.value;
  }

  async grantRole(
    actor: Actor,
    targetUserId: UserId,
    input: { role: Role; scopeType: string; scopeId: string },
    requestId: string,
    key: string,
  ) {
    await this.authorization.authorize(
      actor,
      'role.assign',
      targetUserId,
      [input.role],
      requestId,
    );
    if (actor.userId === targetUserId) throw this.selfAction();
    await this.requireRecentAuth(actor, 'role.assign', targetUserId, requestId);
    const outcome = await this.idempotency.run(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'admin.user.role.grant',
        key,
      },
      'POST',
      `/v1/admin/users/${targetUserId}/roles`,
      input,
      (tx) => this.grantRoleDurable(tx, actor, targetUserId, input, requestId),
    );
    return outcome.value;
  }

  async revokeRole(
    actor: Actor,
    targetUserId: UserId,
    assignmentId: string,
    requestId: string,
    key: string,
  ) {
    await this.authorization.authorize(
      actor,
      'role.remove',
      targetUserId,
      undefined,
      requestId,
    );
    if (actor.userId === targetUserId) throw this.selfAction();
    await this.requireRecentAuth(actor, 'role.remove', targetUserId, requestId);
    const outcome = await this.idempotency.run(
      {
        actorScope: `user:${actor.userId}`,
        scope: 'admin.user.role.revoke',
        key,
      },
      'DELETE',
      `/v1/admin/users/${targetUserId}/roles/${assignmentId}`,
      {},
      (tx) =>
        this.revokeRoleDurable(
          tx,
          actor,
          targetUserId,
          assignmentId,
          requestId,
        ),
    );
    return outcome.value;
  }

  private async transitionStatusDurable(
    tx: IdentityTransaction,
    actor: Actor,
    targetUserId: UserId,
    input: { toStatus: AccountStatus; reasonCode: string; restore?: boolean },
    requestId: string,
  ) {
    const target = await tx.users.findById(targetUserId);
    if (!target)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found.',
      });
    const now = new Date();
    const decision = evaluateAccountStatusTransition({
      current: target.accountStatus,
      requested: input.toStatus,
      actor: {
        actorType: 'USER',
        userId: actor.userId,
        sessionId: actor.sessionId as never,
        accountStatus: actor.status,
        roles: actor.roles as never,
      },
      reason: input.reasonCode,
      at: now,
      explicitRestoration: input.restore === true,
    });
    if (!decision.allowed) {
      throw new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'The requested account change is not allowed.',
      });
    }
    const adminLosesAccess =
      ['RESTRICTED', 'SUSPENDED', 'CLOSED'].includes(input.toStatus) &&
      (await tx.roles.hasActiveGlobalAdmin(targetUserId));
    if (adminLosesAccess) {
      await tx.roles.lockAdminInvariant();
      if ((await tx.roles.countActiveGlobalAdmins()) <= 1) {
        throw new ConflictException({
          code: 'LAST_ADMIN_REQUIRED',
          message: 'At least one active administrator is required.',
        });
      }
    }
    await tx.users.updateStatus(targetUserId, input.toStatus);
    await tx.statusHistory.append({
      id: randomUUID(),
      userId: targetUserId,
      fromStatus: target.accountStatus,
      toStatus: input.toStatus,
      reason: input.reasonCode,
      actorUserId: actor.userId,
      createdAt: now,
    });
    if (decision.sessionsMustRevoke) {
      await tx.sessions.revokeAllForUser(
        targetUserId,
        input.toStatus as 'RESTRICTED' | 'SUSPENDED' | 'CLOSED',
        now,
      );
    }
    await tx.audit.append(
      this.audit(
        'ACCOUNT_STATUS_CHANGED',
        actor,
        targetUserId,
        requestId,
        now,
        {
          fromStatus: target.accountStatus,
          toStatus: input.toStatus,
          reasonCode: input.reasonCode,
        },
      ),
    );
    return { userId: targetUserId, accountStatus: input.toStatus };
  }

  private async grantRoleDurable(
    tx: IdentityTransaction,
    actor: Actor,
    targetUserId: UserId,
    input: { role: Role; scopeType: string; scopeId: string },
    requestId: string,
  ) {
    if (!(await tx.users.findById(targetUserId)))
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resource not found.',
      });
    const now = new Date();
    try {
      const assignment = await tx.roles.assign({
        id: randomUUID() as never,
        userId: targetUserId,
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        assignedByUserId: actor.userId,
        createdAt: now,
        revokedAt: null,
      });
      await tx.audit.append(
        this.audit('ROLE_GRANTED', actor, targetUserId, requestId, now, {
          role: input.role,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          assignmentId: assignment.id,
        }),
      );
      return {
        assignmentId: assignment.id,
        userId: targetUserId,
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      };
    } catch (error) {
      if (error instanceof RepositoryConflict)
        throw new ConflictException({
          code: 'ROLE_ALREADY_ASSIGNED',
          message: 'The requested role is already assigned.',
        });
      throw error;
    }
  }

  private async revokeRoleDurable(
    tx: IdentityTransaction,
    actor: Actor,
    targetUserId: UserId,
    assignmentId: string,
    requestId: string,
  ) {
    const assignment = await tx.roles.findById(assignmentId as never);
    if (
      !assignment ||
      assignment.userId !== targetUserId ||
      assignment.revokedAt
    ) {
      throw new NotFoundException({
        code: 'ROLE_NOT_ASSIGNED',
        message: 'Resource not found.',
      });
    }
    if (
      assignment.role === 'ADMIN' &&
      assignment.scopeType === 'GLOBAL' &&
      assignment.scopeId === '*'
    ) {
      await tx.roles.lockAdminInvariant();
      if ((await tx.roles.countActiveGlobalAdmins()) <= 1) {
        throw new ConflictException({
          code: 'LAST_ADMIN_REQUIRED',
          message: 'At least one active administrator is required.',
        });
      }
    }
    const now = new Date();
    if (!(await tx.roles.revoke(assignment.id, now))) {
      throw new NotFoundException({
        code: 'ROLE_NOT_ASSIGNED',
        message: 'Resource not found.',
      });
    }
    await tx.audit.append(
      this.audit('ROLE_REVOKED', actor, targetUserId, requestId, now, {
        role: assignment.role,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        assignmentId: assignment.id,
      }),
    );
    return { assignmentId: assignment.id, userId: targetUserId, revoked: true };
  }

  private audit(
    action: string,
    actor: Actor,
    resourceId: UserId,
    requestId: string,
    createdAt: Date,
    metadata: Record<string, unknown>,
  ) {
    return {
      id: randomUUID(),
      actorUserId: actor.userId,
      actorType: 'USER' as const,
      action,
      resourceType: 'user',
      resourceId,
      requestId,
      sessionId: actor.sessionId as never,
      result: 'SUCCESS' as const,
      metadata,
      createdAt,
    };
  }
  private async requireRecentAuth(
    actor: Actor,
    permission: string,
    targetUserId: UserId,
    requestId: string,
  ) {
    try {
      this.recentAuth.require(actor);
    } catch (error) {
      await this.uow.withinTransaction((tx) =>
        tx.audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'ACCESS_DENIED',
          resourceType: 'access-control',
          resourceId: targetUserId,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'FAILURE',
          metadata: {
            permission,
            reasonCode: 'RECENT_AUTH_REQUIRED',
            targetUserId,
          },
          createdAt: new Date(),
        }),
      );
      throw error;
    }
  }
  private selfAction() {
    return new ForbiddenException({
      code: 'SELF_ADMIN_ACTION_FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  }
}
