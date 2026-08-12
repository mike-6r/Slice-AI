import {
  type AccountStatus,
  type IdentityProfile,
  type IdentitySession,
  type IdentityUser,
  type PublicIdentityUser,
  type Role,
  type SessionRevocationReason,
  type UserId,
} from '../../domain/identity.types';

export type PersistedIdentityUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  phoneE164?: string | null;
  phoneVerifiedAt?: Date | null;
  twoFactor?: { enabledAt: Date | null } | null;
  accountStatus: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  profile: PersistedIdentityProfile | null;
};

export type PersistedIdentityProfile = {
  displayName: string;
  publicUsername: string | null;
  usernameChangedAt: Date | null;
  avatarReference: string | null;
  countryCode: string;
  preferredCurrency: string;
  timezone: string;
  locale?: string;
};

export type PersistedIdentitySession = {
  id: string;
  publicId: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  replacedBySessionId: string | null;
  issuedAt: Date;
  authenticatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  lastActivityAt: Date;
  userAgent: string | null;
  ipHash: string | null;
};

const accountStatuses = new Set<AccountStatus>([
  'PENDING_REVIEW',
  'ACTIVE',
  'DEACTIVATED',
  'RESTRICTED',
  'SUSPENDED',
  'CLOSED',
]);
const roles = new Set<Role>([
  'USER',
  'SUPPORT',
  'COMPLIANCE_ANALYST',
  'ASSET_REVIEWER',
  'VAULT_OPERATOR',
  'FINANCE_OPERATOR',
  'ADMIN',
]);
const revocationReasons = new Set<SessionRevocationReason>([
  'LOGOUT',
  'SESSION_REVOKED',
  'OTHER_SESSIONS_REVOKED',
  'RESTRICTED',
  'SUSPENDED',
  'CLOSED',
  'DEACTIVATED',
  'ROTATED',
  'REFRESH_REPLAY',
  'PASSWORD_CHANGED',
  'ADMIN_ACTION',
  'EXPIRED',
]);

export function mapIdentityUser(record: PersistedIdentityUser): IdentityUser {
  return {
    id: asUserId(record.id),
    email: requireText(record.email, 'email'),
    normalizedEmail: requireText(
      record.normalizedEmail,
      'normalizedEmail',
    ) as IdentityUser['normalizedEmail'],
    passwordHash: requireText(record.passwordHash, 'passwordHash'),
    emailVerifiedAt: record.emailVerifiedAt,
    phoneE164: record.phoneE164 ?? null,
    phoneVerifiedAt: record.phoneVerifiedAt ?? null,
    twoFactorEnabledAt: record.twoFactor?.enabledAt ?? null,
    accountStatus: asAccountStatus(record.accountStatus),
    createdAt: asDate(record.createdAt, 'createdAt'),
    updatedAt: asDate(record.updatedAt, 'updatedAt'),
    lastLoginAt: record.lastLoginAt,
    profile: record.profile ? mapIdentityProfile(record.profile) : null,
  };
}

export function toPublicIdentityUser(
  user: IdentityUser,
  assignedRoles: Role[],
): PublicIdentityUser {
  return {
    id: user.id,
    email: user.email,
    emailVerificationStatus: user.emailVerifiedAt ? 'VERIFIED' : 'UNVERIFIED',
    twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
    twoFactorEnabledAt: user.twoFactorEnabledAt ?? null,
    accountStatus: user.accountStatus,
    profile: user.profile,
    roles: assignedRoles.map(asRole),
  };
}

export function mapIdentitySession(
  record: PersistedIdentitySession,
): IdentitySession {
  return {
    id: requireText(record.id, 'session.id') as IdentitySession['id'],
    publicId: requireText(record.publicId, 'session.publicId'),
    userId: asUserId(record.userId),
    tokenHash: requireText(record.tokenHash, 'tokenHash'),
    familyId: requireText(record.familyId, 'familyId'),
    replacedBySessionId: record.replacedBySessionId
      ? (requireText(
          record.replacedBySessionId,
          'replacedBySessionId',
        ) as IdentitySession['id'])
      : null,
    issuedAt: asDate(record.issuedAt, 'issuedAt'),
    authenticatedAt: asDate(record.authenticatedAt, 'authenticatedAt'),
    expiresAt: asDate(record.expiresAt, 'expiresAt'),
    revokedAt: record.revokedAt,
    revocationReason: record.revocationReason
      ? asSessionRevocationReason(record.revocationReason)
      : null,
    lastActivityAt: asDate(record.lastActivityAt, 'lastActivityAt'),
    userAgent: record.userAgent,
    ipHash: record.ipHash,
  };
}

function mapIdentityProfile(record: PersistedIdentityProfile): IdentityProfile {
  const preferredCurrency = record.preferredCurrency;
  if (
    preferredCurrency !== 'GBP' &&
    preferredCurrency !== 'USD' &&
    preferredCurrency !== 'CAD' &&
    preferredCurrency !== 'EUR'
  ) {
    throw new Error(
      'CORRUPT_PERSISTED_IDENTITY: unsupported preferredCurrency',
    );
  }
  return {
    displayName: requireText(record.displayName, 'displayName'),
    publicUsername: record.publicUsername,
    usernameChangedAt: record.usernameChangedAt,
    avatarReference: record.avatarReference,
    countryCode: requireText(record.countryCode, 'countryCode'),
    preferredCurrency,
    timezone: requireText(record.timezone, 'timezone'),
    locale: asLocale(record.locale ?? 'en-GB'),
  };
}

function asLocale(value: string): 'en-GB' | 'en-US' {
  if (value !== 'en-GB' && value !== 'en-US') {
    throw new Error('CORRUPT_PERSISTED_IDENTITY: unsupported locale');
  }
  return value;
}

function asAccountStatus(value: string): AccountStatus {
  if (!accountStatuses.has(value as AccountStatus)) {
    throw new Error('CORRUPT_PERSISTED_IDENTITY: unsupported accountStatus');
  }
  return value as AccountStatus;
}

function asRole(value: Role): Role {
  if (!roles.has(value)) {
    throw new Error('CORRUPT_PERSISTED_IDENTITY: unsupported role');
  }
  return value;
}

function asSessionRevocationReason(value: string): SessionRevocationReason {
  if (!revocationReasons.has(value as SessionRevocationReason)) {
    throw new Error(
      'CORRUPT_PERSISTED_IDENTITY: unsupported revocation reason',
    );
  }
  return value as SessionRevocationReason;
}

function asUserId(value: string): UserId {
  return requireText(value, 'user.id') as UserId;
}

function asDate(value: Date, field: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`CORRUPT_PERSISTED_IDENTITY: invalid ${field}`);
  }
  return value;
}

function requireText(value: string, field: string) {
  if (!value.trim()) {
    throw new Error(`CORRUPT_PERSISTED_IDENTITY: missing ${field}`);
  }
  return value;
}
