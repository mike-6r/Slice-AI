import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../identity/auth/auth.service';
import { AuthorizationService } from '../identity/access/authorization.service';
import { RecentAuthService } from '../identity/access/recent-auth.service';
import { sanitizeAuditMetadata } from '../identity/domain/audit';

type RevisionInput = {
  expectedRevision: string;
  reasonCode: string;
};

type ProfileInput = RevisionInput & {
  displayName?: string;
  countryCode?: string;
  timezone?: string;
  preferredCurrency?: string;
};

@Injectable()
export class AdminAccountControlService {
  constructor(
    private readonly db: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly recentAuth: RecentAuthService,
  ) {}

  async updateProfile(
    actor: Actor,
    userId: string,
    input: ProfileInput,
    requestId: string,
    key: string,
  ) {
    await this.authorize(actor, 'users.profile.manage', userId, requestId);
    return this.idempotent(
      actor,
      'admin.account.profile',
      key,
      input,
      async (tx) => {
        const revision = await this.assertTarget(
          tx,
          actor,
          userId,
          input.expectedRevision,
        );
        const profile = {
          ...(input.displayName === undefined
            ? {}
            : { displayName: input.displayName }),
          ...(input.countryCode === undefined
            ? {}
            : { countryCode: input.countryCode }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.preferredCurrency === undefined
            ? {}
            : { preferredCurrency: input.preferredCurrency }),
        };
        await tx.userProfile.upsert({
          where: { userId },
          create: {
            userId,
            displayName: input.displayName ?? 'Slice member',
            ...profile,
          },
          update: profile,
        });
        await this.audit(
          tx,
          actor,
          'ADMIN_ACCOUNT_PROFILE_UPDATED',
          userId,
          requestId,
          {
            changedFields: Object.keys(profile),
            reasonCode: input.reasonCode,
          },
        );
        return { userId, revision, changedFields: Object.keys(profile) };
      },
    );
  }

