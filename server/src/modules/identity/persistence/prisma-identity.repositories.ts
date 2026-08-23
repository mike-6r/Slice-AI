import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import {
  RepositoryConflict,
  RepositoryNotFound,
  RepositorySerializationFailure,
} from '../domain/errors';
import type {
  AccountStatusHistoryEntry,
  IdentityProfile,
  IdentitySession,
  IdentityUser,
  RoleAssignment,
  SessionId,
  SessionRevocationReason,
  UserId,
} from '../domain/identity.types';
import { mapIdentitySession, mapIdentityUser } from './mappers/identity.mapper';
import { sanitizeAuditMetadata } from '../domain/audit';
import type {
  AccountStatusHistoryRepository,
  AuditEventRepository,
  AuditQuery,
  AuditWrite,
  IdempotencyAcquisition,
  IdempotencyIdentity,
  IdempotencyRecord,
  IdempotencyRepository,
  IdempotencyStoredResponse,
  ConsentAcceptanceRepository,
  IdentityTransaction,
  IdentityUnitOfWork,
  NewIdentityUser,
  ProfilePatch,
  RoleAssignmentRepository,
  SessionRepository,
  UserRepository,
} from '../ports/repositories';

type Db = PrismaClient | Prisma.TransactionClient;
const userInclude = {
  profile: true,
  twoFactor: { select: { enabledAt: true } },
  smsTwoFactor: { select: { enabledAt: true } },
} satisfies Prisma.UserInclude;

class UserAdapter implements UserRepository {
  constructor(private readonly db: Db) {}
  async create(input: NewIdentityUser) {
    try {
      return mapIdentityUser(
        await this.db.user.create({
          data: {
            id: input.id,
            email: input.email,
            normalizedEmail: input.normalizedEmail,
            passwordHash: input.passwordHash,
            emailVerifiedAt: input.emailVerifiedAt,
            accountStatus: input.accountStatus,
            profile: input.profile
              ? { create: { id: `${input.id}-profile`, ...input.profile } }
              : undefined,
          },
          include: userInclude,
        }),
      );
    } catch (error) {
      if (isUsernameConflict(error))
        throw new RepositoryConflict('DUPLICATE_USERNAME');
      throw translate(error, 'IDENTITY_EMAIL_CONFLICT');
    }
  }
  async findById(id: UserId) {
    const row = await this.db.user.findUnique({
      where: { id },
      include: userInclude,
    });
    return row ? mapIdentityUser(row) : null;
  }
  async findByNormalizedEmail(normalizedEmail: string) {
    const row = await this.db.user.findUnique({
      where: { normalizedEmail },
      include: userInclude,
    });
    return row ? mapIdentityUser(row) : null;
  }
  async findByUsername(publicUsername: string) {
    const row = await this.db.user.findFirst({
      where: {
        profile: {
          publicUsername: { equals: publicUsername, mode: 'insensitive' },
        },
      },
      include: userInclude,
    });
    return row ? mapIdentityUser(row) : null;
  }
  async updateProfile(id: UserId, update: ProfilePatch) {
    try {
      return mapIdentityUser(
        await this.db.user.update({
          where: { id },
          data: { profile: { update } },
          include: userInclude,
        }),
      );
    } catch (error) {
      throw translate(error, 'DUPLICATE_USERNAME');
    }
  }
  async updateEmailVerificationState(id: UserId, emailVerifiedAt: Date | null) {
    await this.update(id, { emailVerifiedAt });
  }
  async updatePasswordHash(id: UserId, passwordHash: string) {
    await this.update(id, { passwordHash });
  }
  async invalidateTwoFactorLoginChallenges(id: UserId) {
    await this.db.twoFactorLoginChallenge.deleteMany({ where: { userId: id } });
  }
  async updateStatus(id: UserId, accountStatus: IdentityUser['accountStatus']) {
    await this.update(id, { accountStatus });
  }
  async getProfile(id: UserId): Promise<IdentityProfile | null> {
    return (await this.findById(id))?.profile ?? null;
  }
  private async update(id: UserId, data: Prisma.UserUpdateInput) {
    try {
      await this.db.user.update({ where: { id }, data });
    } catch (error) {
      throw translate(error, 'IDENTITY_NOT_FOUND');
    }
  }
}

