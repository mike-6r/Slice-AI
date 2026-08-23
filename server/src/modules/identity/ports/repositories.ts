import type {
  AccountStatusHistoryEntry,
  IdentityProfile,
  IdentitySession,
  IdentityUser,
  IdempotencyRecordId,
  Role,
  RoleAssignment,
  SessionId,
  SessionRevocationReason,
  UserId,
} from '../domain/identity.types';

export type NewIdentityUser = Omit<
  IdentityUser,
  'createdAt' | 'updatedAt' | 'lastLoginAt' | 'profile'
> & { profile: IdentityProfile };

export type ProfilePatch = Partial<IdentityProfile>;

export interface UserRepository {
  create(input: NewIdentityUser): Promise<IdentityUser>;
  findById(id: UserId): Promise<IdentityUser | null>;
  findByNormalizedEmail(email: string): Promise<IdentityUser | null>;
  findByUsername(username: string): Promise<IdentityUser | null>;
  updateProfile(id: UserId, update: ProfilePatch): Promise<IdentityUser>;
  updateEmailVerificationState(
    id: UserId,
    verifiedAt: Date | null,
  ): Promise<void>;
  updatePasswordHash(id: UserId, passwordHash: string): Promise<void>;
  invalidateTwoFactorLoginChallenges(id: UserId): Promise<void>;
  updateStatus(
    id: UserId,
    status: IdentityUser['accountStatus'],
  ): Promise<void>;
  getProfile(id: UserId): Promise<IdentityProfile | null>;
}

export interface SessionRepository {
  create(input: IdentitySession): Promise<IdentitySession>;
  findById(id: SessionId): Promise<IdentitySession | null>;
  findByPublicId(publicId: string): Promise<IdentitySession | null>;
  findByRefreshTokenHash(hash: string): Promise<IdentitySession | null>;
  listActiveByUser(userId: UserId, now: Date): Promise<IdentitySession[]>;
  touchLastUsed(id: SessionId, at: Date): Promise<void>;
  markRecentAuth(id: SessionId, at: Date): Promise<void>;
  rotate(
    id: SessionId,
    successor: IdentitySession,
    rotatedAt: Date,
  ): Promise<void>;
  revoke(
    id: SessionId,
    reason: SessionRevocationReason,
    at: Date,
  ): Promise<boolean>;
  revokeAllForUser(
    userId: UserId,
    reason: SessionRevocationReason,
    at: Date,
  ): Promise<number>;
  revokeAllExcept(
    userId: UserId,
    exceptSessionId: SessionId,
    reason: SessionRevocationReason,
    at: Date,
  ): Promise<number>;
  revokeSessionFamily(
    familyId: string,
    reason: SessionRevocationReason,
    at: Date,
  ): Promise<void>;
}

export interface RoleAssignmentRepository {
  listForUser(userId: UserId): Promise<RoleAssignment[]>;
  assign(input: RoleAssignment): Promise<RoleAssignment>;
  findById(id: RoleAssignment['id']): Promise<RoleAssignment | null>;
  revoke(id: RoleAssignment['id'], at: Date): Promise<boolean>;
  remove(userId: UserId, role: Role): Promise<void>;
  /** Must be invoked inside the same PostgreSQL transaction as a global-admin mutation. */
  lockAdminInvariant(): Promise<void>;
  countActiveGlobalAdmins(): Promise<number>;
  hasActiveGlobalAdmin(userId: UserId): Promise<boolean>;
}

export interface AccountStatusHistoryRepository {
  append(input: AccountStatusHistoryEntry): Promise<void>;
  listForUser(userId: UserId): Promise<AccountStatusHistoryEntry[]>;
}

export interface AuditEventRepository {
  append(input: AuditWrite): Promise<void>;
  findByRequestId(requestId: string): Promise<AuditWrite[]>;
  findForResource(type: string, id: string): Promise<AuditWrite[]>;
  query(input: AuditQuery): Promise<AuditWrite[]>;
}

export type AuditQuery = {
  action?: string;
  actions?: readonly string[];
  actorUserId?: UserId;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  before?: { createdAt: Date; id: string };
  limit: number;
};

export type AuditWrite = {
  id: string;
  actorUserId: UserId | null;
  actorType: 'USER' | 'SYSTEM';
  action: string;
  resourceType: string;
  resourceId: string | null;
  requestId: string | null;
  sessionId: SessionId | null;
  result: 'SUCCESS' | 'FAILURE';
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type IdempotencyStoredResponse = {
  status: number;
  body: Record<string, unknown>;
};
export type IdempotencyIdentity = {
  actorScope: string;
  scope: string;
  key: string;
};
export type IdempotencyAcquisition = {
  state:
    | 'ACQUIRED'
    | 'EXPIRED_REACQUIRED'
    | 'EXISTING_IN_PROGRESS'
    | 'EXISTING_COMPLETED'
    | 'FINGERPRINT_CONFLICT';
  record: IdempotencyRecord;
};

export type IdempotencyRecord = {
  id: IdempotencyRecordId;
  key: string;
  actorScope: string;
  scope: string;
  requestHash: string;
  status: 'PROCESSING' | 'COMPLETED';
  response: IdempotencyStoredResponse | null;
  expiresAt: Date;
  createdAt: Date;
  completedAt: Date | null;
};

export interface IdempotencyRepository {
  find(identity: IdempotencyIdentity): Promise<IdempotencyRecord | null>;
  acquire(
    identity: IdempotencyIdentity,
    requestHash: string,
    expiresAt: Date,
  ): Promise<IdempotencyAcquisition>;
  complete(
    identity: IdempotencyIdentity,
    result: IdempotencyStoredResponse,
    at: Date,
  ): Promise<void>;
}

export type ConsentAcceptanceWrite = {
  id: string;
  userId: UserId;
  consentType: 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY';
  policyVersion: string;
  acceptedAt: Date;
  source: 'SIGNUP';
};

export interface ConsentAcceptanceRepository {
  appendMany(input: readonly ConsentAcceptanceWrite[]): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const ROLE_ASSIGNMENT_REPOSITORY = Symbol('ROLE_ASSIGNMENT_REPOSITORY');
export const ACCOUNT_STATUS_HISTORY_REPOSITORY = Symbol(
  'ACCOUNT_STATUS_HISTORY_REPOSITORY',
);
export const AUDIT_EVENT_REPOSITORY = Symbol('AUDIT_EVENT_REPOSITORY');
export const IDEMPOTENCY_REPOSITORY = Symbol('IDEMPOTENCY_REPOSITORY');
export const CONSENT_ACCEPTANCE_REPOSITORY = Symbol('CONSENT_ACCEPTANCE_REPOSITORY');

export interface IdentityTransaction {
  users: UserRepository;
  sessions: SessionRepository;
  roles: RoleAssignmentRepository;
  statusHistory: AccountStatusHistoryRepository;
  audit: AuditEventRepository;
  idempotency: IdempotencyRepository;
  consents: ConsentAcceptanceRepository;
}

export interface IdentityUnitOfWork {
  withinTransaction<T>(
    work: (transaction: IdentityTransaction) => Promise<T>,
  ): Promise<T>;
}

export const IDENTITY_UNIT_OF_WORK = Symbol('IDENTITY_UNIT_OF_WORK');
export const IDENTITY_REPOSITORIES = Symbol('IDENTITY_REPOSITORIES');
