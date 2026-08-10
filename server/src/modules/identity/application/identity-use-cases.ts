import type {
  AccountStatus,
  IdentitySession,
  IdentityUser,
  PublicIdentityUser,
  Role,
  SessionId,
  UserId,
} from '../domain/identity.types';
import type { ProfilePatch } from '../ports/repositories';

/**
 * Offline contract only. Document 004 owns implementations and HTTP transport.
 */
export interface IdentityApplicationServices {
  createUser(input: CreateUserCommand): Promise<IdentityUser>;
  createSession(input: CreateSessionCommand): Promise<IdentitySession>;
  getPublicUser(userId: UserId): Promise<PublicIdentityUser | null>;
  updateProfile(userId: UserId, patch: ProfilePatch): Promise<IdentityUser>;
  revokeSession(input: RevokeSessionCommand): Promise<void>;
}

export type CreateUserCommand = {
  user: IdentityUser;
  initialProfile: NonNullable<IdentityUser['profile']>;
  initialRoles: Role[];
};

export type CreateSessionCommand = {
  session: IdentitySession;
  accountStatus: AccountStatus;
};

export type RevokeSessionCommand = {
  userId: UserId;
  sessionId: SessionId;
  reason: 'LOGOUT' | 'ADMIN_ACTION';
};