class SessionAdapter implements SessionRepository {
  constructor(private readonly db: Db) {}
  async create(input: IdentitySession) {
    try {
      return mapIdentitySession(
        await this.db.session.create({
          data: {
            ...input,
            publicId: input.publicId ?? `session_${randomUUID()}`,
          },
        }),
      );
    } catch (error) {
      throw translate(error, 'SESSION_TOKEN_CONFLICT');
    }
  }
  async findById(id: SessionId) {
    const row = await this.db.session.findUnique({ where: { id } });
    return row ? mapIdentitySession(row) : null;
  }
  async findByPublicId(publicId: string) {
    const row = await this.db.session.findUnique({ where: { publicId } });
    return row ? mapIdentitySession(row) : null;
  }
  async findByRefreshTokenHash(tokenHash: string) {
    const row = await this.db.session.findUnique({ where: { tokenHash } });
    return row ? mapIdentitySession(row) : null;
  }
  async listActiveByUser(userId: UserId, now: Date) {
    return (
      await this.db.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
      })
    ).map(mapIdentitySession);
  }
  async touchLastUsed(id: SessionId, lastActivityAt: Date) {
    try {
      await this.db.session.update({ where: { id }, data: { lastActivityAt } });
    } catch (error) {
      throw translate(error, 'SESSION_NOT_FOUND');
    }
  }
  async markRecentAuth(id: SessionId, at: Date) {
    const changed = await this.db.session.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: at } },
      data: { recentAuthAt: at },
    });
    if (changed.count !== 1) throw new RepositoryNotFound('SESSION_NOT_FOUND');
  }
  async rotate(id: SessionId, successor: IdentitySession, rotatedAt: Date) {
    const changed = await this.db.session.updateMany({
      where: { id, revokedAt: null, expiresAt: { gt: rotatedAt } },
      data: {
        revokedAt: rotatedAt,
        revocationReason: 'ROTATED',
        replacedBySessionId: successor.id,
      },
    });
    if (changed.count !== 1) throw new RepositoryNotFound('SESSION_NOT_FOUND');
    await this.create(successor);
  }
  async revoke(id: SessionId, reason: SessionRevocationReason, at: Date) {
    const result = await this.db.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at, revocationReason: reason },
    });
    return result.count === 1;
  }
  async revokeAllForUser(
    userId: UserId,
    reason: SessionRevocationReason,
    at: Date,
  ) {
    const result = await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at, revocationReason: reason },
    });
    return result.count;
  }
  async revokeAllExcept(
    userId: UserId,
    exceptSessionId: SessionId,
    reason: SessionRevocationReason,
    at: Date,
  ) {
    const result = await this.db.session.updateMany({
      where: { userId, id: { not: exceptSessionId }, revokedAt: null },
      data: { revokedAt: at, revocationReason: reason },
    });
    return result.count;
  }
  async revokeSessionFamily(
    familyId: string,
    reason: SessionRevocationReason,
    at: Date,
  ) {
    await this.db.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at, revocationReason: reason },
    });
  }
}

