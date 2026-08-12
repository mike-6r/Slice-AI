export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type UserId = Brand<string, 'UserId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RoleAssignmentId = Brand<string, 'RoleAssignmentId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type IdempotencyRecordId = Brand<string, 'IdempotencyRecordId'>;
export type NormalizedEmail = Brand<string, 'NormalizedEmail'>;
export type AccountStatus =
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'DEACTIVATED'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'CLOSED';
export type EmailVerificationStatus = 'UNVERIFIED' | 'VERIFIED';
export type ActorType = 'USER' | 'SYSTEM';
export type Role =
  | 'USER'
  | 'COLLECTOR'
  | 'SUPPORT'
  | 'COMPLIANCE_ANALYST'
  | 'ASSET_REVIEWER'
  | 'VAULT_OPERATOR'
  | 'FINANCE_OPERATOR'
  | 'ADMIN';
export type Permission =
  | 'profile.read.self'
  | 'profile.update.self'
  | 'user.read.support'
  | 'role.assign'
  | 'role.remove'
  | 'account.status.change'
  | 'session.revoke.self'
  | 'session.revoke.other'
  | 'audit.read'
  | 'admin.access'
  | 'catalogue.manage'
  | 'submission.review'
  | 'valuation.manage'
  | 'custody.manage'
  | 'insurance.manage'
  | 'publication.manage'
  | 'ownership.issue'
  | 'ownership.manage'
  | 'finance.manage'
  | 'trading.manage'
  | 'community.moderate'
  | 'governance.manage'
  | 'distribution.manage'
  | 'compliance.manage'
  | 'provider.manage';
export type SessionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROTATED';
export type SessionRevocationReason =
  | 'LOGOUT'
  | 'SESSION_REVOKED'
  | 'OTHER_SESSIONS_REVOKED'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'CLOSED'
  | 'DEACTIVATED'
  | 'ROTATED'
  | 'REFRESH_REPLAY'
  | 'PASSWORD_CHANGED'
  | 'ADMIN_ACTION'
  | 'EXPIRED';
export type AuthenticationMethod = 'PASSWORD' | 'EXTERNAL_PROVIDER';
export interface ActorContext {
  userId?: UserId;
  actorType: ActorType;
  accountStatus?: AccountStatus;
  roles: Role[];
  sessionId?: SessionId;
}

export interface IdentityProfile {
  displayName: string;
  publicUsername: string | null;
  usernameChangedAt: Date | null;
  avatarReference: string | null;
  countryCode: string;
  preferredCurrency: 'GBP' | 'USD' | 'CAD' | 'EUR';
  timezone: string;
  /** Customer display locale. The product currently supports English variants only. */
  locale?: 'en-GB' | 'en-US';
}

export interface IdentityUser {
  id: UserId;
  email: string;
  normalizedEmail: NormalizedEmail;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  phoneE164?: string | null;
  phoneVerifiedAt?: Date | null;
  twoFactorEnabledAt?: Date | null;
  accountStatus: AccountStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  profile: IdentityProfile | null;
}

export interface PublicIdentityUser {
  id: UserId;
  email: string;
  emailVerificationStatus: EmailVerificationStatus;
  twoFactorEnabled: boolean;
  twoFactorEnabledAt: Date | null;
  accountStatus: AccountStatus;
  profile: IdentityProfile | null;
  roles: Role[];
}

export interface IdentitySession {
  id: SessionId;
  /** Opaque customer-facing reference. Internal ids remain persistence-only. */
  publicId?: string;
  userId: UserId;
  tokenHash: string;
  familyId: string;
  replacedBySessionId: SessionId | null;
  issuedAt: Date;
  authenticatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: SessionRevocationReason | null;
  lastActivityAt: Date;
  userAgent: string | null;
  ipHash: string | null;
}

export interface RoleAssignment {
  id: RoleAssignmentId;
  userId: UserId;
  role: Role;
  scopeType: string;
  scopeId: string;
  assignedByUserId: UserId | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface AccountStatusHistoryEntry {
  id: string;
  userId: UserId;
  fromStatus: AccountStatus | null;
  toStatus: AccountStatus;
  reason: string;
  actorUserId: UserId | null;
  createdAt: Date;
}