  async revokeSessions(
    actor: Actor,
    userId: string,
    input: RevisionInput,
    requestId: string,
    key: string,
  ) {
    await this.authorize(actor, 'users.security.manage', userId, requestId);
    return this.idempotent(
      actor,
      'admin.account.sessions.revoke',
      key,
      input,
      async (tx) => {
        const revision = await this.assertTarget(
          tx,
          actor,
          userId,
          input.expectedRevision,
        );
        const revoked = await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), revocationReason: 'SESSION_REVOKED' },
        });
        await this.audit(
          tx,
          actor,
          'ADMIN_ACCOUNT_SESSIONS_REVOKED',
          userId,
          requestId,
          {
            reasonCode: input.reasonCode,
            revokedSessionCount: revoked.count,
          },
        );
        return { userId, revision, revokedSessionCount: revoked.count };
      },
    );
  }

  async resetTwoFactor(
    actor: Actor,
    userId: string,
    input: RevisionInput,
    requestId: string,
    key: string,
  ) {
    await this.authorize(actor, 'users.security.manage', userId, requestId);
    return this.idempotent(
      actor,
      'admin.account.two-factor.reset',
      key,
      input,
      async (tx) => {
        const revision = await this.assertTarget(
          tx,
          actor,
          userId,
          input.expectedRevision,
        );
        const [totp, sms, recoveryCodes, sessions] = await Promise.all([
          tx.userTwoFactor.deleteMany({ where: { userId } }),
          tx.userSmsTwoFactor.deleteMany({ where: { userId } }),
          tx.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
          tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: {
              revokedAt: new Date(),
              revocationReason: 'SESSION_REVOKED',
            },
          }),
        ]);
        await Promise.all([
          tx.twoFactorLoginChallenge.deleteMany({ where: { userId } }),
          tx.twoFactorActionChallenge.deleteMany({ where: { userId } }),
        ]);
        await this.audit(
          tx,
          actor,
          'ADMIN_ACCOUNT_TWO_FACTOR_RESET',
          userId,
          requestId,
          {
            reasonCode: input.reasonCode,
            revokedSessionCount: sessions.count,
            removedRecoveryCodeCount: recoveryCodes.count,
          },
        );
        return {
          userId,
          revision,
          removedMethods: totp.count + sms.count,
          revokedSessionCount: sessions.count,
        };
      },
    );
  }

  async createRestriction(
    actor: Actor,
    userId: string,
    input: RevisionInput & { scope: string },
    requestId: string,
    key: string,
  ) {
    await this.authorize(actor, 'users.restrictions.manage', userId, requestId);
    return this.idempotent(
      actor,
      'admin.account.restriction.create',
      key,
      input,
      async (tx) => {
        const revision = await this.assertTarget(
          tx,
          actor,
          userId,
          input.expectedRevision,
        );
        const existing = await tx.complianceHold.findFirst({
          where: { userId, scope: input.scope, status: 'ACTIVE' },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException({
            code: 'COMPLIANCE_HOLD_ACTIVE',
            message: 'An active restriction already exists for this scope.',
          });
        }
        const hold = await tx.complianceHold.create({
          data: {
            id: randomUUID(),
            userId,
            scope: input.scope,
            reasonCode: input.reasonCode,
            source: 'ADMIN_ACCOUNT_CONTROL',
          },
        });
        await this.audit(
          tx,
          actor,
          'ADMIN_ACCOUNT_RESTRICTION_CREATED',
          userId,
          requestId,
          {
            holdId: hold.id,
            scope: hold.scope,
            reasonCode: hold.reasonCode,
            source: hold.source,
          },
        );
        return {
          userId,
          revision,
          hold: { id: hold.id, scope: hold.scope, status: hold.status },
        };
      },
    );
  }

  async releaseRestriction(
    actor: Actor,
    userId: string,
    holdId: string,
    input: RevisionInput,
    requestId: string,
    key: string,
  ) {
    await this.authorize(actor, 'users.restrictions.manage', userId, requestId);
    return this.idempotent(
      actor,
      'admin.account.restriction.release',
      key,
      input,
      async (tx) => {
        const revision = await this.assertTarget(
          tx,
          actor,
          userId,
          input.expectedRevision,
        );
        const hold = await tx.complianceHold.findFirst({
          where: { id: holdId, userId, status: 'ACTIVE' },
        });
        if (!hold) {
          throw new NotFoundException({
            code: 'COMPLIANCE_HOLD_NOT_FOUND',
            message: 'Active restriction was not found.',
          });
        }
        const released = await tx.complianceHold.update({
          where: { id: hold.id },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });
        await this.audit(
          tx,
          actor,
          'ADMIN_ACCOUNT_RESTRICTION_RELEASED',
          userId,
          requestId,
          {
            holdId: released.id,
            scope: released.scope,
            reasonCode: released.reasonCode,
            releaseReasonCode: input.reasonCode,
            source: released.source,
          },
        );
        return {
          userId,
          revision,
          hold: { id: released.id, status: released.status },
        };
      },
    );
  }

  async addNote(
    actor: Actor,
    userId: string,
    input: RevisionInput & { category: string; note: string },
    requestId: string,
    key: string,
  ) {
    await this.authorize(actor, 'users.notes.manage', userId, requestId);
    return this.idempotent(
      actor,
      'admin.account.note.add',
      key,
      input,
      async (tx) => {
        const revision = await this.assertTarget(
          tx,
          actor,
          userId,
          input.expectedRevision,
        );
        await this.audit(
          tx,
          actor,
          'ADMIN_ACCOUNT_NOTE_ADDED',
          userId,
          requestId,
          {
            category: input.category,
            noteSummary: input.note,
            reasonCode: input.reasonCode,
          },
        );
        return { userId, revision, recorded: true };
      },
    );
  }

  private async authorize(
    actor: Actor,
    permission:
      | 'users.profile.manage'
      | 'users.security.manage'
      | 'users.restrictions.manage'
      | 'users.notes.manage',
    userId: string,
    requestId: string,
  ) {
    await this.authorization.authorize(
      actor,
      permission,
      userId as never,
      undefined,
      requestId,
    );
    this.recentAuth.require(actor);
  }

  private async assertTarget(
    tx: Prisma.TransactionClient,
    actor: Actor,
    userId: string,
    expectedRevision: string,
  ) {
    if (actor.userId === userId) {
      throw new ForbiddenException({
        code: 'SELF_ADMIN_ACTION_FORBIDDEN',
        message: 'Use the account self-service controls for your own account.',
      });
    }
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, updatedAt: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Account was not found.',
      });
    }
    if (target.updatedAt.toISOString() !== expectedRevision) {
      throw new ConflictException({
        code: 'STALE_ACCOUNT_REVISION',
        message: 'The account changed. Refresh it before retrying this action.',
      });
    }
    const next = new Date();
    const touched = await tx.user.updateMany({
      where: { id: userId, updatedAt: target.updatedAt },
      data: { updatedAt: next },
    });
    if (touched.count !== 1) {
      throw new ConflictException({
        code: 'STALE_ACCOUNT_REVISION',
        message: 'The account changed. Refresh it before retrying this action.',
      });
    }
    return next.toISOString();
  }

  private async idempotent<T extends Record<string, unknown>>(
    actor: Actor,
    scope: string,
    key: string,
    body: unknown,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const requestHash = createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');
    const identity = { actorScope: `user:${actor.userId}`, scope, key };
    return this.db.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { actorScope_scope_key: identity },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_CONFLICT',
            message:
              'This idempotency key is already associated with a different request.',
          });
        }
        if (existing.status === 'COMPLETED' && existing.responseBody) {
          return existing.responseBody as T;
        }
        throw new ConflictException({
          code: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'This request is already being processed.',
        });
      }
      await tx.idempotencyRecord.create({
        data: {
          ...identity,
          requestHash,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const result = await work(tx);
      await tx.idempotencyRecord.update({
        where: { actorScope_scope_key: identity },
        data: {
          status: 'COMPLETED',
          responseStatus: 200,
          responseBody: result as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      return result;
    });
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    userId: string,
    requestId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditEvent.create({
      data: {
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action,
        resourceType: 'user',
        resourceId: userId,
        requestId,
        sessionId: actor.sessionId,
        result: 'SUCCESS',
        metadata: sanitizeAuditMetadata(
          action,
          metadata,
        ) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  }
}