class RoleAdapter implements RoleAssignmentRepository {
  constructor(private readonly db: Db) {}
  async listForUser(userId: UserId) {
    return (
      await this.db.roleAssignment.findMany({
        where: { userId, revokedAt: null },
        orderBy: { createdAt: 'asc' },
      })
    ).map(asRole);
  }
  async assign(input: RoleAssignment) {
    try {
      return asRole(await this.db.roleAssignment.create({ data: input }));
    } catch (error) {
      throw translate(error, 'ROLE_ASSIGNMENT_CONFLICT');
    }
  }
  async findById(id: RoleAssignment['id']) {
    const row = await this.db.roleAssignment.findUnique({ where: { id } });
    return row ? asRole(row) : null;
  }
  async revoke(id: RoleAssignment['id'], at: Date) {
    const result = await this.db.roleAssignment.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: at },
    });
    return result.count === 1;
  }
  async remove(userId: UserId, role: RoleAssignment['role']) {
    await this.db.roleAssignment.updateMany({
      where: { userId, role, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async lockAdminInvariant() {
    await this.db.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(54870615)`,
    );
  }
  async countActiveGlobalAdmins() {
    return this.db.roleAssignment.count({
      where: {
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        revokedAt: null,
        user: { accountStatus: { in: ['ACTIVE', 'PENDING_REVIEW'] } },
      },
    });
  }
  async hasActiveGlobalAdmin(userId: UserId) {
    return (
      (await this.db.roleAssignment.count({
        where: {
          userId,
          role: 'ADMIN',
          scopeType: 'GLOBAL',
          scopeId: '*',
          revokedAt: null,
        },
      })) > 0
    );
  }
}

class StatusHistoryAdapter implements AccountStatusHistoryRepository {
  constructor(private readonly db: Db) {}
  async append(input: AccountStatusHistoryEntry) {
    await this.db.accountStatusHistory.create({ data: input });
  }
  async listForUser(userId: UserId) {
    return (
      await this.db.accountStatusHistory.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    ).map((row) => ({
      ...row,
      userId: row.userId as UserId,
      actorUserId: row.actorUserId as UserId | null,
    }));
  }
}

class AuditAdapter implements AuditEventRepository {
  constructor(private readonly db: Db) {}
  async append(input: AuditWrite) {
    const metadata = sanitizeAuditMetadata(input.action, input.metadata);
    await this.db.auditEvent.create({
      data: {
        ...input,
        metadata:
          metadata === null
            ? Prisma.JsonNull
            : (metadata as Prisma.InputJsonValue),
      },
    });
  }
  async findByRequestId(requestId: string) {
    return (
      await this.db.auditEvent.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
      })
    ).map(asAudit);
  }
  async findForResource(resourceType: string, resourceId: string) {
    return (
      await this.db.auditEvent.findMany({
        where: { resourceType, resourceId },
        orderBy: { createdAt: 'asc' },
      })
    ).map(asAudit);
  }
  async query(input: AuditQuery) {
    const cursorFilter: Prisma.AuditEventWhereInput | undefined = input.before
      ? {
          OR: [
            { createdAt: { lt: input.before.createdAt } },
            { createdAt: input.before.createdAt, id: { lt: input.before.id } },
          ],
        }
      : undefined;
    return (
      await this.db.auditEvent.findMany({
        where: {
          action: input.action,
          ...(input.actions ? { action: { in: [...input.actions] } } : {}),
          actorUserId: input.actorUserId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          createdAt: {
            gte: input.from,
            lte: input.to,
          },
          ...(cursorFilter ? { AND: [cursorFilter] } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit,
      })
    ).map(asAudit);
  }
}

class IdempotencyAdapter implements IdempotencyRepository {
  constructor(private readonly db: Db) {}
  async find(identity: IdempotencyIdentity) {
    const row = await this.db.idempotencyRecord.findFirst({
      where: identity,
      orderBy: { createdAt: 'desc' },
    });
    return row ? asIdempotency(row) : null;
  }
  async acquire(
    identity: IdempotencyIdentity,
    requestHash: string,
    expiresAt: Date,
  ): Promise<IdempotencyAcquisition> {
    const created = await this.db.idempotencyRecord.createMany({
      data: {
        id: crypto.randomUUID(),
        ...identity,
        requestHash,
        expiresAt,
      },
      skipDuplicates: true,
    });
    if (created.count === 1) {
      const record = await this.find(identity);
      if (!record) throw new RepositoryConflict('PERSISTENCE_CONFLICT', true);
      return { state: 'ACQUIRED', record };
    }
    const record = await this.find(identity);
    if (!record) throw new RepositoryConflict('PERSISTENCE_CONFLICT', true);
    const now = new Date();
    if (record.expiresAt <= now) {
      const replaced = await this.db.idempotencyRecord.updateMany({
        where: { ...identity, expiresAt: { lte: now } },
        data: {
          requestHash,
          status: 'PROCESSING',
          responseStatus: null,
          responseBody: Prisma.JsonNull,
          expiresAt,
          completedAt: null,
        },
      });
      if (replaced.count === 1) {
        const reacquired = await this.find(identity);
        if (!reacquired)
          throw new RepositoryConflict('PERSISTENCE_CONFLICT', true);
        return { state: 'EXPIRED_REACQUIRED', record: reacquired };
      }
      return this.acquire(identity, requestHash, expiresAt);
    }
    return {
      state:
        record.requestHash === requestHash
          ? record.status === 'COMPLETED'
            ? 'EXISTING_COMPLETED'
            : 'EXISTING_IN_PROGRESS'
          : 'FINGERPRINT_CONFLICT',
      record,
    };
  }
  async complete(
    identity: IdempotencyIdentity,
    result: IdempotencyStoredResponse,
    completedAt: Date,
  ) {
    const changed = await this.db.idempotencyRecord.updateMany({
      where: { ...identity, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED',
        responseStatus: result.status,
        responseBody: result.body as Prisma.InputJsonValue,
        completedAt,
      },
    });
    if (changed.count !== 1)
      throw new RepositoryConflict('IDEMPOTENCY_KEY_CONFLICT');
  }
}

class ConsentAcceptanceAdapter implements ConsentAcceptanceRepository {
  constructor(private readonly db: Db) {}
  async appendMany(
    input: readonly import('../ports/repositories').ConsentAcceptanceWrite[],
  ) {
    if (!input.length) return;
    await this.db.consentAcceptance.createMany({ data: [...input] });
  }
}

export function createIdentityTransaction(db: Db): IdentityTransaction {
  return {
    users: new UserAdapter(db),
    sessions: new SessionAdapter(db),
    roles: new RoleAdapter(db),
    statusHistory: new StatusHistoryAdapter(db),
    audit: new AuditAdapter(db),
    idempotency: new IdempotencyAdapter(db),
    consents: new ConsentAcceptanceAdapter(db),
  };
}

@Injectable()
export class PrismaIdentityUnitOfWork implements IdentityUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}
  withinTransaction<T>(work: (transaction: IdentityTransaction) => Promise<T>) {
    return this.prisma.withTransaction((db) =>
      work(createIdentityTransaction(db)),
    );
  }
}

function translate(
  error: unknown,
  conflict:
    | 'IDENTITY_EMAIL_CONFLICT'
    | 'DUPLICATE_USERNAME'
    | 'IDENTITY_NOT_FOUND'
    | 'SESSION_TOKEN_CONFLICT'
    | 'SESSION_NOT_FOUND'
    | 'ROLE_ASSIGNMENT_CONFLICT'
    | 'IDEMPOTENCY_KEY_CONFLICT',
) {
  if (
    error instanceof RepositoryConflict ||
    error instanceof RepositoryNotFound
  )
    return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002')
      return new RepositoryConflict(
        conflict === 'IDENTITY_NOT_FOUND' || conflict === 'SESSION_NOT_FOUND'
          ? 'PERSISTENCE_CONFLICT'
          : conflict,
      );
    if (error.code === 'P2025')
      return new RepositoryNotFound(
        conflict === 'SESSION_NOT_FOUND'
          ? 'SESSION_NOT_FOUND'
          : 'IDENTITY_NOT_FOUND',
      );
    if (error.code === 'P2034') return new RepositorySerializationFailure();
  }
  throw error;
}
function isUsernameConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.target ?? '').includes('publicUsername')
  );
}
function asRole(row: {
  id: string;
  userId: string;
  role: RoleAssignment['role'];
  scopeType: string;
  scopeId: string;
  assignedByUserId: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}): RoleAssignment {
  return {
    ...row,
    id: row.id as RoleAssignment['id'],
    userId: row.userId as UserId,
    assignedByUserId: row.assignedByUserId as UserId | null,
  };
}
function asAudit(row: {
  id: string;
  actorUserId: string | null;
  actorType: 'USER' | 'SYSTEM';
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  sessionId: string | null;
  result: 'SUCCESS' | 'FAILURE';
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): AuditWrite {
  return {
    ...row,
    actorUserId: row.actorUserId as UserId | null,
    sessionId: row.sessionId as SessionId | null,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}
function asIdempotency(row: {
  id: string;
  key: string;
  actorScope: string;
  scope: string;
  requestHash: string;
  status: 'PROCESSING' | 'COMPLETED';
  responseStatus: number | null;
  responseBody: Prisma.JsonValue | null;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
}): IdempotencyRecord {
  return {
    id: row.id as IdempotencyRecord['id'],
    key: row.key,
    actorScope: row.actorScope,
    scope: row.scope,
    requestHash: row.requestHash,
    status: row.status,
    response:
      row.responseStatus !== null && row.responseBody !== null
        ? {
            status: row.responseStatus,
            body: row.responseBody as Record<string, unknown>,
          }
        : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}
